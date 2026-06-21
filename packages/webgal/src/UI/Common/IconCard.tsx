/**
 * IconCard 公共组件（2026-06-19 加：Plan 17 重构）
 *
 * 用途：高**频**复**用**的**圆**形**头**像** + 文**本** + 点**击**卡**片**
 *
 * 适用**场**景**：
 * - 安**全**屋**角**色**卡**片**（SafehouseCharacterPanel）
 * - 安**全**屋**房**间**入**口**卡**片**（同上）
 * - 市**场**卡**片**、**任**务**卡**片**等
 *
 * 之前：
 *   - characterCard 和 roomEntryCard 各**自**实**现**（**代**码**重**复**）
 *   - 样**式**类**似**但**细**节**不**同**（容**易**出**错**）
 *
 * 现**在**：
 *   - **统**一** IconCard **组**件**，**支**持** char/ icon **两**种**头**像**模**式**
 *   - **支**持** default/ exit **两**种**变**体**（**红**色**边**框**）
 *   - **统**一**样**式**（**圆**角** 20px、**宽**高** 150x200、**悬**浮**动**效**）
 */
import { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import styles from './IconCard.module.scss';

export type IconCardVariant = 'default' | 'exit';

export interface IconCardProps {
  /** 变**体**：default（蓝**色**边**框**） / exit（红**色**边**框**）*/
  variant?: IconCardVariant;
  /** 字符头**像**（如 '维'）*/
  char?: string;
  /** Iconify icon 名**称**（如 'material-symbols:door-back'）*/
  icon?: string;
  /** 标**题**（**卡**片**下**方**文**字**）*/
  title: string;
  /** 副**文**本**（标**题**下**方**，**可**选**）*/
  subtitle?: ReactNode;
  /** 点**击**回**调**（**不**传**则**不**可**点**击**）*/
  onClick?: () => void;
  /** 鼠标**悬**浮**提**示** */
  hint?: string;
  /** Avatar 圆**形**图**标**的**大**小**（**像**素**，**默**认** 80**）*/
  avatarSize?: number;
}

export const IconCard = ({
  variant = 'default',
  char,
  icon,
  title,
  subtitle,
  onClick,
  hint,
  avatarSize = 80,
}: IconCardProps) => {
  const className = `${styles.iconCard} ${variant === 'exit' ? styles.exit : ''}`;
  const avatarStyle = { width: avatarSize, height: avatarSize };

  return (
    <div
      className={className}
      onClick={onClick}
      title={hint ?? title}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className={styles.avatar} style={avatarStyle}>
        {icon ? (
          <Icon icon={icon} />
        ) : char ? (
          <span className={styles.avatarChar}>{char}</span>
        ) : (
          <Icon icon="material-symbols:question-mark" />
        )}
      </div>
      <div className={styles.title}>{title}</div>
      {subtitle !== undefined && <div className={styles.subtitle}>{subtitle}</div>}
    </div>
  );
};
