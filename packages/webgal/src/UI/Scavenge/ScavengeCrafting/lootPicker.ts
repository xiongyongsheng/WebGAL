/**
 * 蓝图 / 物品统一拾取（2026-06-21 加）
 *
 * 用途：
 * - 拾荒 / 任务奖励 / 商人出售 都通过这个函数
 * - 自动识别 itemId 是蓝图（`bp_` / `craft_`）还是普通物品
 * - 蓝图 → addBlueprint（不进 inventory）
 * - 普通 → addToInventory（按常规走）
 *
 * 调用方：lootDrop / missionOutcome / merchantBuy 等所有"玩家获得物品"的入口
 */

import { InventoryItem, isBlueprintItem } from '../ScavengeItems/inventory';

export type PickedLoot =
  | { kind: 'blueprint'; id: string; bpKind: 'workbench' | 'craft' }
  | { kind: 'item'; item: InventoryItem };

/**
 * 把拾取的物品分类
 * 2026-06-21 改：蓝图当**普**通物**品**走，**不**再**单**独调 addBlueprint
 *   - 蓝图 itemId 直接 addToInventory 到仓库即可
 *   - 这里只**标**记**类**型，**不**修改 GameVar
 */
export const pickLoot = (item: InventoryItem): PickedLoot => {
  const bpKind = isBlueprintItem(item.itemId);
  if (bpKind) {
    return { kind: 'blueprint', id: item.itemId, bpKind };
  }
  return { kind: 'item', item };
};

/**
 * 批量拾取（一次拾取多个物品）
 *   - 蓝图**当**普**通**物**品**返回（itemId 是 `bp_xxx` / `craft_xxx`）
 *   - 调**用**方**统**一 addToInventory 到仓库
 */
export const pickLootBatch = (items: InventoryItem[]): {
  blueprints: Array<{ id: string; bpKind: 'workbench' | 'craft' }>;
  items: InventoryItem[];
} => {
  const blueprints: Array<{ id: string; bpKind: 'workbench' | 'craft' }> = [];
  const normalItems: InventoryItem[] = [];
  for (const item of items) {
    const picked = pickLoot(item);
    if (picked.kind === 'blueprint') {
      blueprints.push({ id: picked.id, bpKind: picked.bpKind });
    } else {
      normalItems.push(picked.item);
    }
  }
  return { blueprints, items: normalItems };
};
