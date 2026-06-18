/**
 * Scavenge 角色面板 - 物品/装备/特性 handlers（2026-06-09 拆分）
 *
 * 包含：
 * - 物品使用/丢弃（useItem / discard via executeItemAction）
 * - 装备/卸下（equip / unequip）
 * - 加点应用（applyPending）
 * - 策略切换（changeStrategy）
 * - 特性增删（addTrait / removeTrait）
 *
 * 注：依赖 stage.ts 的数据读写 + stats.ts 的属性计算 + UI state setters（由主组件传入）
 */

import { ScavengeCharacter, EquipSlotKey } from '../character';
import {
  getItemById, isConsumable, isEquipment, getEquipmentSlot,
  getArmorSlot, ConsumableItem, EquipmentItem, ArmorSlot,
} from '../../ScavengeItems/items';
import {
  InventoryItem, addToInventory, removeFromInventory, replaceInventoryItemAt,
} from '../../ScavengeItems/inventory';
import { applyPendingStatPoints } from '../characterExperience';
import { getCharacters, updateCharacter } from './ScavengeCharacterPanel.stage';
import { getMaxHp, getMaxHungerThirst } from './ScavengeCharacterPanel.stats';

// ============== 角色操作 ==============

/** 切换拾荒策略（stealth/combat） */
export const handleChangeStrategy = (charId: string, strategy: 'stealth' | 'combat', refresh: () => void) => {
  const characters = getCharacters();
  const char = characters.find(c => c.id === charId);
  if (!char || char.strategy === strategy) return;
  updateCharacter({ ...char, strategy });
  refresh();
};

/** 玩家点"保存加点"时：把 Attributes 组件的暂存批量写入角色数据 */
export const handleApplyPending = (
  charId: string,
  pending: { str: number; agi: number; end: number; int: number },
  refresh: () => void,
) => {
  const characters = getCharacters();
  const char = characters.find(c => c.id === charId);
  if (!char) return;
  const updated = applyPendingStatPoints(char, pending);
  updateCharacter(updated);
  refresh();
};

// ============== 装备/卸下 ==============

/** 卸下装备到背包 */
export const handleUnequipItem = (charId: string, slot: 'weapon' | 'tool' | ArmorSlot, refresh: () => void) => {
  const characters = getCharacters();
  const char = characters.find(c => c.id === charId);
  if (!char) return;
  const slotKey: EquipSlotKey = slot === 'weapon' ? 'weapon'
    : slot === 'tool' ? 'tool'
    : slot;
  const slotIdField = `${slot}Id` as keyof ScavengeCharacter;
  const equippedInstance = char.equipped?.[slotKey];
  if (!equippedInstance) return;

  let newInventory = addToInventory(char.inventory ?? [], equippedInstance);
  const newEquipped = { ...(char.equipped ?? {}) };
  delete newEquipped[slotKey];

  const updated: ScavengeCharacter = {
    ...char,
    inventory: newInventory,
    equipped: newEquipped,
  };
  (updated as any)[slotIdField] = undefined;

  const newMaxHp = getMaxHp(updated);
  if (updated.hp > newMaxHp) updated.hp = newMaxHp;
  const newMaxHunger = getMaxHungerThirst(updated);
  if (updated.hunger > newMaxHunger) updated.hunger = newMaxHunger;
  if (updated.thirst > newMaxHunger) updated.thirst = newMaxHunger;

  updateCharacter(updated);
  refresh();
};

/** 装备物品（instance 从 inventory 移到 equipped） */
export const handleEquipItem = (charId: string, invItem: InventoryItem, refresh: () => void) => {
  const characters = getCharacters();
  const char = characters.find(c => c.id === charId);
  if (!char) return;
  const slot = getEquipmentSlot(invItem.itemId);
  if (!slot) return;
  const equipItem = getItemById(invItem.itemId);
  if (!equipItem || !isEquipment(invItem.itemId)) return;

  // 护甲：按 armorSlot 选 slotKey（2026-06-07 改）
  let slotKey: EquipSlotKey;
  let slotIdField: keyof ScavengeCharacter;
  if (slot === 'armor') {
    const armorSlot = getArmorSlot(invItem.itemId);
    if (!armorSlot) return;
    slotKey = armorSlot;
    slotIdField = `${armorSlot}Id` as keyof ScavengeCharacter;
  } else {
    slotKey = slot;
    slotIdField = `${slot}Id` as keyof ScavengeCharacter;
  }

  // 装备 instance 从 inventory 移到 equipped[slotKey]
  let newInventory = removeFromInventory(char.inventory ?? [], invItem.instanceId, 1);
  // 若当前 slot 已有装备（旧 instance），先放回 inventory
  const oldEquipped = char.equipped?.[slotKey];
  if (oldEquipped) {
    newInventory = addToInventory(newInventory, oldEquipped);
  }
  const newEquipped: Partial<Record<EquipSlotKey, InventoryItem>> = {
    ...(char.equipped ?? {}),
    [slotKey]: invItem,
  };

  const updated: ScavengeCharacter = {
    ...char,
    inventory: newInventory,
    equipped: newEquipped,
  };
  (updated as any)[slotIdField] = invItem.itemId;
  // 耐久在 invItem.durability 上保持

  updateCharacter(updated);
  refresh();
};

// ============== 物品使用 ==============

/** 使用消耗品（按 effect.type 加 buff，clamp 到 max） */
export const handleUseItem = (charId: string, invItem: InventoryItem, refresh: () => void) => {
  const characters = getCharacters();
  const char = characters.find(c => c.id === charId);
  if (!char) return;
  const item = getItemById(invItem.itemId);
  if (!item || !isConsumable(invItem.itemId)) return;

  const consumableItem = item as ConsumableItem;
  const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };

  consumableItem.effects.forEach(effect => {
    const effectKey = effect.type as keyof ScavengeCharacter;
    let maxValue: number;
    switch (effect.type) {
      case 'hp': maxValue = getMaxHp(updated); break;
      case 'hunger': maxValue = getMaxHungerThirst(updated); break;
      case 'thirst': maxValue = getMaxHungerThirst(updated); break;
      case 'sanity': maxValue = updated.maxSanity; break;
      default: maxValue = 100;
    }
    const currentValue = updated[effectKey] as number;
    (updated as any)[effectKey] = Math.min(currentValue + effect.value, maxValue);
  });

  updated.inventory = removeFromInventory(updated.inventory, invItem.instanceId, 1);
  updateCharacter(updated);
  refresh();
};

// ============== 物品操作编排 ==============

/** 执行物品菜单操作（use / equip / discard） */
export const executeItemAction = (
  action: string,
  selectedItem: { charId: string; item: InventoryItem } | null,
  quantity: number,
  refresh: () => void,
  closeItemMenu: () => void,
) => {
  if (!selectedItem) return;
  const { charId, item } = selectedItem;
  closeItemMenu();

  if (action === 'use' && isConsumable(item.itemId)) {
    for (let i = 0; i < quantity; i++) {
      handleUseItem(charId, { ...item, quantity: 1 }, refresh);
    }
  } else if (action === 'equip' && isEquipment(item.itemId)) {
    handleEquipItem(charId, { ...item, quantity: 1 }, refresh);
  } else if (action === 'discard') {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
    updated.inventory = replaceInventoryItemAt(updated.inventory, item.instanceId, null);
    updateCharacter(updated);
    refresh();
  }
};
