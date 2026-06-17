import { Icon } from '@iconify/react';
import {
  computeDisplayLevel,
  getAffinityLevelName,
  getAffinityLevelColor,
  getAffinityLevelIcon,
  AffinityLevelIndex,
} from '../affinityUtils';
import styles from './ScavengeCharacterHeader.module.scss';

interface ScavengeCharacterHeaderProps {
  name: string;
  statusText: string;
  isExploring: boolean;
  /** 角色完整数据（用于显示好感度等级），可选 */
  character?: { id: string; affinity: number; completedAffinityStoryLevels: number[] };
  onClose: () => void;
}

export const ScavengeCharacterHeader = ({ name, statusText, isExploring, character, onClose }: ScavengeCharacterHeaderProps) => {
  // 2026-06-09 加：好感度等级（主角本身不显示 affinity 等级）
  const showAffinity = character && character.id !== 'player_1';
  const affinityLevel = showAffinity ? (computeDisplayLevel(character as any) as AffinityLevelIndex) : null;
  const affinityName = affinityLevel !== null ? getAffinityLevelName(affinityLevel) : '';
  const affinityColor = affinityLevel !== null ? getAffinityLevelColor(affinityLevel) : '#fff';
  const affinityIcon = affinityLevel !== null ? getAffinityLevelIcon(affinityLevel) : '';

  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <div className={styles.avatar}>
          <Icon icon="material-symbols:person" />
        </div>
        <div className={styles.titleInfo}>
          <h2 className={styles.title}>{name}</h2>
          <div className={styles.subInfo}>
            <span className={`${styles.status} ${isExploring ? styles.statusExploring : ''}`}>
              {statusText}
            </span>
            {showAffinity && (
              <span
                className={styles.affinityBadge}
                style={{ background: `${affinityColor}25`, color: affinityColor }}
                title={`${name} 对你的好感等级`}
              >
                <span className={styles.affinityIcon}>{affinityIcon}</span>
                {affinityName}
              </span>
            )}
          </div>
        </div>
      </div>
      <button className={styles.closeButton} onClick={onClose}>
        <Icon icon="material-symbols:close" />
      </button>
    </div>
  );
};