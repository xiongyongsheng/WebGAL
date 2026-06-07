/**
 * 拾荒系统 - 角色战斗派生属性
 *
 * 派生属性从"基础属性 (str/agi/end) + 装备"线性公式算出。
 * 这些是**战斗时的实时派生值**，**不存 GameVar**。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 攻击伤害 = str * 2 + 装备 attackDamage
 * - 攻击速度 = 0.5 + agi * 0.1（每 period 攻击次数 0.5~1.5）
 * - 护甲值 = end * 1.5 + 装备 armor
 * - 隐蔽率 = agi * 2%（0~10%）
 * - 命中率 = 50% + agi * 3%（50%~65%）
 * - 闪避率 = agi * 2%（0~10%）
 * - 暴击率 = 5% + agi * 1%（5%~10%）
 */

import { ScavengeCharacter } from './character';
import { getItemById, isEquipment, EquipmentItem } from '../ScavengeItems/items';

// ============== 装备加成读取 ==============

export interface EquipmentCombatBonus {
  attackDamage: number;
  attackSpeed: number;
  armor: number;
}

const ZERO_BONUS: EquipmentCombatBonus = { attackDamage: 0, attackSpeed: 0, armor: 0 };

/**
 * 读装备的"战斗加成"（从 weapon/armor/tool 装备物品读 attackDamage / armor / attackSpeed 字段）。
 * 装备没有这些字段时算 0。
 */
export const getEquipmentCombatBonus = (char: ScavengeCharacter): EquipmentCombatBonus => {
  const slotIds: Array<'weaponId' | 'armorId' | 'toolId'> = ['weaponId', 'armorId', 'toolId'];
  let bonus: EquipmentCombatBonus = { ...ZERO_BONUS };
  for (const slot of slotIds) {
    const id = char[slot];
    if (!id) continue;
    const def = getItemById(id);
    if (!def || !isEquipment(id)) continue;
    const equip = def as EquipmentItem;
    // MVP：把"装备.attributes.end * 0.5"算入 armor；装备.attributes.str * 0.5 算入 attackDamage；
    // 装备.attributes.agi * 0.5 算入 attackSpeed
    if (equip.attributes.str) bonus.attackDamage += equip.attributes.str * 0.5;
    if (equip.attributes.end) bonus.armor += equip.attributes.end * 0.5;
    if (equip.attributes.agi) bonus.attackSpeed += equip.attributes.agi * 0.5;
  }
  return bonus;
};

// ============== 派生属性 ==============

export interface DerivedCombatStats {
  attackDamage: number;        // 单次攻击伤害
  /**
   * ATB 累加值（2026-06-05 改）：
   * 战斗开始后每 tick 累加 currentTick += attackSpeed，
   * currentTick ≥ 100 时该参战者触发行动（攻击），重置 currentTick -= 100 保留余数。
   * 基础 5 时角色 = 30，约 3.3 tick 触发一次；追击者 30 = 同速。
   */
  attackSpeed: number;
  armor: number;                // 减伤
  stealth: number;              // 0~1 概率（避免遭遇）
  accuracy: number;             // 0~1 概率
  evasion: number;              // 0~1 概率
  critRate: number;              // 0~1 概率
}

/**
 * 计算角色战斗派生属性（线性公式）
 */
export const computeDerivedStats = (char: ScavengeCharacter): DerivedCombatStats => {
  const equip = getEquipmentCombatBonus(char);
  return {
    attackDamage: char.str * 2 + equip.attackDamage,
    // ATB 累加值：agi * 6（基础 5 时 = 30，100 阈值下约 3.3 tick 触发一次）
    attackSpeed: char.agi * 6 + equip.attackSpeed,
    armor: char.end * 1.5 + equip.armor,
    stealth: clamp01(char.agi * 0.02),
    accuracy: clamp01(0.5 + char.agi * 0.03),
    evasion: clamp01(char.agi * 0.02),
    critRate: clamp01(0.05 + char.agi * 0.01),
  };
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
