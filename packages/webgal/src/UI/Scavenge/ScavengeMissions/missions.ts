/**
 * 拾荒系统 - 派遣（Missions）
 *
 * 挂机派遣模式：选地点 + 选角色 → 角色锁住 N 个 period → 时间推进到点自动结算。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 单人派遣（先实现，**接口预留** 多人 partyMemberIds）
 * - 复用 isExploring + exploringLocationId，加 returnDay/returnPeriodIndex
 * - 随机事件先不做（**接口预留** MissionEvent[]）
 *
 * 存储：GameVar `scavenge_missions` 存 JSON 字符串数组。
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { gainExp } from '../ScavengeCharacter/characterExperience';
import { InventoryItem, addToInventory, generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';

export const MISSIONS_GAMEVAR_KEY = 'scavenge_missions';

// ============== 数据模型 ==============

export type MissionStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export type MissionOutcomeReason = 'completed' | 'cancelled' | 'character_dead';

/** 派遣结算结果 */
export interface MissionOutcome {
  success: boolean;
  reason: MissionOutcomeReason;
  message: string;
  /** 获得的物品（包含 instanceId，可直接 addToInventory） */
  itemsGained: InventoryItem[];
  /** 经验获得 */
  expGained: number;
  /** 派遣期间损失（已包含 period 推进的消耗） */
  hpLost: number;
}

/** 派遣任务 */
export interface Mission {
  /** 唯一 ID */
  id: string;
  /** 派遣角色（单人；预留 partyMemberIds: string[]） */
  characterId: string;
  /** 派遣地点 */
  locationId: string;
  /** 开始：第几天 */
  startDay: number;
  /** 开始：哪个 period（0=清晨, 1=上午, ...） */
  startPeriodIndex: number;
  /** 持续多少个 period（>= 1） */
  durationPeriods: number;
  /** 结束：第几天 */
  returnDay: number;
  /** 结束：哪个 period */
  returnPeriodIndex: number;
  status: MissionStatus;
  outcome?: MissionOutcome;
  /** 结算结果是否已展示过（弹窗点过"确定"后置 true，避免刷新页面再弹） */
  outcomeShown?: boolean;
  /** ISO 时间戳 */
  createdAt: string;
  /** 随机事件占位（暂未启用，**接口预留**） */
  events?: MissionEvent[];
}

/** 派遣事件（**接口预留**，暂不实现） */
export interface MissionEvent {
  id: string;
  triggerDay: number;
  triggerPeriodIndex: number;
  // 未来加：text / options / effects
}

// ============== 调参常量 ==============

/** 基础经验：每个地点难度 0 → 50 exp，每升 1 难度 +10 exp */
export const MISSION_BASE_EXP = 50;
export const MISSION_EXP_PER_DANGER = 10;

/** 派遣期间 HP 损失（按危险等级） */
export const MISSION_HP_LOSS_PER_DANGER = 2;

/** lootType → itemId 映射（locations.ts 里的 lootTypes 字段） */
const LOOT_TYPE_TO_ITEM: Record<string, string> = {
  food: 'food_apple',
  drink: 'drink_water',
  beverage: 'drink_water',
  medicine: 'medicine_bandage',
  bandage: 'medicine_bandage',
  parts: 'material_parts',
  tools: 'material_tools',
  cloth: 'material_cloth',
  metal: 'material_metal',
  daily: 'material_parts',
  weapon: 'weapon_knife',
  armor: 'armor_vest',
};

// ============== 时间计算 ==============

/**
 * 计算派遣的"结束时间"：startDay/startPeriod + durationPeriods → returnDay/returnPeriod
 * 一天 5 个 period：0=清晨, 1=上午, 2=下午, 3=半晚, 4=黑夜
 */
export const calcReturnTime = (
  startDay: number,
  startPeriodIndex: number,
  durationPeriods: number,
): { day: number; periodIndex: number } => {
  let day = startDay;
  let period = startPeriodIndex + durationPeriods;
  while (period >= 5) {
    day += 1;
    period -= 5;
  }
  return { day, periodIndex: period };
};

/** 当前时间是否已到结束时间（>=） */
export const isTimeReached = (
  currentDay: number,
  currentPeriodIndex: number,
  targetDay: number,
  targetPeriodIndex: number,
): boolean => {
  if (currentDay > targetDay) return true;
  if (currentDay === targetDay && currentPeriodIndex >= targetPeriodIndex) return true;
  return false;
};

// ============== 派遣创建 / 取消 ==============

/**
 * 创建派遣任务。
 *
 * @param characterId 派遣角色 ID
 * @param location 派遣地点
 * @param currentDay 当前第几天
 * @param currentPeriodIndex 当前 period
 * @returns 新 Mission
 */
export const startMission = (
  characterId: string,
  location: ScavengeLocationItem,
  currentDay: number,
  currentPeriodIndex: number,
): Mission => {
  const duration = Math.max(1, location.explorationTime);
  const { day, periodIndex } = calcReturnTime(currentDay, currentPeriodIndex, duration);
  return {
    id: generateInstanceId(),
    characterId,
    locationId: location.id,
    startDay: currentDay,
    startPeriodIndex: currentPeriodIndex,
    durationPeriods: duration,
    returnDay: day,
    returnPeriodIndex: periodIndex,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
};

/**
 * 取消派遣（玩家主动撤回归还）。
 * 返回更新后的 mission；如果没找到返回 null。
 */
export const cancelMissionInList = (
  missions: Mission[],
  missionId: string,
): { missions: Mission[]; cancelled: Mission | null } => {
  let cancelled: Mission | null = null;
  const updated = missions.map(m => {
    if (m.id === missionId && m.status === 'active') {
      cancelled = {
        ...m,
        status: 'cancelled',
        outcome: {
          success: false,
          reason: 'cancelled',
          message: '派遣被取消',
          itemsGained: [],
          expGained: 0,
          hpLost: 0,
        },
        outcomeShown: false,
      };
      return cancelled;
    }
    return m;
  });
  return { missions: updated, cancelled };
};

// ============== 派遣完成 / 结算 ==============

/** 难度 0/1 → 1 个物品；2/3 → 2 个；4/5 → 3 个 */
const lootCountForDanger = (dangerLevel: number): number => {
  if (dangerLevel <= 1) return 1;
  if (dangerLevel <= 3) return 2;
  return 3;
};

/** 随机 1~max（不均，含两端） */
const randInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * 派遣完成 → 结算
 *
 * MVP 规则（**先不做随机事件**）：
 * - 总是 success（除非角色 HP=0 → reason='character_dead'）
 * - 物品：从 location.lootTypes 随机选 N 个（N 随危险等级）+ 随机 quantity
 * - 经验：50 + dangerLevel * 10
 * - HP 损失：dangerLevel * 2
 *
 * @param mission 派遣任务（status 必须是 'active'）
 * @param char 派遣角色
 * @param location 派遣地点
 * @returns 已填入 outcome 的 mission
 */
export const completeMission = (
  mission: Mission,
  char: ScavengeCharacter,
  location: ScavengeLocationItem,
): Mission => {
  // 角色死亡（HP=0）：失败
  if (char.hp <= 0) {
    return {
      ...mission,
      status: 'failed',
      outcome: {
        success: false,
        reason: 'character_dead',
        message: '任务失败，角色在派遣途中倒下',
        itemsGained: [],
        expGained: 0,
        hpLost: 0,
      },
      outcomeShown: false,
    };
  }

  // 随机选 N 个 lootType
  const lootCount = lootCountForDanger(location.dangerLevel);
  const available = location.lootTypes ?? [];
  const chosen: string[] = [];
  if (available.length > 0) {
    const pool = [...available];
    while (chosen.length < lootCount && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool[idx]);
      pool.splice(idx, 1);
    }
  }

  // 映射到 itemId + 随机数量
  const itemsGained: InventoryItem[] = chosen
    .map((lootType) => LOOT_TYPE_TO_ITEM[lootType])
    .filter((itemId): itemId is string => Boolean(itemId))
    .map((itemId) => ({
      instanceId: generateInstanceId(),
      itemId,
      quantity: randInt(1, 3),
    }));

  // 经验
  const expGained = MISSION_BASE_EXP + location.dangerLevel * MISSION_EXP_PER_DANGER;

  // HP 损失
  const hpLost = location.dangerLevel * MISSION_HP_LOSS_PER_DANGER;

  return {
    ...mission,
    status: 'completed',
    outcome: {
      success: true,
      reason: 'completed',
      message: `任务完成！从【${location.name}】带回 ${itemsGained.length} 类物资，获得 ${expGained} 经验。`,
      itemsGained,
      expGained,
      hpLost,
    },
    outcomeShown: false,
  };
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
      // 已经结算过的，保留
      continue;
    }
    if (!isTimeReached(currentDay, currentPeriodIndex, m.returnDay, m.returnPeriodIndex)) {
      active.push(m);
      continue;
    }
    // 时间到，结算
    const char = characters.find(c => c.id === m.characterId);
    const loc = locations.find(l => l.id === m.locationId);
    if (!char || !loc) {
      // 数据异常，标记为 cancelled
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
    const completed = completeMission(m, char, loc);
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
 */
export const applyMissionOutcomeToCharacter = (
  char: ScavengeCharacter,
  outcome: MissionOutcome,
): ScavengeCharacter => {
  let updated: ScavengeCharacter = { ...char };

  // 状态字段清空
  updated = {
    ...updated,
    isExploring: false,
    exploringLocationId: undefined,
    returnDay: undefined,
    returnPeriodIndex: undefined,
  };

  // HP
  if (outcome.hpLost > 0) {
    updated.hp = Math.max(0, updated.hp - outcome.hpLost);
  }

  // 物品进背包
  if (outcome.itemsGained.length > 0) {
    let inv = [...(updated.inventory ?? [])];
    for (const item of outcome.itemsGained) {
      inv = addToInventory(inv, item);
    }
    updated.inventory = inv;
  }

  // 经验（可能连升）
  if (outcome.expGained > 0) {
    updated = gainExp(updated, outcome.expGained);
  }

  return updated;
};

// ============== GameVar 读写 ==============

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

/** 读 missions（GameVar JSON 字符串 → Mission[]，缺 outcomeShown 时补 false） */
export const readMissions = (): Mission[] => {
  const raw = stageStateManager.getCalculationStageState().GameVar[MISSIONS_GAMEVAR_KEY];
  const migrate = (arr: unknown[]): Mission[] => {
    return arr
      .filter((m): m is Mission => m !== null && typeof m === 'object' && 'id' in m)
      .map(m => ({
        ...(m as Mission),
        outcomeShown: (m as Mission).outcomeShown ?? false,
      }));
  };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return migrate(parsed);
    } catch { /* ignore */ }
  }
  if (Array.isArray(raw)) {
    return migrate(raw as unknown[]);
  }
  return [];
};

/** 写 missions */
export const writeMissions = (missions: Mission[]): void => {
  stageStateManager.setStageVarAndCommit({
    key: MISSIONS_GAMEVAR_KEY,
    value: JSON.stringify(missions),
  });
};

/** 标记某个 mission 的 outcome 已展示（避免刷新重弹） */
export const markMissionOutcomeShown = (missionId: string): void => {
  const missions = readMissions();
  const updated = missions.map(m =>
    m.id === missionId ? { ...m, outcomeShown: true } : m,
  );
  writeMissions(updated);
};
