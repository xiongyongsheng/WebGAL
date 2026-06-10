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

interface StatusRingProps {
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

// 2026-06-09 改：水平进度条 → 圆环 + 中心 icon + 下方名称+数值
const StatusRing = ({ icon, label, value, maxValue, color }: StatusRingProps) => {
  const percentage = Math.max(0, Math.min(100, (value / maxValue) * 100));
  const radius = 24;          // 圆环半径
  const stroke = 5;           // 描边宽度
  const size = 60;            // 整体尺寸
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percentage / 100);

  return (
    <div className={styles.ringItem}>
      <div className={styles.ringSvgWrap}>
        <svg width={size} height={size} className={styles.ringSvg}>
          {/* 背景环 */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth={stroke}
          />
          {/* 进度环（从顶部顺时针） */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            className={styles.ringFg}
          />
        </svg>
        <div className={styles.ringIcon}>
          <Icon icon={icon} className={styles.ringIconInner} style={{ color }} />
        </div>
      </div>
      <div className={styles.ringLabel}>
        <span className={styles.ringName}>{label}</span>
        <span className={styles.ringValue}>{value}</span>
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
  // 总潜行值（2026-06-08 第三次改）：显示 character.stealth（integer）
  // 公式：Σ(equipped.stealth) × (1 + agi/10)，夜间 ×1.1，clamp 上界 100
  // 负值保留（装备太暴露 → 必被发现）
  // 不显示潜行率（百分比）：真正的成功率要按每个敌人 detection 单算（1 - min/max 公式）
  const characterStealth = combat.stealth;
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

      {/* 5 个状态圆环（2026-06-09 改：水平条 → 圆环）横排 */}
      <div className={styles.ringRow}>
        <StatusRing
          icon={favorite}
          label="生命值"
          value={charData.hp}
          maxValue={maxHp}
          color={getStatusBarColor(charData.hp, maxHp)}
        />
        <StatusRing
          icon={restaurant}
          label="饥饿值"
          value={charData.hunger}
          maxValue={maxHunger}
          color={getStatusBarColor(charData.hunger, maxHunger)}
        />
        <StatusRing
          icon={waterDrop}
          label="口渴值"
          value={charData.thirst}
          maxValue={maxThirst}
          color={getStatusBarColor(charData.thirst, maxThirst)}
        />
        <StatusRing
          icon={psychology}
          label="精神值"
          value={charData.sanity}
          maxValue={charData.maxSanity}
          color={getStatusBarColor(charData.sanity, charData.maxSanity)}
        />
        <StatusRing
          icon={localFireDepartment}
          label="体力值"
          value={charData.stamina}
          maxValue={charData.maxStamina}
          color={getStatusBarColor(charData.stamina, charData.maxStamina)}
        />
      </div>

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
            <span className={styles.combatLabel}>潜行值</span>
            <span
              className={styles.combatValue}
              style={{
                color: characterStealth > 0 ? '#4CAF50' : characterStealth < -8 ? '#F44336' : characterStealth < 0 ? '#FFC107' : '#909090',
              }}
              title={`Σ装备 × (1 + agi/10) × [×1.1 黑夜]`}
            >
              {characterStealth >= 0 ? characterStealth : characterStealth}
            </span>
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
