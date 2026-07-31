/**
 * 战斗休整 modal（2026-06-09 重构：复用 ScavengeCharacterPanel / 2026-06-21 加 customWarehouseRef）
 *
 * 设计（按用户重定义）：
 * 1. **直接复用 ScavengeCharacterPanel**，传 restMode=true
 *    - 隐藏：非队内角色、永久仓库、跨队转移选项
 *    - 显示：状态条 + 装备 + 物品
 * 2. 玩家用背包里的物品补充状态（吃/喝/药）
 * 3. 玩家可以更换装备
 * 4. 关闭 modal → encounter.shown = true, restChoice = 'rest'
 *
 * 2026-06-21 加：customWarehouseRef（如果 active mission 有 tempLoot）
 *   - 玩家能在休整的同时把"队伍背包"里的拾荒战利品分配给角色
 *   - 这与"战利品分配 modal"（任务完成时弹）共享同一个 UI 风格
 *   - 区别：休整 modal 关闭时**不**做"剩余入仓库"（任务还在 active，下次还能看到）
 *
 * 触发：encounterCheck 战斗胜利后，ScavengeTimeControl 写 GameVar
 *   `scavenge_rest_pending: { missionId, encounterId }`
 *   ScavengeMain 监听 → 弹本 modal
 *
 * 为什么不自己写"简化版角色列表"？
 *   - 重复代码（已在 ScavengeCharacterPanel 实现）
 *   - 行为不一致（休整 modal 跟角色列表操作不一样，玩家困惑）
 *   - 维护成本（2 套代码，2 个 bug）
 *
 * 之前错误：写了 ScavengeRestCharacterDetail（已删除）
 */
import { useMemo } from 'react';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { ScavengeCharacterPanel } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel';
import {
  readMissions, writeMissions, Mission,
} from '../ScavengeMissions/missions';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { InventoryItem } from '../ScavengeItems/inventory';
import { getCharacters, setCharacters } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { computeAffinityDelta } from '../ScavengeMissions/characterNeeds';
import styles from './ScavengeRestModal.module.scss';

interface ScavengeRestModalProps {
  /** 派往队伍（1-3 人） */
  party: ScavengeCharacter[];
  /**
   * 触发休整的 encounter id（用于标记 shown）
   * - string：战斗触发的休整（有 encounter 可标记）
   * - null：玩家主动休整（无 encounter，不标记）
   */
  encounterId: string | null;
  /** 关闭 modal（标记 restChoice='rest'） */
  onClose: () => void;
}

export const ScavengeRestModal = ({ party, encounterId, onClose }: ScavengeRestModalProps) => {
  if (party.length === 0) return null;

  const partyIds = party.map(c => c.id);

  // 2026-06-21 加：查当前 mission（用于 customWarehouseRef）
  //   - 玩家能边休整边分配拾荒战利品
  //   - mission.tempLoot 非空时显示"队伍背包"
  const mission = useMemo<Mission | null>(() => {
    const missions = readMissions();
    // 优先找 encounterId 对应的 mission（更精确）
    if (encounterId) {
      const m = missions.find(m =>
        m.encounters?.some(e => e.id === encounterId)
      );
      if (m) return m;
    }
    // fallback：找 party 中第一个角色正在进行的 active mission
    return missions.find(m =>
      m.status === 'active' && partyIds.includes(m.characterId)
    ) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId]);

  // 当前 tempLoot 快照（用于 customWarehouseRef）
  const currentTempLoot = useMemo(() => mission?.tempLoot ?? [], [mission?.tempLoot]);

  /**
   * 关闭 modal
   * - 有 encounterId：标记 encounter.shown = true, restChoice = 'rest'
   * - 无 encounterId（null）：玩家主动休整，不改 encounter
   * - 清 scavenge_rest_pending GameVar
   *
   * 2026-06-21 改：**不**做"剩余入永久仓库"（任务还在 active，下次还能看到）
   *   - 任务完成时的兜底在 ScavengeLootDistributionModal 里
   */
  const handleClose = () => {
    if (encounterId !== null) {
      // 战斗触发：标记 encounter
      const missions = readMissions();
      const newMissions = missions.map(m => ({
        ...m,
        encounters: (m.encounters ?? []).map(e =>
          e.id === encounterId
            ? { ...e, shown: true, restChoice: 'rest' as const }
            : e
        ),
      }));
      writeMissions(newMissions);
    }
    // 主动触发：什么 encounter 都不改

    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_rest_pending',
      value: JSON.stringify(null),
    });

    onClose();
  };

  // 2026-06-21 加：customWarehouseRef（**永远传**，让"小队详情"UI + 队伍背包空状态都显示）
  //   - 让玩家在休整时也能分配战利品
  //   - 关闭时**不**清空 tempLoot（任务还在 active）
  //   - 队伍背包空时也显示 UI（emptyMessage 提示玩家）
  // 2026-06-21 M3 加：commit 内部计算好感度增量（手动分配 + 智能分配风格）
  const customWarehouseRef = mission
    ? {
        items: currentTempLoot,
        commit: (newItems: InventoryItem[]) => {
          if (!mission) return;
          // 找出被分走的物品（old tempLoot - new tempLoot）
          const newIds = new Set(newItems.map(i => i.instanceId ?? i.itemId));
          const removedItems = currentTempLoot.filter(i => !newIds.has(i.instanceId ?? i.itemId));
          if (removedItems.length > 0) {
            // 找出 inventory 包含被分走物品的角色（接收者）
            const allChars = getCharacters();
            const removedItemIds = new Set(removedItems.map(i => i.itemId));
            const targets = allChars.filter(c =>
              (c.inventory ?? []).filter((i): i is InventoryItem => i !== null).some(i => removedItemIds.has(i.itemId))
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
                console.log(`[好感度/休整分配] ${affinitySummary.join(', ')}`);
              }
            }
          }
          // 写回 mission.tempLoot
          const missions = readMissions();
          const newMissions = missions.map(m => {
            if (m.id !== mission.id) return m;
            return { ...m, tempLoot: newItems };
          });
          writeMissions(newMissions);
          stageStateManager.setStageVarAndCommit({
            key: '_tempLoot_updated',
            value: Date.now(),
          });
        },
        label: '队伍背包',
        emptyMessage: '没有可分配的战利品',
      }
    : undefined;

  return (
    <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
      {/* 复用 ScavengeCharacterPanel（restMode=true）
          - 内部关闭按钮（panel 标题栏的 ×）被点击时，会调 onClose
          - 玩家"完成休整"或"跳过"都是同一个行为：关闭 modal
            （区别只是玩家是否消耗了物品，但行为上都是 close） */}
      <div className={styles.panelWrapper}>
        <ScavengeCharacterPanel
          restrictView
          restrictTransfer
          partyCharacterIds={partyIds}
          onClose={handleClose}
          customWarehouseRef={customWarehouseRef}
        />
      </div>
    </div>
  );
};
