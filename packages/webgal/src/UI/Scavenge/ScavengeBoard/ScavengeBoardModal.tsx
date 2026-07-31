/**
 * 综合看板 Modal（2026-06-21 加：替代 ScavengeEncounterBoardModal）
 *
 * 设计（**重**新**设**计**版**本**）**：
 * - 3 **个**分**区**：
 *   1. **工**作**中**（**蓝**色**）**：**派**遣** + **制**作** + **修**补**
 *   2. **空**闲**（**绿**色**）**：可**派**遣**的**角**色**
 *   3. **无**法**行**动**（**红**色**）**：HP=0 / **饱**食**=0 / **精**神**=0 **等**
 *
 * 快照机制：
 * - 每次 time advance **覆**盖**记**录**一**次**快**照**（**不**存** history**）
 * - 玩家**反**复**打**开**显**示**的**是** "**上**一**回**合**结**束**时**"**的**状**态**
 * - 下**次** advance **才**会**更**新**快**照**
 *
 * 入口：
 * - 玩家**主**动**打**开**：**地**图**上**的** "看**板**" **按**钮**
 * - 不**再**自**动**弹**出**（**不**打**扰**玩**家**）
 */

import { useStageState } from '@/hooks/useStageState';
import { Icon } from '@iconify/react';
import locationOn from '@iconify-icons/material-symbols/location-on';
import build from '@iconify-icons/material-symbols/build';
import buildCircle from '@iconify-icons/material-symbols/build-circle';
import sick from '@iconify-icons/material-symbols/sick';
import hotel from '@iconify-icons/material-symbols/hotel';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import cancel from '@iconify-icons/material-symbols/cancel';
import swords from '@iconify-icons/material-symbols/swords';
import visibility from '@iconify-icons/material-symbols/visibility';
import inventory from '@iconify-icons/material-symbols/inventory-2';
import favorite from '@iconify-icons/material-symbols/favorite';
import water from '@iconify-icons/material-symbols/water-drop';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import psychology from '@iconify-icons/material-symbols/psychology';
import bolt from '@iconify-icons/material-symbols/bolt';
import { getBoardSnapshot, setBoardVisible } from './boardStore';
import { BoardSnapshot, BoardCharacterSummary } from './board.types';
import styles from './ScavengeBoardModal.module.scss';

/** encounter 标题映射（简**化**版**）*/
const ENCOUNTER_TITLES: Record<string, string> = {
  resource: '发现物资',
  stealth_clear: '潜行通过',
  evade_success: '潜行成功',
  combat_victory: '战斗胜利',
  evade_fail_combat_victory: '潜行失败/战斗胜',
  combat_defeat: '战斗失败',
  evade_fail_combat_defeat: '潜行失败/战斗败',
  location_cleared: '地点已清',
};

const ENCOUNTER_ICONS: Record<string, any> = {
  resource: inventory,
  stealth_clear: visibility,
  evade_success: visibility,
  combat_victory: swords,
  evade_fail_combat_victory: swords,
  combat_defeat: cancel,
  evade_fail_combat_defeat: cancel,
  location_cleared: inventory,
};

interface ScavengeBoardModalProps {
  onClose: () => void;
}

/** 角色小卡 */
const CharacterCard = ({ c }: { c: BoardCharacterSummary }) => {
  const hpLow = c.hp <= c.maxHp * 0.3;
  const hungerLow = c.hunger <= 30;
  const thirstLow = c.thirst <= 30;
  const sanityLow = c.sanity <= 30;
  const staminaLow = c.stamina <= 30;
  return (
    <div className={styles.charCard}>
      <div className={styles.charName}>
        <Icon icon="material-symbols:person" />
        {c.name}
      </div>
      <div className={styles.charStats}>
        <span className={`${styles.statItem} ${hpLow ? styles.statLow : styles.statOk}`}>
          <Icon icon={favorite} /> {c.hp}/{c.maxHp}
        </span>
        <span className={`${styles.statItem} ${hungerLow ? styles.statLow : ''}`}>
          <Icon icon={restaurant} /> {c.hunger}
        </span>
        <span className={`${styles.statItem} ${thirstLow ? styles.statLow : ''}`}>
          <Icon icon={water} /> {c.thirst}
        </span>
        <span className={`${styles.statItem} ${sanityLow ? styles.statLow : ''}`}>
          <Icon icon={psychology} /> {c.sanity}
        </span>
        <span className={`${styles.statItem} ${staminaLow ? styles.statLow : ''}`}>
          <Icon icon={bolt} /> {c.stamina}
        </span>
      </div>
    </div>
  );
};

/** 角色 + 工作（crafting/repairing）*/
const BusyCharacterCard = ({ c, job }: { c: BoardCharacterSummary; job: { kind: 'crafting' | 'repairing'; label: string; remaining: number } }) => {
  return (
    <div className={styles.charCard}>
      <div className={styles.charName}>
        <Icon icon={job.kind === 'crafting' ? build : buildCircle} />
        {c.name}
      </div>
      <div className={styles.charJob}>{job.label}</div>
      <div className={styles.charJobProgress}>剩 {job.remaining} 回合</div>
    </div>
  );
};

export const ScavengeBoardModal = ({ onClose }: ScavengeBoardModalProps) => {
  // 订阅 stage state，让快照更新能触发重渲染
  useStageState();
  const snapshot = getBoardSnapshot();

  const handleClose = () => {
    // 关闭后只隐藏 modal（不删快照，下次打开还能看上一回合的）
    setBoardVisible(false);
    onClose();
  };

  if (!snapshot) {
    return (
      <div className={styles.overlay} onClick={handleClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <div className={styles.titleGroup}>
              <Icon icon={locationOn} className={styles.titleIcon} />
              <h2 className={styles.title}>综合看板</h2>
            </div>
            <button className={styles.closeBtn} onClick={handleClose}>×</button>
          </div>
          <div className={styles.empty} style={{ padding: 60 }}>
            暂无快照。请先推进一回合。
          </div>
        </div>
      </div>
    );
  }

  // 工作中 = missions + crafting + repairing
  const busyCount = snapshot.missions.length + snapshot.crafting.length + snapshot.repairing.length;

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon icon={locationOn} className={styles.titleIcon} />
            <h2 className={styles.title}>综合看板</h2>
            <span className={styles.snapshotHint}>
              上一回合：Day {snapshot.day} · Period {snapshot.period}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={handleClose}>×</button>
        </div>

        {/* 三分区 */}
        <div className={styles.body}>
          {/* ============ 工作中 ============ */}
          <div className={`${styles.section} ${styles.sectionBusy}`}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Icon icon={locationOn} />
                工作中
              </span>
              <span className={styles.sectionCount}>{busyCount}</span>
            </div>
            <div className={styles.sectionContent}>
              {snapshot.missions.length === 0 && snapshot.crafting.length === 0 && snapshot.repairing.length === 0 ? (
                <div className={styles.empty}>无人工作</div>
              ) : (
                <>
                  {/* 派遣中的任务 */}
                  {snapshot.missions.map(m => (
                    <div key={m.id} className={styles.missionCard}>
                      <div className={styles.missionHeader}>
                        <span className={styles.missionLocation}>
                          <Icon icon={locationOn} /> {m.locationName}
                        </span>
                        <span className={`${styles.missionBadge} ${
                          m.hasOutcome
                            ? (m.outcomeSuccess ? styles.missionBadgeSuccess : styles.missionBadgeFail)
                            : styles.missionBadgeProgress
                        }`}>
                          {m.hasOutcome
                            ? (m.outcomeSuccess ? '✓ 已完成' : '✗ 失败')
                            : '进行中'}
                        </span>
                      </div>
                      <div className={styles.missionParty}>
                        队员：{m.partyNames.join('、') || '—'}
                      </div>
                      {m.encounters.length > 0 && (
                        <div className={styles.missionEncounters}>
                          {m.encounters.slice(-3).map((enc, idx) => {
                            const IconComp = ENCOUNTER_ICONS[enc.kind] ?? locationOn;
                            return (
                              <div key={idx} className={styles.encounterItem}>
                                <Icon icon={IconComp} className={styles.encounterIcon} />
                                <span>{ENCOUNTER_TITLES[enc.kind] ?? enc.kind}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {m.loot && m.loot.length > 0 && (
                        <div className={styles.missionLoot}>
                          🎁 {m.loot.map(l => `${l.itemId}×${l.quantity}`).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* crafting 中 */}
                  {snapshot.crafting.map(craft => (
                    <BusyCharacterCard
                      key={craft.charId}
                      c={{ id: craft.charId, name: craft.charName, hp: 0, maxHp: 100, hunger: 0, thirst: 0, sanity: 0, stamina: 0 }}
                      job={{
                        kind: 'crafting',
                        label: `${craft.blueprintName}${craft.workbenchId ? '' : '（建造）'}`,
                        remaining: craft.remainingPeriods,
                      }}
                    />
                  ))}
                  {/* repairing 中 */}
                  {snapshot.repairing.map(rep => (
                    <BusyCharacterCard
                      key={rep.charId}
                      c={{ id: rep.charId, name: rep.charName, hp: 0, maxHp: 100, hunger: 0, thirst: 0, sanity: 0, stamina: 0 }}
                      job={{
                        kind: 'repairing',
                        label: `修补${rep.targetName}`,
                        remaining: rep.remainingPeriods,
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* ============ 空闲 ============ */}
          <div className={`${styles.section} ${styles.sectionIdle}`}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Icon icon={checkCircle} />
                空闲（可派遣）
              </span>
              <span className={styles.sectionCount}>{snapshot.idle.length}</span>
            </div>
            <div className={styles.sectionContent}>
              {snapshot.idle.length === 0 ? (
                <div className={styles.empty}>无空闲角色</div>
              ) : (
                snapshot.idle.map(c => <CharacterCard key={c.id} c={c} />)
              )}
            </div>
          </div>

          {/* ============ 无法行动 ============ */}
          <div className={`${styles.section} ${styles.sectionIncapacitated}`}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Icon icon={sick} />
                无法行动
              </span>
              <span className={styles.sectionCount}>{snapshot.incapacitated.length}</span>
            </div>
            <div className={styles.sectionContent}>
              {snapshot.incapacitated.length === 0 ? (
                <div className={styles.empty}>全部健康</div>
              ) : (
                snapshot.incapacitated.map(c => (
                  <div key={c.id} className={styles.charCard}>
                    <div className={styles.charName}>
                      <Icon icon={sick} />
                      {c.name}
                    </div>
                    {c.reasons && c.reasons.length > 0 && (
                      <div className={styles.charReasons}>
                        {c.reasons.join(' · ')}
                      </div>
                    )}
                    <div className={styles.charStats}>
                      <span className={`${styles.statItem} ${styles.statLow}`}>
                        <Icon icon={favorite} /> {c.hp}/{c.maxHp}
                      </span>
                      <span className={`${styles.statItem} ${styles.statLow}`}>
                        <Icon icon={bolt} /> {c.stamina}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
