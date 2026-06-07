import { useState } from 'react';
import { ScavengeCharacter, MainStat, MAIN_STAT_NAMES } from '../character';
import { getItemById, isEquipment, EquipmentItem } from '../../ScavengeItems/items';
import styles from './ScavengeCharacterAttributes.module.scss';

interface ScavengeCharacterAttributesProps {
  charData: ScavengeCharacter;
  strBonus: number;
  agiBonus: number;
  endBonus: number;
  intBonus: number;
  /** 玩家点"保存加点"时回调：父组件更新 GameVar */
  onApplyPending?: (pending: { str: number; agi: number; end: number; int: number }) => void;
  /** 玩家切换拾荒策略时回调：父组件更新 GameVar */
  onChangeStrategy?: (strategy: 'stealth' | 'combat') => void;
}

const STAT_KEYS: MainStat[] = ['str', 'agi', 'end', 'int'];
const ZERO_PENDING = { str: 0, agi: 0, end: 0, int: 0 };

export const ScavengeCharacterAttributes = ({
  charData,
  strBonus,
  agiBonus,
  endBonus,
  intBonus,
  onApplyPending,
  onChangeStrategy,
}: ScavengeCharacterAttributesProps) => {
  // 暂存状态：玩家在 UI 上点 +/- 调整，点"保存加点"才真正提交
  const [pending, setPending] = useState({ ...ZERO_PENDING });

  const bonusMap: Record<MainStat, number> = {
    str: strBonus,
    agi: agiBonus,
    end: endBonus,
    int: intBonus,
  };

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
          const base = charData[stat];
          const bonus = bonusMap[stat];
          const pend = pending[stat];
          // 暂存时显示：原值 + 暂存 +N
          const displayValue = base + pend;
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
                {bonus > 0 && (
                  <span className={styles.attrBonus}>+{bonus}</span>
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
