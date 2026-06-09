import { useSelector } from 'react-redux';
import { Icon } from '@iconify/react';
import schedule from '@iconify-icons/material-symbols/schedule';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { saveGame } from '@/Core/controller/storage/saveGame';
import { generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeCharacter, normalizeCharacter } from '../ScavengeCharacter/character';
import { applyPeriodEffectsToCharacters } from './characterTimeEffects';
import {
  readMissions, writeMissions,
  applyMissionOutcomeToCharacter, completeMission,
  encounterCheck, isTimeReached,
  Mission, EncounterLog,
} from '../ScavengeMissions/missions';
import { SCAVENGE_LOCATIONS } from '../ScavengeMap/locations';
import styles from './ScavengeTimeControl.module.scss';

type TimePeriod = '清晨' | '上午' | '下午' | '半晚' | '黑夜';

interface TimeState {
  day: number;
  period: TimePeriod;
  periodIndex: number;
}

const TIME_PERIODS: TimePeriod[] = ['清晨', '上午', '下午', '半晚', '黑夜'];

function getNextPeriod(currentIndex: number): TimeState {
  let nextIndex = currentIndex + 1;
  let nextDay = 0;

  if (nextIndex >= TIME_PERIODS.length) {
    nextIndex = 0;
    nextDay = 1;
  }

  return {
    day: nextDay,
    period: TIME_PERIODS[nextIndex],
    periodIndex: nextIndex,
  };
}

export const ScavengeTimeControl = () => {
  const GUIState = useSelector((state: RootState) => state.GUI);
  const stageState = useStageState();

  const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
  const currentPeriodIndex = (stageState.GameVar['current_period_index'] as number) ?? 0;
  const currentPeriod = TIME_PERIODS[currentPeriodIndex] ?? '上午';

  const isVisible = (stageState.GameVar['show_scavenge_time_control'] as boolean) ?? false;
  const isEnterGame = GUIState.isEnterGame;

  if (!isVisible || !isEnterGame) return null;

  const handleTimeAdvance = () => {
    const nextState = getNextPeriod(currentPeriodIndex);
    const newDay = currentDay + nextState.day;
    const newPeriodIndex = nextState.periodIndex;
    const isOvernight = nextState.day > 0;

    stageStateManager.setStageVarAndCommit({ key: 'current_day', value: newDay });
    stageStateManager.setStageVarAndCommit({ key: 'current_period_index', value: newPeriodIndex });

    // 应用时间效果到所有角色（消耗/恢复/触底扣血）
    const rawChars = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const chars: ScavengeCharacter[] = (() => {
      if (typeof rawChars === 'string') {
        try {
          const parsed = JSON.parse(rawChars);
          if (Array.isArray(parsed)) return parsed.map((c) => normalizeCharacter(c as ScavengeCharacter));
        } catch { /* ignore */ }
      }
      if (Array.isArray(rawChars)) {
        return (rawChars as unknown as ScavengeCharacter[]).map((c) => normalizeCharacter(c));
      }
      return [];
    })();
    if (chars.length > 0) {
      const updated = applyPeriodEffectsToCharacters(chars, isOvernight);

      // 派遣系统钩子：合并"遭遇检查" + "时间到点"判定
      // 重要：先 encounterCheck（即使已到 returnTime 也跑最后一次遭遇），再判定是否结算
      const oldMissions = readMissions();
      let finalChars = updated;
      const resultMissions: Mission[] = [];
      let justCompletedCount = 0;
      let failedCount = 0;
      const allEncounters: EncounterLog[] = [];

      for (const m of oldMissions) {
        if (m.status !== 'active') {
          resultMissions.push(m);
          continue;
        }
        const char = finalChars.find(c => c.id === m.characterId);
        const loc = SCAVENGE_LOCATIONS.find(l => l.id === m.locationId);
        if (!char || !loc) {
          resultMissions.push(m);
          continue;
        }

        // 1. 准备期判定：第 1 次推进（m.encounters 还没任何记录）算准备期
        // 后续每次推进往 encounters 插占位（kind='no_encounter'）让"准备期"标记持久化
        const hasAnyEncounter = (m.encounters ?? []).length > 0;
        const isPreparing = !hasAnyEncounter;
        // （2026-06-09 改：删除 isActivePeriod 判断，最后一期也要跑 encounterCheck）

        // 3. 处理三种状态
        let encounter: EncounterLog | null = null;
        let updatedChar = char;
        let missionOver = false;
        let mWithEncounters: Mission = m;

        if (isPreparing) {
          // 准备期：插一个 no_encounter 占位（标记"准备完成"）
          mWithEncounters = {
            ...m,
            encounters: [{
              id: generateInstanceId(),
              triggerDay: newDay,
              triggerPeriodIndex: newPeriodIndex,
              kind: 'no_encounter',
              message: '准备完成',
            }],
          };
        } else {
          // 活跃期 + returnTime 当期（2026-06-09 改：最后一个阶段也要遇敌判定）
          const result = encounterCheck(m, char, loc, newDay, newPeriodIndex);
          encounter = result.encounter;
          updatedChar = result.updatedChar;
          missionOver = result.missionOver;
          finalChars = finalChars.map(c => c.id === char.id ? updatedChar : c);
          allEncounters.push(encounter);
          mWithEncounters = { ...m, encounters: [...m.encounters, encounter] };
        }
        // 准备期：插 no_encounter 占位；活跃期 + returnTime 当期：都跑 encounterCheck
        // （2026-06-09 改：原代码最后阶段不跑 encounterCheck，现在改为也跑）

        // 3. 判定是否到 returnTime
        const reached = isTimeReached(newDay, newPeriodIndex, m.returnDay, m.returnPeriodIndex);

        if (encounter && missionOver) {
          // 战斗败：标记 failed + 立即结算
          const failed: Mission = {
            ...mWithEncounters,
            status: 'failed',
            returnDay: newDay,
            returnPeriodIndex: newPeriodIndex,
            outcome: {
              success: false,
              reason: 'character_dead',
              message: encounter.message,
              itemsGained: [],
              expGained: 0,
              hpLost: Math.abs(encounter.hpDelta ?? 0),
            },
            outcomeShown: false,
          };
          resultMissions.push(failed);
          if (failed.outcome) {
            finalChars = finalChars.map(c =>
              c.id === char.id ? applyMissionOutcomeToCharacter(c, failed.outcome!) : c
            );
          }
          failedCount++;
          console.log(
            `[派遣/失败] 角色=${char.name} 地点=${loc.name} 遭遇=${encounter.kind} ` +
            `敌人=${encounter.enemiesEncountered} HP变化=${encounter.hpDelta}`,
          );
        } else if (reached) {
          // 时间到：正常完成（outcome.itemsGained 从 encounters 收集）
          const completed = completeMission(mWithEncounters, char, loc);
          resultMissions.push(completed);
          if (completed.outcome) {
            finalChars = finalChars.map(c =>
              c.id === char.id ? applyMissionOutcomeToCharacter(c, completed.outcome!) : c
            );
          }
          justCompletedCount++;
          // 只算"真实遭遇"（排除准备期 no_encounter 占位）
          const realEncounters = mWithEncounters.encounters.filter(e => e.kind !== 'no_encounter').length;
          console.log(
            `[派遣/完成] 角色=${char.name} 地点=${loc.name} 物品=${completed.outcome?.itemsGained.length ?? 0}类 ` +
            `经验+${completed.outcome?.expGained ?? 0} 真实遭遇${realEncounters}次`,
          );
        } else {
          // 继续 active
          resultMissions.push(mWithEncounters);
          if (encounter && encounter.kind !== 'no_encounter') {
            console.log(
              `[派遣/遭遇] ${encounter.kind} 角色=${char.name} 地点=${loc.name}  ` +
              (encounter.itemsGained ? `物品+${encounter.itemsGained.length}` : ''),
            );
          } else if (!hasAnyEncounter) {
            // 准备期（占位已加，调试输出）
            console.log(
              `[派遣/准备] 角色=${char.name} 地点=${loc.name}（准备完成，下次开始活跃）`,
            );
          }
        }
      }

      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(finalChars),
      });
      writeMissions(resultMissions);

      // 调试输出
      const exhausted = finalChars.filter(c => c.hunger === 0 || c.thirst === 0).length;
      const dead = finalChars.filter(c => c.hp <= 0).length;
      const onMission = finalChars.filter(c => c.isExploring).length;
      const encounterCount = allEncounters.filter(e => e.kind !== 'no_encounter').length;
      console.log(
        `时间推进: 第${newDay}天 ${nextState.period}` +
        (isOvernight ? ' (过夜恢复)' : '') +
        (exhausted > 0 ? ` [${exhausted} 人饥/渴=0]` : '') +
        (dead > 0 ? ` [${dead} 人濒死]` : '') +
        (onMission > 0 ? ` [${onMission} 人派遣中]` : '') +
        (justCompletedCount > 0 ? ` [${justCompletedCount} 派遣完成]` : '') +
        (failedCount > 0 ? ` [${failedCount} 派遣失败]` : '') +
        (encounterCount > 0 ? ` [${encounterCount} 遭遇]` : ''),
      );
    } else {
      console.log(`时间推进: 第${newDay}天 ${nextState.period}`);
    }

    if (isOvernight) {
      console.log('新的一天开始，自动存档到槽位 0！');
      saveGame(0);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.timeDisplay}>
        <div className={styles.day}>
          <span className={styles.label}>第</span>
          <span className={styles.value}>{currentDay}</span>
          <span className={styles.label}>天</span>
        </div>
        <div className={styles.period}>
          <span className={styles.periodValue}>{currentPeriod}</span>
        </div>
      </div>
      <button className={styles.advanceButton} onClick={handleTimeAdvance} title="时间流逝">
        <Icon icon={schedule} className={styles.buttonIcon} />
      </button>
    </div>
  );
};
