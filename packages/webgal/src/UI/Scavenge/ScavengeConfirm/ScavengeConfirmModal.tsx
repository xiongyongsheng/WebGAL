/**
 * 公用确认对话框（2026-06-09 加：Plan 4）
 *
 * 替代 `window.confirm` / `window.alert`：
 * - 风格统一（深色半透明背景 + 居中卡片）
 * - 可自定义按钮文字、标题、消息
 * - 支持异步 onConfirm（按确认后 disable 按钮）
 *
 * 风格原因：UI 是深色游戏风，浏览器原生 confirm 是浅色，破坏沉浸感
 */
import { useState } from 'react';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import styles from './ScavengeConfirmModal.module.scss';

export interface ScavengeConfirmModalProps {
  /** 是否显示 */
  open: boolean;
  /** 标题 */
  title: string;
  /** 消息内容（支持多行） */
  message: string | string[];
  /** 确认按钮文字，默认"确定" */
  confirmText?: string;
  /** 取消按钮文字，默认"取消" */
  cancelText?: string;
  /** 确认按钮变体：'primary'（蓝）、'danger'（红）、'warning'（黄） */
  variant?: 'primary' | 'danger' | 'warning';
  /** 确认回调（异步也行） */
  onConfirm: () => void | Promise<void>;
  /** 取消回调（关闭 modal） */
  onCancel: () => void;
}

export const ScavengeConfirmModal = ({
  open,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  variant = 'primary',
  onConfirm,
  onCancel,
}: ScavengeConfirmModalProps) => {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    if (isProcessing) return;  // 防双击
    setIsProcessing(true);
    try {
      await onConfirm();
      // 不在这里关 modal（由 onConfirm 决定是否关）
    } finally {
      setIsProcessing(false);
    }
  };

  const messageLines = Array.isArray(message) ? message : [message];

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <button className={styles.closeButton} onClick={onCancel} disabled={isProcessing}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 消息 */}
        <div className={styles.body}>
          {messageLines.map((line, idx) => (
            <p key={idx} className={styles.messageLine}>{line}</p>
          ))}
        </div>

        {/* 按钮 */}
        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isProcessing}
          >
            {cancelText}
          </button>
          <button
            className={`${styles.confirmButton} ${styles[variant]}`}
            onClick={handleConfirm}
            disabled={isProcessing}
          >
            {isProcessing ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
