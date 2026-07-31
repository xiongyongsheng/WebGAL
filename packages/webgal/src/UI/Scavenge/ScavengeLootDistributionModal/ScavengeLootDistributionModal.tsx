/**
 * 战利品分配 modal（M1 + M2 阶段，2026-06-21 加 / 2026-06-21 加操作按钮）
 *
 * 设计（2026-06-21 重构）：
 *   - 复用 ScavengeCharacterPanel（与休整 modal 同款）
 *   - customWarehouseRef 把"队伍背包"（mission.tempLoot）作为"仓库"
 *   - 拖拽 + 菜单分配自动支持
 *
 * 4 个操作按钮（2026-06-21 加）：
 *   - 重置：清空 currentTempLoot，回到初始状态
 *   - 智能分配：根据角色偏好 + 当前需求自动分配（scoreItemForParty）
 *   - 跳过：所有物品入永久仓库（玩家不要）
 *   - 确认：所有物品已分配（currentTempLoot.length === 0）才能点
 *
 * 关闭行为：
 *   - X 按钮：同"跳过"（剩余入永久仓库）
 *   - 智能分配后还有剩余：可以继续手动分配 或 点"跳过"入仓库
 *
 * 触发：mission 状态变化（active → completed/failed/cancelled）+ tempLoot.length > 0 + !tempLootDistributed
 */

import { useState, useMemo, useEffect } from 'react';
import { Icon } from '@iconify/react';
import autoFix from '@iconify-icons/material-symbols/auto-fix-high';
import warehouse from '@iconify-icons/material-symbols/warehouse';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { ScavengeCharacterPanel } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel';
import {
  readMissions, writeMissions, Mission,
} from '../ScavengeMissions/missions';
import { getCharacters, getWarehouse, setCharacters, setWarehouse } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import {
  addToInventory, addToWarehouse, canAddToInventory, InventoryItem,
} from '../ScavengeItems/inventory';
import { getItemById } from '../ScavengeItems/items';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { scoreItemForParty, computeAffinityDelta } from '../ScavengeMissions/characterNeeds';
import styles from './ScavengeLootDistributionModal.module.scss';

interface ScavengeLootDistributionModalProps {
  /** 触发本次分配的 mission（含 tempLoot 字段）*/
  mission: Mission;
  /** 队伍成员（按 characterId 顺序）*/
  party: ScavengeCharacter[];
  /** 关闭 modal（panel 的 onClose 也会调这个）*/
  onClose: () => void;
  /**
   * 模式（2026-06-21 加：用此 modal 完全代替 ScavengeRestModal）
   * - 'rest'：战斗休整 / 拾荒中途 → 关闭 modal **不**清 tempLoot，**不**标 distributed
   * - 'complete'：任务完成 → 关闭（confirm/skip/X）会标 distributed + 清 tempLoot
   */
  mode?: 'rest' | 'complete';
}

/**
 * Modal 主组件
 *
 * 状态管理：
 *   - currentTempLoot: 当前待分配的物品（local state，不直接同步到 mission）
 *   - 玩家分配 / 智能分配 / 重置 都会改 currentTempLoot
 *   - 关闭时才同步到 mission（distribute / skip）
 *   - 原因：每次操作都同步 mission 会触发 stageState 写盘，影响性能
 */
export const ScavengeLootDistributionModal = ({
  mission, party, onClose,
  mode = 'complete',  // 默认 'complete'（任务完成时弹）
}: ScavengeLootDistributionModalProps) => {
  // 队伍 ID 列表
  const partyIds = useMemo(() => {
    if (mission.partyCharacterIds && mission.partyCharacterIds.length > 0) {
      return mission.partyCharacterIds;
    }
    return [mission.characterId];
  }, [mission]);

  // 初始 tempLoot（用于"重置"按钮恢复）
  const initialTempLoot = useMemo(() => mission.tempLoot ?? [], [mission.id]);

  // 当前待分配物品（local state，玩家操作时变化）
  const [currentTempLoot, setCurrentTempLoot] = useState<InventoryItem[]>(initialTempLoot);

  // 同步到 mission 的 helper
  // 每次 currentTempLoot 变化时也写回 mission（这样 ScavengeMain 重新计算 pendingLootMission 时能正确判断）
  useEffect(() => {
    const missions = readMissions();
    const newMissions = missions.map(m => {
      if (m.id !== mission.id) return m;
      return { ...m, tempLoot: currentTempLoot };
    });
    writeMissions(newMissions);
    stageStateManager.setStageVarAndCommit({
      key: '_tempLoot_updated',
      value: Date.now(),
    });
  }, [currentTempLoot, mission.id]);

  // 2026-06-21 删：去掉重置按钮（不需要）
  // const handleReset = () => {
  //   setCurrentTempLoot(initialTempLoot);
  // };

  // 2026-06-21 删：去掉确认按钮（不需要）
  // const allDistributed = currentTempLoot.length === 0;

  /**
   * 智能分配：按 scoreItemForParty 给每个 item 找推荐角色
   *   - 能装下 → 装入角色 + 从 tempLoot 移除
   *   - 装不下 → 留在 tempLoot（让玩家手动处理）
   * 2026-06-21 M3 加：分配成功时增加角色好感度
   *   - Δaffinity = base × preferenceFactor × needFactor × priceFactor
   *   - 累加到 character.affinity
   */
  const handleSmartAssign = () => {
    const allChars = getCharacters();
    const charMap = new Map(allChars.map(c => [c.id, c]));
    const remaining: InventoryItem[] = [];
    const distributed: string[] = [];  // 用于日志
    const affinityDeltas: Array<{ charName: string; charId: string; delta: number; itemName: string }> = [];

    for (const item of currentTempLoot) {
      const scores = scoreItemForParty(party, item);
      const recommended = scores[0];
      // 没有推荐（所有 score <= 0）或推荐角色 hp <= 0 → 跳过（留在 tempLoot）
      if (!recommended || recommended.total <= 0) {
        remaining.push(item);
        continue;
      }
      // 推荐角色
      const target = charMap.get(recommended.char.id);
      if (!target) {
        remaining.push(item);
        continue;
      }
      // 容量检查
      const inv = (target.inventory ?? []).filter((i): i is InventoryItem => i !== null);
      const check = canAddToInventory(inv, item, false);
      if (!check.canAdd) {
        remaining.push(item);
        continue;
      }
      // 装入角色
      const newInv = addToInventory(inv, { ...item, quantity: check.accepted });
      // 2026-06-21 M3 加：好感度增加
      const affinityDelta = computeAffinityDelta(target, { ...item, quantity: check.accepted });
      charMap.set(target.id, {
        ...target,
        inventory: newInv,
        affinity: (target.affinity ?? 0) + affinityDelta,
      });
      // 多余的数量（accepted < item.quantity）留在 tempLoot
      if (check.accepted < item.quantity) {
        remaining.push({ ...item, quantity: item.quantity - check.accepted });
      }
      const itemName = getItemById(item.itemId)?.name ?? item.itemId;
      distributed.push(`${itemName} → ${target.name}`);
      affinityDeltas.push({ charName: target.name, charId: target.id, delta: affinityDelta, itemName });
    }

    setCharacters(Array.from(charMap.values()));
    setCurrentTempLoot(remaining);
    if (distributed.length > 0) {
      logger.info(`[智能分配] 已分 ${distributed.length} 件：${distributed.join(', ')}`);
    }
    // M3 加：按角色聚合好感度增量，console 提示
    if (affinityDeltas.length > 0) {
      const grouped = new Map<string, { name: string; total: number }>();
      for (const d of affinityDeltas) {
        const existing = grouped.get(d.charId);
        if (existing) {
          existing.total += d.delta;
        } else {
          grouped.set(d.charId, { name: d.charName, total: d.delta });
        }
      }
      const summary = Array.from(grouped.values()).map(g => `${g.name} +${g.total}`).join(', ');
      logger.info(`[好感度] 智能分配后：${summary}`);
    }
  };

  /**
   * 关闭 modal 时的统一收尾
   * @param action 行为类型
   *   - 'skip'：剩余入永久仓库
   *   - 'close'：剩余入永久仓库（默认）
   *   - 'keep'：剩余留在 tempLoot（玩家下次还能看到）
   *   - 'confirm'：玩家主动确认分配完毕（currentTempLoot 必须空）
   * 2026-06-21 加：mode === 'rest' 时不标记 distributed，不清 tempLoot
   */
  const finalizeModal = (action: 'skip' | 'close' | 'keep' | 'confirm' = 'close') => {
    // 1. 处理剩余物品
    if (action === 'skip' || action === 'close') {
      if (currentTempLoot.length > 0) {
        const currentWh = getWarehouse();
        let newWh = currentWh;
        for (const item of currentTempLoot) {
          newWh = addToWarehouse(newWh, item);
        }
        setWarehouse(newWh);
        setCurrentTempLoot([]);
      }
    }
    // 'keep' 不动 currentTempLoot（留在 mission.tempLoot）
    // 'confirm' 必须 currentTempLoot === 0（外层已 check）

    // 2. mission 状态更新
    const missions = readMissions();
    const newMissions = missions.map(m => {
      if (m.id !== mission.id) return m;
      // 'rest' 模式：**不**标记 distributed，**不**清 tempLoot
      if (mode === 'rest') {
        return { ...m, tempLoot: currentTempLoot.length === 0 ? undefined : currentTempLoot };
      }
      // 'complete' 模式：标记 distributed + 清 tempLoot
      return { ...m, tempLootDistributed: true, tempLoot: undefined };
    });
    writeMissions(newMissions);

    onClose();
  };

  /**
   * 跳过：所有剩余物品入永久仓库
   * - 'rest'：入永久仓库，**不**清 tempLoot（玩家想保留在 tempLoot 也能用 close）
   * - 'complete'：入永久仓库，标记 distributed
   */
  const handleSkip = () => {
    finalizeModal('skip');
  };

  // 2026-06-21 删：去掉确认按钮（玩家直接点 X 关闭）
  // const handleConfirm = () => {
  //   finalizeModal('confirm');
  // };

  /**
   * 关闭（X 按钮或 panel 标题栏 X）：
   * - 'rest'：剩余留在 tempLoot，**不**标 distributed
   * - 'complete'：剩余入永久仓库，标 distributed
   */
  const handleClose = () => {
    finalizeModal(mode === 'rest' ? 'keep' : 'close');
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 2026-06-21 改：删除顶部 headerBar（冗余）
            只保留 panel，panel 内"队伍背包"标题已经包含状态信息 */}

        {/* ScavengeCharacterPanel（实际物品 / 角色展示）
            customWarehouseActions 把按钮注入到 panel 内"队伍背包"标题旁 */}
        <div className={styles.panelWrapper}>
          <ScavengeCharacterPanel
            onClose={handleClose}
            restrictView
            restrictTransfer
            partyCharacterIds={partyIds}
            customWarehouseRef={{
              items: currentTempLoot,
              commit: (newItems: InventoryItem[]) => {
                // 2026-06-21 M3 加：手动拖动 → 计算好感度增量
                //   - 比较 old tempLoot 和 new tempLoot 找出"被分走的"物品
                //   - 找出 inventory 包含这些物品的角色 → 好感度 +
                const oldItems = currentTempLoot;
                const newIds = new Set(newItems.map(i => i.instanceId ?? i.itemId));
                const removedItems = oldItems.filter(i => !newIds.has(i.instanceId ?? i.itemId));
                if (removedItems.length > 0) {
                  const allChars = getCharacters();
                  const removedIds = new Set(removedItems.map(i => i.itemId));
                  const targets = allChars.filter(c =>
                    (c.inventory ?? []).filter((i): i is InventoryItem => i !== null).some(i => removedIds.has(i.itemId))
                  );
                  if (targets.length > 0) {
                    const charMap = new Map(allChars.map(c => [c.id, c]));
                    const affinitySummary: string[] = [];
                    for (const target of targets) {
                      let totalDelta = 0;
                      const inv = (target.inventory ?? []).filter((i): i is InventoryItem => i !== null);
                      for (const ri of removedItems) {
                        if (inv.some(i => i.itemId === ri.itemId)) {
                          totalDelta += computeAffinityDelta(target, ri);
                        }
                      }
                      if (totalDelta > 0) {
                        const newAffinity = (target.affinity ?? 0) + totalDelta;
                        charMap.set(target.id, { ...target, affinity: newAffinity });
                        affinitySummary.push(`${target.name} +${totalDelta}（→ ${newAffinity}）`);
                      }
                    }
                    setCharacters(Array.from(charMap.values()));
                    if (affinitySummary.length > 0) {
                      logger.info(`[好感度] 手动分配：${affinitySummary.join(', ')}`);
                    }
                  }
                }
                setCurrentTempLoot(newItems);
              },
              label: '队伍背包',
              // 2026-06-21 加：空提示改为"分配完毕"（不再显示"仓库是空的"）
              emptyMessage: '分配完毕',
            }}
            customWarehouseActions={
              <div className={styles.headerActions}>
                {/* 2026-06-21 删：去掉重置按钮 */}
                <button
                  className={styles.actionBtn}
                  onClick={handleSmartAssign}
                  title="智能分配：根据角色偏好 + 当前需求自动分配"
                  disabled={currentTempLoot.length === 0}
                >
                  <Icon icon={autoFix} />
                  智能分配
                </button>
                {/* 2026-06-21 改：跳过按钮只在任务完成时显示（mode='complete'）
                    战斗休整中途（mode='rest'）不显示，避免误操作把还没分配的物品全入仓库 */}
                {mode === 'complete' && (
                  <button
                    className={styles.skipBtn}
                    onClick={handleSkip}
                    title="跳过：所有物品入永久仓库"
                  >
                    <Icon icon={warehouse} />
                    跳过
                  </button>
                )}
                {/* 2026-06-21 删：去掉确认按钮
                    关闭（X 按钮）由 panel 自身提供，
                    任务完成时：剩余入永久仓库 + 标 distributed
                    战斗休整中途：剩余留在 tempLoot */}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};

// 简易 logger
const logger = {
  info: (msg: string) => console.log(msg),
};
