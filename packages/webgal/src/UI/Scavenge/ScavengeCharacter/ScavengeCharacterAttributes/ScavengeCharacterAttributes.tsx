import { useState } from 'react';
import { ScavengeCharacter, MainStat, MAIN_STAT_NAMES } from '../character';
import { getItemById, isEquipment, EquipmentItem } from '../../ScavengeItems/items';
// 2026-06-09 改：用统一的 getFinalAttr 拿"基础 + 装备 + 特性"总值
// 之前用 prop 传装备 bonus + 自己算特性 bonus（3 个不同来源 → 不一致）
// 现在所有系统都从这一个函数取
import { getFinalAttr } from '../ScavengeCharacterPanel/ScavengeCharacterPanel.stats';
import styles from './ScavengeCharacterAttributes.module.scss';

interface ScavengeCharacterAttributesProps {
  charData: ScavengeCharacter;
  /** 玩家点"保存加点"时回调：父组件更新 GameVar */
  onApplyPending?: (pending: { str: number; agi: number; end: number; int: number }) => void;
  /** 玩家切换拾荒策略时回调：父组件更新 GameVar */
  onChangeStrategy?: (strategy: 'stealth' | 'combat') => void;
}

const STAT_KEYS: MainStat[] = ['str', 'agi', 'end', 'int'];
const ZERO_PENDING = { str: 0, agi: 0, end: 0, int: 0 };

export const ScavengeCharacterAttributes = ({
  charData,
  onApplyPending,
  onChangeStrategy,
}: ScavengeCharacterAttributesProps) => {
  // 暂存状态：玩家在 UI 上点 +/- 调整，点"保存加点"才真正提交
  const [pending, setPending] = useState({ ...ZERO_PENDING });

  const totalPending = pending.str + pending.agi + pending.end + pending.int;
  const remainingPoints = charData.statPoints - totalPending;
  const canEdit = charData.statPoints > 0;
  const hasPending = totalPending > 0;

  const handlePlus = (stat: MainStat) => {
    if (remainingPoints <= 0) return;
    setPending({ ...pending, [stat]: pending[stat] + 1 });
  };

  const handleMinus = (stat: MainStat) => {
    if (pending[stat] <= 0) return;
    setPending({ ...pending, [stat]: pending[stat] - 1 });
  };

  const handleSave = () => {
    if (totalPending <= 0) return;
    onApplyPending?.(pending);
    setPending({ ...ZERO_PENDING });
  };

  const handleCancel = () => {
    setPending({ ...ZERO_PENDING });
  };

  return (
    <div className={styles.attrPanel}>
      <div className={styles.sectionTitle}>角色属性</div>
      <div className={styles.attrList}>
        {STAT_KEYS.map(stat => {
          // 2026-06-09 改：统一用 getFinalAttr（基础 + 装备 + 特性） + pending（暂存）
          // 之前 base + bonus + trait + pend 是 4 个字段相加，现在简化为 2 个
          // 这样保证：UI 显示的"str/agi/end/int" 和 战斗公式用的"str/agi/end/int"完全一致
          const base = charData[stat];
          const finalized = getFinalAttr(charData, stat);
          const totalBonus = finalized - base;  // 装备 + 特性的总和
          const pend = pending[stat];
          const displayValue = Math.max(0, finalized + pend);
          return (
            <div
              key={stat}
              className={`${styles.attrRow} ${pend > 0 ? styles.attrRowPending : ''}`}
            >
              <span className={styles.attrName}>
                {MAIN_STAT_NAMES[stat]} <span className={styles.attrKey}>{stat.toUpperCase()}</span>
              </span>
              <span className={styles.attrValue}>
                {displayValue}
                {totalBonus > 0 && (
                  <span className={styles.attrBonus}>+{totalBonus}</span>
                )}
                {totalBonus < 0 && (
                  <span className={styles.attrBonus}>{totalBonus}</span>
                )}
                {pend > 0 && (
                  <span className={styles.attrPendingDelta}>+{pend}</span>
                )}
              </span>
              {canEdit && (
                <div className={styles.attrControls}>
                  <button
                    className={styles.attrBtn}
                    disabled={pend <= 0}
                    onClick={() => handleMinus(stat)}
                    title="减 1 点"
                  >−</button>
                  <button
                    className={styles.attrBtn}
                    disabled={remainingPoints <= 0}
                    onClick={() => handlePlus(stat)}
                    title="加 1 点"
                  >+</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 可加点时才显示剩余点数 + 保存按钮 */}
      {canEdit && (
        <div className={styles.attrActions}>
          <div className={styles.remainingPoints}>
            <span className={styles.remainingLabel}>待分配</span>
            <span className={styles.remainingValue}>{totalPending}</span>
            <span className={styles.remainingSeparator}>/</span>
            <span className={styles.remainingTotal}>{charData.statPoints}</span>
          </div>
          <div className={styles.attrActionBtns}>
            {hasPending && (
              <button className={styles.cancelBtn} onClick={handleCancel}>
                取消
              </button>
            )}
            <button
              className={styles.saveBtn}
              disabled={!hasPending}
              onClick={handleSave}
            >
              保存加点
            </button>
          </div>
        </div>
      )}

      {/* 拾荒策略切换（始终显示，派遣前/后都能改） */}
      {onChangeStrategy && (
        <div className={styles.strategyRow}>
          <span className={styles.strategyLabel}>拾荒策略</span>
          <div className={styles.strategyBtns}>
            <button
              className={`${styles.strategyBtn} ${charData.strategy === 'stealth' ? styles.strategyBtnActive : ''}`}
              onClick={() => onChangeStrategy('stealth')}
              title="优先隐蔽，失败再战斗"
            >
              隐蔽
            </button>
            <button
              className={`${styles.strategyBtn} ${charData.strategy === 'combat' ? styles.strategyBtnActive : ''}`}
              onClick={() => onChangeStrategy('combat')}
              title="直接战斗"
            >
              战斗
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
