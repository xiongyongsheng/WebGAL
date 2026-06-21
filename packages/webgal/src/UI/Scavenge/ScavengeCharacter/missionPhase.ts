/**
 * Mission Phase 工具（2026-06-19 加：Plan 17，2026-06-19 简化：去掉 returning 阶段）
 *
 * 用途：推**进** character.missionPhase
 *
 * 阶**段**机**制**（**简**化**后**）：
 * - 'preparing' (1 回合): 准**备**阶**段**（**会**遇**敌** / **扣**属**性**）** → 改**为** 'scavenging' 当**时**间**到**了**
 * - 'scavenging' (N 回合): 拾**荒**中**（**会**遇**敌** / **扣**属**性**）** → 改**为** null 当**时**间**到**了**（** mission **结**算**清**空**）
 * - null: 空**闲**（**不**在**派**遣**中**）
 *
 * 注：已**去**掉** 'returning' 阶**段**（2026-06-19 user 决**定**简**化**）
 */
import { ScavengeCharacter } from './character';

export const isTimeReachedForPhase = (
  currentDay: number,
  currentPeriodIndex: number,
  targetDay: number,
  targetPeriodIndex: number,
): boolean => {
  if (currentDay > targetDay) return true;
  if (currentDay < targetDay) return false;
  return currentPeriodIndex >= targetPeriodIndex;
};

/**
 * 推**进**所**有** characters 的** mission phase
 * - 'preparing' 阶**段**时**间**到**了** → 'scavenging'
 * - 'scavenging' 阶**段**时**间**到**了** → null（** mission **结**算**清**空**）
 * - null **不**变**
 */
export const advanceMissionPhaseOfChars = (
  chars: ScavengeCharacter[],
  currentDay: number,
  currentPeriodIndex: number,
): ScavengeCharacter[] => {
  return chars.map(c => {
    if (!c.missionPhase) {
      console.log(`[advanceMissionPhaseOfChars] ${c.name ?? c.id}: phase=null 不**变** (ctx=(${currentDay},${currentPeriodIndex}))`);
      return c;
    }
    console.log(
      `%c [advanceMissionPhaseOfChars] ${c.name ?? c.id}: phase=${c.missionPhase} (ctx=(${currentDay},${currentPeriodIndex}), prepEnd=(${c.preparingEndDay},${c.preparingEndPeriodIndex}), scavEnd=(${c.scavengingEndDay},${c.scavengingEndPeriodIndex}))`,
      'font-size:13px; background:pink; color:#bf2c9f;',
    );
    if (c.missionPhase === 'preparing') {
      if (c.preparingEndDay !== undefined && c.preparingEndPeriodIndex !== undefined) {
        if (isTimeReachedForPhase(currentDay, currentPeriodIndex, c.preparingEndDay, c.preparingEndPeriodIndex)) {
          console.log(`  → ${c.name ?? c.id}: preparing → scavenging`);
          return { ...c, missionPhase: 'scavenging' as const };
        }
      }
    }
    // 2026-06-19 简化：advanceMissionPhaseOfChars 不**推**进** 'scavenging' → null
    //   - 'scavenging' 阶**段**的**推**进**由** applyMissionOutcomeToParty 处**理**（** mission **完**成**时**）
    //   - 避**免** CharacterSystem + MissionSystem **同**一**个** advance 中**两**次**调**用** advanceMissionPhaseOfChars 导**致**的** 'preparing' → 'scavenging' → null **两**步**推**进**
    return c;
  });
};
