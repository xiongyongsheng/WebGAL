/**
 * 拾荒系统 - 数据验证器（2026-06-08 加）
 *
 * 设计目标：
 * 1. 读取存档时自动检测并修复常见数据问题
 * 2. 可扩展：新验证器只要加到 `itemValidators` 或 `charValidators` 数组即可
 * 3. 修复 + 警告双输出：自动改 + console.warn 告诉开发者改了啥
 *
 * 使用：
 *   const { characters, warnings } = validateCharacters(rawChars);
 *   if (warnings.length > 0) console.warn(...);
 *
 * 已包含的验证项（2026-06-08 初始版）：
 *  - 未知 itemId          → warn（保留，让玩家看到）
 *  - 耐久 > max            → clamp 到 max
 *  - 耐久 < 0              → clamp 到 0
 *  - 装备无 durability 字段 → 设为满耐久
 *  - 数量 < 1               → 设 1
 *  - 数量 > maxStack        → clamp
 *
 * 以后想加什么（如检查"strategy 不在 enum"、"equipped 重复占一个 slot"），
 * 加新 ItemValidator / CharacterValidator 函数即可，无需改其他代码。
 */

import { InventoryItem } from '../ScavengeItems/inventory';
import { getItemById, EquipmentItem } from '../ScavengeItems/items';
import { ScavengeCharacter, EquipSlotKey } from './character';

// ============== 警告类型 ==============

/**
 * 单条数据问题报告
 */
export interface ValidationWarning {
  /** 警告类别（"durability_clamp" / "unknown_item" / ...） */
  category: string;
  /** 数据问题来源路径（"player_1.inventory[3]"） */
  path: string;
  /** 人类可读描述 */
  message: string;
}

// ============== 验证器签名 ==============

/** 物品级验证器：检查 + 修复一个 InventoryItem */
type ItemValidator = (
  item: InventoryItem,
  path: string,
) => { item: InventoryItem; warnings: ValidationWarning[] };

/** 角色级验证器：检查 + 修复整个 ScavengeCharacter */
type CharacterValidator = (
  char: ScavengeCharacter,
) => { char: ScavengeCharacter; warnings: ValidationWarning[] };

// ============== 物品级验证器（可扩展数组）==============

/**
 * 验证 itemId 是否在 items.ts 注册
 * 行为：未知 ID 不删除（保留 instance），仅 warn（避免误删玩家数据）
 */
const validateItemIdRegistered: ItemValidator = (item, path) => {
  const def = getItemById(item.itemId);
  if (!def) {
    return {
      item,
      warnings: [{
        category: 'unknown_item',
        path,
        message: `未知物品 ID "${item.itemId}"，保留但请检查 items.ts 是否注册`,
      }],
    };
  }
  return { item, warnings: [] };
};

/**
 * 验证并 clamp 耐久
 * 规则：
 *  - 装备必须有 durability 字段（没就设为满耐久）
 *  - 0 ≤ dur ≤ max
 *  - max=0 或非装备 → 不处理
 */
const validateDurability: ItemValidator = (item, path) => {
  const def = getItemById(item.itemId);
  if (!def || def.type !== 'equipment') {
    return { item, warnings: [] };
  }
  const equip = def as EquipmentItem;
  const max = equip.maxDurability ?? 0;
  if (max <= 0) return { item, warnings: [] };

  let dur = item.durability;
  if (typeof dur !== 'number') {
    return {
      item: { ...item, durability: max },
      warnings: [{
        category: 'durability_missing',
        path,
        message: `装备无 durability 字段，已设为满耐久 ${max}`,
      }],
    };
  }
  if (dur > max) {
    return {
      item: { ...item, durability: max },
      warnings: [{
        category: 'durability_clamp',
        path,
        message: `耐久 ${dur} > max ${max}，已 clamp 到 ${max}`,
      }],
    };
  }
  if (dur < 0) {
    return {
      item: { ...item, durability: 0 },
      warnings: [{
        category: 'durability_clamp',
        path,
        message: `耐久 ${dur} < 0，已 clamp 到 0`,
      }],
    };
  }
  return { item, warnings: [] };
};

/**
 * 验证并 clamp 数量
 * 规则：quantity ≥ 1；可堆叠物品 ≤ def.maxStack
 */
const validateQuantity: ItemValidator = (item, path) => {
  const def = getItemById(item.itemId);
  if (!def) return { item, warnings: [] };

  const warnings: ValidationWarning[] = [];
  let q = item.quantity;
  if (typeof q !== 'number' || q < 1) {
    warnings.push({
      category: 'quantity_fix',
      path,
      message: `数量 ${item.quantity} → 1`,
    });
    q = 1;
  }
  if (def.stackable && typeof def.maxStack === 'number' && q > def.maxStack) {
    warnings.push({
      category: 'quantity_clamp',
      path,
      message: `数量 ${q} > maxStack ${def.maxStack}，clamp`,
    });
    q = def.maxStack;
  }
  return { item: { ...item, quantity: q }, warnings };
};

/** 物品级验证器执行顺序（数组 = 顺序 = pipeline） */
const itemValidators: ItemValidator[] = [
  validateItemIdRegistered,  // 先查 ID（决定后续 validator 是否能拿到 def）
  validateDurability,        // 再修耐久
  validateQuantity,          // 最后修数量
];

/**
 * 验证一个物品（按 pipeline 顺序跑所有 ItemValidator）
 *
 * @returns 修复后的 item + 警告列表
 */
export const validateInventoryItem = (
  item: InventoryItem,
  path: string,
): { item: InventoryItem; warnings: ValidationWarning[] } => {
  let result = item;
  const warnings: ValidationWarning[] = [];
  for (const v of itemValidators) {
    const r = v(result, path);
    result = r.item;
    warnings.push(...r.warnings);
  }
  return { item: result, warnings };
};

// ============== 角色级验证器（可扩展数组）==============

/** 验证 inventory 数组（处理 null 槽 + 跑物品验证器） */
const validateInventory: CharacterValidator = (char) => {
  const warnings: ValidationWarning[] = [];
  const newInventory = (char.inventory ?? []).map((slot, i) => {
    if (slot === null) return null;
    const path = `${char.id}.inventory[${i}]`;
    const { item, warnings: w } = validateInventoryItem(slot, path);
    warnings.push(...w);
    return item;
  });
  return { char: { ...char, inventory: newInventory }, warnings };
};

/** 验证 equipped 字典（每个 slot 跑物品验证器） */
const validateEquipped: CharacterValidator = (char) => {
  if (!char.equipped) {
    return { char, warnings: [] };
  }
  const warnings: ValidationWarning[] = [];
  const newEquipped = { ...char.equipped };
  for (const slot of Object.keys(newEquipped) as EquipSlotKey[]) {
    const inst = newEquipped[slot];
    if (!inst) continue;
    const path = `${char.id}.equipped.${slot}`;
    const { item, warnings: w } = validateInventoryItem(inst, path);
    warnings.push(...w);
    newEquipped[slot] = item;
  }
  return { char: { ...char, equipped: newEquipped }, warnings };
};

/** 角色级验证器执行顺序 */
const charValidators: CharacterValidator[] = [
  validateInventory,
  validateEquipped,
  // 以后想加新验证：直接 push 到这里
  // 例：validateStrategy, validateMainStat, validateStatsRange, ...
];

/**
 * 验证一个角色（pipeline）
 */
export const validateCharacter = (
  char: ScavengeCharacter,
): { char: ScavengeCharacter; warnings: ValidationWarning[] } => {
  let result = char;
  const warnings: ValidationWarning[] = [];
  for (const v of charValidators) {
    const r = v(result);
    result = r.char;
    warnings.push(...r.warnings);
  }
  return { char: result, warnings };
};

/**
 * 验证一个角色数组（pipeline + 防御性输入检查）
 *
 * - 不是数组 → 返回空数组 + warn
 * - 每个元素跑 validateCharacter
 * - 合并所有警告
 */
export const validateCharacters = (
  raw: unknown,
): { characters: ScavengeCharacter[]; warnings: ValidationWarning[] } => {
  if (!Array.isArray(raw)) {
    return {
      characters: [],
      warnings: [{
        category: 'invalid_type',
        path: 'root',
        message: `角色数据不是数组（实际类型 ${typeof raw}），已重置为空数组`,
      }],
    };
  }
  const allWarnings: ValidationWarning[] = [];
  const newChars = raw.map((c) => {
    const { char, warnings } = validateCharacter(c as ScavengeCharacter);
    allWarnings.push(...warnings);
    return char;
  });
  return { characters: newChars, warnings: allWarnings };
};

// ============== 控制台格式化输出 ==============

/**
 * 把 ValidationWarning[] 格式化成多行字符串（用于 console.warn）
 */
export const formatWarnings = (warnings: ValidationWarning[]): string => {
  if (warnings.length === 0) return '';
  return warnings
    .map((w) => `  - [${w.category}] ${w.path}: ${w.message}`)
    .join('\n');
};
