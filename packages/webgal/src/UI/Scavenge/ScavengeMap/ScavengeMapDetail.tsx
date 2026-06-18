import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import locationOn from '@iconify-icons/material-symbols/location-on';
import inventory from '@iconify-icons/material-symbols/inventory';
import checkBox from '@iconify-icons/material-symbols/check-box-outline';
import checkBoxOutlineBlank from '@iconify-icons/material-symbols/check-box-outline-blank';
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
import { canDispatch } from '../ScavengeCharacter/traits';
import { startMission, readMissions, writeMissions, MAX_PARTY_SIZE, buildEarlyReturnMission, applyMissionOutcomeToParty } from '../ScavengeMissions/missions';
import { SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import { ScavengeConfirmModal } from '../ScavengeConfirm/ScavengeConfirmModal';
import styles from './ScavengeMapDetail.module.scss';

interface ScavengeMapDetailProps {
  location: ScavengeLocationItem;
  onClose: () => void;
}

export const ScavengeMapDetail = ({ location, onClose }: ScavengeMapDetailProps) => {
  const stageState = useStageState();
  const [showCharPicker, setShowCharPicker] = useState(false);
  // 2026-06-09 加：多选队伍（最多 3 人）
  const [selectedParty, setSelectedParty] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // 2026-06-09 加：提前返回确认 modal
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  // 派往该地点的角色 ID（从 missions 列表里查）
  const allMissions = readMissions();
  const activeMissionsAtLocation = allMissions.filter(
    m => m.locationId === location.id && m.status === 'active',
  );
  const isCurrentlyExploring = activeMissionsAtLocation.length > 0;
  // 2026-06-09 改：显示所有队伍成员（partyCharacterIds 优先）
  const exploringPartyIds = activeMissionsAtLocation.flatMap(m =>
    m.partyCharacterIds && m.partyCharacterIds.length > 0
      ? m.partyCharacterIds
      : [m.characterId],
  );

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
  // 2026-06-09 改：用 canDispatch 检查数值（任一项归0 → 不能派遣）
  const dispatchable = characters.filter(c => {
    if (c.isExploring) return false;
    if (c.stamina < 20) return false;
    const template = CHARACTER_TEMPLATES[c.id];
    if (!template) return false;
    if ((template.faction ?? 'ally') !== 'ally') return false;
    return canDispatch(c).canDispatch;
  });

  /**
   * 派遣队伍（2026-06-09 改：多角色）
   * @param partyIds 队伍 ID 列表（1-3 人）
   */
  const handleDispatchParty = (partyIds: string[]) => {
    setError(null);
    if (partyIds.length === 0) {
      setError('请至少选择 1 个角色');
      return;
    }
    if (partyIds.length > MAX_PARTY_SIZE) {
      setError(`队伍上限 ${MAX_PARTY_SIZE} 人`);
      return;
    }
    // 检查每个角色
    for (const id of partyIds) {
      const char = characters.find(c => c.id === id);
      if (!char) {
        setError(`角色 ${id} 不存在`);
        return;
      }
      if (char.isExploring) {
        setError(`${char.name} 正在执行其他任务`);
        return;
      }
      if (char.hp <= 0) {
        setError(`${char.name} 无法行动（HP=0）`);
        return;
      }
      if (char.stamina < 20) {
        setError(`${char.name} 体力不足（需要 ≥ 20）`);
        return;
      }
    }
    // 创建 mission（partyCharacterIds = partyIds）
    const mission = startMission(partyIds, location, currentDay, currentPeriodIndex);
    // 写回 missions
    const allMissions = readMissions();
    writeMissions([...allMissions, mission]);
    // 更新所有队员：isExploring=true, exploringLocationId, returnDay, returnPeriodIndex
    const partySet = new Set(partyIds);
    const updatedChars = characters.map(c => {
      if (!partySet.has(c.id)) return c;
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
    setSelectedParty([]);
    onClose();
  };

  /**
   * 切换队伍成员（多选 checkbox）
   */
  const togglePartyMember = (charId: string) => {
    setSelectedParty((prev) => {
      if (prev.includes(charId)) {
        return prev.filter(id => id !== charId);
      } else {
        if (prev.length >= MAX_PARTY_SIZE) {
          setError(`队伍最多 ${MAX_PARTY_SIZE} 人`);
          return prev;
        }
        setError(null);
        return [...prev, charId];
      }
    });
  };

  /**
   * 提前返回（2026-06-09 加：Plan 4）
   * 玩家主动放弃剩余派遣时间，立即结算（奖励 50%）
   *
   * 流程（2026-06-09 改）：
   * 1. 显示 ScavengeConfirmModal 确认（不直接弹原生 confirm）
   * 2. 用户确认 → 调 buildEarlyReturnMission
   * 3. 应用 outcome
   * 4. 写回 GameVar
   * 5. 关闭 location detail modal
   * 6. **ScavengeMain 监听 missions 变化自动弹 outcome modal**（提前返回的结算）
   */
  const doReturnEarly = (mission: ReturnType<typeof readMissions>[number]) => {
    // 找队伍
    const partyIds = mission.partyCharacterIds && mission.partyCharacterIds.length > 0
      ? mission.partyCharacterIds
      : [mission.characterId];
    const party = partyIds
      .map(id => characters.find(c => c.id === id))
      .filter((c): c is ScavengeCharacter => Boolean(c));
    if (party.length === 0) {
      setError('队伍数据异常');
      return;
    }

    // 算 outcome（提前返回模式）
    const updatedMission = buildEarlyReturnMission(mission, party, location);

    // 应用 outcome（更新所有队员）
    if (!updatedMission.outcome) return;
    const appliedParty = applyMissionOutcomeToParty(party, updatedMission.outcome);
    const partyMap = new Map(appliedParty.map(p => [p.id, p]));
    const newChars = characters.map(c => partyMap.get(c.id) ?? c);

    // 写回 GameVar
    const allMissions = readMissions();
    const newMissions = allMissions.map(x => x.id === mission.id ? updatedMission : x);
    writeMissions(newMissions);
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(newChars),
    });

    // 关 location detail modal
    setShowCharPicker(false);
    setShowReturnConfirm(false);
    onClose();
    // 注意：ScavengeMain 监听 missions 变化，会自动弹 outcome modal
  };

  const handleReturnEarlyClick = () => {
    if (activeMissionsAtLocation.length === 0) return;
    setShowReturnConfirm(true);
  };

  /**
   * 打开休整 modal（2026-06-09 加：Plan 3 重构）
   * 派遣中任何时候可点 → 打开休整面板（用物品恢复状态）
   * 与"战斗后自动弹休整"的关系：
   *   - 战斗胜 → ScavengeTimeControl 写 GameVar scavenge_rest_pending → 自动弹
   *   - 没战斗但想休整 → 点 location detail modal 里的"休整"按钮 → 这里触发
   * 实现：
   *   - 写 GameVar scavenge_rest_pending = { missionId, encounterId: null }
   *   - ScavengeMain 监听到 → 弹 ScavengeRestModal
   *   - encounterId=null 表示"非战斗触发的休整"
   */
  const handleRestClick = () => {
    if (activeMissionsAtLocation.length === 0) return;
    const m = activeMissionsAtLocation[0];
    // 写 rest_pending 触发 modal（encounterId 为 null 表示主动休整）
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_rest_pending',
      value: JSON.stringify({ missionId: m.id, encounterId: null }),
    });
    onClose();  // 关 location detail modal
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
        {isCurrentlyExploring && exploringPartyIds.length > 0 && (
          <div className={styles.exploringStatus}>
            <div className={styles.exploringLabel}>
              <span className={styles.pulse}></span>
              正在派遣 {exploringPartyIds.length} 人
            </div>
            <div className={styles.exploringCharacter}>
              {exploringPartyIds.map(id => {
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
                // 2026-06-09 改：永远打开多选 modal（不再跳过，让玩家选队伍）
                setShowCharPicker(true);
              }}
            >
              派遣探索
            </button>
          ) : (
            <div className={styles.activeMissionActions}>
              <button
                className={styles.restButton}
                onClick={handleRestClick}
                title="打开休整面板（用物品恢复状态）"
              >
                休整
              </button>
              <button
                className={styles.secondaryButton}
                onClick={handleReturnEarlyClick}
                title="立即返回（经验 ×50%）"
              >
                提前返回
              </button>
            </div>
          )}
        </div>

        {/* 选队伍浮层（2026-06-09 改：多选） */}
        {showCharPicker && (
          <div className={styles.overlay} onClick={() => setShowCharPicker(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.header}>
                <div className={styles.titleGroup}>
                  <h2 className={styles.title}>组建派遣队伍</h2>
                  <span className={styles.partyCounter}>
                    已选 {selectedParty.length} / {MAX_PARTY_SIZE}
                  </span>
                </div>
                <button className={styles.closeButton} onClick={() => setShowCharPicker(false)}>
                  <Icon icon={close} />
                </button>
              </div>
              <div className={styles.charList}>
                {dispatchable.map(c => {
                  const statusText = getCharacterStatusText(c);
                  const isSelected = selectedParty.includes(c.id);
                  const isDisabled = !isSelected && selectedParty.length >= MAX_PARTY_SIZE;
                  return (
                    <div
                      key={c.id}
                      className={`${styles.charCard} ${isSelected ? styles.charCardSelected : ''} ${isDisabled ? styles.charCardDisabled : ''}`}
                      onClick={() => !isDisabled && togglePartyMember(c.id)}
                    >
                      <div className={styles.charCheckbox}>
                        <Icon
                          icon={isSelected ? checkBox : checkBoxOutlineBlank}
                          className={isSelected ? styles.checkboxIconChecked : styles.checkboxIcon}
                        />
                      </div>
                      <div className={styles.charInfo}>
                        <div className={styles.charName}>
                          {c.name}
                          {isSelected && <span className={styles.partyLeaderTag}>主</span>}
                        </div>
                        <div className={styles.charStats}>
                          Lv.{c.level} · HP {c.hp} · 体力 {c.stamina}
                        </div>
                        <div className={styles.charStatus}>{statusText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* 2026-06-09 加：底部"派遣"按钮（按队伍派遣） */}
              <div className={styles.partyActions}>
                <button
                  className={styles.primaryButton}
                  disabled={selectedParty.length === 0}
                  onClick={() => handleDispatchParty(selectedParty)}
                >
                  派遣 {selectedParty.length > 0 ? `（${selectedParty.length} 人）` : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2026-06-09 加：提前返回确认 modal（替代 window.confirm） */}
        {activeMissionsAtLocation.length > 0 && (
          <ScavengeConfirmModal
            open={showReturnConfirm}
            title="提前返回"
            message={[
              `确定立即从【${location.name}】返回安全屋？`,
              '经验 ×50% 折扣（已获得物资全部带回）',
            ]}
            confirmText="提前返回"
            cancelText="继续派遣"
            variant="warning"
            onConfirm={() => doReturnEarly(activeMissionsAtLocation[0])}
            onCancel={() => setShowReturnConfirm(false)}
          />
        )}
      </div>
    </div>
  );
};
