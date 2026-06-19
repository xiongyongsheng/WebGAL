import { useSelector } from 'react-redux';
import { Icon } from '@iconify/react';
import schedule from '@iconify-icons/material-symbols/schedule';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { saveGame } from '@/Core/controller/storage/saveGame';
import { generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeCharacter, normalizeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { applyPeriodEffectsToCharacters } from './characterTimeEffects';
import { checkMerchantRefresh } from '../Merchant/merchantRefresh';
import {
  readMissions, writeMissions,
  applyMissionOutcomeToParty, applyMissionOutcomeToCharacter, completeMission,
  calculateLostItems,
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

  // 2026-06-09 加：瓶盖（货币显示）
  const currentBottlecaps = (stageState.GameVar['scavenge_bottlecaps'] as number) ?? 0;

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
      let updated = applyPeriodEffectsToCharacters(chars, isOvernight);

      // 2026-06-09 加：商人刷新（每个商人按自己的 refreshDays 周期）
      // 每天推进时检查所有商人是否需要刷新
      for (const c of updated) {
        const refreshResult = checkMerchantRefresh(c, newDay);
        if (refreshResult.shouldRefresh) {
          updated = updated.map(x =>
            x.id === c.id ? refreshResult.nextMerchant : x,
          );
          const template = CHARACTER_TEMPLATES[c.id];
          console.log(
            `[商人/刷新] ${c.name} 在第${newDay}天刷新（金币→${template?.initialGold ?? 0}，库存重置）`,
          );
        }
      }

      // 派遣系统钩子：合并"遭遇检查" + "时间到点"判定
      // 重要：先 encounterCheck（即使已到 returnTime 也跑最后一次遭遇），再判定是否结算
      const oldMissions = readMissions();
      let finalChars = updated;
      const resultMissions: Mission[] = [];
      let justCompletedCount = 0;
      let failedCount = 0;
      const allEncounters: EncounterLog[] = [];

      // 2026-06-09 加：try/catch 防止单 mission 异常中断整个 tick
      //   原因：之前**没** try/catch，第一个 mission 抛异常 → 整个循环中断
      //   后果：所有**其他** mission **不**被处理 → board modal 只显示部分
      try {
        for (const m of oldMissions) {
          console.log(
            `[ScavengeTimeControl/tick] 处理 mission id=${m.id.slice(0, 6)} status=${m.status} loc=${m.locationId} charId=${m.characterId?.slice(0, 6)} encCount=${m.encounters?.length ?? 0}`
          );
          if (m.status !== 'active') {
          resultMissions.push(m);
          continue;
        }
        // 2026-06-09 改：取整个队伍（partyCharacterIds），不是单角色
        // 兼容：旧 mission 没有 partyCharacterIds（用 characterId 作为单人 party）
        const partyIds = m.partyCharacterIds && m.partyCharacterIds.length > 0
          ? m.partyCharacterIds
          : [m.characterId];
        const party = partyIds
          .map(id => finalChars.find(c => c.id === id))
          .filter((c): c is ScavengeCharacter => Boolean(c));
        if (party.length === 0) {
          resultMissions.push(m);
          continue;
        }
        const char = party[0];  // 主队员（兼容旧逻辑）
        const loc = SCAVENGE_LOCATIONS.find(l => l.id === m.locationId);
        if (!char || !loc) {
          resultMissions.push(m);
          continue;
        }

        // 1. 准备期判定：第 1 次推进（m.encounters 还没任何记录）算准备期
        const hasAnyEncounter = (m.encounters ?? []).length > 0;
        const isPreparing = !hasAnyEncounter;
        console.log(
          `[ScavengeTimeControl/tick] mission id=${m.id.slice(0, 6)} hasAnyEncounter=${hasAnyEncounter} isPreparing=${isPreparing}`
        );

        // 3. 处理三种状态
        let encounter: EncounterLog | null = null;
        let updatedParty = party;  // 2026-06-09 改：updatedParty
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
          // 活跃期：encounterCheck 接收整个队伍
          const result = encounterCheck(m, party, loc, newDay, newPeriodIndex);
          encounter = result.encounter;
          updatedParty = result.updatedParty;
          missionOver = result.missionOver;
          // 2026-06-09 改：删战斗后自动弹休整
          //   之前：战斗胜 → 写 scavenge_rest_pending → ScavengeMain 自动弹休整
          //   现在：玩家**主动**点"休整"按钮才弹
          //   战斗胜 → ScavengeCombatLogModal 显示战斗结果 + 物资 + "休整"按钮（玩家可选）
          //   location detail modal 也有"休整"按钮
          // 把 updatedParty 的所有队员写回 finalChars
          for (const upd of updatedParty) {
            finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
          }
          allEncounters.push(encounter);
          mWithEncounters = { ...m, encounters: [...m.encounters, encounter] };
        }

        // 3. 判定是否到 returnTime
        const reached = isTimeReached(newDay, newPeriodIndex, m.returnDay, m.returnPeriodIndex);

        if (encounter && missionOver) {
          // 战斗败：标记 failed + 立即结算
          // 2026-06-09 加：50% 概率丢失物品（主队员背包）
          const lostItems = calculateLostItems(updatedParty[0]);
          const lostMessage = lostItems.length > 0
            ? `（丢失 ${lostItems.length} 类物品）`
            : '';
          const failed: Mission = {
            ...mWithEncounters,
            status: 'failed',
            returnDay: newDay,
            returnPeriodIndex: newPeriodIndex,
            outcome: {
              success: false,
              reason: 'character_dead',
              message: `${encounter.message}${lostMessage}`,
              itemsGained: [],
              expGained: 0,
              hpLost: Math.abs(encounter.hpDelta ?? 0),
              lostItems,  // 2026-06-09 加：失败丢失物品
            },
            outcomeShown: false,
          };
          resultMissions.push(failed);
          if (failed.outcome) {
            // 2026-06-09 改：用 applyMissionOutcomeToParty + 传 partyHpDelta
            // 失败 mission 通常全队都扣血（每个人被随机打）
            const appliedParty = applyMissionOutcomeToParty(updatedParty, failed.outcome, encounter.partyHpDelta);
            for (const upd of appliedParty) {
              finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
            }
          }
          failedCount++;
          console.log(
            `[派遣/失败] 队伍=${party.length}人 主队员=${char.name} 地点=${loc.name} 遭遇=${encounter.kind} ` +
            `敌人=${encounter.enemiesEncountered} HP变化=${encounter.hpDelta}`,
          );
        } else if (reached) {
          // 时间到：正常完成
          // 2026-06-09 改：传 party
          const completed = completeMission(mWithEncounters, updatedParty, loc);
          resultMissions.push(completed);
          if (completed.outcome) {
            // 2026-06-09 改：用 applyMissionOutcomeToParty
            const appliedParty = applyMissionOutcomeToParty(updatedParty, completed.outcome);
            for (const upd of appliedParty) {
              finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
            }
          }
          justCompletedCount++;
          // 2026-06-09 加：瓶盖掉落奖励（每个物品 1-5 瓶盖）
          // 设计：每个掉落物品给 1-5 瓶盖（伪随机，按 itemId 哈希）
          if (completed.outcome && completed.outcome.itemsGained.length > 0) {
            const bottlecapReward = completed.outcome.itemsGained.reduce((sum, item) => {
              // 用 itemId 字符和算 hash，避免 Math.random（保证确定性）
              const hash = item.itemId.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
              return sum + (hash % 5) + 1; // 1-5
            }, 0);
            const currentBottlecaps = Number(stageStateManager.getCalculationStageState().GameVar['scavenge_bottlecaps'] ?? 0);
            stageStateManager.setStageVarAndCommit({
              key: 'scavenge_bottlecaps',
              value: String(currentBottlecaps + bottlecapReward),
            });
            // 把瓶盖奖励加到 outcome.bottlecapsGained（用于 UI 显示）
            completed.outcome.bottlecapsGained = bottlecapReward;
            console.log(
              `[派遣/瓶盖] 角色=${char.name} 物品${completed.outcome.itemsGained.length}类 瓶盖+${bottlecapReward}`,
            );
          }
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
      } catch (err) {
        // 2026-06-09 加：单 mission 异常**不**中断整个 tick
        //   原因：之前**没** try/catch，一个 mission 抛异常 → 整个循环中断
        //   后果：所有**其他** mission **不**被处理 → board modal 只显示部分
        console.error(
          `[ScavengeTimeControl/tick] mission 处理失败:`,
          err
        );
      }

      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(finalChars),
      });
      writeMissions(resultMissions);

      // 调试输出（2026-06-09 改：只统计 ally，过滤中立/敌对）
      const allyChars = finalChars.filter(c => {
        const template = CHARACTER_TEMPLATES[c.id];
        return (template?.faction ?? 'ally') === 'ally';
      });
      const exhausted = allyChars.filter(c => c.hunger === 0 || c.thirst === 0).length;
      const dead = allyChars.filter(c => c.hp <= 0).length;
      const onMission = allyChars.filter(c => c.isExploring).length;
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
        {/* 2026-06-09 加：瓶盖显示 */}
        <div className={styles.bottlecaps} title="瓶盖（货币）">
          <Icon icon="material-symbols:attach-money" className={styles.bottlecapsIcon} />
          <span className={styles.bottlecapsValue}>{currentBottlecaps}</span>
        </div>
      </div>
      <button className={styles.advanceButton} onClick={handleTimeAdvance} title="时间流逝">
        <Icon icon={schedule} className={styles.buttonIcon} />
      </button>
    </div>
  );
};
