/**
 * 角色偏好 + 当前需求评分系统（M2 阶段，2026-06-21 加）
 *
 * 用途：
 * - 在 ScavengeLootDistributionModal 里给每个物品显示"推荐给 X"
 * - 不参与实际分配逻辑，只做 UI 推荐
 *
 * 算法：
 * score(char, item) = preferences[category] * PREF_WEIGHT
 *                   + needs[category] * NEED_WEIGHT
 *                   - 距离惩罚（避免推荐给远处角色）
 *
 * 实际推荐：
 * - 计算所有队员对每个物品的 score
 * - score > 0 视为有"意愿"
 * - 最高分 = "推荐"
 * - 次高分 = "备选"
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { InventoryItem, isItemBroken, getItemMaxDurability } from '../ScavengeItems/inventory';
import { getItemById } from '../ScavengeItems/items';
import { ItemCategory, getItemCategory } from './partyLoot';

// ============== 评分权重（可调参）==============

/** 偏好权重：角色"性格"对推荐的贡献 */
const PREF_WEIGHT = 1.0;

/** 需求权重：角色"当前状态"对推荐的贡献（一般比偏好更重要）*/
const NEED_WEIGHT = 1.5;

// ============== 角色当前需求计算 ==============

/**
 * 角色当前对各 ItemCategory 的需求评分（0-10）
 *
 * 计算规则：
 * - HP < 30% 时 medicine 高需求（10）
 * - HP < 60% 时 medicine 中需求（5）
 * - hunger < 30 时 food 高需求（10）
 * - hunger < 60 时 food 中需求（5）
 * - thirst < 30 时 drink 高需求（10）
 * - thirst < 60 时 drink 中需求（5）
 * - sanity < 30 时 sanity 高需求（10）
 * - sanity < 60 时 sanity 中需求（5）
 * - 武器破损 → weapon 需求 +5
 * - 护甲破损（任意 slot）→ armor 需求 +3
 * - 都没需求 → 0
 */
export const computeCharacterNeeds = (char: ScavengeCharacter): Partial<Record<ItemCategory, number>> => {
  const needs: Partial<Record<ItemCategory, number>> = {};

  // 生命值需求
  if (char.hp <= 0) {
    // 死了，啥也帮不了
    return needs;
  }
  const hpRatio = char.hp / Math.max(1, char.maxHp);
  if (hpRatio < 0.3) {
    needs.medicine = 10;
  } else if (hpRatio < 0.6) {
    needs.medicine = 5;
  }

  // 饥饿
  const hungerRatio = char.hunger / Math.max(1, char.maxHunger);
  if (hungerRatio < 0.3) {
    needs.food = 10;
  } else if (hungerRatio < 0.6) {
    needs.food = 5;
  }

  // 口渴
  const thirstRatio = char.thirst / Math.max(1, char.maxThirst);
  if (thirstRatio < 0.3) {
    needs.drink = 10;
  } else if (thirstRatio < 0.6) {
    needs.drink = 5;
  }

  // 精神
  const sanityRatio = char.sanity / Math.max(1, char.maxSanity);
  if (sanityRatio < 0.3) {
    needs.sanity = 10;
  } else if (sanityRatio < 0.6) {
    needs.sanity = 5;
  }

  // 武器破损（看 equipped.weapon）
  if (char.equipped?.weapon) {
    if (isItemBroken(char.equipped.weapon)) {
      needs.weapon = Math.max(needs.weapon ?? 0, 8);
    }
  } else if (char.weaponId) {
    // 有 weaponId 但 equipped 里没有 → 可能损坏/丢失
    needs.weapon = Math.max(needs.weapon ?? 0, 5);
  }

  // 护甲破损（看任一 armor slot）
  if (char.equipped) {
    const armorSlots = ['helmet', 'chest', 'arms', 'gloves', 'legs', 'boots'] as const;
    let brokenCount = 0;
    for (const slot of armorSlots) {
      const item = char.equipped[slot];
      if (item && isItemBroken(item)) {
        brokenCount++;
      }
    }
    if (brokenCount > 0) {
      needs.armor = Math.max(needs.armor ?? 0, Math.min(8, brokenCount * 3));
    }
  }

  return needs;
};

/**
 * 角色偏好（从 CHARACTER_TEMPLATES 取）
 */
export const getCharacterPreferences = (charId: string): Partial<Record<ItemCategory, number>> => {
  const template = CHARACTER_TEMPLATES[charId];
  if (!template?.preferences) return {};
  return template.preferences;
};

// ============== 综合评分 ==============

export interface ItemScore {
  char: ScavengeCharacter;
  /** 总分（preference + need 加权和）*/
  total: number;
  /** 偏好分 */
  preference: number;
  /** 需求分 */
  need: number;
  /** 推荐等级：'recommended' | 'backup' | 'none' */
  level: 'recommended' | 'backup' | 'none';
}

/**
 * 过滤掉商人（faction='neutral' + isMerchant=true）
 * 2026-06-21 加：算法层防御，caller 不传商人时也安全
 */
const isMerchant = (char: ScavengeCharacter): boolean => {
  const template = CHARACTER_TEMPLATES[char.id];
  if (template?.isMerchant) return true;
  if ((template?.faction ?? 'ally') === 'neutral') return true;
  return false;
};

/**
 * 计算所有队员对单个物品的评分
 *
 * @param party 队伍（按队伍顺序，index 0 是主队员）
 * @param item 物品
 * @returns 每个角色的评分（按分数降序）
 * 2026-06-21 加：自动过滤商人
 */
export const scoreItemForParty = (
  party: ScavengeCharacter[],
  item: InventoryItem,
): ItemScore[] => {
  const category = getItemCategory(item.itemId);
  // 2026-06-21 加：过滤商人（caller 没传商人时也跳过）
  const filteredParty = party.filter(c => !isMerchant(c));
  const scores: ItemScore[] = filteredParty.map((char) => {
    const preferences = getCharacterPreferences(char.id);
    const needs = computeCharacterNeeds(char);

    const prefScore = (preferences[category] ?? 0) * PREF_WEIGHT;
    const needScore = (needs[category] ?? 0) * NEED_WEIGHT;
    const total = prefScore + needScore;

    return {
      char,
      total,
      preference: prefScore,
      need: needScore,
      level: 'none' as const,
    };
  });

  // 按总分降序
  scores.sort((a, b) => b.total - a.total);

  // 标记等级：
  //   - 最高分 > 0 → 'recommended'
  //   - 第二高分 > 0 → 'backup'
  //   - 其他 → 'none'
  if (scores.length > 0 && scores[0].total > 0) {
    scores[0].level = 'recommended';
  }
  if (scores.length > 1 && scores[1].total > 0) {
    scores[1].level = 'backup';
  }

  return scores;
};

/**
 * 获取一个物品的"推荐角色"（最高分）
 * - 返回 ScavengeCharacter（可能是 main char）
 * - 如果所有人分数都 <= 0，返回 null
 */
export const getRecommendedChar = (
  party: ScavengeCharacter[],
  item: InventoryItem,
): ScavengeCharacter | null => {
  const scores = scoreItemForParty(party, item);
  if (scores.length === 0 || scores[0].total <= 0) return null;
  return scores[0].char;
};

/**
 * 获取一个物品的"备选角色"（次高分）
 */
export const getBackupChar = (
  party: ScavengeCharacter[],
  item: InventoryItem,
): ScavengeCharacter | null => {
  const scores = scoreItemForParty(party, item);
  if (scores.length < 2 || scores[1].total <= 0) return null;
  return scores[1].char;
};

// ============== M3 阶段：好感度增量计算 ==============

/**
 * 物品价格（2026-06-21 改：直接读 items.ts 里的 price 字段）
 * - 来自 getItemById(itemId).price
 * - 找不到物品定义时默认 10
 */
const getItemPrice = (item: InventoryItem): number => {
  const def = getItemById(item.itemId);
  return def?.price ?? 10;
};

/**
 * 计算把物品分配给角色带来的好感度增量
 *
 * 公式（2026-06-21 M3 加）：
 *   Δaffinity = BASE
 *             × preferenceFactor    (1 + preferences[cat] / 5)
 *             × needFactor         (1 + needs[cat] / 10)
 *             × priceFactor        (1 + log10(price))
 *
 * 因素说明：
 *   - 基础值 BASE = 1（每次分配的最小增量为 1）
 *   - 偏好：角色"喜欢"这种物品 → 好感 +
 *   - 需求：角色"正需要"这种物品 → 好感 ++
 *   - 价格：贵重物品 → 好感 +（关系更紧密）
 *
 * @param char 接收物品的角色
 * @param item 分配的物品（quantity 会影响，price * quantity 是总价）
 * @returns 好感度增量（**正数**）
 */
export const computeAffinityDelta = (
  char: ScavengeCharacter,
  item: InventoryItem,
): number => {
  // 2026-06-21 加：商人不走通用 affinity 流程（商人有独立 merchantAffection）
  if (isMerchant(char)) return 0;

  // 1. 基础值
  const BASE = 1;

  // 2. 偏好系数
  const preferences = getCharacterPreferences(char.id);
  const prefScore = preferences[getItemCategory(item.itemId)] ?? 0;
  // 偏好 -5 ~ +5 → 系数 0 ~ 2
  const preferenceFactor = 1 + prefScore / 5;

  // 3. 需求系数
  const needs = computeCharacterNeeds(char);
  const needScore = needs[getItemCategory(item.itemId)] ?? 0;
  // 需求 0 ~ 10 → 系数 1 ~ 2
  const needFactor = 1 + needScore / 10;

  // 4. 价格系数
  const unitPrice = getItemPrice(item);
  const totalPrice = unitPrice * item.quantity;
  // 价格 1 ~ 1000 → 系数 1 ~ 4（log10 缩放）
  // 物品 1 价值 1 → 1.0
  // 物品 10 价值 10 → 2.0
  // 物品 100 价值 100 → 3.0
  const priceFactor = 1 + Math.log10(Math.max(1, totalPrice));

  // 综合
  return Math.round(BASE * preferenceFactor * needFactor * priceFactor);
};

/**
 * 把多个物品的好感度增量累加
 * - 用来计算"智能分配"给某角色带来多少好感度
 */
export const computeTotalAffinityDelta = (
  char: ScavengeCharacter,
  items: InventoryItem[],
): number => {
  return items.reduce((sum, item) => sum + computeAffinityDelta(char, item), 0);
};
