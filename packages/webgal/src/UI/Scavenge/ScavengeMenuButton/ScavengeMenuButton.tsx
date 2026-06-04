import styles from './ScavengeMenuButton.module.scss';
import { Icon } from '@iconify/react';

interface ScavengeMenuButtonProps {
  icon: string;
  label: string;
  onClick: () => void;
}

export const ScavengeMenuButton = ({ icon, label, onClick }: ScavengeMenuButtonProps) => {
  return (
    <button className={styles.menuButton} onClick={onClick} title={label}>
      <Icon icon={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </button>
  );
};