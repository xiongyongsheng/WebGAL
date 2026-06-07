import { Icon, IconifyIcon } from '@iconify/react';
import favorite from '@iconify-icons/material-symbols/favorite';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import waterDrop from '@iconify-icons/material-symbols/water-drop';
import psychology from '@iconify-icons/material-symbols/psychology';
import localFireDepartment from '@iconify-icons/material-symbols/local-fire-department';
import militaryTech from '@iconify-icons/material-symbols/military-tech';
import swords from '@iconify-icons/material-symbols/swords';
import bolt from '@iconify-icons/material-symbols/bolt';
import shield from '@iconify-icons/material-symbols/shield';
import visibilityOff from '@iconify-icons/material-symbols/visibility-off';
import myLocation from '@iconify-icons/material-symbols/my-location';
import directionsRun from '@iconify-icons/material-symbols/directions-run';
import whatshot from '@iconify-icons/material-symbols/whatshot';
import { ScavengeCharacter, getStatusBarColor } from '../character';
import { getExpProgress } from '../characterExperience';
import { computeDerivedStats } from '../characterCombat';
import styles from './ScavengeCharacterStatus.module.scss';

interface StatusBarProps {
  icon: IconifyIcon;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

interface ScavengeCharacterStatusProps {
  charData: ScavengeCharacter;
  maxHp: number;
  maxHunger: number;
  maxThirst: number;
  // 注：属性加点 UI 已迁出到 ScavengeCharacterAttributes（暂存+保存模式）
}

const StatusBar = ({ icon, label, value, maxValue, color }: StatusBarProps) => {
  const percentage = (value / maxValue) * 100;

  return (
    <div className={styles.statusItem}>
      <div className={styles.statusHeader}>
        <Icon icon={icon} className={styles.statusIcon} style={{ color }} />
        <span className={styles.statusLabel}>{label}</span>
        <span className={styles.statusValue}>{value}</span>
      </div>
      <div className={styles.statusTrack}>
        <div
          className={styles.statusFill}
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
};

export const ScavengeCharacterStatus = ({
  charData,
  maxHp,
  maxHunger,
  maxThirst,
}: ScavengeCharacterStatusProps) => {
  const expPercent = getExpProgress(charData) * 100;
  const hasPoints = charData.statPoints > 0;

  // 战斗派生属性（不存 GameVar，每次渲染实时计算）
  const combat = computeDerivedStats(charData);
  const fmtPct = (v: number) => `${Math.round(v * 100)}%`;
  const fmtNum = (v: number) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));

  return (
    <div className={styles.statusPanel}>
      {/* 等级 + 经验条 */}
      <div className={styles.levelRow}>
        <Icon icon={militaryTech} className={styles.levelIcon} style={{ color: '#FFD700' }} />
        <span className={styles.levelLabel}>Lv.</span>
        <span className={styles.levelValue}>{charData.level}</span>
        <span className={styles.expText}>
          {charData.exp} / {charData.expToNext} EXP
        </span>
        {hasPoints && (
          <span className={styles.statPointBadge}>+{charData.statPoints} 点</span>
        )}
      </div>
      <div className={styles.expBar}>
        <div
          className={styles.expBarFill}
          style={{ width: `${expPercent}%` }}
        />
      </div>

      <StatusBar
        icon={favorite}
        label="生命值"
        value={charData.hp}
        maxValue={maxHp}
        color={getStatusBarColor(charData.hp, maxHp)}
      />
      <StatusBar
        icon={restaurant}
        label="饥饿值"
        value={charData.hunger}
        maxValue={maxHunger}
        color={getStatusBarColor(charData.hunger, maxHunger)}
      />
      <StatusBar
        icon={waterDrop}
        label="口渴值"
        value={charData.thirst}
        maxValue={maxThirst}
        color={getStatusBarColor(charData.thirst, maxThirst)}
      />
      <StatusBar
        icon={psychology}
        label="精神值"
        value={charData.sanity}
        maxValue={charData.maxSanity}
        color={getStatusBarColor(charData.sanity, charData.maxSanity)}
      />
      <StatusBar
        icon={localFireDepartment}
        label="体力值"
        value={charData.stamina}
        maxValue={charData.maxStamina}
        color={getStatusBarColor(charData.stamina, charData.maxStamina)}
      />

      {/* 战斗派生属性（实时计算，不存 GameVar） */}
      <div className={styles.combatStats}>
        <div className={styles.combatStatsTitle}>
          <Icon icon={swords} className={styles.combatTitleIcon} />
          <span>战斗属性</span>
        </div>
        <div className={styles.combatGrid}>
          <div className={styles.combatItem}>
            <Icon icon={swords} className={styles.combatIcon} style={{ color: '#ff8a65' }} />
            <span className={styles.combatLabel}>攻击伤害</span>
            <span className={styles.combatValue}>{fmtNum(combat.attackDamage)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={bolt} className={styles.combatIcon} style={{ color: '#ffd54f' }} />
            <span className={styles.combatLabel}>攻击速度</span>
            <span className={styles.combatValue}>{fmtNum(combat.attackSpeed)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={shield} className={styles.combatIcon} style={{ color: '#90caf9' }} />
            <span className={styles.combatLabel}>护甲值</span>
            <span className={styles.combatValue}>{fmtNum(combat.armor)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={visibilityOff} className={styles.combatIcon} style={{ color: '#b39ddb' }} />
            <span className={styles.combatLabel}>隐蔽率</span>
            <span className={styles.combatValue}>{fmtPct(combat.stealth)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={myLocation} className={styles.combatIcon} style={{ color: '#81c784' }} />
            <span className={styles.combatLabel}>命中率</span>
            <span className={styles.combatValue}>{fmtPct(combat.accuracy)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={directionsRun} className={styles.combatIcon} style={{ color: '#4dd0e1' }} />
            <span className={styles.combatLabel}>闪避率</span>
            <span className={styles.combatValue}>{fmtPct(combat.evasion)}</span>
          </div>
          <div className={styles.combatItem}>
            <Icon icon={whatshot} className={styles.combatIcon} style={{ color: '#ff7043' }} />
            <span className={styles.combatLabel}>暴击率</span>
            <span className={styles.combatValue}>{fmtPct(combat.critRate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
