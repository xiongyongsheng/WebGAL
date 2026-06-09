/**
 * 拾荒系统 - 角色战斗派生属性（2026-06-07 重构）
 *
 * 派生属性从"基础属性 (str/agi/end) + 装备"线性公式算出。
 * 这些是**战斗时的实时派生值**，**不存 GameVar**。
 *
 * ===== 战斗伤害公式（2026-06-07 与产品确认）=====
 * - 武器伤害 = weapon.rollDamage()（每次命中在 weapon.damageRange 内随机）
 * - 力量加成：weapon.damage * (1 + str/100)
 * - 暴击：× critMultiplier（1.5x）
 * - 最终伤害 = 上面这些相乘后向下取整
 *
 * ===== 攻击速度公式（2026-06-07 与产品确认）=====
 * - 基础：agi * 6（基础 5 时 = 30，约 3.3 tick 触发一次）
 * - 武器 speedModifier：fast × 1.3 / normal × 1.0 / slow × 0.7
 * - 武器 attributes.agi 也会加成
 *
 * ===== 护甲值（2026-06-07 与产品确认）=====
 * - 不再是减伤值，改为"总耐久"显示
 * - 公式 = sum(6 个护甲 slot 当前耐久)
 * - 战斗时：被击中 → 随机选一个有耐久的 slot → 扣耐久，超出归 HP
 *
 * ===== 命中 / 暴击 / 闪避 / 隐蔽（保持原公式）=====
 * - 隐蔽率 = agi * 2%（0~10%）
 * - 命中率 = 50% + agi * 3%（50%~65%）
 * - 闪避率 = agi * 2%（0~10%）
 * - 暴击率 = 5% + agi * 1%（5%~10%）
 *
 * ===== 拳头（无武器）=====
 * - FIST_DAMAGE = 2（伤害很低）
 */

import { ScavengeCharacter } from './character';
import {
  getItemById, isWeapon, getWeaponSpeedModifier,
  SPEED_MODIFIER_MULTIPLIER, meetsEquipmentRequirements, ArmorSlot, rollWeaponDamage,
} from '../ScavengeItems/items';
import { InventoryItem, getItemDurability, getItemMaxDurability, isItemBroken, getItemCurrentStealth } from '../ScavengeItems/inventory';

/** 拳头（无武器）伤害常量 */
export const FIST_DAMAGE = 2;

// ============== 6 护甲 slot 字段映射 ==============

/** 6 护甲 slot 字段映射 */

export const ARMOR_SLOT_IDS: Array<'helmetId' | 'chestId' | 'armsId' | 'glovesId' | 'legsId' | 'bootsId'> =
  ['helmetId', 'chestId', 'armsId', 'glovesId', 'legsId', 'bootsId'];

/** 6 护甲 slot 对应 ArmorSlot 枚举值 */
export const ARMOR_SLOT_FIELD_TO_KIND: Record<typeof ARMOR_SLOT_IDS[number], ArmorSlot> = {
  helmetId: 'helmet',
  chestId: 'chest',
  armsId: 'arms',
  glovesId: 'gloves',
  legsId: 'legs',
  bootsId: 'boots',
};

/** 6 个 ArmorSlot 值（用于遍历 `equipped` 字典）
 *
 * 注意不要用 `ARMOR_SLOT_IDS`（那是字段名 `helmetId`/`chestId` ...），
 * 否则 `equipped[helmetId]` 是 undefined，命中检测会失败。
 */
export const ARMOR_SLOT_KINDS: ArmorSlot[] = ['helmet', 'chest', 'arms', 'gloves', 'legs', 'boots'];

// ============== 装备实例查询 ==============

/**
 * 拿到"当前装备的武器实例"
 *
 * 2026-06-07 改：装备实例在 `char.equipped.weapon`（不在 inventory），所以直接读
 *
 * @returns { def, instance } 或 null（未装备 / 物品未注册 / 没有 equipped.weapon）
 */
export const getEquippedWeapon = (char: ScavengeCharacter): {
  def: import('../ScavengeItems/items').EquipmentItem;
  instance: InventoryItem;
} | null => {
  const instance = char.equipped?.weapon;
  if (!instance) return null;
  const def = getItemById(instance.itemId);
  if (!def || def.type !== 'equipment' || def.slot !== 'weapon') return null;
  return { def, instance };
};

/**
 * 拿到"6 个护甲 slot 当前的实例 + 定义"
 *
 * 2026-06-07 改：从 `char.equipped` 读（不在 inventory）
 *
 * 返回结构：{ helmet: { def, instance } | null, chest: ..., ... }
 */
export const getEquippedArmorPieces = (char: ScavengeCharacter): Record<ArmorSlot, {
  def: import('../ScavengeItems/items').EquipmentItem;
  instance: InventoryItem;
} | null> => {
  const out: Record<ArmorSlot, { def: import('../ScavengeItems/items').EquipmentItem; instance: InventoryItem } | null> = {
    helmet: null,
    chest: null,
    arms: null,
    gloves: null,
    legs: null,
    boots: null,
  };
  for (const field of ARMOR_SLOT_IDS) {
    const kind = ARMOR_SLOT_FIELD_TO_KIND[field];
    const instance = char.equipped?.[kind];
    if (!instance) continue;
    const def = getItemById(instance.itemId);
    if (!def || def.type !== 'equipment' || def.slot !== 'armor' || !def.armorSlot) continue;
    if (def.armorSlot !== kind) continue; // 防御：实例部位与字段不匹配
    out[kind] = { def, instance };
  }
  return out;
};

/**
 * 在角色背包中找一个"可用"武器：
 * - 是武器类（slot==='weapon'）
 * - 角色属性满足 requirements
 * - 耐久 > 0
 *
 * @param excludeInstanceId 排除已坏的当前武器
 * @returns 第一个可用的武器实例，或 null
 */
export const findUsableWeaponInInventory = (
  char: ScavengeCharacter,
  excludeInstanceId?: string,
): InventoryItem | null => {
  for (const slot of char.inventory) {
    if (!slot) continue;
    if (excludeInstanceId && slot.instanceId === excludeInstanceId) continue;
    if (!isWeapon(slot.itemId)) continue;
    if (isItemBroken(slot)) continue;
    const def = getItemById(slot.itemId);
    if (!def || def.type !== 'equipment') continue;
    if (!meetsEquipmentRequirements(char, def.requirements ?? null)) continue;
    return slot;
  }
  return null;
};

/**
 * 角色是否装备了任何护甲（任一 slot 有耐久 > 0 的实例）
 */
export const hasAnyArmorEquipped = (char: ScavengeCharacter): boolean => {
  const pieces = getEquippedArmorPieces(char);
  return Object.values(pieces).some(p => p && getItemDurability(p.instance) > 0);
};

// ============== 装备"装备属性"加成（attributes 字段） ==============

export interface EquipmentStatBonus {
  str: number;
  agi: number;
  end: number;
  int: number;
}

const ZERO_STAT_BONUS: EquipmentStatBonus = { str: 0, agi: 0, end: 0, int: 0 };

/**
 * 把角色所有装备（武器 + 6 护甲 + 工具）的 attributes.{str,agi,end,int} 加起来
 */
export const getEquipmentStatBonus = (char: ScavengeCharacter): EquipmentStatBonus => {
  let bonus: EquipmentStatBonus = { ...ZERO_STAT_BONUS };
  const weapon = getEquippedWeapon(char);
  if (weapon && weapon.def.attributes) {
    bonus.str += weapon.def.attributes.str ?? 0;
    bonus.agi += weapon.def.attributes.agi ?? 0;
    bonus.end += weapon.def.attributes.end ?? 0;
    bonus.int += weapon.def.attributes.int ?? 0;
  }
  const armors = getEquippedArmorPieces(char);
  for (const piece of Object.values(armors)) {
    if (!piece) continue;
    bonus.str += piece.def.attributes.str ?? 0;
    bonus.agi += piece.def.attributes.agi ?? 0;
    bonus.end += piece.def.attributes.end ?? 0;
    bonus.int += piece.def.attributes.int ?? 0;
  }
  if (char.toolId) {
    const def = getItemById(char.toolId);
    if (def && def.type === 'equipment' && def.attributes) {
      bonus.str += def.attributes.str ?? 0;
      bonus.agi += def.attributes.agi ?? 0;
      bonus.end += def.attributes.end ?? 0;
      bonus.int += def.attributes.int ?? 0;
    }
  }
  return bonus;
};

/**
 * 旧接口保留（向后兼容部分 UI），从 attributes 推导：
 * - attackSpeed 仍由 agi 加成（武器 attributes.agi * 0.5）—— 战斗时 computeDerivedStats 会自己算
 * - 旧的 attackDamage / armor 字段保留作兜底
 */
export interface EquipmentCombatBonus {
  attackDamage: number;
  attackSpeed: number;
  armor: number;
}

export const getEquipmentCombatBonus = (char: ScavengeCharacter): EquipmentCombatBonus => {
  const stat = getEquipmentStatBonus(char);
  const weapon = getEquippedWeapon(char);
  const weaponAgiBonus = weapon && weapon.def.attributes?.agi ? weapon.def.attributes.agi * 0.5 : 0;
  return {
    // 旧公式保留：str * 0.5 算入 attackDamage（实际伤害公式已被 weapon.damage 取代）
    attackDamage: stat.str * 0.5,
    // 武器 attributes.agi 仍参与 attackSpeed（叠加到 agi*6）
    attackSpeed: weaponAgiBonus,
    // 旧公式：end * 0.5 算入 armor（实际被"耐久总和"取代）
    armor: stat.end * 0.5,
  };
};

// ============== 派生属性 ==============

export interface DerivedCombatStats {
  /**
   * 单次攻击伤害期望值（向下取整）
   *
   * 公式 = floor(weapon.damageRange[1] * (1 + str/100))
   * - 用 max 不用 min/avg：UI 显示"理论上限"，方便对比装备强度
   * - 实际战斗伤害 = rollWeaponDamage() * (1 + str/100) * critMult，由 combat.ts 实时算
   */
  attackDamage: number;
  /**
   * ATB 累加值（2026-06-07 改）：
   * 公式 = (agi * 6) * speedModMult + 武器 attributes.agi * 0.5
   * - 基础 5 agi = 30
   * - fast 武器 = 30 * 1.3 = 39
   * - slow 武器 = 30 * 0.7 = 21
   */
  attackSpeed: number;
  /**
   * 护甲"总耐久"（2026-06-07 改）：
   * = sum(6 个护甲 slot 当前耐久)
   * - 用于 UI 显示"装甲完整度"
   * - 战斗时不再用作减伤，而是 random slot 扣耐久
   */
  armor: number;
  stealth: number;              // 0~1 概率（避免遭遇）
  accuracy: number;             // 0~1 概率
  evasion: number;              // 0~1 概率
  critRate: number;              // 0~1 概率
}

/**
 * 武器伤害期望值（用于 UI 显示）
 * = floor(damageRange[1] * (1 + str/100))
 */
export const computeWeaponExpectedDamage = (char: ScavengeCharacter): number => {
  const weapon = getEquippedWeapon(char);
  if (!weapon || !weapon.def.damageRange) {
    // 无武器 → 拳头
    return Math.floor(FIST_DAMAGE * (1 + char.str / 100));
  }
  const [, maxDmg] = weapon.def.damageRange;
  return Math.floor(maxDmg * (1 + char.str / 100));
};

/**
 * 计算角色战斗派生属性
 *
 * @param char 角色
 * @param isNight 是否为黑夜（periodIndex=4）；黑夜时 stealth × 1.1（2026-06-08 加）
 */
export const computeDerivedStats = (char: ScavengeCharacter, isNight: boolean = false): DerivedCombatStats => {
  const weapon = getEquippedWeapon(char);
  const weaponSpeedMod = weapon ? getWeaponSpeedModifier(weapon.def.id ?? '') : 'normal';
  const speedMult = SPEED_MODIFIER_MULTIPLIER[weaponSpeedMod];
  // 武器 attributes.agi 也加成 attackSpeed（叠加）
  const weaponAgiBonus = weapon && weapon.def.attributes?.agi ? weapon.def.attributes.agi * 0.5 : 0;

  // 护甲总耐久
  const armors = getEquippedArmorPieces(char);
  let armorTotal = 0;
  for (const piece of Object.values(armors)) {
    if (piece) armorTotal += getItemDurability(piece.instance);
  }

  // ============== 潜行公式（2026-06-08 第三次改：装备为主×敏捷乘数）==============
  //
  // 角色潜行值 = Σ(equipped.stealth) × (1 + agi / 10)
  //              [× 1.1 if isNight]   (黑夜 ×1.1，向下取整)
  //              clamp 上界 [100]      (阻止装备堆叠无敌)
  //
  // 关键约定（用户原话）："如果 装备提供的是 0, 最终潜行值一定是 0"
  //   - 装备潜行值是 **基础（base）**，agi 是 **乘数**
  //   - Σ equipped.stealth = 0 → 必然 stealth = 0（agi 再高也救不回来）
  //   - 这是设计意图：装备是"潜行的物质条件"，agi 只是"放大器"
  //
  // 负值情况：Σ < 0（重甲等）→ stealth < 0 → 装备太暴露，强制被发现
  //
  // 用途：在 encounterCheck 与每个敌人 detection 整数对比
  // 公式：success = 1 - min(char.stealth, enemy.detection) / max(char.stealth, enemy.detection)
  //   char=50, enemy=25 → (50-25)/50 = 50%
  //   char=50, enemy=75 → (75-50)/75 = 33.3%
  //
  // 实测（露西：Σ=12, agi 8, day）：
  //   stealth = 12 × 1.8 = 21.6 ≈ 22
  //   vs wanderer 25 → 1 - 22/25 = 12%  成功
  //   vs chaser 50   → 1 - 22/50 = 56%  成功
  const equippedStealthSum = getEquippedStealthSum(char);
  let stealth = equippedStealthSum * (1 + char.agi / 10);
  if (isNight) stealth = Math.floor(stealth * 1.1);
  stealth = Math.round(stealth);  // 取整，让数字干净
  stealth = Math.min(100, stealth);  // 上界 100；负值保留（装备太暴露）

  return {
    attackDamage: computeWeaponExpectedDamage(char),
    attackSpeed: char.agi * 6 * speedMult + weaponAgiBonus,
    armor: armorTotal,
    stealth,
    accuracy: clamp01(0.5 + char.agi * 0.03),
    evasion: clamp01(char.agi * 0.02),
    critRate: clamp01(0.05 + char.agi * 0.01),
  };
};

// 工具类型导出（combat.ts 需要）
export { getItemDurability, getItemMaxDurability, isItemBroken };
export { rollWeaponDamage };

/**
 * 计算角色装备的"总潜行值" Σ(equipped.stealth)（2026-06-08 导出，2026-06-08 改耐久缩放）：
 *
 * - 只统计已装备的物品
 * - 武器/护甲/工具的 stealth 字段都算上
 * - 负数代表"会暴露"，正数代表"增强隐蔽"
 * - 潜行值按当前耐久缩放（2026-06-08 加）：currentStealth = baseStealth × (dur / max)
 *   例：吉利服(+15) 半耐久 → 当前 +7.5
 * - 例：吉利服(+15) + 软底靴(+4) + 普通防具(-19) = 0（满耐久时）
 *
 * UI 显示这个值，让玩家直观看到装备搭配的总潜行倾向。
 * 真正的"潜行成功率"不在 UI 上显示（每次遭遇由敌人 detection 与角色 stealth 整数对比）。
 */
export const getEquippedStealthSum = (char: ScavengeCharacter): number => {
  let sum = 0;
  for (const piece of Object.values(char.equipped ?? {})) {
    if (!piece) continue;
    // 2026-06-08 改：用 getItemCurrentStealth（按耐久缩放）
    const currentStealth = getItemCurrentStealth(piece);
    if (typeof currentStealth === 'number') {
      sum += currentStealth;
    }
  }
  return sum;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
