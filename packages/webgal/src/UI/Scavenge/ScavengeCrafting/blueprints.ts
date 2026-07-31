/**
 * 蓝图定义（2026-06-21 加）
 *
 * 蓝图类型：
 * - WorkbenchBlueprint：3 个（造工作台用）
 * - CraftBlueprint：10 个左右（造物品用）
 *
 * 蓝图获取方式（3 选 1 或多个）：
 * - loot：拾荒中能拾到
 * - mission：任务奖励
 * - merchant：商人出售
 *
 * 时间单位（2026-06-21 改）：
 * - buildTime / craftTime = **回**合**数**（period）
 * - 1 回合 = 1 个时段（半天）
 * - 1 天 = 4 个回合
 * - 玩家**不**关注"小时"，只关注"回合"
 *
 * ⚠️ 重要约定（2026-06-21）：
 * - buildTime/craftTime **不要写"4 小时"**这种** — 玩家不关心小时
 * - UI 显示"X 回合"（参见 CraftingModal.module.scss）
 * - 推荐值：buildTime 2-4（1 天内能完成），craftTime 1-2
 * - 超过 4 回合 = 跨天，玩家会觉得慢
 *
 * 蓝图存储（2026-06-21 改）：
 * - **不要**存独立 GameVar（已废除 scavenge_blueprints）
 * - 蓝图当**普通物品**入仓库（itemId 是 `bp_xxx` / `craft_xxx`）
 * - 建造不消耗图纸，**可重复使用**
 * - checkWarehouseHasBlueprint(id) 检查
 */

// ============== 工作台建造蓝图（3 个）==============

export const WORKBENCH_BLUEPRINTS = {
  /** 近战武器工作台 */
  bp_melee_workbench: {
    id: 'bp_melee_workbench',
    name: '近战武器工作台',
    workbenchType: 'melee' as const,
    description: '用于制作近战武器（刀、棒、棍等）。',
    materials: [
      { itemId: 'material_wood', quantity: 5 },
      { itemId: 'material_metal', quantity: 3 },
      { itemId: 'material_screws', quantity: 2 },
    ],
    buildTime: 3,  // 3 回合
    source: 'loot' as const,
    unlockHint: '危险 1★ 以上的地点可拾到',
  },
  /** 护甲工作台 */
  bp_armor_workbench: {
    id: 'bp_armor_workbench',
    name: '护甲工作台',
    workbenchType: 'armor' as const,
    description: '用于制作护甲（皮甲、护甲等）。',
    materials: [
      { itemId: 'material_wood', quantity: 4 },
      { itemId: 'material_cloth', quantity: 3 },
      { itemId: 'material_metal', quantity: 2 },
    ],
    buildTime: 3,
    source: 'loot' as const,
    unlockHint: '危险 1★ 以上的地点可拾到',
  },
  /** 烹饪工作台 */
  bp_cooking_workbench: {
    id: 'bp_cooking_workbench',
    name: '烹饪工作台',
    workbenchType: 'cooking' as const,
    description: '用于烹饪食物（烤肉、炖汤等）。',
    materials: [
      { itemId: 'material_wood', quantity: 3 },
      { itemId: 'material_metal', quantity: 2 },
      { itemId: 'material_brick', quantity: 2 },
    ],
    buildTime: 2,
    source: 'loot' as const,
    unlockHint: '危险 2★ 以上的地点可拾到',
  },
} as const;

// ============== 物品制作蓝图（10 个）==============

export const CRAFT_BLUEPRINTS = {
  // --- 近战武器 ---
  craft_machete: {
    id: 'craft_machete',
    name: '砍刀',
    workbenchType: 'melee' as const,
    resultItemId: 'weapon_machete',
    description: '锋利的砍刀，近战武器。',
    materials: [
      { itemId: 'material_metal', quantity: 3 },
      { itemId: 'material_leather', quantity: 1 },
    ],
    craftTime: 2,
    difficulty: 'normal' as const,
  },
  craft_baseball_bat: {
    id: 'craft_baseball_bat',
    name: '棒球棍',
    workbenchType: 'melee' as const,
    resultItemId: 'weapon_baseball_bat',
    description: '木头做的棒球棍，近战武器。',
    materials: [
      { itemId: 'material_wood', quantity: 2 },
    ],
    craftTime: 1,
    difficulty: 'easy' as const,
  },
  craft_dagger: {
    id: 'craft_dagger',
    name: '匕首',
    workbenchType: 'melee' as const,
    resultItemId: 'weapon_dagger',
    description: '小型近战武器，便于隐藏。',
    materials: [
      { itemId: 'material_metal', quantity: 2 },
    ],
    craftTime: 1,
    difficulty: 'easy' as const,
  },

  // --- 护甲 ---
  craft_leather_armor: {
    id: 'craft_leather_armor',
    name: '皮甲',
    workbenchType: 'armor' as const,
    resultItemId: 'armor_leather_chest',
    description: '皮革做的护甲，提供基础防护。',
    materials: [
      { itemId: 'material_leather', quantity: 3 },
      { itemId: 'material_cloth', quantity: 2 },
    ],
    craftTime: 2,
    difficulty: 'normal' as const,
  },
  craft_vest: {
    id: 'craft_vest',
    name: '防刺背心',
    workbenchType: 'armor' as const,
    resultItemId: 'armor_vest',
    description: '防刺背心，提供中等防护。',
    materials: [
      { itemId: 'material_metal', quantity: 2 },
      { itemId: 'material_cloth', quantity: 3 },
    ],
    craftTime: 3,
    difficulty: 'normal' as const,
  },

  // --- 烹饪 ---
  craft_roasted_meat: {
    id: 'craft_roasted_meat',
    name: '烤肉',
    workbenchType: 'cooking' as const,
    resultItemId: 'food_roasted_meat',
    description: '用木炭烤的肉，回复饥饿。',
    materials: [
      { itemId: 'food_raw_meat', quantity: 1 },
      { itemId: 'material_charcoal', quantity: 1 },
    ],
    craftTime: 1,
    difficulty: 'easy' as const,
  },
  craft_stew: {
    id: 'craft_stew',
    name: '炖汤',
    workbenchType: 'cooking' as const,
    resultItemId: 'food_stew',
    description: '蔬菜肉汤，回复饥饿+口渴。',
    materials: [
      { itemId: 'food_raw_meat', quantity: 2 },
      { itemId: 'food_vegetable', quantity: 2 },
    ],
    craftTime: 2,
    difficulty: 'normal' as const,
  },
  craft_bandage: {
    id: 'craft_bandage',
    name: '绷带',
    workbenchType: 'cooking' as const,  // 暂时归到 cooking（2026-06-21 暂定）
    resultItemId: 'medicine_bandage',
    description: '基础医疗包，用布料+草药制作。',
    materials: [
      { itemId: 'material_cloth', quantity: 1 },
      { itemId: 'medicine_herb', quantity: 1 },
    ],
    craftTime: 1,
    difficulty: 'easy' as const,
  },
} as const;

/** 所有蓝图（用 id 索引） */
export const ALL_BLUEPRINTS = {
  ...WORKBENCH_BLUEPRINTS,
  ...CRAFT_BLUEPRINTS,
} as const;

/** 蓝图 id 联合类型 */
export type BlueprintId = keyof typeof ALL_BLUEPRINTS;

/** 查找蓝图（兼容 workbench/craft 两种）*/
export const findBlueprint = (id: string) => {
  return ALL_BLUEPRINTS[id as BlueprintId];
};

// ============== 门窗修补参数 ==============

/** 门的初始 HP */
export const DOOR_INITIAL_HP = 30;
/** 窗每扇的初始 HP */
export const WINDOW_INITIAL_HP = 15;
/** 窗数量（默认 4 扇）*/
export const DEFAULT_WINDOW_COUNT = 4;
/** 每日门窗损耗（固定 -1）*/
export const DAILY_STRUCTURE_DAMAGE = 1;

/** 修补消耗（用于 UI 提示） */
export const REPAIR_COSTS = {
  door: {
    materialWood: 2,  // 木材
    hours: 2,
  },
  window: {
    materialWood: 1,
    hours: 1,
  },
};

/** 修补恢复量 */
export const REPAIR_AMOUNTS = {
  door: 10,    // 每次补 +10 HP
  window: 8,   // 每次补 +8 HP
};
