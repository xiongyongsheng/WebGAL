/**
 * 派遣结算结果弹窗
 *
 * 显示派遣完成/失败的详细结果：地点、角色、物品、经验、HP。
 * 点"确定"后调 markMissionOutcomeShown，避免刷新页面再弹。
 */
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import cancel from '@iconify-icons/material-symbols/cancel';
import inventory from '@iconify-icons/material-symbols/inventory';
import experience from '@iconify-icons/material-symbols/stars';
import heart from '@iconify-icons/material-symbols/favorite';
import { Mission, MissionOutcome, markMissionOutcomeShown } from '../ScavengeMissions/missions';
import { ScavengeLocationItem, SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { getItemName, getItemIcon, getItemRarityColor } from '../ScavengeItems/items';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { normalizeCharacter } from '../ScavengeCharacter/character';
import styles from './ScavengeMissionOutcomeModal.module.scss';

interface ScavengeMissionOutcomeModalProps {
  mission: Mission;
  onClose: () => void;
}

export const ScavengeMissionOutcomeModal = ({ mission, onClose }: ScavengeMissionOutcomeModalProps) => {
  const outcome = mission.outcome;
  if (!outcome) return null;

  // 解析地点
  const location: ScavengeLocationItem | undefined = SCAVENGE_LOCATIONS.find(l => l.id === mission.locationId);

  // 解析角色
  const rawChars = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
  let character: ScavengeCharacter | undefined;
  if (typeof rawChars === 'string') {
    try {
      const parsed = JSON.parse(rawChars);
      if (Array.isArray(parsed)) {
        character = (parsed as ScavengeCharacter[])
          .map(c => normalizeCharacter(c))
          .find(c => c.id === mission.characterId);
      }
    } catch { /* ignore */ }
  } else if (Array.isArray(rawChars)) {
    character = (rawChars as ScavengeCharacter[])
      .map(c => normalizeCharacter(c))
      .find(c => c.id === mission.characterId);
  }

  const isSuccess = outcome.success;
  const accentColor = isSuccess ? '#4CAF50' : '#F44336';
  const statusIcon = isSuccess ? checkCircle : cancel;
  const statusLabel = isSuccess ? '任务完成' : '任务失败';
  const reasonText: Record<string, string> = {
    completed: '任务顺利完成',
    cancelled: '派遣被取消',
    character_dead: '角色在任务中倒下',
  };

  const handleClose = () => {
    markMissionOutcomeShown(mission.id);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题 */}
        <div className={styles.header} style={{ borderBottomColor: accentColor }}>
          <div className={styles.titleGroup}>
            <Icon
              icon={statusIcon}
              className={styles.statusIcon}
              style={{ color: accentColor }}
            />
            <h2 className={styles.title} style={{ color: accentColor }}>
              {statusLabel}
            </h2>
          </div>
          <button className={styles.closeButton} onClick={handleClose}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 摘要 */}
        <div className={styles.summary}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>地点</span>
            <span className={styles.summaryValue}>
              {location?.name ?? mission.locationId}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>执行人</span>
            <span className={styles.summaryValue}>
              {character?.name ?? mission.characterId}
              {character && (
                <span className={styles.summaryMeta}>
                  {' '}Lv.{character.level} · 剩余 HP {character.hp}
                </span>
              )}
            </span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>状态</span>
            <span className={styles.summaryValue} style={{ color: accentColor }}>
              {reasonText[outcome.reason] ?? outcome.reason}
            </span>
          </div>
        </div>

        {/* 物品列表（成功才有） */}
        {isSuccess && outcome.itemsGained.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Icon icon={inventory} className={styles.sectionIcon} />
              获得物品
            </div>
            <div className={styles.itemList}>
              {outcome.itemsGained.map((item, idx) => (
                <div key={`${item.instanceId}-${idx}`} className={styles.itemRow}>
                  <div className={styles.itemIcon} style={{ color: getItemRarityColor(item.itemId) }}>
                    <Icon icon={getItemIcon(item.itemId)} />
                  </div>
                  <span className={styles.itemName}>{getItemName(item.itemId)}</span>
                  <span className={styles.itemQty}>x{item.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 经验 + HP 损失（成功才有） */}
        {isSuccess && (
          <div className={styles.rewardsRow}>
            {outcome.expGained > 0 && (
              <div className={styles.rewardBadge} style={{ borderColor: '#FFD700' }}>
                <Icon icon={experience} className={styles.rewardIcon} style={{ color: '#FFD700' }} />
                <span className={styles.rewardValue}>+{outcome.expGained} EXP</span>
              </div>
            )}
            {outcome.hpLost > 0 && (
              <div className={styles.rewardBadge} style={{ borderColor: '#F44336' }}>
                <Icon icon={heart} className={styles.rewardIcon} style={{ color: '#F44336' }} />
                <span className={styles.rewardValue}>-{outcome.hpLost} HP</span>
              </div>
            )}
          </div>
        )}

        {/* 失败原因详情 */}
        {!isSuccess && (
          <div className={styles.failureMsg}>{outcome.message}</div>
        )}

        {/* 底部按钮 */}
        <div className={styles.actions}>
          <button className={styles.confirmButton} onClick={handleClose}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};
