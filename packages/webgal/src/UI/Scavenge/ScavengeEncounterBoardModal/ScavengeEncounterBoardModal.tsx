/**
 * 多队伍回合看板 modal（2026-06-09 重构：参考 ScavengeMapDetail 的 UI 风格）
 *
 * 设计原则（参考地点详情 modal 的"卡片式"布局）：
 * - 每个 mission 一列 = 一个独立卡片
 * - 卡片内：基本信息 grid + 角色状态 + 战斗日志 + 物品 + 奖励
 * - 字体清晰（label 13px / value 16px+）
 * - 颜色分明（成功绿 / 失败红 / 警告橙）
 *
 * 2026-06-09 改：玩家关闭 modal = **所有** mission 都 mark shown
 * 2026-06-09 改：删"已阅"按钮，玩家**主动**关闭 = 玩家**主动**确认
 */
import { useStageState } from '@/hooks/useStageState';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import hotel from '@iconify-icons/material-symbols/hotel';
import inventory from '@iconify-icons/material-symbols/inventory-2';
import swords from '@iconify-icons/material-symbols/swords';
import visibility from '@iconify-icons/material-symbols/visibility';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import cancel from '@iconify-icons/material-symbols/cancel';
import heart from '@iconify-icons/material-symbols/favorite';
import experience from '@iconify-icons/material-symbols/stars';
import shield from '@iconify-icons/material-symbols/shield';
import group from '@iconify-icons/material-symbols/group';
import locationOn from '@iconify-icons/material-symbols/location-on';
import schedule from '@iconify-icons/material-symbols/schedule';
import star from '@iconify-icons/material-symbols/star';
import { Mission, EncounterLog, markEncounterShown, markMissionOutcomeShown } from '../ScavengeMissions/missions';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { ScavengeLocationItem, SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { getItemName, getItemIcon, getItemRarityColor } from '../ScavengeItems/items';
import { CombatLogEntry } from '../ScavengeCombat/combat';
import styles from './ScavengeEncounterBoardModal.module.scss';

interface ScavengeEncounterBoardModalProps {
  onClose: () => void;
  missions: Mission[];
  characters: ScavengeCharacter[];
}

const ENCOUNTER_TITLES: Record<string, string> = {
  resource: '发现物资点',
  stealth_clear: '潜行通过',
  evade_success: '潜行成功',
  combat_victory: '战斗胜利',
  evade_fail_combat_victory: '隐蔽失败 / 战斗胜利',
  combat_defeat: '战斗失败',
  evade_fail_combat_defeat: '隐蔽失败 / 战斗失败',
  location_cleared: '地点已清空',
};

const ENCOUNTER_COLORS: Record<string, string> = {
  resource: '#4caf50',
  stealth_clear: '#4caf50',
  evade_success: '#4caf50',
  combat_victory: '#4caf50',
  evade_fail_combat_victory: '#ffa726',
  combat_defeat: '#f44336',
  evade_fail_combat_defeat: '#f44336',
  location_cleared: '#9e9e9e',
};

const COMBAT_KIND_INFO: Record<string, { color: string; label: string; icon: any }> = {
  hit: { color: '#4a90e2', label: '命中', icon: swords },
  crit: { color: '#FFD700', label: '暴击', icon: swords },
  miss: { color: '#888', label: '未命中', icon: shield },
  death: { color: '#F44336', label: '击倒', icon: cancel },
  armor_absorb: { color: '#90caf9', label: '护甲吸收', icon: shield },
  weapon_break: { color: '#ff7043', label: '武器损坏', icon: swords },
  weapon_switch: { color: '#81c784', label: '切换武器', icon: swords },
  fist_fallback: { color: '#ff5252', label: '拳头', icon: swords },
  weapon_durability_loss: { color: '#a0a0a0', label: '耐久-1', icon: swords },
  system: { color: '#888', label: '系统', icon: shield },
};

const REASON_TEXT: Record<string, string> = {
  completed: '任务顺利完成',
  cancelled: '派遣被取消',
  character_dead: '角色在任务中倒下',
  early_return: '提前返回（经验 ×50%）',
};

export const ScavengeEncounterBoardModal = ({ onClose, missions, characters }: ScavengeEncounterBoardModalProps) => {
  useStageState();

  /**
   * 玩家关闭 modal = **所有** mission 都 mark shown
   * 2026-06-21 改：不再过滤 location_cleared / stealth_clear 等真实遭遇
   *   只过滤旧版"准备期占位" no_encounter（防止旧存档把占位也展示给玩家）
   */
  const handleClose = () => {
    missions.forEach(m => {
      const latestUnshown = (m.encounters ?? [])
        .slice()
        .reverse()
        .find(e => e.kind !== 'no_encounter' && !e.shown);
      if (latestUnshown) {
        markEncounterShown(m.id, latestUnshown.id);
      }
      if (m.outcome && !m.outcomeShown) {
        markMissionOutcomeShown(m.id);
      }
    });
    onClose();
  };

  const handleRestOne = (mission: Mission, encounter: EncounterLog) => {
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_rest_pending',
      value: JSON.stringify({ missionId: mission.id, encounterId: encounter.id }),
    });
    markEncounterShown(mission.id, encounter.id);
    stageStateManager.setStageVarAndCommit({
      key: '_board_dismissed_at',
      value: Date.now(),
    });
  };

  const canRest = (encounter: EncounterLog | null): boolean => {
    if (!encounter) return false;
    return encounter.kind === 'combat_victory' || encounter.kind === 'evade_fail_combat_victory';
  };

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon icon={locationOn} className={styles.titleIcon} />
            <h2 className={styles.title}>当前回合拾荒看板</h2>
            <span className={styles.count}>{missions.length} 队</span>
          </div>
          <button className={styles.closeButton} onClick={handleClose} title="关闭（自动标记所有为已读）">
            <Icon icon={close} />
          </button>
        </div>

        {/* 提示 */}
        <div className={styles.tip}>
          点击空白处或 ✕ 关闭（已自动标记所有为已读）
        </div>

        {/* mission 卡片 */}
        <div className={styles.columns}>
          {missions.map(mission => (
            <MissionColumn
              key={mission.id}
              mission={mission}
              characters={characters}
              onRest={handleRestOne}
              canRest={canRest}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ============== 单 mission 卡片 ==============

const MissionColumn = ({
  mission,
  characters,
  onRest,
  canRest,
}: {
  mission: Mission;
  characters: ScavengeCharacter[];
  onRest: (mission: Mission, encounter: EncounterLog) => void;
  canRest: (encounter: EncounterLog | null) => boolean;
}) => {
  const loc = SCAVENGE_LOCATIONS.find(l => l.id === mission.locationId);
  const partyIds = mission.partyCharacterIds && mission.partyCharacterIds.length > 0
    ? mission.partyCharacterIds
    : [mission.characterId];
  const party = partyIds
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is ScavengeCharacter => Boolean(c));

  // 最新未展示 encounter
  // 2026-06-21 改：保留 no_encounter filter（防止旧存档里准备期占位污染看板）
  //   location_cleared / stealth_clear / evade_success / combat_* / resource 都会展示
  const latestUnshown = (mission.encounters ?? [])
    .slice()
    .reverse()
    .find(e => e.kind !== 'no_encounter' && !e.shown);

  // 2026-06-21 加：判断当前是准备阶段还是拾荒阶段（用于 badge + 准备期标识）
  //   优先看主队员（party[0]）的 missionPhase，因为 MissionSystem 用它来判断 phase
  const mainChar = party[0];
  const isPrepPhase = mainChar?.missionPhase === 'preparing';

  // 状态
  const hasUnshownOutcome = mission.outcome && !mission.outcomeShown;
  const isCompleted = mission.status === 'completed' || mission.status === 'cancelled';
  const isSuccess = mission.outcome?.success;
  const isEarlyReturn = mission.outcome?.reason === 'early_return';

  // 当前显示状态
  let statusTitle: string;
  let statusColor: string;
  let StatusIcon: any;
  if (isCompleted) {
    if (isEarlyReturn) {
      statusTitle = '提前返回';
      statusColor = '#FFA726';
      StatusIcon = 'material-symbols:logout';
    } else if (isSuccess) {
      statusTitle = '任务完成';
      statusColor = '#4CAF50';
      StatusIcon = checkCircle;
    } else {
      statusTitle = '任务失败';
      statusColor = '#F44336';
      StatusIcon = cancel;
    }
  } else if (latestUnshown) {
    statusTitle = ENCOUNTER_TITLES[latestUnshown.kind] ?? latestUnshown.kind;
    statusColor = ENCOUNTER_COLORS[latestUnshown.kind] ?? '#999';
    if (latestUnshown.kind === 'resource') StatusIcon = inventory;
    else if (latestUnshown.kind === 'location_cleared') StatusIcon = 'material-symbols:inventory';
    else if (latestUnshown.kind === 'evade_success' || latestUnshown.kind === 'stealth_clear') StatusIcon = visibility;
    else StatusIcon = swords;
  } else {
    statusTitle = '无遭遇';
    statusColor = '#999';
    StatusIcon = locationOn;
  }

  // 是否能休整
  const showRestButton = !isCompleted && latestUnshown && canRest(latestUnshown);

  // 战斗日志行（聚合失败 mission 的所有 encounter）
  const allCombatLogs: { encounterIdx: number; entry: CombatLogEntry }[] = [];
  if (isCompleted && !isSuccess && !isEarlyReturn) {
    (mission.encounters ?? []).forEach((enc, idx) => {
      if (enc.combatLog) {
        enc.combatLog.forEach((entry) => {
          allCombatLogs.push({ encounterIdx: idx + 1, entry });
        });
      }
    });
  }

  return (
    <div className={styles.column}>
      {/* ============ 顶部：地点 + 状态徽章 ============ */}
      <div className={styles.columnHeader}>
        <Icon icon={locationOn} className={styles.columnHeaderIcon} style={{ color: statusColor }} />
        <div className={styles.columnHeaderTitle}>{loc?.name ?? '?'}</div>
        {/* 2026-06-21 加：准备阶段徽章（蓝色，区别于拾荒） */}
        {!isCompleted && isPrepPhase && (
          <div className={styles.phaseBadge} title="队伍正在前往目标地点，途中可能遭遇游荡者">
            <Icon icon="material-symbols:directions-walk" />
            <span>准备阶段</span>
          </div>
        )}
        <div className={styles.statusBadge} style={{ color: statusColor, borderColor: statusColor }}>
          <Icon icon={StatusIcon} />
          <span>{statusTitle}</span>
        </div>
      </div>

      {/* ============ 基本信息 grid（2x2）============ */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>基本信息</div>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>队伍</span>
            <span className={styles.infoValue}>
              <Icon icon={group} className={styles.infoIcon} />
              {party.length} 人队
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>距离</span>
            <span className={styles.infoValue}>
              <Icon icon={schedule} className={styles.infoIcon} />
              {loc?.distance ?? '?'} 小时
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>危险等级</span>
            <span className={styles.infoValue} style={{ color: '#FFD700' }}>
              <Icon icon={star} className={styles.infoIcon} />
              {loc?.dangerLevel ?? 0}★
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>派遣耗时</span>
            <span className={styles.infoValue}>
              {(loc?.explorationTime ?? 0) + 1} period
            </span>
          </div>
        </div>
      </div>

      {/* ============ 队伍角色状态 ============ */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>当前状态</div>
        <div className={styles.partyList}>
          {party.length === 0 ? (
            <div className={styles.emptyHint}>暂无队员</div>
          ) : (
            party.map(c => {
              const hpDelta = latestUnshown?.partyHpDelta?.[c.id] ?? 0;
              return (
                <div key={c.id} className={styles.partyRow}>
                  <span className={styles.partyName}>{c.name}</span>
                  <span className={styles.partyHp}>
                    <Icon icon={heart} className={styles.partyHpIcon} />
                    {c.hp}
                    {hpDelta !== 0 && (
                      <span className={hpDelta < 0 ? styles.deltaNeg : styles.deltaPos}>
                        {' '}({hpDelta > 0 ? '+' : ''}{hpDelta})
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============ 战斗记录（最新 encounter）============ */}
      {latestUnshown && latestUnshown.combatLog && latestUnshown.combatLog.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            战斗记录（{latestUnshown.combatLog.length} 条）
          </div>
          <div className={styles.combatLog}>
            {latestUnshown.combatLog.map((entry, idx) => (
              <CombatLogRow key={entry.id ?? idx} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* ============ 潜行成功 / 潜行通过（2026-06-09 加：Plan 14 修复）============ */}
      {/* 之前**没**专门 section，导致潜行 mission 在 board modal 内**几乎**看不到
          （**只**显示消息，**没** "潜行" 标识，玩家**不**知道这队是潜行过的） */}
      {(latestUnshown?.kind === 'evade_success' || latestUnshown?.kind === 'stealth_clear') && (
        <div className={styles.section}>
          <div className={styles.evadeSuccessHint}>
            <Icon icon={visibility} className={styles.evadeSuccessIcon} />
            <div className={styles.evadeSuccessContent}>
              <div className={styles.evadeSuccessTitle}>
                {latestUnshown.kind === 'stealth_clear' ? '潜行通过' : '潜行成功'}
              </div>
              <div className={styles.evadeSuccessDesc}>
                {latestUnshown.kind === 'stealth_clear'
                  ? '这一段路没遇到任何威胁，悄悄溜过'
                  : `遭遇 ${latestUnshown.enemiesEncountered ?? 0} 个敌人，悄悄溜过`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 地点已清空（2026-06-21 加）============ */}
      {/* 敌人 + 物资都被清理，提示玩家"扑空了" */}
      {latestUnshown?.kind === 'location_cleared' && (
        <div className={styles.section}>
          <div className={styles.evadeSuccessHint}>
            <Icon icon="material-symbols:inventory" className={styles.evadeSuccessIcon} />
            <div className={styles.evadeSuccessContent}>
              <div className={styles.evadeSuccessTitle}>地点已清空</div>
              <div className={styles.evadeSuccessDesc}>
                该地点的敌人和物资都已被清理，队伍空手而归
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============ 失败任务：所有 encounter 战斗日志聚合 ============ */}
      {allCombatLogs.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            完整战斗记录（共 {allCombatLogs.length} 条）
          </div>
          <div className={styles.combatLog}>
            {allCombatLogs.slice(0, 50).map(({ encounterIdx, entry }, idx) => (
              <CombatLogRow
                key={`${encounterIdx}-${entry.id ?? idx}`}
                entry={entry}
                encounterIdx={encounterIdx}
              />
            ))}
            {allCombatLogs.length > 50 && (
              <div className={styles.logMore}>+{allCombatLogs.length - 50} 条（已折叠）</div>
            )}
          </div>
        </div>
      )}

      {/* ============ 战斗消息 ============ */}
      {latestUnshown?.message && (
        <div className={styles.section}>
          <div className={styles.message}>
            {latestUnshown.message}
          </div>
        </div>
      )}

      {/* ============ 失败提示 ============ */}
      {(latestUnshown?.kind === 'combat_defeat' || latestUnshown?.kind === 'evade_fail_combat_defeat') && (
        <div className={styles.section}>
          <div className={styles.defeatHint}>
            <Icon icon={shield} className={styles.defeatIcon} />
            <span>队伍受伤严重，任务已强制结束</span>
          </div>
        </div>
      )}

      {/* ============ 获得物品（最新 encounter）============ */}
      {latestUnshown?.itemsGained && latestUnshown.itemsGained.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>获得物品</div>
          <div className={styles.itemList}>
            {latestUnshown.itemsGained.map((item, idx) => (
              <div key={`${item.instanceId}-${idx}`} className={styles.itemRow}>
                <div className={styles.itemIcon} style={{ color: getItemRarityColor(item.itemId) }}>
                  <Icon icon={getItemIcon(item.itemId)} />
                </div>
                <span className={styles.itemName}>{getItemName(item.itemId)}</span>
                <span className={styles.itemQty}>×{item.quantity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ 任务结果（完成 / 失败 / 提前返回）============ */}
      {isCompleted && hasUnshownOutcome && mission.outcome && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>任务结果</div>
            <div
              className={styles.outcomeStatus}
              style={{ color: isEarlyReturn ? '#FFA726' : (isSuccess ? '#4CAF50' : '#F44336') }}
            >
              <Icon
                icon={isEarlyReturn ? 'material-symbols:logout' : (isSuccess ? checkCircle : cancel)}
                className={styles.outcomeIcon}
              />
              {REASON_TEXT[mission.outcome.reason] ?? mission.outcome.reason}
            </div>
          </div>

          {/* 任务物品 */}
          {isSuccess && mission.outcome.itemsGained.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>任务获得物品</div>
              <div className={styles.itemList}>
                {mission.outcome.itemsGained.map((item, idx) => (
                  <div key={`${item.instanceId}-${idx}`} className={styles.itemRow}>
                    <div className={styles.itemIcon} style={{ color: getItemRarityColor(item.itemId) }}>
                      <Icon icon={getItemIcon(item.itemId)} />
                    </div>
                    <span className={styles.itemName}>{getItemName(item.itemId)}</span>
                    <span className={styles.itemQty}>×{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 任务奖励（成功）*/}
          {isSuccess && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>任务奖励</div>
              <div className={styles.rewardsRow}>
                {mission.outcome.expGained > 0 && (
                  <div className={styles.rewardBadge} style={{ borderColor: '#FFD700' }}>
                    <Icon icon={experience} className={styles.rewardIcon} style={{ color: '#FFD700' }} />
                    <span className={styles.rewardValue}>+{mission.outcome.expGained} EXP</span>
                  </div>
                )}
                {mission.outcome.hpLost > 0 && (
                  <div className={styles.rewardBadge} style={{ borderColor: '#F44336' }}>
                    <Icon icon={heart} className={styles.rewardIcon} style={{ color: '#F44336' }} />
                    <span className={styles.rewardValue}>-{mission.outcome.hpLost} HP</span>
                  </div>
                )}
                {mission.outcome.bottlecapsGained !== undefined && mission.outcome.bottlecapsGained > 0 && (
                  <div className={styles.rewardBadge} style={{ borderColor: '#fbbf24' }}>
                    <Icon icon="material-symbols:attach-money" className={styles.rewardIcon} style={{ color: '#fbbf24' }} />
                    <span className={styles.rewardValue}>+{mission.outcome.bottlecapsGained} 瓶盖</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 失败消息 */}
          {!isSuccess && mission.outcome.message && (
            <div className={styles.section}>
              <div className={styles.failureMsg}>{mission.outcome.message}</div>
            </div>
          )}

          {/* 丢失物品 */}
          {!isSuccess && mission.outcome.lostItems && mission.outcome.lostItems.length > 0 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                <Icon
                  icon="material-symbols:remove-shopping-cart"
                  className={styles.sectionTitleIcon}
                  style={{ color: '#F44336' }}
                />
                丢失物品
              </div>
              <div className={styles.itemList}>
                {mission.outcome.lostItems.map((lost, idx) => (
                  <div
                    key={`${lost.item.instanceId}-${idx}`}
                    className={styles.itemRow}
                    style={{ background: 'rgba(244, 67, 54, 0.08)', borderLeftColor: '#f44336' }}
                  >
                    <div
                      className={styles.itemIcon}
                      style={{ color: getItemRarityColor(lost.item.itemId), opacity: 0.6 }}
                    >
                      <Icon icon={getItemIcon(lost.item.itemId)} />
                    </div>
                    <span
                      className={styles.itemName}
                      style={{ textDecoration: 'line-through', opacity: 0.7 }}
                    >
                      {getItemName(lost.item.itemId)}
                    </span>
                    <span className={styles.itemQty} style={{ color: '#f44336' }}>
                      × {lost.lostCount} 丢失
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ 底部按钮 ============ */}
      {showRestButton && (
        <div className={styles.actions}>
          <button
            className={styles.restButton}
            onClick={() => latestUnshown && onRest(mission, latestUnshown)}
          >
            <Icon icon={hotel} />
            <span>休整</span>
          </button>
        </div>
      )}
    </div>
  );
};

// ============== 战斗日志行 ==============

const CombatLogRow = ({ entry, encounterIdx }: { entry: CombatLogEntry; encounterIdx?: number }) => {
  const info = COMBAT_KIND_INFO[entry.kind] ?? COMBAT_KIND_INFO.system;
  return (
    <div className={styles.logRow}>
      <span className={styles.logRound}>T{entry.tick}</span>
      {encounterIdx !== undefined && (
        <span className={styles.logEncounterTag}>#{encounterIdx}</span>
      )}
      <span className={styles.logKind} style={{ color: info.color }}>
        <Icon icon={info.icon} className={styles.logKindIcon} />
        {info.label}
      </span>
      {entry.attackerName && <span className={styles.logAttacker}>{entry.attackerName}</span>}
      {entry.attackerName && entry.defenderName && (
        <span className={styles.logConnector}>→</span>
      )}
      {entry.defenderName && <span className={styles.logDefender}>{entry.defenderName}</span>}
      {entry.damage > 0 && (
        <span className={styles.logDamage} style={{ color: info.color }}>
          -{entry.damage}
        </span>
      )}
      {(entry.defenderHp > 0 || entry.defenderMaxHp > 0) && (
        <span className={styles.logHp}>({entry.defenderHp}/{entry.defenderMaxHp})</span>
      )}
    </div>
  );
};