/**
 * 商人刷新（2026-06-09 加）
 *
 * 周期：每个商人 template 自定义 `refreshDays`（默认 2）
 * 触发：时间推进到新一天时检查 `currentDay - lastRefreshDay >= refreshDays`
 * 效果：
 *   - 商人金币 → template.initialGold
 *   - 商人 inventory → template.inventory（重置成初始模板）
 *   - 好感度不变（不影响玩家关系）
 *
 * 首次（lastRefreshDay=0）→ 立即刷新（避免刚开局商人就 0 金）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { createEquipmentInstance, InventoryItem } from '../ScavengeItems/inventory';

/**
 * 检查商人是否需要刷新，返回 { shouldRefresh, nextMerchant }
 * - shouldRefresh: true 表示需要刷新（调用方会写回 stage state）
 * - nextMerchant: 刷新后的商人对象
 */
export function checkMerchantRefresh(
  merchant: ScavengeCharacter,
  currentDay: number,
): { shouldRefresh: boolean; nextMerchant: ScavengeCharacter } {
  const template = CHARACTER_TEMPLATES[merchant.id];
  if (!template?.isMerchant) {
    return { shouldRefresh: false, nextMerchant: merchant };
  }

  const refreshDays = template.refreshDays ?? 2;
  const lastRefresh = merchant.lastRefreshDay ?? 0;

  // 首次刷新：lastRefresh=0 立即刷新
  // 后续：currentDay - lastRefresh >= refreshDays 才刷新
  const daysSinceRefresh = currentDay - lastRefresh;
  if (daysSinceRefresh < refreshDays && lastRefresh !== 0) {
    return { shouldRefresh: false, nextMerchant: merchant };
  }

  // 构造刷新后的 inventory（用 createEquipmentInstance 补全 durability）
  const newInventory: InventoryItem[] = (template.inventory ?? []).map((slot) => {
    // slot 是 template 里的项（可能没 instanceId 和 durability）
    return createEquipmentInstance(slot.itemId, {
      quantity: slot.quantity,
      durability: slot.durability,
    });
  });

  const nextMerchant: ScavengeCharacter = {
    ...merchant,
    gold: template.initialGold ?? 0,
    inventory: newInventory,
    lastRefreshDay: currentDay,
  };

  return { shouldRefresh: true, nextMerchant };
}
