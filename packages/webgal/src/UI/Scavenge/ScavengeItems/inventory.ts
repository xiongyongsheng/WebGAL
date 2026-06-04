/**
 * 拾荒系统 - 背包与仓库管理模块
 * 角色背包和仓库的物品管理
 */

import { getItemById, isEquipment, EquipmentItem } from './items';

// ============== 物品实例接口 ==============

/**
 * 背包/仓库中的物品实例
 */
export interface InventoryItem {
  /** 物品ID */
  itemId: string;
  /** 物品数量 */
  quantity: number;
  /** 当前耐久度（仅装备类物品有） */
  durability?: number;
}

// ============== 背包容量配置 ==============

/** 背包最大负重（单位：kg） */
export const MAX_CARRY_WEIGHT = 30;

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
 * 计算背包总重量
 * @param items 背包物品列表
 * @returns 总重量
 */
export const calculateTotalWeight = (items: InventoryItem[]): number => {
  return items.reduce((total, invItem) => {
    const item = getItemById(invItem.itemId);
    if (!item) return total;
    return total + item.weight * invItem.quantity;
  }, 0);
};

/**
 * 检查是否可以添加物品到背包
 * @param items 当前背包物品
 * @param newItem 要添加的物品
 * @returns 是否可以添加及原因
 */
export const canAddToInventory = (
  items: InventoryItem[],
  newItem: InventoryItem
): { canAdd: boolean; reason: string } => {
  const item = getItemById(newItem.itemId);
  if (!item) {
    return { canAdd: false, reason: '物品不存在' };
  }

  // 检查负重
  const currentWeight = calculateTotalWeight(items);
  const newWeight = item.weight * newItem.quantity;
  if (currentWeight + newWeight > MAX_CARRY_WEIGHT) {
    return { canAdd: false, reason: `超出负重限制（${MAX_CARRY_WEIGHT}kg）` };
  }

  // 检查堆叠
  if (item.stackable) {
    const existingItem = items.find((i) => i.itemId === newItem.itemId);
    if (existingItem) {
      if (existingItem.quantity + newItem.quantity > item.maxStack) {
        return { canAdd: false, reason: `超过最大堆叠数（${item.maxStack}）` };
      }
    }
  }

  return { canAdd: true, reason: '' };
};

/**
 * 添加物品到背包
 * @param items 当前背包物品
 * @param newItem 要添加的物品
 * @returns 新背包物品列表
 */
export const addToInventory = (
  items: InventoryItem[],
  newItem: InventoryItem
): InventoryItem[] => {
  const { canAdd, reason } = canAddToInventory(items, newItem);
  if (!canAdd) {
    console.warn(`无法添加物品: ${reason}`);
    return items;
  }

  const item = getItemById(newItem.itemId);
  if (!item) return items;

  // 如果是装备，设置初始耐久度
  const equipmentItem = item as EquipmentItem;
  const durability = isEquipment(newItem.itemId)
    ? (newItem.durability ?? equipmentItem.maxDurability)
    : undefined;

  // 复制当前背包
  const newItems = [...items];

  // 检查是否可以堆叠
  if (item.stackable) {
    const existingIndex = newItems.findIndex((i) => i.itemId === newItem.itemId);
    if (existingIndex >= 0) {
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + newItem.quantity,
      };
      return newItems;
    }
  }

  // 添加新物品
  newItems.push({
    itemId: newItem.itemId,
    quantity: newItem.quantity,
    durability,
  });

  return newItems;
};

/**
 * 从背包移除物品
 * @param items 当前背包物品
 * @param itemId 物品ID
 * @param quantity 移除数量
 * @returns 新背包物品列表
 */
export const removeFromInventory = (
  items: InventoryItem[],
  itemId: string,
  quantity: number = 1
): InventoryItem[] => {
  const newItems = [...items];
  const itemIndex = newItems.findIndex((i) => i.itemId === itemId);

  if (itemIndex < 0) return items;

  const existingItem = newItems[itemIndex];

  if (existingItem.quantity <= quantity) {
    // 移除整个物品
    newItems.splice(itemIndex, 1);
  } else {
    // 减少数量
    newItems[itemIndex] = {
      ...existingItem,
      quantity: existingItem.quantity - quantity,
    };
  }

  return newItems;
};

/**
 * 使用消耗品
 * @param items 当前背包物品
 * @param itemId 物品ID
 * @returns 新的背包和使用后的效果
 */
export const useConsumable = (
  items: InventoryItem[],
  itemId: string
): { newItems: InventoryItem[]; effects: Record<string, number> } | null => {
  const item = getItemById(itemId);
  if (!item || item.type !== 'consumable') {
    return null;
  }

  // 创建效果记录
  const effects: Record<string, number> = {};
  for (const effect of item.effects) {
    effects[effect.type] = effect.value;
  }

  // 移除使用的物品
  const newItems = removeFromInventory(items, itemId, 1);

  return { newItems, effects };
};

// ============== 仓库操作函数 ==============

/**
 * 检查仓库是否已满
 * @param warehouse 仓库物品
 * @param itemId 物品ID
 * @param quantity 数量
 * @returns 是否可以存放
 */
export const canAddToWarehouse = (
  warehouse: InventoryItem[],
  itemId: string,
  quantity: number
): boolean => {
  const item = getItemById(itemId);
  if (!item) return false;

  // 检查已有物品数量
  const existing = warehouse.find((w) => w.itemId === itemId);
  const currentQty = existing?.quantity ?? 0;

  // 检查是否超过每种物品的最大堆叠数
  if (currentQty + quantity > item.maxStack) {
    return false;
  }

  return true;
};

/**
 * 添加物品到仓库
 * @param warehouse 当前仓库物品
 * @param newItem 要添加的物品
 * @returns 新仓库物品列表
 */
export const addToWarehouse = (
  warehouse: InventoryItem[],
  newItem: InventoryItem
): InventoryItem[] => {
  const item = getItemById(newItem.itemId);
  if (!item) return warehouse;

  const newWarehouse = [...warehouse];
  const existingIndex = newWarehouse.findIndex((w) => w.itemId === newItem.itemId);

  if (existingIndex >= 0) {
    // 更新已有物品数量
    newWarehouse[existingIndex] = {
      ...newWarehouse[existingIndex],
      quantity: newWarehouse[existingIndex].quantity + newItem.quantity,
    };
  } else {
    // 添加新物品
    newWarehouse.push({
      itemId: newItem.itemId,
      quantity: newItem.quantity,
      durability: newItem.durability,
    });
  }

  return newWarehouse;
};

/**
 * 从仓库移除物品
 * @param warehouse 当前仓库物品
 * @param itemId 物品ID
 * @param quantity 移除数量
 * @returns 新仓库物品列表
 */
export const removeFromWarehouse = (
  warehouse: InventoryItem[],
  itemId: string,
  quantity: number = 1
): InventoryItem[] => {
  const newWarehouse = [...warehouse];
  const itemIndex = newWarehouse.findIndex((w) => w.itemId === itemId);

  if (itemIndex < 0) return warehouse;

  const existingItem = newWarehouse[itemIndex];

  if (existingItem.quantity <= quantity) {
    newWarehouse.splice(itemIndex, 1);
  } else {
    newWarehouse[itemIndex] = {
      ...existingItem,
      quantity: existingItem.quantity - quantity,
    };
  }

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
