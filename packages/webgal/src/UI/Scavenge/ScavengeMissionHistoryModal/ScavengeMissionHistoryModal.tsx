/**
 * 派遣历史 modal（2026-06-09 加：Plan 10）
 *
 * 目的：玩家回顾过去派遣（completed / failed / cancelled）
 * - 显示**所有**非 active mission
 * - 简明列表（时间 + 地点 + 队伍 + 状态 + 奖励）
 * - 不显示战斗日志（避免 modal 太大）
 *
 * 数据：scavenge_missions GameVar
 * 监听：useStageState（missions 变化自动刷新）
 */
import { useStageState } from '@/hooks/useStageState';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import cancel from '@iconify-icons/material-symbols/cancel';
import { Mission, readMissions } from '../ScavengeMissions/missions';
import { SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { useMemo } from 'react';
import styles from './ScavengeMissionHistoryModal.module.scss';

interface ScavengeMissionHistoryModalProps {
  onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: '完成', color: '#4caf50', icon: checkCircle },
  failed: { label: '失败', color: '#f44336', icon: cancel },
  cancelled: { label: '取消', color: '#999', icon: cancel },
};

export const ScavengeMissionHistoryModal = ({ onClose }: ScavengeMissionHistoryModalProps) => {
  useStageState();  // 订阅 GameVar 变化

  // 所有非 active mission（按时间倒序：最新的在前）
  const historyMissions = useMemo(() => {
    const missions = readMissions();
    return missions
      .filter(m => m.status !== 'active')
      .sort((a, b) => (b.startDay * 5 + b.startPeriodIndex) - (a.startDay * 5 + a.startPeriodIndex));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 统计
  const totalCount = historyMissions.length;
  const completedCount = historyMissions.filter(m => m.status === 'completed').length;
  const totalExpGained = historyMissions.reduce((sum, m) => sum + (m.outcome?.expGained ?? 0), 0);
  const totalItemsGained = historyMissions.reduce(
    (sum, m) => sum + (m.outcome?.itemsGained?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 0),
    0,
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon icon="material-symbols:history" className={styles.titleIcon} />
            <h2 className={styles.title}>派遣记录</h2>
            <span className={styles.count}>共 {totalCount} 次</span>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 统计 */}
        <div className={styles.statBar}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>完成</span>
            <span className={styles.statValue}>{completedCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>总经验</span>
            <span className={styles.statValue}>{totalExpGained}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>总物品</span>
            <span className={styles.statValue}>{totalItemsGained}</span>
          </div>
        </div>

        {/* mission 列表 */}
        {historyMissions.length === 0 ? (
          <div className={styles.empty}>
            <Icon icon="material-symbols:inbox" className={styles.emptyIcon} />
            <p>暂无派遣记录</p>
          </div>
        ) : (
          <div className={styles.missionList}>
            {historyMissions.map(m => {
              const loc = SCAVENGE_LOCATIONS.find(l => l.id === m.locationId);
              const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, color: '#999', icon: cancel };
              const expGained = m.outcome?.expGained ?? 0;
              const itemCount = m.outcome?.itemsGained?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 0;
              const partyIds = m.partyCharacterIds && m.partyCharacterIds.length > 0
                ? m.partyCharacterIds
                : [m.characterId];
              return (
                <div key={m.id} className={styles.missionRow}>
                  {/* 状态图标 */}
                  <Icon
                    icon={statusInfo.icon}
                    className={styles.statusIcon}
                    style={{ color: statusInfo.color }}
                  />

                  {/* 内容 */}
                  <div className={styles.content}>
                    <div className={styles.titleRow}>
                      <span className={styles.locationName}>{loc?.name ?? '?'}</span>
                      <span
                        className={styles.statusLabel}
                        style={{ color: statusInfo.color }}
                      >
                        {statusInfo.label}
                      </span>
                    </div>
                    <div className={styles.metaRow}>
                      <span className={styles.day}>Day {m.startDay}</span>
                      <span className={styles.party}>
                        {partyIds.length} 人队
                      </span>
                      {expGained > 0 && (
                        <span className={styles.exp}>+{expGained} EXP</span>
                      )}
                      {itemCount > 0 && (
                        <span className={styles.items}>+{itemCount} 物品</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
