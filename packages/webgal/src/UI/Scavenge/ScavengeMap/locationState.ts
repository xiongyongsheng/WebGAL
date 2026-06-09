/**
 * 拾荒系统 - 地点运行时状态（2026-06-08 加）
 *
 * 设计目标：
 * - 每个地点的"剩余敌人 / 剩余物资"持久化（不每帧重算）
 * - 刷新机制：时间（N 天没人拾荒）+ 事件（外部 mark dirty）
 * - 自定义敌人 / 物资 类型留接口（types 是 string，不限制 EnemyType）
 */

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

/** GameVar key（约定放 GameVar 而不是 character 字段，方便全局查看） */
export const LOCATION_STATES_GAMEVAR_KEY = 'scavenge_location_states';

/**
 * 单个地点的运行时状态
 *
 * - enemyCount：每种敌人类型剩余数量（用 string key 方便自定义类型）
 * - lootCount：每种物资类型剩余数量
 * - lastRefreshedDay：上次刷新是第几天（用于时间触发）
 * - dirty：true 表示"立即刷新"（事件驱动）
 * - lastInteractedDay：上次派遣是第几天（用于显示"几天没人来"）
 */
export interface LocationState {
  /** 上次刷新是第几天（用作时间比较） */
  lastRefreshedDay: number;
  /** 上次派遣是第几天（用于"X 天没人来"显示） */
  lastInteractedDay?: number;
  /** 剩余敌人：{ [type: string]: count } */
  enemyCount: Record<string, number>;
  /** 剩余物资：{ [type: string]: count } */
  lootCount: Record<string, number>;
  /** 事件驱动刷新标记（外部可设置 true 强制下次 encounterCheck 刷新） */
  dirty: boolean;
}

/** 全局状态：{ [locationId: string]: LocationState } */
export type AllLocationStates = Record<string, LocationState>;

/** 读全部 location 状态（自动 JSON.parse + 防御性） */
export const loadAllLocationStates = (): AllLocationStates => {
  const raw = stageStateManager.getCalculationStageState().GameVar[LOCATION_STATES_GAMEVAR_KEY];
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as AllLocationStates;
    }
    return {};
  } catch {
    return {};
  }
};

/** 写全部 location 状态 */
export const saveAllLocationStates = (states: AllLocationStates): void => {
  stageStateManager.setStageVarAndCommit({
    key: LOCATION_STATES_GAMEVAR_KEY,
    value: JSON.stringify(states),
  });
};

/** 读单个 location 状态（不存在则返回 undefined） */
export const getLocationState = (locationId: string): LocationState | undefined => {
  return loadAllLocationStates()[locationId];
};

/** 写单个 location 状态 */
export const setLocationState = (locationId: string, state: LocationState): void => {
  const all = loadAllLocationStates();
  all[locationId] = state;
  saveAllLocationStates(all);
};

/** 标记某个 location 需要立即刷新（事件驱动入口，2026-06-08 加） */
export const markLocationNeedsRefresh = (locationId: string): void => {
  const all = loadAllLocationStates();
  const cur = all[locationId];
  if (cur) {
    cur.dirty = true;
  } else {
    // 没状态也建一个占位，标 dirty
    all[locationId] = {
      lastRefreshedDay: -1,
      enemyCount: {},
      lootCount: {},
      dirty: true,
    };
  }
  saveAllLocationStates(all);
};

/** 记录某地点被派遣过（更新 lastInteractedDay） */
export const touchLocationInteracted = (locationId: string, currentDay: number): void => {
  const all = loadAllLocationStates();
  const cur = all[locationId];
  if (cur) {
    cur.lastInteractedDay = currentDay;
    saveAllLocationStates(all);
  }
};
