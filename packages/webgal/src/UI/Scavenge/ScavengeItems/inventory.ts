/**
 * 拾荒系统 - 背包与仓库管理模块
 * 角色背包和仓库的物品管理
 */

import { getItemById, isEquipment, EquipmentItem } from './items';

// ============== 物品实例接口 ==============

/**
 * 背包/仓库中的物品实例
 *
 * 重要：`instanceId` 是每个**实例**的唯一标识，区别于 `itemId`（物品种类）。
 * - 装备类（不可堆叠）：每件装备需要独立 instanceId 来区分"我有 3 把撬棍"
 * - 消耗品（可堆叠）：合堆共享一个 instanceId；拆堆/新增 entry 时分配新 ID
 *
 * 旧存档数据可能没有 instanceId，读取时用 `migrateInventory` 兜底。
 */
export interface InventoryItem {
  /** 物品实例唯一 ID（区别于 itemId：同 itemId 可有多个实例） */
  instanceId: string;
  /** 物品 ID（种类） */
  itemId: string;
  /** 物品数量 */
  quantity: number;
  /** 当前耐久度（仅装备类物品有） */
  durability?: number;
}

/**
 * 背包中的槽位，可以是物品或空槽位（null）
 */
export type InventorySlot = InventoryItem | null;

// ============== 工具函数 ==============

// 已警告过的未注册 ID 集合，避免控制台刷屏
const _warnedUnregisteredIds = new Set<string>();
/** 开发期发现未注册物品 ID 时输出 warn，同一 ID 只 warn 一次。
 *  详见 docs/PATCHES.md 的 `item-id-must-be-registered` 规则。*/
const warnUnregisteredItemId = (id: string) => {
  if (_warnedUnregisteredIds.has(id)) return;
  _warnedUnregisteredIds.add(id);
  // eslint-disable-next-line no-console
  console.warn(
    `[Scavenge] 未注册的物品 ID: "${id}"\n` +
    `→ 请先在 packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts 的 ` +
    `CONSUMABLE_ITEMS / MATERIAL_ITEMS / EQUIPMENT_ITEMS / QUEST_ITEMS 之一注册。\n` +
    `→ 详见 docs/PATCHES.md 的 "item-id-must-be-registered" 规则。`,
  );
};

let _instanceCounter = 0;
/**
 * 生成物品实例 ID。
 * 优先用 `crypto.randomUUID`，浏览器不支持时降级用 `Date.now() + 计数器`。
 * 加 `inst_` 前缀便于在存储中识别"这是实例 ID 而不是 itemId"。
 */
export const generateInstanceId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `inst_${crypto.randomUUID()}`;
  }
  _instanceCounter += 1;
  return `inst_${Date.now()}_${_instanceCounter}`;
};

/**
 * 数据迁移：给一组旧数据补 instanceId。
 * 缺/重复时分配新 ID，保证数组内 instanceId 唯一。
 * 用于读取 GameVar 后、写回前调用一次。
 */
export const migrateInventory = <T extends { instanceId?: string }>(items: T[]): (T & { instanceId: string })[] => {
  const seen = new Set<string>();
  return items.map(item => {
    if (item.instanceId && !seen.has(item.instanceId)) {
      seen.add(item.instanceId);
      return item as T & { instanceId: string };
    }
    const newId = generateInstanceId();
    seen.add(newId);
    return { ...item, instanceId: newId } as T & { instanceId: string };
  });
};

/**
 * 检测 itemId 是否是蓝图（2026-06-21 加：M3 蓝图掉落）
 * - 以 `bp_` 开头 → workbench 蓝图
 * - 以 `craft_` 开头 → craft 蓝图
 */
export const isBlueprintItem = (itemId: string): 'workbench' | 'craft' | null => {
  if (itemId.startsWith('bp_')) return 'workbench';
  if (itemId.startsWith('craft_')) return 'craft';
  return null;
};

/**
 * "能否放下" 检查结果
 */
export interface CanAddResult {
  canAdd: boolean;
  /** 可以实际放入的数量（可能小于请求数，例如负重/堆叠上限限制） */
  accepted: number;
  /** 拒绝或截断原因，空字符串表示无问题 */
  reason: string;
}

// ============== 背包容量配置 ==============

/** 背包最大负重（单位：kg） */
export const MAX_CARRY_WEIGHT = 30;

// ============== 装备实例工厂（2026-06-07 战斗系统重构） ==============

/**
 * 创建一件装备实例
 *
 * 用法：任务/商店/拾荒掉落时调用，自动设置 instanceId + 初始 durability = maxDurability
 *
 * @param itemId 物品 ID（必须注册在 items.ts）
 * @param overrides 覆盖项（一般不需要）
 * @returns InventoryItem 实例
 */
export const createEquipmentInstance = (
  itemId: string,
  overrides?: Partial<InventoryItem>,
): InventoryItem => {
  const def = getItemById(itemId);
  const isEquip = isEquipment(itemId);
  const maxDura = (def && def.type === 'equipment') ? def.maxDurability : 0;
  return {
    instanceId: overrides?.instanceId ?? generateInstanceId(),
    itemId,
    quantity: overrides?.quantity ?? 1,
    // 装备类：默认满耐久；非装备不设
    ...(isEquip ? { durability: overrides?.durability ?? maxDura } : {}),
    ...overrides,
  };
};

/**
 * 读取实例耐久度（无耐久时返回 maxDurability 当作 0 - 装备未损坏前显示 100%）
 */
export const getItemDurability = (item: InventoryItem): number => {
  if (item.durability !== undefined) return item.durability;
  // 兜底：旧数据没有 durability 字段
  const def = getItemById(item.itemId);
  if (def?.type === 'equipment') return def.maxDurability;
  return 0;
};

/**
 * 读取实例最大耐久度（无注册物品时返回 0）
 */
export const getItemMaxDurability = (item: InventoryItem): number => {
  const def = getItemById(item.itemId);
  if (def?.type === 'equipment') return def.maxDurability;
  return 0;
};

/**
 * 消耗实例耐久度（clamp 到 0）
 * @returns 实际扣除量（受当前耐久限制）
 */
export const damageItem = (item: InventoryItem, amount: number): number => {
  if (item.durability === undefined) return 0;
  const before = item.durability;
  item.durability = Math.max(0, item.durability - amount);
  return before - item.durability;
};

/**
 * 判断装备是否"已坏"（耐久 = 0）
 */
export const isItemBroken = (item: InventoryItem): boolean => {
  if (item.durability === undefined) return false;
  return item.durability <= 0;
};

/**
 * 修复装备耐久度（Plan 19：2026-06-19 加）
 * @param item 要修复的装备
 * @returns 实际恢复量
 */
export const repairItem = (item: InventoryItem): number => {
  if (item.durability === undefined) return 0;
  const max = getItemMaxDurability(item);
  if (max === 0) return 0;
  const before = item.durability;
  item.durability = max;  // 一次性回满
  return item.durability - before;
};

// ============== 未知物品清理（2026-06-07 新增）==============

/**
 * 过滤出"未在 items.ts 注册"的物品 ID
 *
 * 用于清理老存档 / 脏数据中残留的未知 itemId，
 * 避免 UI 显示"未知物品"且 getItemName 兜底报错。
 */
export const findUnknownItemIds = (
  items: readonly (InventoryItem | null)[],
): string[] => {
  const unknown = new Set<string>();
  for (const slot of items) {
    if (slot && !getItemById(slot.itemId)) {
      unknown.add(slot.itemId);
    }
  }
  return Array.from(unknown);
};

// ============== 潜行值按耐久缩放（2026-06-08 加）==============

/**
 * 算出物品的"当前潜行值"（按当前耐久缩放，2026-06-08 加）：
 *
 *   currentStealth = baseStealth × (current / max)
 *
 * 例子：
 *   吉利服 满耐久（67/67）baseStealth=15 → 当前 +15
 *   吉利服 半耐久（33/67）baseStealth=15 → 当前 +7.5
 *   吉利服 0 耐久（0/67）baseStealth=15  → 当前 0
 *
 * 设计意图（用户原话）："随着护甲装备耐久降低,提供潜行属性也越来越低"
 *
 * 返回：
 *   - 装备无 stealth 字段 → undefined（不是潜行型装备）
 *   - 有 stealth 字段但无 maxDurability → 直接返回 baseStealth（理论上不会发生）
 *   - 正常情况 → 按比例缩放
 */
export const getItemCurrentStealth = (item: InventoryItem): number | undefined => {
  const def = getItemById(item.itemId);
  if (!def || def.type !== 'equipment' || typeof def.stealth !== 'number') {
    return undefined;
  }
  const baseStealth = def.stealth;
  const max = def.maxDurability ?? 0;
  if (max <= 0) return baseStealth;
  const current = item.durability ?? 0;
  return baseStealth * (current / max);
};

/**
 * 过滤掉未注册的物品（保留 null 槽位）
 * @returns valid: 合法物品（含 null 槽位），removed: 被移除的物品 ID 列表
 *
 * 入参接受 `InventoryItem[]` 或 `(InventoryItem | null)[]`（仓库只存物品，背包可含 null 槽位）
 */
export const filterUnknownItems = <T extends InventoryItem | null>(
  items: readonly T[],
): { valid: T[]; removed: string[] } => {
  const valid: T[] = [];
  const removed: string[] = [];
  for (const slot of items) {
    if (slot === null) {
      valid.push(slot);
      continue;
    }
    if (getItemById(slot.itemId)) {
      valid.push(slot);
    } else {
      removed.push(slot.itemId);
    }
  }
  return { valid, removed };
};

// ============== 仓库容量配置（根据 DESIGN_PLAN） ==============

/** 消耗品仓库容量 */
export const CONSUMABLE_WAREHOUSE_CAPACITY = 50; // 每种50格，每格99个
/** 材料仓库容量 */
export const MATERIAL_WAREHOUSE_CAPACITY = 100; // 每种100格，每格99个
/** 装备仓库容量 */
export const EQUIPMENT_WAREHOUSE_CAPACITY = 10; // 每种装备1件
/** 任务物品仓库容量 */
export const QUEST_WAREHOUSE_CAPACITY = 20; // 每种20格，每格5个

// ============== 背包操作函数 ==============

/**
 * 计算背包总重量（忽略 null 槽位）
 * @param items 背包物品列表
 * @returns 总重量
 */
export const calculateTotalWeight = (items: (InventoryItem | null)[]): number => {
  return items.reduce((total, invItem) => {
    if (!invItem) return total;
    const item = getItemById(invItem.itemId);
    if (!item) return total;
    return total + item.weight * invItem.quantity;
  }, 0);
};

/**
 * 检查背包能否放下指定物品。
 *
 * 检查项：
 * 1. 装备类：每件独立槽位，按件数算负重
 * 2. 消耗品：可堆叠到 maxStack，超出则开新 entry；总重受负重限制
 *
 * 返回 `accepted` 表示可实际放入的数量（可能 < 请求数），
 * 调用方拿到 `canAdd=false` 或 `accepted < newItem.quantity` 时应给用户提示。
 *
 * @param skipWeight 2026-06-09 加：跳过重量检查（商人等"无重量限制"的目标用）
 */
export const canAddToInventory = (
  items: InventoryItem[],
  newItem: InventoryItem,
  skipWeight: boolean = false,
): CanAddResult => {
  const item = getItemById(newItem.itemId);
  if (!item) {
    warnUnregisteredItemId(newItem.itemId);
    return { canAdd: false, accepted: 0, reason: '未登记的物品（请检查 items.ts）' };
  }

  const currentWeight = skipWeight ? 0 : calculateTotalWeight(items);
  const remainingCapacity = skipWeight ? Number.MAX_SAFE_INTEGER : MAX_CARRY_WEIGHT - currentWeight;

  // 装备类：每件独立
  if (!item.stackable) {
    if (item.weight > remainingCapacity) {
      return { canAdd: false, accepted: 0, reason: `负重已满（${item.weight}kg/件）` };
    }
    const maxByWeight = Math.floor(remainingCapacity / item.weight);
    const accepted = Math.min(newItem.quantity, maxByWeight);
    if (accepted <= 0) {
      return { canAdd: false, accepted: 0, reason: '负重已满' };
    }
    return {
      canAdd: accepted === newItem.quantity,
      accepted,
      reason: accepted < newItem.quantity ? `负重只够放下 ${accepted} 件` : '',
    };
  }

  // 可堆叠：先按 maxStack 算出最多能叠加多少
  const existing = items.find((i) => i.itemId === newItem.itemId);
  // 原有数量（合并后）
  const existingQty = existing?.quantity ?? 0;
  const maxAddableByStack = (item.maxStack ?? 99) - existingQty;
  if (maxAddableByStack <= 0) {
    return {
      canAdd: false,
      accepted: 0,
      reason: `「${item.name}」堆叠已满（${existingQty}/${item.maxStack}）`,
    };
  }

  // 再按负重计算
  const maxByWeight = item.weight > 0 ? Math.floor(remainingCapacity / item.weight) : newItem.quantity;
  const accepted = Math.min(newItem.quantity, maxAddableByStack, maxByWeight);
  if (accepted <= 0) {
    return { canAdd: false, accepted: 0, reason: '负重不足' };
  }
  return {
    canAdd: accepted === newItem.quantity,
    accepted,
    reason: accepted < newItem.quantity
      ? (maxAddableByStack < newItem.quantity
          ? `「${item.name}」已达堆叠上限（${item.maxStack}），只能再叠加 ${accepted} 个`
          : `负重只够叠加 ${accepted} 个`)
      : '',
  };
};

/**
 * 添加物品到背包（支持 null 槽位，优先填入空槽）
 *
 * - 装备类（不可堆叠）：每个实例独立 entry，新分配 instanceId
 * - 可堆叠：合并到同 itemId 的现有 entry 直至 maxStack，再开新 entry
 *   - 合并时**保留**现有 entry 的 instanceId
 *   - 新开 entry 时复用入参 newItem.instanceId（如果还有剩余）否则生成新 ID
 *
 * 重量/堆叠上限由 `canAddToInventory` 提前把关；本函数假设入参已通过容量检查。
 *
 * @param items 当前背包物品
 * @param newItem 要添加的物品（建议已分配好 instanceId，但这里会兜底）
 * @returns 新背包物品列表
 */
export const addToInventory = (
  items: (InventoryItem | null)[],
  newItem: InventoryItem
): (InventoryItem | null)[] => {
  const item = getItemById(newItem.itemId);
  if (!item) return items;

  const equipmentItem = item as EquipmentItem;
  const durability = isEquipment(newItem.itemId)
    ? (newItem.durability ?? equipmentItem.maxDurability)
    : undefined;

  const newItems = [...items];
  const newInstanceId = newItem.instanceId || generateInstanceId();

  // 不可堆叠：每个实例独立
  if (!item.stackable) {
    const slotItem: InventoryItem = {
      instanceId: newInstanceId,
      itemId: newItem.itemId,
      quantity: newItem.quantity,
      durability,
    };
    const nullIndex = newItems.findIndex((i) => i === null);
    if (nullIndex >= 0) {
      newItems[nullIndex] = slotItem;
    } else {
      newItems.push(slotItem);
    }
    return newItems;
  }

  // 可堆叠：先合并到现有 entry（保留其 instanceId），剩余开新 entry
  let remaining = newItem.quantity;
  const firstExistingIdx = newItems.findIndex(
    (i) => i !== null && i.itemId === newItem.itemId,
  );
  if (firstExistingIdx >= 0 && remaining > 0) {
    const existing = newItems[firstExistingIdx]!;
    const space = item.maxStack - existing.quantity;
    if (space > 0) {
      const fill = Math.min(space, remaining);
      newItems[firstExistingIdx] = { ...existing, quantity: existing.quantity + fill };
      remaining -= fill;
    }
  }

  // 剩余数量：每个新 entry 最多堆 maxStack 个
  let firstNewUsed = false;
  while (remaining > 0) {
    const fill = Math.min(item.maxStack, remaining);
    // 第一个新 entry 优先用入参 instanceId（便于回溯），后续新分配
    const slotItem: InventoryItem = {
      instanceId: !firstNewUsed ? newInstanceId : generateInstanceId(),
      itemId: newItem.itemId,
      quantity: fill,
      durability,
    };
    firstNewUsed = true;
    const nullIndex = newItems.findIndex((i) => i === null);
    if (nullIndex >= 0) {
      newItems[nullIndex] = slotItem;
    } else {
      newItems.push(slotItem);
    }
    remaining -= fill;
  }

  return newItems;
};

/**
 * 按 `instanceId` 从背包移除指定数量。
 *
 * instanceId 唯一标识一个 entry，匹配永远只命中一个槽位。
 * 数量减为 0 时置空槽位（保留 index 以便 UI 维持稳定），不删除。
 *
 * @param items 当前背包物品
 * @param instanceId 物品实例 ID
 * @param quantity 移除数量
 * @returns 新背包物品列表
 */
export const removeFromInventory = (
  items: (InventoryItem | null)[],
  instanceId: string,
  quantity: number = 1
): (InventoryItem | null)[] => {
  const index = items.findIndex((i) => i !== null && i.instanceId === instanceId);
  if (index < 0) return items;
  const entry = items[index]!;
  if (entry.quantity <= quantity) {
    const newItems = [...items];
    newItems[index] = null;
    return newItems;
  }
  const newItems = [...items];
  newItems[index] = { ...entry, quantity: entry.quantity - quantity };
  return newItems;
};

/**
 * 按 `instanceId` 减少物品数量（使用物品：消耗完置空槽位）
 */
export const decreaseInventoryItem = (
  items: (InventoryItem | null)[],
  instanceId: string,
  quantity: number = 1
): (InventoryItem | null)[] => {
  return removeFromInventory(items, instanceId, quantity);
};

/**
 * 在指定 `instanceId` 槽位替换为新物品（装备替换时用）
 * @param items 背包物品
 * @param targetInstanceId 要替换的物品实例 ID
 * @param replacement 替换的物品，null 表示置空
 */
export const replaceInventoryItemAt = (
  items: (InventoryItem | null)[],
  targetInstanceId: string,
  replacement: InventoryItem | null
): (InventoryItem | null)[] => {
  return items.map((item) => {
    if (item && item.instanceId === targetInstanceId) {
      return replacement;
    }
    return item;
  });
};

/**
 * 整理背包：移除空槽位，把所有物品移到前面
 */
export const compactInventorySlots = (
  items: (InventoryItem | null)[]
): (InventoryItem | null)[] => {
  return items.filter((item): item is InventoryItem => item !== null);
};

/**
 * 使用消耗品（按 `instanceId`）
 * @param items 当前背包物品
 * @param instanceId 物品实例 ID
 * @returns 新的背包和使用后的效果
 */
export const useConsumable = (
  items: (InventoryItem | null)[],
  instanceId: string
): { newItems: (InventoryItem | null)[]; effects: Record<string, number> } | null => {
  const entry = items.find((i) => i !== null && i.instanceId === instanceId);
  if (!entry) return null;
  const item = getItemById(entry.itemId);
  if (!item || item.type !== 'consumable') {
    return null;
  }

  const effects: Record<string, number> = {};
  for (const effect of item.effects) {
    effects[effect.type] = effect.value;
  }

  const newItems = removeFromInventory(items, instanceId, 1);
  return { newItems, effects };
};

// ============== 仓库操作函数 ==============

/**
 * 检查仓库能否放下指定物品。
 *
 * 仓库无总容量上限、无数目上限，只有单 entry 的 `maxStack` 限制：
 * - 不可堆叠（装备/任务）：每个实例独立 entry → 永远 canAdd=true
 * - 可堆叠：超 maxStack 时开新 entry（数量无限）→ 永远 canAdd=true
 *
 * 因此仓库的 canAddToWarehouse 实际上**总是 canAdd=true**，
 * 保留这个函数是为了接口对称（和 canAddToInventory 一样），未来如果加仓库总容量可在此扩展。
 */
export const canAddToWarehouse = (
  warehouse: InventoryItem[],
  newItem: InventoryItem
): CanAddResult => {
  const item = getItemById(newItem.itemId);
  if (!item) {
    warnUnregisteredItemId(newItem.itemId);
    return { canAdd: false, accepted: 0, reason: '未登记的物品（请检查 items.ts）' };
  }
  return { canAdd: true, accepted: newItem.quantity, reason: '' };
};

/**
 * 添加物品到仓库
 *
 * - 装备/任务类（不可堆叠）：直接 push 新 entry
 * - 可堆叠：合并到现有 entry 直至 maxStack，再开新 entry
 *   - 合并时**保留**现有 entry 的 instanceId
 *   - 新开 entry 复用入参 newItem.instanceId（如果还有剩余）否则生成新 ID
 *
 * 堆叠上限由 `canAddToWarehouse` 提前把关；本函数假设入参已通过检查。
 */
export const addToWarehouse = (
  warehouse: InventoryItem[],
  newItem: InventoryItem
): InventoryItem[] => {
  const item = getItemById(newItem.itemId);
  if (!item) return warehouse;

  const newInstanceId = newItem.instanceId || generateInstanceId();

  // 不可堆叠：直接 push 新 entry
  if (!item.stackable) {
    return [
      ...warehouse,
      {
        instanceId: newInstanceId,
        itemId: newItem.itemId,
        quantity: newItem.quantity,
        durability: newItem.durability,
      },
    ];
  }

  // 可堆叠：合并 + 多 entry 堆叠
  const newWarehouse = [...warehouse];
  let remaining = newItem.quantity;

  // 先合并到现有 entry（保留其 instanceId）
  for (let i = 0; i < newWarehouse.length && remaining > 0; i++) {
    const entry = newWarehouse[i];
    if (entry.itemId !== newItem.itemId) continue;
    const space = item.maxStack - entry.quantity;
    if (space > 0) {
      const fill = Math.min(space, remaining);
      newWarehouse[i] = { ...entry, quantity: entry.quantity + fill };
      remaining -= fill;
    }
  }

  // 剩余：开新 entry（每个最多 maxStack）
  let firstNewUsed = false;
  while (remaining > 0) {
    const fill = Math.min(item.maxStack, remaining);
    newWarehouse.push({
      instanceId: !firstNewUsed ? newInstanceId : generateInstanceId(),
      itemId: newItem.itemId,
      quantity: fill,
      durability: newItem.durability,
    });
    firstNewUsed = true;
    remaining -= fill;
  }

  return newWarehouse;
};

/**
 * 按 `instanceId` 从仓库移除指定数量。
 * 数量减为 0 时彻底删除 entry（仓库没有"空槽位"概念）。
 */
export const removeFromWarehouse = (
  warehouse: InventoryItem[],
  instanceId: string,
  quantity: number = 1
): InventoryItem[] => {
  const index = warehouse.findIndex((w) => w.instanceId === instanceId);
  if (index < 0) return warehouse;
  const entry = warehouse[index];
  if (entry.quantity <= quantity) {
    const newWarehouse = [...warehouse];
    newWarehouse.splice(index, 1);
    return newWarehouse;
  }
  const newWarehouse = [...warehouse];
  newWarehouse[index] = { ...entry, quantity: entry.quantity - quantity };
  return newWarehouse;
};

// ============== 物品统计 ==============

/**
 * 获取背包物品数量统计
 */
export const getInventoryStats = (items: InventoryItem[]) => {
  const total = items.length;
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalWeight = calculateTotalWeight(items);
  const equipmentCount = items.filter((i) => isEquipment(i.itemId)).length;
  const consumableCount = items.filter(
    (i) => getItemById(i.itemId)?.type === 'consumable'
  ).length;

  return {
    total,
    totalQuantity,
    totalWeight,
    equipmentCount,
    consumableCount,
    remainingWeight: MAX_CARRY_WEIGHT - totalWeight,
  };
};

/**
 * 获取仓库物品统计
 */
export const getWarehouseStats = (warehouse: InventoryItem[]) => {
  const total = warehouse.length;
  const totalQuantity = warehouse.reduce((sum, i) => sum + i.quantity, 0);

  return {
    total,
    totalQuantity,
  };
};
