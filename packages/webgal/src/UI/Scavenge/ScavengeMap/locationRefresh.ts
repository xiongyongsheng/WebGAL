/**
 * 拾荒系统 - 地点刷新逻辑（2026-06-08 加）
 *
 * 核心设计：
 * - 每个 location 走"权重 + 浮动"系统（详见 locations.ts LocationEnemyWeight / LocationLootWeight）
 * - 触发条件：
 *   1. 时间触发：N 天没人拾荒（location.enemyConfig.refreshDays / lootConfig.refreshDays）
 *   2. 事件触发：locationState.dirty === true（外部 markLocationNeedsRefresh）
 *   3. 首次访问：状态不存在 → 立即刷新
 *
 * 持久化：
 * - LocationState 存 GameVar `scavenge_location_states`（locationState.ts）
 * - 写完后 missions.ts 读取 state 决定遭遇内容
 */

import {
  ScavengeLocationItem,
  LocationEnemyConfig,
  LocationLootConfig,
  LocationEnemyWeight,
  LocationLootWeight,
} from './locations';
import { LocationState, setLocationState, getLocationState, touchLocationInteracted } from './locationState';
import { ENEMY_TEMPLATES, EnemyType, EnemyInstance } from '../ScavengeEnemies/enemies';
import { InventoryItem, generateInstanceId } from '../ScavengeItems/inventory';
import { logger } from '@/Core/util/logger';

/**
 * 资源点类型 → itemId 映射（2026-06-08 移到本文件，避免 locationRefresh ↔ missions 循环依赖）
 * missions.ts 重新 export 保持向后兼容
 */
export const RESOURCE_TYPE_TO_ITEM: Record<string, string> = {
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

// ============== 工具：权重选 ==============

/** 给定 weights 数组，按 weight 随机选一个 index（2026-06-08 加） */
const pickByWeightIndex = <T extends { weight: number }>(items: T[]): number => {
  if (items.length === 0) return -1;
  const total = items.reduce((s, x) => s + Math.max(0, x.weight), 0);
  if (total <= 0) return Math.floor(Math.random() * items.length);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, items[i].weight);
    if (r <= 0) return i;
  }
  return items.length - 1;
};

/**
 * 给定一批带 jitter 的类型条目，生成"按 weight 分配 count 个"的桶
 * - 每个条目 weight 在本次调用中先 ±jitter 浮动（确定性快照）
 * - 然后按浮动后的 weight 分配 count 个
 *
 * 例：types=[wanderer w=30 j=5, chaser w=50 j=5, rioter w=20 j=3], count=10
 *  → 每次调用结果不同（jitter 让比例微动）
 *
 * 2026-06-08 加
 */
const distributeByWeight = <T extends { weight: number; jitter: number }>(
  types: T[],
  count: number,
): T[] => {
  if (types.length === 0 || count <= 0) return [];
  // 1. 浮动权重（一次性快照）
  const jittered = types.map((t) => ({
    type: t,
    weight: Math.max(0, t.weight + (Math.random() * 2 - 1) * t.jitter),
  }));
  // 2. 按 weight 分配 count 次
  const result: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = pickByWeightIndex(jittered);
    if (idx >= 0) result.push(types[idx]);
  }
  return result;
};

// ============== 敌人 / 物资 生成 ==============

/** 按 enemyConfig 刷新出敌人实例数组（2026-06-08 加） */
const spawnEnemiesFromConfig = (config: LocationEnemyConfig): EnemyInstance[] => {
  if (config.types.length === 0) return [];
  // 1. 选总数量（countRange 内）
  const [min, max] = config.countRange;
  const total = min + Math.floor(Math.random() * (max - min + 1));
  // 2. 按权重分配到具体类型
  const chosen = distributeByWeight(config.types, total);
  // 3. 生成实例
  return chosen.map((entry) => {
    const tpl = ENEMY_TEMPLATES[entry.type as EnemyType];
    return {
      instanceId: generateInstanceId(),  // 2026-06-09 修：补 instanceId
      type: tpl.type,
      name: tpl.name,
      maxHp: tpl.hp,
      currentHp: tpl.hp,
      attackDamage: tpl.attackDamage,
      attackSpeed: tpl.attackSpeed,
      armor: tpl.armor,
      accuracy: tpl.accuracy,
      evasion: tpl.evasion,
      critRate: tpl.critRate,
      critMultiplier: tpl.critMultiplier,
      detection: tpl.detection,
      startAtb: 0,
    };
  });
};

/** 把敌人实例数组压成 { [type: string]: count }（存到 LocationState） */
const enemiesToCount = (enemies: EnemyInstance[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of enemies) {
    out[e.type] = (out[e.type] ?? 0) + 1;
  }
  return out;
};

/** 把 { [type]: count } 还原成敌人实例数组（用于 encounterCheck 现场 spawn） */
export const countToEnemies = (counts: Record<string, number>): EnemyInstance[] => {
  const out: EnemyInstance[] = [];
  for (const [type, cnt] of Object.entries(counts)) {
    const tpl = ENEMY_TEMPLATES[type as EnemyType];
    if (!tpl || cnt <= 0) continue;
    for (let i = 0; i < cnt; i++) {
      out.push({
        instanceId: generateInstanceId(),  // 2026-06-09 修：补 instanceId
        type: tpl.type,
        maxHp: tpl.hp,
        currentHp: tpl.hp,
        attackDamage: tpl.attackDamage,
        attackSpeed: tpl.attackSpeed,
        armor: tpl.armor,
        accuracy: tpl.accuracy,
        evasion: tpl.evasion,
        critRate: tpl.critRate,
        critMultiplier: tpl.critMultiplier,
        detection: tpl.detection,
        startAtb: 0,
      });
    }
  }
  return out;
};

/** 按 lootConfig 刷新出物资物品数组（2026-06-08 加） */
const spawnLootFromConfig = (config: LocationLootConfig): InventoryItem[] => {
  if (config.types.length === 0) return [];
  const [min, max] = config.countRange;
  const total = min + Math.floor(Math.random() * (max - min + 1));
  const chosen = distributeByWeight(config.types, total);
  return chosen
    .map((entry): InventoryItem | null => {
      const itemId = RESOURCE_TYPE_TO_ITEM[entry.type];
      if (!itemId) return null;
      return {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,  // 每个"点"代表 1 个物品（不再 quantity 浮动）
      };
    })
    .filter((x): x is InventoryItem => x !== null);
};

/** 把物品数组压成 { [type]: count }（其中 type 来自 itemId 的 metadata） */
const lootToCount = (items: InventoryItem[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) {
    out[item.itemId] = (out[item.itemId] ?? 0) + 1;
  }
  return out;
};

/** 把 { [itemId]: count } 还原成物品数组（每次 1 个实例） */
export const countToLoot = (counts: Record<string, number>): InventoryItem[] => {
  const out: InventoryItem[] = [];
  for (const [itemId, cnt] of Object.entries(counts)) {
    for (let i = 0; i < cnt; i++) {
      out.push({
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,
      });
    }
  }
  return out;
};

// ============== 刷新决策 ==============

/**
 * 判断 location 是否需要刷新（2026-06-08 加，2026-06-09 改）
 *
 * 触发条件（任一为 true 即返回 true）：
 * 1. 状态不存在（首次访问）→ 立即刷新
 * 2. dirty === true（事件驱动）
 * 3. 时间过期：`currentDay - lastInteractedDay >= max(enemyConfig.refreshDays, lootConfig.refreshDays)`
 *    - 以 `lastInteractedDay` 为基准（**N 天没人拾荒就刷新**，匹配原始需求）
 *    - fallback 到 `lastRefreshedDay`（首次派遣前）
 *    - 敌人/物资**同步刷新**（取两者 refreshDays 中较大）→ 状态一致
 */
export const shouldRefreshLocation = (
  location: ScavengeLocationItem,
  currentDay: number,
): boolean => {
  const cur = getLocationState(location.id);
  if (!cur) return true;
  if (cur.dirty) return true;
  // 2026-06-09 加：玩家已清空所有敌人 + 物资 → 保持空状态，不刷新
  // 否则会有 bug：杀光 location 后第二天又刷新出新敌人，违背用户预期
  // 想要重新刷新 → 外部调 markLocationNeedsRefresh() 显式触发
  const isCleared =
    Object.values(cur.enemyCount).every(n => n <= 0) &&
    Object.values(cur.lootCount).every(n => n <= 0);
  if (isCleared) return false;
  // 同步刷新：取敌人 / 物资 refreshDays 中较大的（状态一致）
  const refreshDays = Math.max(
    location.enemyConfig?.refreshDays ?? 0,
    location.lootConfig?.refreshDays ?? 0,
  );
  if (refreshDays === 0) return false;  // 没配置就不刷
  // 时间基准：用 lastInteractedDay（"N 天没人拾荒"），fallback 到 lastRefreshedDay
  const referenceDay = cur.lastInteractedDay ?? cur.lastRefreshedDay;
  const elapsed = currentDay - referenceDay;
  if (elapsed >= refreshDays) return true;
  return false;
};

/**
 * 刷新 location 状态（2026-06-08 加）
 *
 * 流程：
 * 1. 按 enemyConfig 重新生成敌人实例 → 压成 count
 * 2. 按 lootConfig 重新生成物品 → 压成 count
 * 3. 写回 GameVar
 */
export const refreshLocationState = (
  location: ScavengeLocationItem,
  currentDay: number,
): LocationState => {
  const enemies = location.enemyConfig
    ? spawnEnemiesFromConfig(location.enemyConfig)
    : [];
  const loot = location.lootConfig
    ? spawnLootFromConfig(location.lootConfig)
    : [];
  const newState: LocationState = {
    lastRefreshedDay: currentDay,
    lastInteractedDay: getLocationState(location.id)?.lastInteractedDay,
    enemyCount: enemiesToCount(enemies),
    lootCount: lootToCount(loot),
    dirty: false,
  };
  setLocationState(location.id, newState);
  logger.debug(
    `[Scavenge] 地点 ${location.name} 刷新：${Object.entries(newState.enemyCount).map(([t, c]) => `${t}×${c}`).join(',')} | ` +
    `物资 ${Object.entries(newState.lootCount).map(([t, c]) => `${t}×${c}`).join(',')}`,
  );
  return newState;
};

/**
 * 取或刷新：返回当前 location 状态（如果需要刷新则先刷新再返回）
 *
 * 2026-06-08 加，外部调这个就行
 */
export const getOrRefreshLocationState = (
  location: ScavengeLocationItem,
  currentDay: number,
): LocationState => {
  if (shouldRefreshLocation(location, currentDay)) {
    return refreshLocationState(location, currentDay);
  }
  return getLocationState(location.id)!;
};

// ============== 状态变更（deduct / take）==============

/** 战斗后减少敌人（按类型扣数） */
export const deductEnemiesByType = (
  locationId: string,
  defeatedCounts: Record<string, number>,
): void => {
  const cur = getLocationState(locationId);
  if (!cur) return;
  for (const [type, n] of Object.entries(defeatedCounts)) {
    cur.enemyCount[type] = Math.max(0, (cur.enemyCount[type] ?? 0) - n);
  }
  setLocationState(locationId, cur);
};

/** 玩家拿走物资后减少 */
export const takeLootByItemId = (
  locationId: string,
  takenItemIds: string[],
): void => {
  const cur = getLocationState(locationId);
  if (!cur) return;
  for (const id of takenItemIds) {
    cur.lootCount[id] = Math.max(0, (cur.lootCount[id] ?? 0) - 1);
  }
  setLocationState(locationId, cur);
};

// ============== UI 辅助 ==============

/** 算"距离下次刷新的天数"（0 = 今天刷新 / 已过期） */
export const getDaysUntilRefresh = (
  location: ScavengeLocationItem,
  currentDay: number,
): number => {
  const cur = getLocationState(location.id);
  if (!cur) return 0;
  // 同步刷新：取敌人/物资 refreshDays 中较大的（与 shouldRefreshLocation 一致）
  const refreshDays = Math.max(
    location.enemyConfig?.refreshDays ?? 0,
    location.lootConfig?.refreshDays ?? 0,
  );
  if (refreshDays === 0) return 0;
  // 以 lastInteractedDay 为基准（"N 天没人拾荒"）
  const referenceDay = cur.lastInteractedDay ?? cur.lastRefreshedDay;
  const elapsed = currentDay - referenceDay;
  return Math.max(0, refreshDays - elapsed);
};

/** 是否需要立即刷新（用于 UI 红点提示） */
export const needsRefresh = (
  location: ScavengeLocationItem,
  currentDay: number,
): boolean => shouldRefreshLocation(location, currentDay);

/** 敌人总量（所有类型 count 之和） */
export const getTotalEnemyCount = (state: LocationState | undefined): number => {
  if (!state) return 0;
  return Object.values(state.enemyCount).reduce((s, n) => s + n, 0);
};

/** 物资总量 */
export const getTotalLootCount = (state: LocationState | undefined): number => {
  if (!state) return 0;
  return Object.values(state.lootCount).reduce((s, n) => s + n, 0);
};

// 重新导出（方便外部一行 import）
export { getLocationState, touchLocationInteracted };
