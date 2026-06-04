import { Icon } from '@iconify/react';
import styles from './ScavengeCharacterHeader.module.scss';

interface ScavengeCharacterHeaderProps {
  name: string;
  statusText: string;
  isExploring: boolean;
  onClose: () => void;
}

export const ScavengeCharacterHeader = ({ name, statusText, isExploring, onClose }: ScavengeCharacterHeaderProps) => {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <div className={styles.avatar}>
          <Icon icon="material-symbols:person" />
        </div>
        <div className={styles.titleInfo}>
          <h2 className={styles.title}>{name}</h2>
          <span className={`${styles.status} ${isExploring ? styles.statusExploring : ''}`}>
            {statusText}
          </span>
        </div>
      </div>
      <button className={styles.closeButton} onClick={onClose}>
        <Icon icon="material-symbols:close" />
      </button>
    </div>
  );
};