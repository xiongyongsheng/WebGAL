/**
 * 拾荒系统 - 派遣完成 / 结算（2026-06-08 拆分自 missions.ts）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { gainExp } from '../ScavengeCharacter/characterExperience';
import { applyAutoTraits } from '../ScavengeCharacter/traits';
import { InventoryItem, addToInventory, removeFromInventory } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';
import {
  Mission,
  MissionOutcome,
  LostItem,
  MISSION_BASE_EXP,
  MISSION_EXP_PER_DANGER,
  // MISSION_HP_LOSS_PER_DANGER  // 2026-06-21 移除：取消战斗完成固定扣血
  isTimeReached,
} from './missions';

/** 战斗失败丢物品的触发概率（2026-06-09 加：Plan 2） */
const LOSE_ITEMS_PROBABILITY = 0.5;
/** 触发后，每个 inventory entry 50% 概率丢 */
const LOSE_EACH_ENTRY_PROBABILITY = 0.5;
/** 装备优先保留（不被丢） */
const PROTECT_EQUIPMENT = true;
/** 2026-06-09 加：提前返回奖励系数（Plan 4） */
const EARLY_RETURN_REWARD_RATE = 0.5;

// ============== 派遣完成 / 结算 ==============

/**
 * 派遣完成 / 结算（2026-06-08 拆分自 missions.ts）
 * 设计：
 * - 角色死亡（HP=0）→ 任务失败
 * - 物资 = 派遣期间 encounters 累计获取
 * - 经验 = BASE_EXP(50) + dangerLevel * 10（**全队平分**）
 * - HP 损失：dangerLevel * 2（2026-06-09 加：每个队员都扣）
 *
 * 2026-06-09 改：多角色队伍
 * - char 参数改名 party（1-3 人）
 * - 经验全队平分：splitExpAmongParty
 * - 物资入 party[0]（主队员）背包
 * - HP 损失应用到每个队员
 *
 * 2026-06-09 加：Plan 4 提前返回
 * - options.earlyReturn = true：玩家主动返回
 *   - 经验 × 0.5（奖励 50%）
 *   - 物资全部带回
 *   - reason: 'early_return'
 *   - 状态：'cancelled'（与"主动取消"区分）
 *
 * @param mission 派遣任务（status 必须是 'active'）
 * @param party 队伍（2026-06-09 改：1-3 人）
 * @param location 派遣地点
 * @param options 2026-06-09 加：{ earlyReturn?: boolean }
 * @returns 已填入 outcome 的 mission
 */
export const completeMission = (
  mission: Mission,
  party: ScavengeCharacter[],
  location: ScavengeLocationItem,
  options: { earlyReturn?: boolean } = {},
): Mission => {
  const primary = party[0];
  const earlyReturn = options.earlyReturn ?? false;
  // 2026-06-09 加：主队员死亡 → 任务失败（其他队员可能存活，但 mission 算失败）
  if (primary.hp <= 0) {
    // 2026-06-09 加：50% 概率丢失物品
    const lostItems = calculateLostItems(primary);
    const lostMessage = lostItems.length > 0
      ? `（丢失 ${lostItems.length} 类物品）`
      : '';
    return {
      ...mission,
      status: 'failed',
      outcome: {
        success: false,
        reason: 'character_dead',
        message: `任务失败，主队员在派遣途中倒下${lostMessage}`,
        itemsGained: [],
        expGained: 0,
        hpLost: 0,
        lostItems,
      },
      outcomeShown: false,
    };
  }

  // 物资 = 派遣期间 encounters 累计获取（资源点 / 战斗胜）
  const itemsGained: InventoryItem[] = (mission.encounters ?? [])
    .flatMap((e) => e.itemsGained ?? []);

  // 经验（2026-06-09 改：全队平分 + 提前返回 50% 系数）
  const totalExp = MISSION_BASE_EXP + location.dangerLevel * MISSION_EXP_PER_DANGER;
  const expGained = Math.floor(
    (totalExp * (earlyReturn ? EARLY_RETURN_REWARD_RATE : 1)) / Math.max(1, party.length),
  );

  // HP 损失（2026-06-21 改：取消战斗完成固定扣血）
  //   - 之前：dangerLevel * MISSION_HP_LOSS_PER_DANGER * （提前返回 0.5）
  //     → 危险 2 星固定扣 4 HP，危险 5 星固定扣 10 HP
  //   - 现在：固定 0
  //     → 战斗中的扣血已在 encounterCheck / runCombat 里通过 encounter.hpDelta / partyHpDelta 算过
  //     → 任务完成时不再额外扣全队血
  //   - MISSION_HP_LOSS_PER_DANGER 常量保留在 missions.ts（万一以后要加回来）
  const hpLost = 0;

  // 2026-06-09 改：提前返回 → status='cancelled', reason='early_return'
  return {
    ...mission,
    status: earlyReturn ? 'cancelled' : 'completed',
    outcome: {
      success: !earlyReturn,  // 提前返回不算"成功完成"（避免 UI 误显示"任务成功"）
      reason: earlyReturn ? 'early_return' : 'completed',
      message: earlyReturn
        ? itemsGained.length > 0
          ? `提前返回（${location.name}）。带回 ${itemsGained.length} 类物资，经验 ×50%。`
          : `提前返回（${location.name}）。经验 ×50%（未获取物资）。`
        : itemsGained.length > 0
          ? `任务完成！从【${location.name}】带回 ${itemsGained.length} 类物资，获得 ${expGained} 经验。`
          : `任务完成。获得 ${expGained} 经验（未获取物资）。`,
      itemsGained,
      expGained,
      hpLost,
    },
    outcomeShown: false,
  };
};

/**
 * 战斗失败时计算丢失物品（2026-06-09 加：Plan 2）
 *
 * 规则：
 * - 50% 概率触发（LOSE_ITEMS_PROBABILITY）
 * - 触发时：从主队员（party[0]）背包随机抽 50% 的 entry
 *   - 每个 entry 50% 概率丢（LOSE_EACH_ENTRY_PROBABILITY）
 *   - 丢这个 entry 一半数量（Math.ceil）
 * - 装备优先保留（PROTECT_EQUIPMENT = true）
 * - 任务物品（isQuestItem）保留
 *
 * @param primary 主队员（party[0]）
 * @returns 丢失的物品列表（可能为空）
 */
export const calculateLostItems = (primary: ScavengeCharacter): LostItem[] => {
  if (Math.random() >= LOSE_ITEMS_PROBABILITY) return [];
  const inv = (primary.inventory ?? []).filter((s): s is InventoryItem => s !== null);
  if (inv.length === 0) return [];
  const lost: LostItem[] = [];
  for (const slot of inv) {
    // 装备优先保留
    if (PROTECT_EQUIPMENT && (slot.itemId.startsWith('weapon_') || slot.itemId.startsWith('armor_') || slot.itemId.startsWith('tool_'))) {
      continue;
    }
    // 任务物品保留
    if (slot.itemId.startsWith('quest_')) {
      continue;
    }
    // 每个 entry 50% 概率丢
    if (Math.random() < LOSE_EACH_ENTRY_PROBABILITY) {
      const lostCount = Math.max(1, Math.ceil(slot.quantity / 2));
      lost.push({ item: slot, lostCount });
    }
  }
  return lost;
};

/**
 * 构建提前返回的 mission（2026-06-09 加：Plan 4）
 *
 * 玩家在派遣中点"提前返回"按钮：
 * 1. 调 completeMission with earlyReturn=true（奖励 50%）
 * 2. UI 拿到这个 mission，**自己** applyMissionOutcomeToParty + writeMissions
 *
 * 为什么不把整个流程封装成一个函数？
 * - 避免循环依赖（missionComplete 已 import missions.ts）
 * - UI 层要刷新 characters 列表（setStageVarAndCommit）
 * - 让 UI 显式看到每一步（可调试）
 *
 * @param mission 当前 active mission
 * @param party 队伍
 * @param location 地点
 * @returns 已填入 outcome 的 mission（status='cancelled', reason='early_return'）
 */
export const buildEarlyReturnMission = (
  mission: Mission,
  party: ScavengeCharacter[],
  location: ScavengeLocationItem,
): Mission => {
  return completeMission(mission, party, location, { earlyReturn: true });
};

// ============== 派遣检查（时间推进钩子用） ==============

export interface MissionCheckResult {
  active: Mission[];        // 仍在进行中的
  justCompleted: Mission[]; // 刚刚到时间的（已填入 outcome）
}

/**
 * 检查所有 missions 状态：
 * - active 且时间到 → 调 completeMission 填入 outcome（status 保持 'active' 由调用方改为 'completed'）
 * - active 但时间未到 → 保留
 * - 非 active → 保留
 */
export const checkMissionsProgress = (
  missions: Mission[],
  characters: ScavengeCharacter[],
  locations: ScavengeLocationItem[],
  currentDay: number,
  currentPeriodIndex: number,
): MissionCheckResult => {
  const active: Mission[] = [];
  const justCompleted: Mission[] = [];

  for (const m of missions) {
    if (m.status !== 'active') {
      continue;
    }
    if (!isTimeReached(currentDay, currentPeriodIndex, m.returnDay, m.returnPeriodIndex)) {
      active.push(m);
      continue;
    }
    // 时间到，结算
    // 2026-06-09 改：取整个队伍（partyCharacterIds 优先，回退 characterId）
    const partyIds = m.partyCharacterIds && m.partyCharacterIds.length > 0
      ? m.partyCharacterIds
      : [m.characterId];
    const party = partyIds
      .map(id => characters.find(c => c.id === id))
      .filter((c): c is ScavengeCharacter => Boolean(c));
    const char = party[0];  // 兼容旧逻辑
    const loc = locations.find(l => l.id === m.locationId);
    if (!char || !loc) {
      active.push({
        ...m,
        status: 'cancelled',
        outcome: {
          success: false,
          reason: 'cancelled',
          message: '数据异常，派遣被取消',
          itemsGained: [],
          expGained: 0,
          hpLost: 0,
        },
        outcomeShown: false,
      });
      continue;
    }
    const completed = completeMission(m, party, loc);
    justCompleted.push(completed);
  }

  return { active, justCompleted };
};

// ============== 应用结算到角色 ==============

/**
 * 把 mission outcome 应用到角色：
 * - 物品：加到背包
 * - 经验：gainExp
 * - HP：扣 hpLost
 * - 状态：isExploring = false, exploringLocationId = undefined
 *         returnDay = undefined, returnPeriodIndex = undefined
 *
 * 2026-06-09 改：支持多角色队伍
 * - 物品入主队员（party[0]）背包
 * - 经验每个队员都加（平分后）
 * - HP 每个队员都扣
 * - 状态字段每个队员都清
 * - applyAutoTraits 每个队员都跑
 */
export const applyMissionOutcomeToParty = (
  party: ScavengeCharacter[],
  outcome: MissionOutcome,
  /** 2026-06-09 加：组队战斗 — 每个队员的 HP delta
   *  2026-06-09 改：用 partyHpDelta 替代 outcome.hpLost（每个队员不同） */
  partyHpDelta?: Record<string, number>,
): ScavengeCharacter[] => {
  return party.map((char, idx) => {
    let updated: ScavengeCharacter = { ...char };

    // 状态字段清空（每个队员都清）
    updated = {
      ...updated,
      isExploring: false,
      exploringLocationId: undefined,
      returnDay: undefined,
      returnPeriodIndex: undefined,
      // 2026-06-19 加：Plan 17 - mission 完成 → 清空 phase
      missionPhase: null,
      preparingEndDay: undefined,
      preparingEndPeriodIndex: undefined,
      scavengingEndDay: undefined,
      scavengingEndPeriodIndex: undefined,
    };

    // 2026-06-09 改：HP 损耗
    // 优先用 partyHpDelta（组队战斗，每个队员不同）
    // 兼容：单独 outcome.hpLost（所有队员统一扣）
    if (partyHpDelta && partyHpDelta[char.id] !== undefined) {
      updated.hp = Math.max(0, char.hp + partyHpDelta[char.id]);
    } else if (outcome.hpLost > 0) {
      updated.hp = Math.max(0, updated.hp - outcome.hpLost);
    }

    // 2026-06-21 改：**不**再把 outcome.itemsGained addToInventory 到主队员背包
    //   - 物品已在 encounterCheck → MissionSystem 入 mission.tempLoot
    //   - 任务完成时弹 ScavengeLootDistributionModal 让玩家**手动**分配
    //   - 之前这里双重入库（一份入角色背包 + 一份留在 tempLoot）→ 现在移除
    // 注：outcome.itemsGained 字段保留（UI 任务完成消息"带回 N 类物资"还要用）

    // 2026-06-09 加：应用丢失物品（**只主队员** party[0] 减背包）
    if (idx === 0 && outcome.lostItems && outcome.lostItems.length > 0) {
      for (const lost of outcome.lostItems) {
        updated.inventory = removeFromInventory(
          updated.inventory ?? [],
          lost.item.instanceId,
          lost.lostCount,
        );
      }
    }

    // 经验（每个队员都加，按平分后的数量）
    if (outcome.expGained > 0) {
      updated = gainExp(updated, outcome.expGained);
    }

    // 自动特性更新（每个队员都跑，独立 HP/特性）
    updated = applyAutoTraits(updated, 0);

    return updated;
  });
};

/**
 * @deprecated 2026-06-09 改：单角色版本保留兼容，但推荐用 applyMissionOutcomeToParty
 */
export const applyMissionOutcomeToCharacter = (
  char: ScavengeCharacter,
  outcome: MissionOutcome,
): ScavengeCharacter => {
  return applyMissionOutcomeToParty([char], outcome)[0] ?? char;
};
