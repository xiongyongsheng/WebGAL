import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import locationOn from '@iconify-icons/material-symbols/location-on';
import inventory from '@iconify-icons/material-symbols/inventory';
import { ScavengeLocationItem, getRegionDisplayName, getDangerStars } from "./locations";
import { getItemName } from "../ScavengeItems/items";
import { ENEMY_TEMPLATES } from "../ScavengeEnemies/enemies";
import {
  getLocationState,
  getDaysUntilRefresh,
  getTotalEnemyCount,
  getTotalLootCount,
} from "./locationRefresh";
import { ScavengeCharacter, normalizeCharacter, getCharacterStatusText } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { startMission, readMissions, writeMissions } from '../ScavengeMissions/missions';
import styles from './ScavengeMapDetail.module.scss';

interface ScavengeMapDetailProps {
  location: ScavengeLocationItem;
  onClose: () => void;
}

export const ScavengeMapDetail = ({ location, onClose }: ScavengeMapDetailProps) => {
  const stageState = useStageState();
  const [showCharPicker, setShowCharPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 派往该地点的角色 ID（从 missions 列表里查）
  const allMissions = readMissions();
  const activeMissionsAtLocation = allMissions.filter(
    m => m.locationId === location.id && m.status === 'active',
  );
  const isCurrentlyExploring = activeMissionsAtLocation.length > 0;
  const exploringCharacterIds = activeMissionsAtLocation.map(m => m.characterId);

  // 物资类型显示映射
  const lootTypeNames: Record<string, string> = {
    food: '食物',
    drink: '饮用水',
    beverage: '饮料',
    medicine: '药品',
    bandage: '绷带',
    parts: '零件',
    tools: '工具',
    cloth: '布料',
    metal: '金属',
    daily: '日用品',
    weapon: '武器',
    armor: '护甲',
  };

  // 解析所有角色
  const getCharacters = (): ScavengeCharacter[] => {
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((c) => normalizeCharacter(c as ScavengeCharacter));
      } catch { /* ignore */ }
    }
    if (Array.isArray(raw)) return (raw as unknown as ScavengeCharacter[]).map((c) => normalizeCharacter(c));
    return [];
  };

  const characters = getCharacters();
  const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
  const currentPeriodIndex = (stageState.GameVar['current_period_index'] as number) ?? 0;

  // 可派遣角色：HP>0, !isExploring, 体力>=20
  // 2026-06-09 改：按阵营过滤（只 ally 可派遣）
  //   - ally（友方/队伍成员）：可派遣
  //   - neutral（中立，如商人）：不可派遣（独立 NPC）
  //   - enemy（敌对）：不可派遣
  const dispatchable = characters.filter(c => {
    if (c.hp <= 0 || c.isExploring || c.stamina < 20) return false;
    const template = CHARACTER_TEMPLATES[c.id];
    if (!template) return false;
    return (template.faction ?? 'ally') === 'ally';
  });

  const handleDispatch = (charId: string) => {
    setError(null);
    const char = characters.find(c => c.id === charId);
    if (!char) {
      setError('角色不存在');
      return;
    }
    if (char.isExploring) {
      setError('该角色正在执行其他任务');
      return;
    }
    if (char.hp <= 0) {
      setError('该角色无法行动');
      return;
    }
    if (char.stamina < 20) {
      setError('体力不足（需要 ≥ 20）');
      return;
    }
    // 创建 mission
    const mission = startMission(charId, location, currentDay, currentPeriodIndex);
    // 写回 missions
    const allMissions = readMissions();
    writeMissions([...allMissions, mission]);
    // 更新角色：isExploring=true, exploringLocationId, returnDay, returnPeriodIndex
    const updatedChars = characters.map(c => {
      if (c.id !== charId) return c;
      return {
        ...c,
        isExploring: true,
        exploringLocationId: location.id,
        returnDay: mission.returnDay,
        returnPeriodIndex: mission.returnPeriodIndex,
      };
    });
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(updatedChars),
    });
    setShowCharPicker(false);
    onClose();
  };
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon
              icon={locationOn}
              style={{ color: location.regionColor }}
              className={styles.titleIcon}
            />
            <h2 className={styles.title}>{location.name}</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 探索状态 */}
        {isCurrentlyExploring && exploringCharacterIds.length > 0 && (
          <div className={styles.exploringStatus}>
            <div className={styles.exploringLabel}>
              <span className={styles.pulse}></span>
              正在派遣 {exploringCharacterIds.length} 人
            </div>
            <div className={styles.exploringCharacter}>
              {exploringCharacterIds.map(id => {
                const c = characters.find(ch => ch.id === id);
                return c ? (
                  <span key={id} className={styles.characterName}>
                    {c.name}（{getCharacterStatusText(c)}）
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}

        {/* 基本信息 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>基本信息</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>区域</span>
              <span className={styles.infoValue}>{getRegionDisplayName(location.region)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>危险等级</span>
              <span className={`${styles.infoValue} ${styles.dangerValue}`}>
                {getDangerStars(location.dangerLevel)}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>距离</span>
              <span className={styles.infoValue}>{location.distance}小时</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>派遣耗时</span>
              <span className={styles.infoValue}>{location.timeDisplay}（{location.explorationTime} 个 period）</span>
            </div>
          </div>
        </div>

        {/* 描述 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>地点描述</div>
          <p className={styles.description}>{location.description}</p>
        </div>

        {/* 2026-06-08 加：当前敌人（按种类 + 数量） */}
        {(() => {
          const ls = getLocationState(location.id);
          const total = getTotalEnemyCount(ls);
          const entries = ls ? Object.entries(ls.enemyCount).filter(([_, n]) => n > 0) : [];
          if (total === 0) {
            return (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>当前敌人</div>
                <p className={styles.emptyHint}>暂无敌人（被刷光 / 危险等级 0）</p>
              </div>
            );
          }
          return (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                当前敌人（共 {total} 个）
              </div>
              <div className={styles.countGrid}>
                {entries.map(([type, n]) => {
                  const tpl = ENEMY_TEMPLATES[type as keyof typeof ENEMY_TEMPLATES];
                  return (
                    <div key={type} className={styles.countItem}>
                      <span className={styles.countLabel}>{tpl?.name ?? type}</span>
                      <span className={styles.countValue}>×{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* 2026-06-08 加：当前物资（按 itemId + 数量 + 总计） */}
        {(() => {
          const ls = getLocationState(location.id);
          const total = getTotalLootCount(ls);
          const entries = ls ? Object.entries(ls.lootCount).filter(([_, n]) => n > 0) : [];
          if (total === 0) {
            return (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>当前物资</div>
                <p className={styles.emptyHint}>暂无物资（被搜光）</p>
              </div>
            );
          }
          return (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>
                当前物资（共 {total} 个）
              </div>
              <div className={styles.countGrid}>
                {entries.map(([itemId, n]) => (
                  <div key={itemId} className={styles.countItem}>
                    <span className={styles.countLabel}>{getItemName(itemId)}</span>
                    <span className={styles.countValue}>×{n}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 2026-06-09 改：下次刷新时间（同步刷新） */}
        {(() => {
          const ls = getLocationState(location.id);
          if (!ls) {
            return (
              <div className={styles.section}>
                <div className={styles.refreshHint}>首次访问，下次派遣时立即刷新</div>
              </div>
            );
          }
          const days = getDaysUntilRefresh(location, currentDay);
          return (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>下次刷新</div>
              <div className={styles.refreshInfo}>
                {days === 0
                  ? '🔄 现在刷新（已到时间 / dirty）'
                  : `还剩 ${days} 天`}
              </div>
            </div>
          );
        })()}

        {/* 错误提示 */}
        {error && <div className={styles.errorMsg}>{error}</div>}

        {/* 操作按钮 */}
        <div className={styles.actions}>
          {!isCurrentlyExploring ? (
            <button
              className={styles.primaryButton}
              onClick={() => {
                setError(null);
                if (dispatchable.length === 0) {
                  setError('没有可派遣的角色（HP>0 且体力≥20 且未在任务中）');
                  return;
                }
                if (dispatchable.length === 1) {
                  handleDispatch(dispatchable[0].id);
                } else {
                  setShowCharPicker(true);
                }
              }}
            >
              派遣探索
            </button>
          ) : (
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setError('取消派遣功能待实现（接口已预留 cancelMissionInList）');
              }}
            >
              召回角色
            </button>
          )}
        </div>

        {/* 选角色浮层 */}
        {showCharPicker && (
          <div className={styles.overlay} onClick={() => setShowCharPicker(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.header}>
                <div className={styles.titleGroup}>
                  <h2 className={styles.title}>选择派遣角色</h2>
                </div>
                <button className={styles.closeButton} onClick={() => setShowCharPicker(false)}>
                  <Icon icon={close} />
                </button>
              </div>
              <div className={styles.charList}>
                {dispatchable.map(c => {
                  const statusText = getCharacterStatusText(c);
                  return (
                    <div key={c.id} className={styles.charCard} onClick={() => handleDispatch(c.id)}>
                      <div className={styles.charInfo}>
                        <div className={styles.charName}>{c.name}</div>
                        <div className={styles.charStats}>
                          Lv.{c.level} · HP {c.hp} · 体力 {c.stamina}
                        </div>
                        <div className={styles.charStatus}>{statusText}</div>
                      </div>
                      <button className={styles.primaryButton}>派遣</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
