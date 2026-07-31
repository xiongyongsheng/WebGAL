/**
 * 建造/制作/修补 Modal（2026-06-21 加）
 *
 * UI 结构：
 * - 3 个 tab：工作台 / 制作 / 修补
 * - 选蓝图 / 物品 / 目标
 * - 选角色（仅空闲的）
 * - 选时间（开始时间 + 消耗小时）
 * - 调 start* action
 *
 * 入口：
 * - 安全屋 modal（safehouse_scene 场景）点"工作台"按钮
 * - 厨房 modal（kitchen 场景）点"烹饪工作台"按钮
 */

import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { useStageState } from '@/hooks/useStageState';
import { Modal } from '@/UI/Common/Modal';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { getCharacters } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { InventoryItem } from '../ScavengeItems/inventory';
import { getItemById } from '../ScavengeItems/items';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import {
  WORKBENCH_BLUEPRINTS,
  CRAFT_BLUEPRINTS,
  REPAIR_COSTS,
  REPAIR_AMOUNTS,
  BlueprintId,
} from './blueprints';
import { getWorkbenches, getSafehouseStructure, checkWarehouseHasBlueprint, countBlueprintInWarehouse } from './craftingStore';
import { getWarehouse } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { startWorkbenchBuild, startCrafting, startRepair, checkCraftingConflicts } from './craftingActions';
import styles from './CraftingModal.module.scss';

interface CraftingModalProps {
  /** 当前 day / period（来自 stageState） */
  currentDay: number;
  currentPeriod: number;
  /** 关闭回调 */
  onClose: () => void;
  /** 默认 tab */
  defaultTab?: 'build' | 'craft' | 'repair';
  /** 工作台类型限制（如果从特定工作台点过来，只显示该类型制作） */
  workbenchTypeFilter?: 'melee' | 'armor' | 'cooking';
}

type Tab = 'build' | 'craft' | 'repair';

/** 一时段多少小时（2026-06-21 假设 1）*/
const HOURS_PER_PERIOD = 1;

export const CraftingModal = ({
  currentDay, currentPeriod, onClose, defaultTab = 'build', workbenchTypeFilter,
}: CraftingModalProps) => {
  const stageState = useStageState();
  // 重新读一次以触发重渲染
  void stageState;

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<'door' | 'window' | null>(null);
  const [selectedWorkbenchId, setSelectedWorkbenchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allChars = getCharacters();
  // 2026-06-21 改：蓝图当**普**通物**品**入仓库，**不**用 ownedBlueprints
  const workbenches = getWorkbenches();
  const safehouse = getSafehouseStructure();

  // 2026-06-21 加：过滤商人（中立 NPC，不能参与 crafting/repair）
  //   - 商人有独立 merchantAffection，**不**走通用任务系统
  //   - 让商人进工作台 = 浪费商人时间
  const isMerchant = (char: ScavengeCharacter): boolean => {
    const template = CHARACTER_TEMPLATES[char.id];
    return template?.isMerchant ?? false;
  };

  // 2026-06-21 加：检查仓库材料（**返**回每个材料的 缺/有 详细）
  //   - 之**前** check 角色背包，现在改**为**仓库（**材**料从仓库扣）
  //   - **返**回**详**细**数**组**给 UI 显**示**"X×有/缺 N"
  const checkWarehouseMaterials = (materials: readonly { itemId: string; quantity: number }[]): {
    satisfied: boolean;
    details: Array<{ itemId: string; required: number; owned: number; missing: number }>;
  } => {
    const warehouse = getWarehouse();
    const details = materials.map(m => {
      const found = warehouse.find(i => i.itemId === m.itemId);
      const owned = found?.quantity ?? 0;
      const missing = Math.max(0, m.quantity - owned);
      return { itemId: m.itemId, required: m.quantity, owned, missing };
    });
    const satisfied = details.every(d => d.missing === 0);
    return { satisfied, details };
  };

  // ============== 数据准备 ==============

  // 2026-06-21 改：列出**所**有**3**个**工作台**蓝**图**
  //   - 检**查**仓库里**有**没**有**图纸（checkWarehouseHasBlueprint）
  //   - 检**查**仓库材料**满**足（checkWarehouseMaterials）
  //   - 缺什么/缺几**个**记**录**在 materialDetails
  const buildableWorkbenches = useMemo(() => {
    return Object.values(WORKBENCH_BLUEPRINTS).map(bp => {
      const hasBlueprint = checkWarehouseHasBlueprint(bp.id);
      const blueprintCount = countBlueprintInWarehouse(bp.id);
      const alreadyBuilt = workbenches.some(w => w.type === bp.workbenchType);
      const matCheck = checkWarehouseMaterials(bp.materials);
      const canBuild = hasBlueprint && !alreadyBuilt && matCheck.satisfied;
      return {
        blueprint: bp,
        hasBlueprint,
        blueprintCount,
        alreadyBuilt,
        canBuild,
        materialDetails: matCheck.details,
      };
    });
  }, [workbenches]);

  // 可制作物品（仓库里**有**图纸 + 材料**满**足 + 工作台存在 + 未在工作）
  const craftableItems = useMemo(() => {
    return Object.values(CRAFT_BLUEPRINTS)
      .filter(bp => !workbenchTypeFilter || bp.workbenchType === workbenchTypeFilter)
      .map(bp => {
        const hasBlueprint = checkWarehouseHasBlueprint(bp.id);
        const matCheck = checkWarehouseMaterials(bp.materials);
        const wb = workbenches.find(w => w.type === bp.workbenchType);
        return {
          blueprint: bp,
          workbenchId: wb?.id,
          canCraft: hasBlueprint && matCheck.satisfied && !!wb && !wb.currentJob,
          materialDetails: matCheck.details,
        };
      });
  }, [workbenches, workbenchTypeFilter]);

  // 空闲角色（2026-06-21 改：排除商人）
  //   - 商人有**独**立**的** merchantAffection 任务系统
  //   - 商人**不**应该**接**拾**荒**/休息/工作台/修**补**等通用任务
  //   - 让**他**们去工作台 = **浪**费**他**们的**时**间，**应**该让他们**专**注交易
  //   - **未**来**扩**展：商人**可**以**接**"商队护送"**等**特殊任务
  const idleChars = useMemo(() => {
    return allChars.filter(c => !isMerchant(c) && !checkCraftingConflicts(c));
  }, [allChars]);

  // ============== 计算总耗时 + 结束时间 ==============

  const computeEndTime = (startDay: number, startPeriod: number, hours: number) => {
    const PERIODS_PER_DAY = 4;
    const totalPeriods = startPeriod + hours;
    const dayOffset = Math.floor(totalPeriods / PERIODS_PER_DAY);
    const period = totalPeriods % PERIODS_PER_DAY;
    return { day: startDay + dayOffset, period };
  };

  // ============== 提交 ==============

  const handleSubmit = () => {
    setError(null);
    if (tab === 'build') {
      if (!selectedBlueprintId) { setError('请选择蓝图'); return; }
      if (!selectedCharId) { setError('请选择角色'); return; }
      const r = startWorkbenchBuild(selectedCharId, selectedBlueprintId, currentDay, currentPeriod);
      if (!r.success) { setError(r.reason ?? '失败'); return; }
      onClose();
    } else if (tab === 'craft') {
      if (!selectedBlueprintId) { setError('请选择物品'); return; }
      if (!selectedCharId) { setError('请选择角色'); return; }
      if (!selectedWorkbenchId) { setError('请选择工作台'); return; }
      const r = startCrafting(selectedCharId, selectedWorkbenchId, selectedBlueprintId, currentDay, currentPeriod);
      if (!r.success) { setError(r.reason ?? '失败'); return; }
      onClose();
    } else if (tab === 'repair') {
      if (!selectedTarget) { setError('请选择修补目标'); return; }
      if (!selectedCharId) { setError('请选择角色'); return; }
      const r = startRepair(selectedCharId, selectedTarget, currentDay, currentPeriod);
      if (!r.success) { setError(r.reason ?? '失败'); return; }
      onClose();
    }
  };

  // ============== 计算当前选中的"信息"显示 ==============

  const renderSelectedInfo = () => {
    if (tab === 'build' && selectedBlueprintId) {
      const bp = WORKBENCH_BLUEPRINTS[selectedBlueprintId as keyof typeof WORKBENCH_BLUEPRINTS];
      if (!bp) return null;
      const end = computeEndTime(currentDay, currentPeriod, bp.buildTime);
      return (
        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <strong>{bp.name}</strong>
            <span className={styles.infoTime}>耗时 {bp.buildTime} 回合</span>
          </div>
          <div className={styles.infoMaterials}>
            {bp.materials.map((m, i) => (
              <span key={i} className={styles.materialChip}>
                {getItemById(m.itemId)?.name ?? m.itemId} × {m.quantity}
              </span>
            ))}
          </div>
          <div className={styles.infoFooter}>
            完成时间：第 {end.day + 1} 天 第 {end.period + 1} 时段
          </div>
        </div>
      );
    }
    if (tab === 'craft' && selectedBlueprintId) {
      const bp = CRAFT_BLUEPRINTS[selectedBlueprintId as keyof typeof CRAFT_BLUEPRINTS];
      if (!bp) return null;
      const wb = workbenches.find(w => w.id === selectedWorkbenchId);
      if (!wb) return null;
      const end = computeEndTime(currentDay, currentPeriod, bp.craftTime);
      return (
        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <strong>{bp.name}</strong>
            <span className={styles.infoTime}>耗时 {bp.craftTime} 回合</span>
          </div>
          <div className={styles.infoMaterials}>
            {bp.materials.map((m, i) => (
              <span key={i} className={styles.materialChip}>
                {getItemById(m.itemId)?.name ?? m.itemId} × {m.quantity}
              </span>
            ))}
          </div>
          <div className={styles.infoFooter}>
            在 {wb.name} 制作 · 完成：第 {end.day + 1} 天 第 {end.period + 1} 时段
          </div>
        </div>
      );
    }
    if (tab === 'repair' && selectedTarget) {
      const cost = selectedTarget === 'door' ? REPAIR_COSTS.door : REPAIR_COSTS.window;
      const recover = selectedTarget === 'door' ? REPAIR_AMOUNTS.door : REPAIR_AMOUNTS.window;
      const end = computeEndTime(currentDay, currentPeriod, cost.hours);
      return (
        <div className={styles.infoBox}>
          <div className={styles.infoRow}>
            <strong>修补{selectedTarget === 'door' ? '门' : '窗'}</strong>
            <span className={styles.infoTime}>耗时 {cost.hours} 回合</span>
          </div>
          <div className={styles.infoMaterials}>
            <span className={styles.materialChip}>木材 × {cost.materialWood}</span>
          </div>
          <div className={styles.infoFooter}>
            恢复 +{recover} HP · 完成：第 {end.day + 1} 天 第 {end.period + 1} 时段
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      title="建造与修补"
      titleIcon="material-symbols:construction"
      onClose={onClose}
      width={720}
    >
        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'build' ? styles.tabActive : ''}`}
            onClick={() => { setTab('build'); setSelectedBlueprintId(null); setError(null); }}
          >
            <Icon icon="material-symbols:carpenter" /> 建造工作台
          </button>
          <button
            className={`${styles.tab} ${tab === 'craft' ? styles.tabActive : ''}`}
            onClick={() => { setTab('craft'); setSelectedBlueprintId(null); setError(null); }}
          >
            <Icon icon="material-symbols:handyman" /> 制作物品
          </button>
          <button
            className={`${styles.tab} ${tab === 'repair' ? styles.tabActive : ''}`}
            onClick={() => { setTab('repair'); setSelectedTarget(null); setError(null); }}
          >
            <Icon icon="material-symbols:build" /> 修补门窗
          </button>
        </div>

        {/* 主体 */}
        <div className={styles.body}>
          {/* 左侧：选项列表 */}
          <div className={styles.list}>
            {tab === 'build' && (
              <>
                <div className={styles.listHeader}>所有工作台蓝图</div>
                {buildableWorkbenches.map(({ blueprint: bp, hasBlueprint, alreadyBuilt, canBuild, materialDetails }) => {
                  // 4 种状态 badge + 原因
                  let badge: string | null = null;
                  let reason: string | null = null;
                  if (!hasBlueprint) {
                    badge = '未解锁';
                    reason = bp.unlockHint;
                  } else if (alreadyBuilt) {
                    badge = '已建造';
                    reason = '已有同类工作台';
                  } else if (!canBuild) {
                    badge = '缺材料';
                    // 列出**缺**哪**些**材料（**只**显**示**缺**的**）
                    const missingItems = materialDetails
                      .filter(d => d.missing > 0)
                      .map(d => `${getItemById(d.itemId)?.name ?? d.itemId}×${d.missing}`);
                    reason = `缺：${missingItems.join('、')}`;
                  }
                  return (
                    <button
                      key={bp.id}
                      className={`${styles.listItem} ${selectedBlueprintId === bp.id ? styles.listItemActive : ''} ${!canBuild ? styles.listItemDisabled : ''}`}
                      onClick={() => setSelectedBlueprintId(bp.id)}
                      disabled={!canBuild}
                    >
                      <div className={styles.listItemTitle}>
                        {bp.name}
                        {badge && <span className={styles.badge}>{badge}</span>}
                      </div>
                      <div className={styles.listItemMaterials}>
                        {materialDetails.map((d, i) => (
                          <span
                            key={i}
                            className={styles.materialChip}
                            style={{ color: d.missing > 0 ? '#f87171' : '#4ade80' }}
                          >
                            {getItemById(d.itemId)?.name ?? d.itemId} {d.owned}/{d.required}
                          </span>
                        ))}
                      </div>
                      <div className={styles.listItemMeta}>
                        <span>耗时 {bp.buildTime} 回合</span>
                      </div>
                      {reason && (
                        <div className={styles.listItemReason}>{reason}</div>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {tab === 'craft' && (
              <>
                <div className={styles.listHeader}>可制作物品</div>
                {craftableItems.length === 0 ? (
                  <div className={styles.empty}>没有可制作的物品</div>
                ) : craftableItems.map(({ blueprint: bp, workbenchId, canCraft, materialDetails }) => {
                  // 4 种状态 badge + 原因
                  let badge: string | null = null;
                  let reason: string | null = null;
                  const hasBlueprint = checkWarehouseHasBlueprint(bp.id);
                  const wb = workbenches.find(w => w.id === workbenchId);
                  if (!hasBlueprint) {
                    badge = '缺图纸';
                    reason = '仓库里没有该图纸';
                  } else if (!wb) {
                    badge = '缺工作台';
                    reason = '需要先建造对应工作台';
                  } else if (wb.currentJob) {
                    badge = '工作台忙';
                    reason = '工作台正在被使用';
                  } else if (!canCraft) {
                    badge = '缺材料';
                    const missingItems = materialDetails
                      .filter(d => d.missing > 0)
                      .map(d => `${getItemById(d.itemId)?.name ?? d.itemId}×${d.missing}`);
                    reason = `缺：${missingItems.join('、')}`;
                  }
                  return (
                    <button
                      key={bp.id}
                      className={`${styles.listItem} ${selectedBlueprintId === bp.id ? styles.listItemActive : ''} ${!canCraft ? styles.listItemDisabled : ''}`}
                      onClick={() => {
                        setSelectedBlueprintId(bp.id);
                        if (workbenchId) setSelectedWorkbenchId(workbenchId);
                      }}
                      disabled={!canCraft}
                    >
                      <div className={styles.listItemTitle}>
                        {bp.name}
                        {badge && <span className={styles.badge}>{badge}</span>}
                      </div>
                      <div className={styles.listItemSub}>
                        {materialDetails.map((d, i) => (
                          <span
                            key={i}
                            style={{
                              marginRight: 4,
                              color: d.missing > 0 ? '#f87171' : '#4ade80',
                            }}
                          >
                            {getItemById(d.itemId)?.name ?? d.itemId} {d.owned}/{d.required}
                            {d.missing > 0 && <span style={{ marginLeft: 2 }}>(缺{d.missing})</span>}
                          </span>
                        ))}
                      </div>
                      <div className={styles.listItemSub} style={{ marginTop: 2, opacity: 0.7 }}>
                        耗时 {bp.craftTime} 回合
                      </div>
                      {reason && (
                        <div className={styles.listItemReason}>{reason}</div>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {tab === 'repair' && (
              <>
                <div className={styles.listHeader}>门窗状态</div>
                <button
                  className={`${styles.listItem} ${selectedTarget === 'door' ? styles.listItemActive : ''} ${safehouse.doorRepairJob ? styles.listItemDisabled : ''}`}
                  onClick={() => setSelectedTarget('door')}
                  disabled={!!safehouse.doorRepairJob}
                >
                  <div className={styles.listItemTitle}>
                    门
                    {safehouse.doorRepairJob && <span className={styles.badge}>修补中</span>}
                  </div>
                  <div className={styles.listItemSub}>
                    {safehouse.door.hp} / {safehouse.door.maxHp} HP
                  </div>
                </button>
                <button
                  className={`${styles.listItem} ${selectedTarget === 'window' ? styles.listItemActive : ''} ${safehouse.windowRepairJob ? styles.listItemDisabled : ''}`}
                  onClick={() => setSelectedTarget('window')}
                  disabled={!!safehouse.windowRepairJob}
                >
                  <div className={styles.listItemTitle}>
                    窗（×{safehouse.windows.count}）
                    {safehouse.windowRepairJob && <span className={styles.badge}>修补中</span>}
                  </div>
                  <div className={styles.listItemSub}>
                    {safehouse.windows.eachHp} / {safehouse.windows.eachMaxHp} HP/扇
                  </div>
                </button>
              </>
            )}
          </div>

          {/* 右侧：角色选择 + 信息 */}
          <div className={styles.detail}>
            <div className={styles.listHeader}>选择角色</div>
            {idleChars.length === 0 ? (
              <div className={styles.empty}>所有角色都在忙</div>
            ) : (
              <div className={styles.charGrid}>
                {idleChars.map(c => (
                  <button
                    key={c.id}
                    className={`${styles.charItem} ${selectedCharId === c.id ? styles.charItemActive : ''}`}
                    onClick={() => setSelectedCharId(c.id)}
                  >
                    <span className={styles.charAvatar}>{c.name.charAt(0)}</span>
                    <span className={styles.charName}>{c.name}</span>
                  </button>
                ))}
              </div>
            )}

            {renderSelectedInfo()}

            {error && <div className={styles.error}>{error}</div>}
          </div>
        </div>

        {/* 底部：操作按钮 */}
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={() => {
            console.log('[CraftingModal] cancel btn click');
            onClose();
          }}>取消</button>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={
              (tab === 'build' && (!selectedBlueprintId || !selectedCharId)) ||
              (tab === 'craft' && (!selectedBlueprintId || !selectedCharId)) ||
              (tab === 'repair' && (!selectedTarget || !selectedCharId))
            }
          >
            开始
          </button>
        </div>
    </Modal>
  );
};
