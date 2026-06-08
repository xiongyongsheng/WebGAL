/**
 * 派遣遭遇结果弹窗
 *
 * 显示派遣期间每次遭遇的详细结果：
 * - 资源点：展示获得的物品
 * - 隐蔽成功 / 失败
 * - 战斗：逐条 combat log（命中/暴击/未命中/被击倒）
 * - 战斗胜：展示物品 + 经验 + HP 变化
 * - 战斗败：展示 HP 损失
 *
 * 点"确定"后调 markEncounterShown 写回 GameVar。
 */
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import cancel from '@iconify-icons/material-symbols/cancel';
import inventory from '@iconify-icons/material-symbols/inventory';
import favorite from '@iconify-icons/material-symbols/favorite';
import swords from '@iconify-icons/material-symbols/swords-outline';
import shield from '@iconify-icons/material-symbols/shield';
import visibility from '@iconify-icons/material-symbols/visibility-off';
import { EncounterLog, EncounterKind, markEncounterShown } from '../ScavengeMissions/missions';
import { ScavengeLocationItem, SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { getItemName, getItemIcon, getItemRarityColor } from '../ScavengeItems/items';
import { CombatLogEntry } from '../ScavengeCombat/combat';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { normalizeCharacter } from '../ScavengeCharacter/character';
import styles from './ScavengeCombatLogModal.module.scss';

interface ScavengeCombatLogModalProps {
  missionId: string;
  encounter: EncounterLog;
  onClose: () => void;
}

const ENCOUNTER_TITLES: Record<EncounterKind, string> = {
  no_encounter: '未遭遇',
  resource: '发现资源点',
  evade_success: '隐蔽成功',
  evade_fail_combat_victory: '隐蔽失败 / 战斗胜利',
  evade_fail_combat_defeat: '隐蔽失败 / 战斗失败',
  combat_victory: '战斗胜利',
  combat_defeat: '战斗失败',
  // 兼容旧值（不应该再出现，但保留兜底）
  // @ts-expect-error
  evade_fail_combat: '隐蔽失败',
};

const ENCOUNTER_ACCENTS: Record<string, string> = {
  resource: '#4CAF50',
  evade_success: '#4CAF50',
  combat_victory: '#4CAF50',
  evade_fail_combat_victory: '#4CAF50',
  combat_defeat: '#F44336',
  evade_fail_combat_defeat: '#F44336',
  no_encounter: '#a0a0a0',
};

export const ScavengeCombatLogModal = ({ missionId, encounter, onClose }: ScavengeCombatLogModalProps) => {
  const accentColor = ENCOUNTER_ACCENTS[encounter.kind] ?? '#a0a0a0';
  const title = ENCOUNTER_TITLES[encounter.kind] ?? encounter.kind;
  const isCombat = encounter.kind.startsWith('combat') || encounter.kind.startsWith('evade_fail');
  const isVictory = encounter.kind === 'combat_victory' || encounter.kind === 'evade_fail_combat_victory';
  const isDefeat = encounter.kind === 'combat_defeat' || encounter.kind === 'evade_fail_combat_defeat';

  // 解析地点 + 角色
  const missionsRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_missions'];
  let mission: any = null;
  if (typeof missionsRaw === 'string') {
    try {
      const parsed = JSON.parse(missionsRaw);
      if (Array.isArray(parsed)) mission = parsed.find((m: any) => m.id === missionId);
    } catch { /* ignore */ }
  } else if (Array.isArray(missionsRaw)) {
    mission = (missionsRaw as any[]).find(m => m.id === missionId);
  }
  const location: ScavengeLocationItem | undefined = mission
    ? SCAVENGE_LOCATIONS.find(l => l.id === mission.locationId)
    : undefined;
  const charRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
  let character: ScavengeCharacter | undefined;
  if (typeof charRaw === 'string') {
    try {
      const parsed = JSON.parse(charRaw);
      if (Array.isArray(parsed)) {
        character = (parsed as ScavengeCharacter[])
          .map(c => normalizeCharacter(c))
          .find(c => mission && c.id === mission.characterId);
      }
    } catch { /* ignore */ }
  } else if (Array.isArray(charRaw) && mission) {
    character = (charRaw as ScavengeCharacter[])
      .map(c => normalizeCharacter(c))
      .find(c => c.id === mission.characterId);
  }

  const handleClose = () => {
    markEncounterShown(missionId, encounter.id);
    onClose();
  };

  // 状态图标
  const StatusIcon = isDefeat ? cancel : isCombat ? swords : encounter.kind === 'evade_success' ? visibility : inventory;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题 */}
        <div className={styles.header} style={{ borderBottomColor: accentColor }}>
          <div className={styles.titleGroup}>
            <Icon
              icon={StatusIcon}
              className={styles.statusIcon}
              style={{ color: accentColor }}
            />
            <h2 className={styles.title} style={{ color: accentColor }}>
              {title}
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
              {location?.name ?? mission?.locationId ?? '?'}
            </span>
          </div>
          {mission && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>执行人</span>
              <span className={styles.summaryValue}>
                {character?.name ?? mission.characterId}
              </span>
            </div>
          )}
          {encounter.enemiesEncountered !== undefined && (
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>遭遇敌人</span>
              <span className={styles.summaryValue}>
                <Icon icon={swords} className={styles.summaryIcon} />
                {encounter.enemiesEncountered} 个
              </span>
            </div>
          )}
        </div>

        {/* 战斗日志 */}
        {isCombat && encounter.combatLog && encounter.combatLog.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Icon icon={swords} className={styles.sectionIcon} />
              战斗日志（{encounter.combatLog.length} 条）
            </div>
            <div className={styles.combatLog}>
              {encounter.combatLog.map(entry => (
                <CombatLogRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* 战斗小结 */}
        {(isCombat && encounter.hpDelta !== undefined && encounter.hpDelta !== 0) && (
          <div className={styles.summaryRow} style={{ padding: '0 20px 12px' }}>
            <span className={styles.summaryLabel}>生命值</span>
            <span
              className={styles.summaryValue}
              style={{ color: encounter.hpDelta < 0 ? '#ff8a80' : '#a0a0a0' }}
            >
              <Icon icon={favorite} className={styles.summaryIcon} />
              {encounter.hpDelta > 0 ? `+${encounter.hpDelta}` : encounter.hpDelta} HP
            </span>
          </div>
        )}

        {/* 战斗胜/资源点：物品列表 */}
        {(isVictory || encounter.kind === 'resource') && encounter.itemsGained && encounter.itemsGained.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Icon icon={inventory} className={styles.sectionIcon} />
              获得物品
            </div>
            <div className={styles.itemList}>
              {encounter.itemsGained.map((item, idx) => (
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

        {/* 战斗败提示 */}
        {isDefeat && (
          <div className={styles.defeatHint}>
            <Icon icon={shield} className={styles.defeatIcon} />
            <span>角色受伤严重，任务已强制结束</span>
          </div>
        )}

        {/* 消息 */}
        <div className={styles.message}>{encounter.message}</div>

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

// ============== 战斗日志行 ==============

const CombatLogRow = ({ entry }: { entry: CombatLogEntry }) => {
  let kindColor = '#a0a0a0';
  let kindIcon = swords;
  let kindLabel = '';
  switch (entry.kind) {
    case 'hit':
      kindColor = '#4a90e2';
      kindIcon = swords;
      kindLabel = '命中';
      break;
    case 'crit':
      kindColor = '#FFD700';
      kindIcon = swords;
      kindLabel = '暴击！';
      break;
    case 'miss':
      kindColor = '#808080';
      kindIcon = shield;
      kindLabel = '未命中';
      break;
    case 'death':
      kindColor = '#F44336';
      kindIcon = cancel;
      kindLabel = '击倒';
      break;
    // 2026-06-07 新增：武器/护甲系统
    case 'armor_absorb':
      kindColor = '#90caf9';
      kindIcon = shield;
      kindLabel = '护甲吸收';
      break;
    case 'weapon_break':
      kindColor = '#ff7043';
      kindIcon = swords;
      kindLabel = '武器损坏';
      break;
    case 'weapon_switch':
      kindColor = '#81c784';
      kindIcon = swords;
      kindLabel = '切换武器';
      break;
    case 'fist_fallback':
      kindColor = '#ff5252';
      kindIcon = swords;
      kindLabel = '拳头';
      break;
    case 'weapon_durability_loss':
      kindColor = '#a0a0a0';
      kindIcon = swords;
      kindLabel = '耐久-1';
      break;
  }
  return (
    <div className={styles.logRow}>
      <span className={styles.logRound}>T{entry.tick}</span>
      <span className={styles.logKind} style={{ color: kindColor }}>
        <Icon icon={kindIcon} className={styles.logKindIcon} />
        {kindLabel}
      </span>
      {entry.attackerName && (
        <span className={styles.logAttacker}>{entry.attackerName}</span>
      )}
      {entry.attackerName && entry.defenderName && (
        <span className={styles.logConnector}>→</span>
      )}
      {entry.defenderName && (
        <span className={styles.logDefender}>{entry.defenderName}</span>
      )}
      {entry.damage > 0 && (
        <span className={styles.logDamage} style={{ color: kindColor }}>
          -{entry.damage}
        </span>
      )}
      {(entry.defenderHp > 0 || entry.defenderMaxHp > 0) && (
        <span className={styles.logHp}>
          {entry.defenderHp}/{entry.defenderMaxHp}
        </span>
      )}
      {entry.flavor && (
        <span className={styles.logFlavor}>{entry.flavor}</span>
      )}
    </div>
  );
};
