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
import { Mission, markMissionOutcomeShown } from '../ScavengeMissions/missions';
import { ScavengeLocationItem, SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CombatLogEntry } from '../ScavengeCombat/combat';
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
    character = (rawChars as unknown as ScavengeCharacter[])
      .map(c => normalizeCharacter(c))
      .find(c => c.id === mission.characterId);
  }

  const isSuccess = outcome.success;

  // 2026-06-09 加：聚合所有 encounter 的战斗记录（玩家被击倒时看过程）
  // 失败时通常只 1 个 encounter 有 combatLog（致命的）
  // 成功时多个 encounter 都有
  const allCombatLogs: { encounterIdx: number; kind: string; entry: CombatLogEntry }[] = [];
  (mission.encounters ?? []).forEach((enc, idx) => {
    if (enc.combatLog) {
      enc.combatLog.forEach((entry) => {
        allCombatLogs.push({ encounterIdx: idx + 1, kind: enc.kind, entry });
      });
    }
  });
  // 限制最多显示 30 条（避免太长）
  const MAX_LOG_LINES = 30;
  const visibleLogs = allCombatLogs.slice(0, MAX_LOG_LINES);
  const hiddenCount = allCombatLogs.length - visibleLogs.length;
  // 2026-06-09 改：提前返回用黄色（中性）
  const isEarlyReturn = outcome.reason === 'early_return';
  const accentColor = isEarlyReturn ? '#FFA726' : (isSuccess ? '#4CAF50' : '#F44336');
  const statusIcon = isEarlyReturn ? 'material-symbols:logout' : (isSuccess ? checkCircle : cancel);
  const statusLabel = isEarlyReturn ? '提前返回' : (isSuccess ? '任务完成' : '任务失败');
  const reasonText: Record<string, string> = {
    completed: '任务顺利完成',
    cancelled: '派遣被取消',
    character_dead: '角色在任务中倒下',
    early_return: '提前返回（经验 ×50%）',  // 2026-06-09 加：Plan 4
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
            {outcome.bottlecapsGained !== undefined && outcome.bottlecapsGained > 0 && (
              <div className={styles.rewardBadge} style={{ borderColor: '#fbbf24' }} title="瓶盖（参考辐射4）">
                <Icon icon="material-symbols:attach-money" className={styles.rewardIcon} style={{ color: '#fbbf24' }} />
                <span className={styles.rewardValue}>+{outcome.bottlecapsGained} 瓶盖</span>
              </div>
            )}
          </div>
        )}

        {/* 失败原因详情 */}
        {!isSuccess && (
          <div className={styles.failureMsg}>{outcome.message}</div>
        )}

        {/* 2026-06-09 加：丢失物品（战斗失败时显示） */}
        {!isSuccess && outcome.lostItems && outcome.lostItems.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Icon icon="material-symbols:remove-shopping-cart" className={styles.sectionIcon} style={{ color: '#F44336' }} />
              丢失物品
            </div>
            <div className={styles.itemList}>
              {outcome.lostItems.map((lost, idx) => (
                <div key={`${lost.item.instanceId}-${idx}`} className={styles.itemRow} style={{ opacity: 0.6 }}>
                  <div className={styles.itemIcon} style={{ color: getItemRarityColor(lost.item.itemId) }}>
                    <Icon icon={getItemIcon(lost.item.itemId)} />
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemName} style={{ textDecoration: 'line-through' }}>
                      {getItemName(lost.item.itemId)}
                    </div>
                    <div className={styles.itemQty}>× {lost.lostCount} 丢失</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 战斗记录（2026-06-09 加：被击倒时让玩家看到战斗过程） */}
        {visibleLogs.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              战斗记录
              <span className={styles.sectionMeta}>
                （共 {allCombatLogs.length} 条{hiddenCount > 0 ? `，显示前 ${MAX_LOG_LINES} 条` : ''}）
              </span>
            </div>
            <div className={styles.combatLog}>
              {visibleLogs.map(({ encounterIdx, entry }, idx) => {
                // 简化显示：armor_absorb 简写，hit 显示 -X HP，crit 高亮
                const isHit = entry.kind === 'hit';
                const isCrit = entry.kind === 'crit';
                const isMiss = entry.kind === 'miss';
                const isAbsorb = entry.kind === 'armor_absorb';
                const isDeath = entry.kind === 'death';
                const isSystem = entry.kind === 'system' || entry.kind === 'weapon_break' || entry.kind === 'weapon_switch' || entry.kind === 'fist_fallback' || entry.kind === 'weapon_durability_loss';
                let lineText = '';
                let lineClass = '';
                if (isHit) {
                  lineText = `T${entry.tick} ${entry.attackerName} → ${entry.defenderName} -${entry.damage} (${entry.defenderHp}/${entry.defenderMaxHp})`;
                  lineClass = styles.logHit;
                } else if (isCrit) {
                  lineText = `T${entry.tick} 暴击！${entry.attackerName} → ${entry.defenderName} -${entry.damage} (${entry.defenderHp}/${entry.defenderMaxHp})`;
                  lineClass = styles.logCrit;
                } else if (isMiss) {
                  lineText = `T${entry.tick} ${entry.attackerName} → ${entry.defenderName} 未命中`;
                  lineClass = styles.logMiss;
                } else if (isAbsorb) {
                  lineText = `T${entry.tick} 护甲 [${entry.defenderName}] 抵消 ${entry.damage} 伤害 (${entry.flavor ?? ''})`;
                  lineClass = styles.logAbsorb;
                } else if (isDeath) {
                  lineText = `T${entry.tick} ${entry.defenderName} 被击倒`;
                  lineClass = styles.logDeath;
                } else if (isSystem) {
                  lineText = `T${entry.tick} ${entry.attackerName} ${entry.defenderName} ${entry.flavor ?? entry.kind}`;
                  lineClass = styles.logSystem;
                } else {
                  lineText = `T${entry.tick} [${entry.kind}] ${entry.attackerName} ${entry.defenderName}`;
                }
                return (
                  <div key={entry.id ?? idx} className={`${styles.logLine} ${lineClass}`}>
                    <span className={styles.logEncounterTag}>#{encounterIdx}</span>
                    {lineText}
                  </div>
                );
              })}
            </div>
          </div>
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
