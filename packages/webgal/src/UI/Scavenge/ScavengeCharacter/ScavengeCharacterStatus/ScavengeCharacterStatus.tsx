import { Icon, IconifyIcon } from '@iconify/react';
import favorite from '@iconify-icons/material-symbols/favorite';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import waterDrop from '@iconify-icons/material-symbols/water-drop';
import psychology from '@iconify-icons/material-symbols/psychology';
import localFireDepartment from '@iconify-icons/material-symbols/local-fire-department';
import { ScavengeCharacter, getStatusBarColor } from '../character';
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

export const ScavengeCharacterStatus = ({ charData, maxHp, maxHunger, maxThirst }: ScavengeCharacterStatusProps) => {
  return (
    <div className={styles.statusPanel}>
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
        label="疲劳值"
        value={charData.fatigue}
        maxValue={charData.maxFatigue}
        color={getStatusBarColor(charData.maxFatigue - charData.fatigue, charData.maxFatigue)}
      />
    </div>
  );
};