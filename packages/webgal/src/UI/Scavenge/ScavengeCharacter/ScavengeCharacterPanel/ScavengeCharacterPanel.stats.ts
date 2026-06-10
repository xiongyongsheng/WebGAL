/**
 * Scavenge 角色面板 - 属性计算（2026-06-09 拆分）
 *
 * 包含：calculateEquipBonus / getFinalAttr / getMaxHp / getMaxStamina
 *      getMaxCarryWeight / getMaxHungerThirst / compactAll
 *
 * 注：所有函数接收 charData 为参数，refresh 由调用方管理。
 */

import { ScavengeCharacter } from '../character';
import {
  getItemById, isEquipment, EquipmentItem,
} from '../../ScavengeItems/items';
import { compactInventorySlots, InventoryItem, MAX_CARRY_WEIGHT } from '../../ScavengeItems/inventory';
import { sumActiveTraitEffects } from '../traits';
import { getCharacters, setCharacters, getWarehouse, setWarehouse } from './ScavengeCharacterPanel.stage';

/** 装备 bonus 累加（武器 + 6 护甲 + 工具） */
export const calculateEquipBonus = (
  charData: ScavengeCharacter,
  attr: 'str' | 'agi' | 'end' | 'int',
): number => {
  let bonus = 0;
  // 遍历所有装备 slot：武器 + 6 护甲 + 工具（2026-06-07 改）
  const slotIds: Array<keyof ScavengeCharacter> = [
    'weaponId',
    'helmetId', 'chestId', 'armsId', 'glovesId', 'legsId', 'bootsId',
    'toolId',
  ];
  for (const slot of slotIds) {
    const equipId = charData[slot] as string | undefined;
    if (equipId) {
      const equipItem = getItemById(equipId);
      if (equipItem && isEquipment(equipId)) {
        const equipment = equipItem as EquipmentItem;
        if (equipment.attributes && equipment.attributes[attr]) {
          bonus += equipment.attributes[attr]!;
        }
      }
    }
  }
  return bonus;
};

/** 角色最终属性 = 基础 + 装备 bonus */
export const getFinalAttr = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
  return charData[attr] + calculateEquipBonus(charData, attr);
};

/**
 * HP 上限（2026-06-09 改：去掉 -5 基准 + 加 trait bonus）
 * 公式：maxHp(100) + (end + equip.end) * 8 + trait.maxHpBonus
 */
export const getMaxHp = (charData: ScavengeCharacter): number => {
  const endBonus = getFinalAttr(charData, 'end');
  const traitBonus = sumActiveTraitEffects(charData);
  return charData.maxHp + endBonus * 8 + (traitBonus.maxHpBonus ?? 0);
};

/**
 * 体力上限（2026-06-09 加：getMaxStamina + trait bonus）
 * 公式：100 + (end + equip.end) * 8 + trait.maxStaminaBonus
 */
export const getMaxStamina = (charData: ScavengeCharacter): number => {
  const endBonus = getFinalAttr(charData, 'end');
  const traitBonus = sumActiveTraitEffects(charData);
  return 100 + endBonus * 8 + (traitBonus.maxStaminaBonus ?? 0);
};

/**
 * 负重上限（2026-06-09 改：×5 系数 + trait weightReduction）
 * 公式：(25 + end*5) * (1 - trait.weightReduction)
 */
export const getMaxCarryWeight = (charData: ScavengeCharacter): number => {
  const totalEnd = charData.end + calculateEquipBonus(charData, 'end');
  const traitBonus = sumActiveTraitEffects(charData);
  const reduction = traitBonus.weightReduction ?? 0;
  return (MAX_CARRY_WEIGHT + totalEnd * 5) * (1 - reduction);
};

/** 饥/渴上限固定 100（生理上限，2026-06-05 与产品确认） */
export const getMaxHungerThirst = (charData: ScavengeCharacter): number => {
  return charData.maxHunger;
};

/** 压缩所有角色背包的 null 槽位（启动时调用一次） */
export const compactAll = () => {
  const characters = getCharacters();
  let changed = false;
  for (const char of characters) {
    const compacted = compactInventorySlots(char.inventory ?? []);
    if (compacted.length !== (char.inventory ?? []).length) {
      char.inventory = compacted;
      changed = true;
    }
  }
  if (changed) {
    setCharacters(characters);
  }
};

/** 启动数据迁移：把 normalize 后的结果写回 GameVar，保证 instanceId 稳定 */
export const migrateOnStartup = () => {
  compactAll();
  const chars = getCharacters();
  setCharacters(chars);
  const wh = getWarehouse();
  setWarehouse(wh);
};
