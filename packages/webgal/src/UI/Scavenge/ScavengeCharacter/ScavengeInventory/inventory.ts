/**
 * 角色背包数据定义
 * 存储在 GameVar 中，跟随角色存档
 */

import { InventoryItem } from '../ScavengeItems/inventory';

/** 角色背包最大负重（kg） */
export const CHARACTER_MAX_CARRY_WEIGHT = 30;

/**
 * 获取角色背包数据
 * @param characterId 角色ID
 * @returns 背包物品列表
 */
export const getCharacterInventory = (characterId: string, stageState: any): InventoryItem[] => {
  const key = `scavenge_inventory_${characterId}`;
  const inventory = stageState.GameVar[key];
  if (Array.isArray(inventory)) {
    return inventory as InventoryItem[];
  }
  return [];
};

/**
 * 保存角色背包数据
 * @param characterId 角色ID
 * @param inventory 背包物品列表
 */
export const saveCharacterInventory = (characterId: string, inventory: InventoryItem[]) => {
  const key = `scavenge_inventory_${characterId}`;
  // 通过场景脚本来更新，或者直接使用 stageStateManager
};

/**
 * 计算背包重量
 */
export const calculateInventoryWeight = (inventory: InventoryItem[], stageState: any): number => {
  return inventory.reduce((total, item) => {
    const itemData = stageState.GameVar[`scavenge_item_${item.itemId}`];
    if (itemData) {
      return total + (itemData.weight ?? 0) * item.quantity;
    }
    return total;
  }, 0);
};