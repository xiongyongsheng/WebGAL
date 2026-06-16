/**
 * 敌人图鉴（2026-06-09 新建）
 *
 * 显示所有敌人模板（来自 ENEMY_TEMPLATES）的完整属性 + 描述
 * 用途：玩家了解敌人、对比威胁等级
 */
import { Icon } from '@iconify/react';
import swords from '@iconify-icons/material-symbols/swords';
import shield from '@iconify-icons/material-symbols/shield-outline';
import speed from '@iconify-icons/material-symbols/speed';
import visibility from '@iconify-icons/material-symbols/visibility';
import { ENEMY_TEMPLATES, EnemyTemplate } from '../enemies';
import styles from './ScavengeEnemyCodex.module.scss';

/** 威胁等级颜色（detection 越高越危险） */
const THREAT_COLOR = (detection: number): string => {
  if (detection >= 80) return '#f44336';      // 红：远距侦测
  if (detection >= 60) return '#ff9800';      // 橙：训练有素
  if (detection >= 40) return '#ffc107';      // 黄：警觉
  return '#4caf50';                            // 绿：低警觉
};

const THREAT_NAME = (detection: number): string => {
  if (detection >= 80) return '高危';
  if (detection >= 60) return '中危';
  if (detection >= 40) return '低危';
  return '无警觉';
};

interface ScavengeEnemyCodexProps {
  onClose: () => void;
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

export const ScavengeEnemyCodex = ({ onClose }: ScavengeEnemyCodexProps) => {
  const enemies: EnemyTemplate[] = Object.values(ENEMY_TEMPLATES);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.codex} onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题 */}
        <div className={styles.codexHeader}>
          <h2 className={styles.codexTitle}>
            <Icon icon={swords} className={styles.titleIcon} />
            敌人图鉴
          </h2>
          <span className={styles.codexHint}>共 {enemies.length} 种敌人</span>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 敌人卡片网格 */}
        <div className={styles.enemyGrid}>
          {enemies.map(enemy => (
            <div
              key={enemy.type}
              className={styles.enemyCard}
              style={{ borderColor: THREAT_COLOR(enemy.detection) }}
            >
              {/* 卡片头 */}
              <div className={styles.cardHeader}>
                <div className={styles.enemyName}>
                  <span className={styles.threatDot} style={{ background: THREAT_COLOR(enemy.detection) }} />
                  {enemy.name}
                </div>
                <span
                  className={styles.threatTag}
                  style={{ background: THREAT_COLOR(enemy.detection) }}
                >
                  {THREAT_NAME(enemy.detection)}
                </span>
              </div>

              <div className={styles.enemyDesc}>{enemy.description}</div>

              {/* 战斗属性 */}
              <div className={styles.statsGrid}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>生命</span>
                  <span className={styles.statValue}>{enemy.hp}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>攻击</span>
                  <span className={styles.statValue}>{enemy.attackDamage}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>
                    <Icon icon={speed} className={styles.statIcon} />
                    速度
                  </span>
                  <span className={styles.statValue}>{enemy.attackSpeed}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>
                    <Icon icon={shield} className={styles.statIcon} />
                    护甲
                  </span>
                  <span className={styles.statValue}>{enemy.armor}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>命中</span>
                  <span className={styles.statValue}>{fmtPct(enemy.accuracy)}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>闪避</span>
                  <span className={styles.statValue}>{fmtPct(enemy.evasion)}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>暴击</span>
                  <span className={styles.statValue}>{fmtPct(enemy.critRate)}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>×暴击</span>
                  <span className={styles.statValue}>{enemy.critMultiplier}x</span>
                </div>
                <div className={`${styles.statRow} ${styles.statRowDetection}`}>
                  <span className={styles.statLabel}>
                    <Icon icon={visibility} className={styles.statIcon} />
                    警觉
                  </span>
                  <span className={styles.statValue}>{enemy.detection}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
