/**
 * 商人系统工具函数（2026-06-09 加）
 *
 * 设计：
 * - 商人好感度独立计算（merchantAffection，不与普通 affinity 共用）
 * - 等级：陌生 / 熟客 / 老主顾 / 至交（4 级）
 * - 折扣：1.0 / 0.9 / 0.8 / 0.7（基于 merchantDiscountMap）
 * - 高好感度可解锁"稀有商品"（merchantSpecialItems，由 caller's 自行控制）
 *
 * 价格计算公式（参考 BG3）：
 *   actualPrice = basePrice * discount * (1 + greedFactor)
 *   greedFactor: 商人贪婪度（merchantGreed 字段，0~0.3，默认 0）
 *               高贪婪的商人价格略高
 */

import type { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';

/** 商人等级索引（4 级：陌生/熟客/老主顾/至交）*/
export type MerchantLevel = 0 | 1 | 2 | 3;

/** 默认等级名（4 级）*/
export const DEFAULT_MERCHANT_LEVEL_NAMES = ['陌生', '熟客', '老主顾', '至交'] as const;

/** 计算当前商人等级（不带门控，按数值）*/
export function computeMerchantLevel(affection: number, thresholds: readonly number[]): MerchantLevel {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (affection >= thresholds[i]) {
      return (i + 1) as MerchantLevel;
    }
  }
  return 0;
}

/** 获取商人等级名 */
export function getMerchantLevelName(level: MerchantLevel, levelNames: readonly string[] = DEFAULT_MERCHANT_LEVEL_NAMES): string {
  return levelNames[level] ?? '未知';
}

/** 计算商人当前折扣率（基于 merchantDiscountMap）*/
export function getMerchantDiscount(character: ScavengeCharacter): number {
  const template = CHARACTER_TEMPLATES[character.id];
  if (!template?.isMerchant) return 1.0;
  const affection = character.merchantAffection ?? template.initialMerchantAffection ?? 0;
  const thresholds = template.merchantAffectionThresholds ?? [30, 60, 90];
  const level = computeMerchantLevel(affection, thresholds);
  const discount = template.merchantDiscountMap?.[level] ?? 1.0;
  return discount;
}

/**
 * 计算物品实际交易价格（玩家买 = 商人卖价）
 *
 * 公式：
 *   buyPrice = basePrice * discount
 *   sellPrice = basePrice * 0.5 * discount  // 卖给商人是原价的 50% 再乘折扣
 *                                                （BG3 风格：商人不按原价收）
 *
 * @param basePrice 物品基础价（items.ts.price）
 * @param character 商人
 * @param mode 'buy' = 玩家买，'sell' = 玩家卖给商人
 */
export function calculateMerchantPrice(
  basePrice: number,
  character: ScavengeCharacter,
  mode: 'buy' | 'sell',
): number {
  const discount = getMerchantDiscount(character);
  if (mode === 'buy') {
    return Math.round(basePrice * discount);
  } else {
    // 玩家卖给商人：按物品价值的 50% 收（行业惯例：商人需要利润空间）
    // 折扣也影响：与商人关系好，他愿意多收一点
    return Math.round(basePrice * 0.5 * (1 + (1 - discount) * 0.5));
  }
}

/** 检查商人是否能解锁"特殊商品"（高好感度专属）
 *  当前实现：to 老主顾（>= 60）才解锁
 */
export function canAccessMerchantSpecialItems(character: ScavengeCharacter): boolean {
  const template = CHARACTER_TEMPLATES[character.id];
  if (!template?.isMerchant) return false;
  const affection = character.merchantAffection ?? template.initialMerchantAffection ?? 0;
  return affection >= 60;
}

/**
 * 修改商人好感度（钳制到 -100~100）
 */
export function clampMerchantAffection(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/**
 * 增加商人好感度（用于"买很多/卖很多"自动涨好感）
 */
export function increaseMerchantAffection(character: ScavengeCharacter, delta: number): ScavengeCharacter {
  return {
    ...character,
    merchantAffection: clampMerchantAffection((character.merchantAffection ?? 0) + delta),
  };
}