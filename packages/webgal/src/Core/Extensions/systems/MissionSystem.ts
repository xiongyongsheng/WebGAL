/**
 * 派遣系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：把 ScavengeTimeControl 内的 mission 循环**移**到**独**立**的**业务系统
 *
 * 之前：
 * - ScavengeTimeControl.handleTimeAdvance 内 100+ 行混**合**所**有**业务
 * - 加新 mission 行为**需**改核心
 * - 错**误**处理散落各**处**
 *
 * 现在：
 * - MissionSystem 独**立**文件，**实**现 ISystem
 * - **通**过 onPeriodChange 钩**子**接**入**时间系统
 * - 错**误**处理**统**一**在** TimeSystem.runHooks 内
 *
 * **迁**移**说**明**：
 * - **从** ScavengeTimeControl 移**出**：
 *   1. mission 循环（每**个** mission 跑 encounterCheck + completeMission）
 *   2. 写**回** missions（afterAdvance）
 *   3. 写**回** characters（afterAdvance，**临**时**兼**管**）
 *   4. 瓶盖奖励**计**算（afterAdvance）
 *
 * - **不**移**动**：
 *   - 商人刷新（**留**在** ScavengeTimeControl，**待** MerchantSystem 迁**移**）
 *   - 角色 HP/饥/渴**变**化（**待** CharacterSystem 迁**移**）
 *   - 自动存档（**留**在** ScavengeTimeControl，**待** PersistenceSystem 迁**移**）
 *   - 时间 state 更新（**移**到** TimeSystem）
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import type { TimeHookContext } from '../time/timeEvents';
import { SCAVENGE_LOCATIONS } from '../../../UI/Scavenge/ScavengeMap/locations';
import {
  readMissions,
  writeMissions,
  applyMissionOutcomeToParty,
  completeMission,
  calculateLostItems,
  encounterCheck,
  isTimeReached,
  Mission,
  EncounterLog,
} from '../../../UI/Scavenge/ScavengeMissions/missions';
import { ScavengeCharacter, normalizeCharacter } from '../../../UI/Scavenge/ScavengeCharacter/character';
import { advanceMissionPhaseOfChars } from '../../../UI/Scavenge/ScavengeCharacter/missionPhase';
import { generateInstanceId, addToInventory, InventoryItem } from '../../../UI/Scavenge/ScavengeItems/inventory';
import { tryAddToTempLoot } from '../../../UI/Scavenge/ScavengeMissions/partyLoot';

export class MissionSystem implements ISystem {
  readonly id = 'mission';

  /** 上一**次** tick 的 missions（beforeAdvance 钩**子**快照，**用**于**调**试**）*/
  private prevMissions: Mission[] = [];

  /** 上一**次** tick 的 characters（**用**于 missions 读取 party）*/
  private prevChars: ScavengeCharacter[] = [];

  /** 处理结果（onPeriodChange **记**录，afterAdvance **读**取）*/
  private lastResult: {
    newMissions: Mission[];
    newChars: ScavengeCharacter[];
    justCompletedCount: number;
    failedCount: number;
    allEncounters: EncounterLog[];
  } | null = null;

  // =================== ISystem 接口 ===================

  init(): void {
    logger.info(`[MissionSystem] init`);
  }

  registerTimeHooks(time: TimeSystem): void {
    // 1. beforeAdvance：快照 missions + characters
    time.on('beforeAdvance', this.onBeforeAdvance);

    // 2. onPeriodChange：处理 mission 循环（核心逻辑）
    time.on('onPeriodChange', this.onPeriodChange);

    // 3. afterAdvance：写回 missions + characters + 瓶盖
    time.on('afterAdvance', this.onAfterAdvance);

    logger.info(`[MissionSystem] 时间钩子已注册`);
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    // 当 missions 变化时，UI（board modal）会**自**动**响**应
    // （**不**需要**显**式订阅，**但**为**了**扩**展**性**预**留**接**口**）
    bus.subscribe('scavenge_missions', () => {
      logger.debug(`[MissionSystem] missions **变**化`);
    });
  }

  // =================== 时间钩子 ===================

  /**
   * beforeAdvance：快照当**前**状态
   */
  private onBeforeAdvance = (_ctx: TimeHookContext): void => {
    this.prevMissions = readMissions();
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    this.prevChars = typeof raw === 'string' ? JSON.parse(raw) : [];
    logger.debug(`[MissionSystem/beforeAdvance] 快照: ${this.prevMissions.length} missions, ${this.prevChars.length} chars`);
  };

  /**
   * onPeriodChange：处理所**有** active mission（核**心**逻辑）
   *
   * **从** ScavengeTimeControl 移**出**的核**心**循环
   */
  private onPeriodChange = (ctx: TimeHookContext): void => {
    const newDay = ctx.next.day;
    const newPeriodIndex = ctx.next.periodIndex;

    const oldMissions = this.prevMissions;
    // 2026-06-19 加：Plan 17 - 推进 mission phase（与 CharacterSystem 同步）
    //   不**调**这**个**会**导**致** finalChars 用**的**是**旧** phase，**而** CharacterSystem 写**回**的**新** phase **会**被** afterAdvance **合**并**覆**盖**回**旧** phase
    console.log(
      `%c [MissionSystem/onPeriodChange] ctx=(${newDay},${newPeriodIndex}) 调**用** advanceMissionPhaseOfChars`,
      'font-size:13px; background:lightgreen; color:green;',
    );
    let finalChars = advanceMissionPhaseOfChars([...this.prevChars], newDay, newPeriodIndex);
    const resultMissions: Mission[] = [];
    let justCompletedCount = 0;
    let failedCount = 0;
    const allEncounters: EncounterLog[] = [];

    for (const m of oldMissions) {
      logger.debug(
        `[MissionSystem/tick] 处理 mission id=${m.id.slice(0, 6)} status=${m.status} loc=${m.locationId} charId=${m.characterId?.slice(0, 6)} encCount=${m.encounters?.length ?? 0}`
      );
      if (m.status !== 'active') {
        resultMissions.push(m);
        continue;
      }

      // 取整个队伍（partyCharacterIds）
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

      // 1. 准备期判定（2026-06-21 改：用 char.missionPhase 而非 encounter 数量）
      //   之前：isPreparing = !hasAnyEncounter → 第一次 tick 之后永远是 false
      //   现在：char.missionPhase 才是真相（preparing / scavenging / null）
      //   注：advanceMissionPhaseOfChars 在本函数顶部已调用过，所以 finalChars 里的 phase 是最新的
      const phase: 'prep' | 'scavenge' = char.missionPhase === 'preparing' ? 'prep' : 'scavenge';
      logger.debug(
        `[MissionSystem/tick] mission id=${m.id.slice(0, 6)} charPhase=${char.missionPhase} → encounterCheck phase=${phase}`
      );

      let encounter: EncounterLog | null = null;
      let updatedParty = party;
      let missionOver = false;
      let mWithEncounters: Mission = m;

      if (phase === 'prep') {
        // 准备期：路上只遇游荡者（2026-06-21 改：真实遭遇，不是占位）
        const result = encounterCheck(m, party, loc, newDay, newPeriodIndex, 'prep');
        encounter = result.encounter;
        updatedParty = result.updatedParty;
        missionOver = result.missionOver;
        // 2026-06-21 改：所有拾荒获得的物品**全部**入 tempLoot，**不**直接进角色背包
        //   - 设计：玩家自主分配（任务完成后弹 modal 手动选）
        //   - 2026-06-21 加：**超重直接丢弃**（基于队伍总负重，详见 partyLoot.ts tryAddToTempLoot）
        let updatedTempLoot: InventoryItem[] = m.tempLoot ?? [];
        if (encounter.itemsGained && encounter.itemsGained.length > 0) {
          for (const item of encounter.itemsGained) {
            const result2 = tryAddToTempLoot(updatedParty, updatedTempLoot, item);
            updatedTempLoot = result2.updatedBackpack;
            if (result2.dropped.length > 0) {
              logger.info(
                `[派遣/丢弃] ${result2.dropped.map(i => i.itemId).join(', ')} 超重（队伍总负重不足），直接丢弃`,
              );
            }
          }
        }
        mWithEncounters = {
          ...m,
          encounters: [...(m.encounters ?? []), encounter],
          tempLoot: updatedTempLoot,
        };
        for (const upd of updatedParty) {
          finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
        }
      } else {
        // 拾荒期：完整流程（含 location_cleared 短路）
        const result = encounterCheck(m, party, loc, newDay, newPeriodIndex, 'scavenge');
        encounter = result.encounter;
        updatedParty = result.updatedParty;
        missionOver = result.missionOver;
        // 2026-06-21 改：所有物品入 tempLoot（不直接进角色背包）
        // 2026-06-21 加：超重直接丢弃
        let updatedTempLoot: InventoryItem[] = m.tempLoot ?? [];
        if (encounter.itemsGained && encounter.itemsGained.length > 0) {
          for (const item of encounter.itemsGained) {
            const result2 = tryAddToTempLoot(updatedParty, updatedTempLoot, item);
            updatedTempLoot = result2.updatedBackpack;
            if (result2.dropped.length > 0) {
              logger.info(
                `[派遣/丢弃] ${result2.dropped.map(i => i.itemId).join(', ')} 超重（队伍总负重不足），直接丢弃`,
              );
            }
          }
        }
        // 把 updatedParty 的所有队员写回 finalChars
        for (const upd of updatedParty) {
          finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
        }
        allEncounters.push(encounter);
        mWithEncounters = {
          ...m,
          encounters: [...m.encounters, encounter],
          tempLoot: updatedTempLoot,
        };
      }

      // 2. 判定是否到 returnTime
      const reached = isTimeReached(newDay, newPeriodIndex, m.returnDay, m.returnPeriodIndex);

      if (encounter && missionOver) {
        // 战斗败：标记 failed
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
            lostItems,
          },
          outcomeShown: false,
        };
        resultMissions.push(failed);
        if (failed.outcome) {
          const appliedParty = applyMissionOutcomeToParty(updatedParty, failed.outcome, encounter.partyHpDelta);
          for (const upd of appliedParty) {
            finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
          }
        }
        failedCount++;
        logger.info(
          `[派遣/失败] 队伍=${party.length}人 主队员=${char.name} 地点=${loc.name} 遭遇=${encounter.kind} ` +
          `敌人=${encounter.enemiesEncountered} HP变化=${encounter.hpDelta}`,
        );
      } else if (reached) {
        // 时间到：正常完成
        const completed = completeMission(mWithEncounters, updatedParty, loc);
        resultMissions.push(completed);
        if (completed.outcome) {
          const appliedParty = applyMissionOutcomeToParty(updatedParty, completed.outcome);
          for (const upd of appliedParty) {
            finalChars = finalChars.map(c => c.id === upd.id ? upd : c);
          }
        }
        justCompletedCount++;
        // 瓶盖掉落奖励
        if (completed.outcome && completed.outcome.itemsGained.length > 0) {
          const bottlecapReward = completed.outcome.itemsGained.reduce((sum, item) => {
            const hash = item.itemId.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
            return sum + (hash % 5) + 1; // 1-5
          }, 0);
          const currentBottlecaps = Number(stageStateManager.getCalculationStageState().GameVar['scavenge_bottlecaps'] ?? 0);
          stageStateManager.setStageVarAndCommit({
            key: 'scavenge_bottlecaps',
            value: String(currentBottlecaps + bottlecapReward),
          });
          completed.outcome.bottlecapsGained = bottlecapReward;
          logger.info(
            `[派遣/瓶盖] 角色=${char.name} 物品${completed.outcome.itemsGained.length}类 瓶盖+${bottlecapReward}`,
          );
        }
        const realEncounters = mWithEncounters.encounters.filter(e => e.kind !== 'no_encounter').length;
        logger.info(
          `[派遣/完成] 角色=${char.name} 地点=${loc.name} 物品=${completed.outcome?.itemsGained.length ?? 0}类 ` +
          `经验+${completed.outcome?.expGained ?? 0} 真实遭遇${realEncounters}次`,
        );
      } else {
        // 继续 active
        resultMissions.push(mWithEncounters);
        if (encounter && encounter.kind !== 'no_encounter') {
          logger.info(
            `[派遣/遭遇] ${encounter.kind} 角色=${char.name} 地点=${loc.name}  ` +
            (encounter.itemsGained ? `物品+${encounter.itemsGained.length}` : ''),
          );
        } else if (phase === 'prep') {
          // 2026-06-21 改：之前是 hasAnyEncounter（基于 m.encounters 数量），现在用 phase
          //   准备阶段每 period 都会跑一遍 encounterCheck，所以会一直打这条日志
          logger.info(
            `[派遣/路上] 角色=${char.name} 地点=${loc.name}（${encounter?.kind ?? 'no-encounter'}）`,
          );
        }
      }
    }

    // 存**储**结果，afterAdvance 钩**子**会**读**取
    this.lastResult = {
      newMissions: resultMissions,
      newChars: finalChars,
      justCompletedCount,
      failedCount,
      allEncounters,
    };

    logger.debug(
      `[MissionSystem/onPeriodChange] 处理完成: ${justCompletedCount} 完成, ${failedCount} 失败, ${allEncounters.length} 遭遇`
    );
  };

  /**
   * afterAdvance：写回 missions + 合并 characters
   *   - 2026-06-19 终版：MissionSystem 写回 missions，characters 与 CharacterSystem 合并
   *   - 合并策略：从 GameVar 读**取** CharacterSystem 写**回**的**结果**（含 applyPeriodEffects）
   *     **只**合**并** mission 改**变**的 HP + inventory，**不**覆**盖** hunger/thirst/sanity
   */
  private onAfterAdvance = (_ctx: TimeHookContext): void => {
    if (!this.lastResult) return;

    // 1. 写 missions
    writeMissions(this.lastResult.newMissions);

    // 2. 合并 characters：读**取** CharacterSystem 已**经**写**回**的**结果**（含 applyPeriodEffects）
    //    mission 改**变**的字段：HP + inventory + missionPhase + isExploring + returnDay
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof raw === 'string') {
      const currentChars: ScavengeCharacter[] = JSON.parse(raw);
      const mergedChars = currentChars.map(c => {
        const missionChar = this.lastResult!.newChars.find(mc => mc.id === c.id);
        if (!missionChar) return c;
        return {
          ...c,
          // mission **改**的字段
          hp: missionChar.hp,
          inventory: missionChar.inventory,
          // 2026-06-19 加：Plan 17 - 任务状态字段（mission 完成时清空 phase）
          missionPhase: missionChar.missionPhase,
          preparingEndDay: missionChar.preparingEndDay,
          preparingEndPeriodIndex: missionChar.preparingEndPeriodIndex,
          scavengingEndDay: missionChar.scavengingEndDay,
          scavengingEndPeriodIndex: missionChar.scavengingEndPeriodIndex,
          isExploring: missionChar.isExploring,
          exploringLocationId: missionChar.exploringLocationId,
          returnDay: missionChar.returnDay,
          returnPeriodIndex: missionChar.returnPeriodIndex,
        };
      });
      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(mergedChars),
      });
    }

    // 3. 清**空**结果
    this.lastResult = null;

    logger.debug(`[MissionSystem/afterAdvance] 已**写**回 missions + 合并 characters`);
  };
}
