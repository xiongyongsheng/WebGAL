/**
 * ListSection 公共组件（2026-06-19 加：Plan 17 重构）
 *
 * 用途：统**一**的** "**标**题** + **空**状**态** + **列**表**"** 布**局**
 *
 * 之前：
 *   - giftList / chatList / infoPanel 各**自**实**现**（**代**码**重**复**）
 *   - 样**式**类**似**但**细**节**不**同**（标**题**、**空**状**态**、**列**表**项**）
 *
 * 现**在**：
 *   - **统**一** ListSection **组**件**，**三**个**子**页**面**复**用**
 *   - 支**持** items / renderItem / emptyText / actions
 */
import { ReactNode } from 'react';
import styles from './ListSection.module.scss';

export interface ListSectionProps<T> {
  /** 标**题**（**如** "**选**择**物**品**"**）*/
  title: string;
  /** 列**表**数**据**（**空**数**组**会**显**示**空**状**态**）*/
  items: T[];
  /** key 提**取**函**数** */
  keyOf: (item: T, index: number) => string | number;
  /** 单**个**项**目**的**渲**染**函**数** */
  renderItem: (item: T, index: number) => ReactNode;
  /** 空**状**态**文**案** */
  emptyText?: string;
  /** 空**状**态**图**标**（**可**选**）*/
  emptyIcon?: ReactNode;
  /** 底**部**自**定**义**操**作**（**如** "**返**回**"** **按**钮**）*/
  actions?: ReactNode;
  /** 是**否**显**示** loading 状**态** */
  loading?: boolean;
}

export function ListSection<T>({
  title,
  items,
  keyOf,
  renderItem,
  emptyText = '暂无内容',
  emptyIcon,
  actions,
  loading = false,
}: ListSectionProps<T>) {
  return (
    <section className={styles.listSection}>
      <h3 className={styles.title}>{title}</h3>

      {loading ? (
        <div className={styles.empty}>
          <div className={styles.spinner} />
          加载中...
        </div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          {emptyIcon && <div className={styles.emptyIcon}>{emptyIcon}</div>}
          <div className={styles.emptyText}>{emptyText}</div>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((item, index) => (
            <div key={keyOf(item, index)} className={styles.listItem}>
              {renderItem(item, index)}
            </div>
          ))}
        </div>
      )}

      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}

/**
 * ListItem 内容 - 统一布局（左侧主标题/副标题 + 右侧 action）
 */
export interface ListItemContentProps {
  /** 主**标**题** */
  title: ReactNode;
  /** 副**标**题**（**可**选**）*/
  subtitle?: ReactNode;
  /** 右**侧** action（**可**选**，**如** "**+1** 好感**"**）*/
  action?: ReactNode;
  /** 锁**定**状**态**（显**示**锁**图**标**）*/
  locked?: boolean;
  /** 不**可**点**击**状**态**（**如**需**要**更**高**好**感**度**）*/
  disabled?: boolean;
  /** 点**击**回**调**（**不**传**则**不**可**点**击**）*/
  onClick?: () => void;
}

export const ListItemContent = ({
  title,
  subtitle,
  action,
  locked = false,
  disabled = false,
  onClick,
}: ListItemContentProps) => {
  const className = `${styles.itemContent} ${disabled ? styles.itemDisabled : ''}`;
  return (
    <div
      className={className}
      onClick={disabled ? undefined : onClick}
      style={{ cursor: onClick && !disabled ? 'pointer' : 'default' }}
    >
      <div className={styles.itemMain}>
        <div className={styles.itemTitle}>{title}</div>
        {subtitle !== undefined && <div className={styles.itemSubtitle}>{subtitle}</div>}
      </div>
      {action && <div className={styles.itemAction}>{action}</div>}
      {locked && <div className={styles.itemLocked}>🔒</div>}
    </div>
  );
};
