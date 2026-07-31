/**
 * 公共 Modal 组件（2026-06-21 加：统一 z-index 防止遮挡）
 *
 * 历史问题：
 * - 之前每个 modal 各自**设**置 z-index 1000 / 10000，**经**常**被** FullScreenClick (z=12) 遮**挡**
 * - 多次**反**复修 z-index
 * - 解决：建**这**个公共**组**件，**强**制 z-index=10000
 *
 * 使用：
 * ```tsx
 * <Modal title="xxx" onClose={() => setOpened(false)}>
 *   <div>content</div>
 * </Modal>
 * ```
 *
 * 如**果**需要**不**同的 z-index（例如确认对话**框**要**叠**在**普**通 modal 上），用 `zIndex` prop
 *
 * ⚠️ 重要约定（2026-06-21）：
 * - **所有新 modal 必须用这个组件**，**不要**自己实现 overlay + modal
 * - z-index 默认 10000，**不要**覆盖（除非有特殊需求）
 * - FullScreenClick 节点 z=12，**容易挡** 1000/500 这种低 z-index
 * - 嵌套 Confirm dialog 用 zIndex={20000} 或更高
 *
 * 现有 modal 列表（参考）：
 * - ScavengeConfirmModal: 10000
 * - ScavengeRestModal: 10000
 * - ScavengeEncounterBoardModal: 10000
 * - ScavengeMissionHistoryModal: 10000
 * - ScavengeItemCodex: 1000（待迁移）
 * - SafehouseCharacterPanel: 1000（待迁移）
 */

import { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import styles from './Modal.module.scss';

export interface ModalProps {
  /** 标题（**不**传则**不**显**示** header）*/
  title?: string;
  /** 标题**前**的 icon 名**称** */
  titleIcon?: string;
  /** 关闭回调（**不**传则**不**显**示**关闭按钮）*/
  onClose?: () => void;
  /** modal 主体内容 */
  children: ReactNode;
  /** 自定义 z-index（**默**认 10000）*/
  zIndex?: number;
  /** 自定义宽度（**默**认 720px）*/
  width?: number;
  /** 自定义 className */
  className?: string;
  /** 点 overlay 关闭（**默**认 false）*/
  closeOnOverlayClick?: boolean;
}

export const Modal = ({
  title,
  titleIcon = 'material-symbols:info',
  onClose,
  children,
  zIndex = 10000,
  width = 720,
  className,
  closeOnOverlayClick = false,
}: ModalProps) => {
  return (
    <div
      className={styles.overlay}
      style={{ zIndex }}
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={`${styles.modal} ${className ?? ''}`}
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <Icon icon={titleIcon} className={styles.titleIcon} />
              <h2 className={styles.title}>{title}</h2>
            </div>
            {onClose && (
              <button className={styles.closeBtn} onClick={onClose}>
                <Icon icon="material-symbols:close" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};
