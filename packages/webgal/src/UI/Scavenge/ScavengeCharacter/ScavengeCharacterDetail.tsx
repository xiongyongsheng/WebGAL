import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeCharacter, getCharacterStatusText } from './character';
import { getItemName, getItemIcon, getItemRarityColor, getItemById, isEquipment, isConsumable, getEquipmentSlot, ConsumableItem, EquipmentItem } from '../ScavengeItems/items';
import { InventoryItem, MAX_CARRY_WEIGHT, addToInventory, removeFromInventory } from '../ScavengeItems/inventory';
import { ScavengeCharacterHeader } from './ScavengeCharacterHeader/ScavengeCharacterHeader';
import { ScavengeCharacterStatus } from './ScavengeCharacterStatus/ScavengeCharacterStatus';
import { ScavengeCharacterAttributes } from './ScavengeCharacterAttributes/ScavengeCharacterAttributes';
import { ScavengeCharacterEquip } from './ScavengeCharacterEquip/ScavengeCharacterEquip';
import { ScavengeCharacterInventory } from './ScavengeCharacterInventory/ScavengeCharacterInventory';
import styles from './ScavengeCharacterDetail.module.scss';

interface ScavengeCharacterDetailProps {
  character: ScavengeCharacter;
  onClose: () => void;
}

export const ScavengeCharacterDetail = ({ character, onClose }: ScavengeCharacterDetailProps) => {
  const [, forceUpdate] = useState({});
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [actionQuantity, setActionQuantity] = useState(1);
  const [itemFilter, setItemFilter] = useState<'all' | 'consumable' | 'equipment' | 'material'>('all');
  const stageState = useStageState();
  const statusText = getCharacterStatusText(character);

  // 强制刷新（用于物品操作后更新UI）
  const refresh = () => forceUpdate({});

  // 计算装备加成
  const calculateEquipBonus = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
    let bonus = 0;
    const slots = ['weaponId', 'armorId', 'toolId'] as const;
    for (const slot of slots) {
      const equipId = charData[slot];
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

  // 计算最终属性值（基础 + 装备加成）
  const getFinalAttr = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
    const base = charData[attr];
    const equipBonus = calculateEquipBonus(charData, attr);
    return base + equipBonus;
  };

  // 计算最大生命值（基础 + 耐力加成）
  const getMaxHp = (charData: ScavengeCharacter): number => {
    const base = charData.maxHp;
    const endBonus = getFinalAttr(charData, 'end');
    return base + (endBonus - 5) * 5;
  };

  // 计算最大负重（基础 + 耐力加成）
  const getMaxCarryWeight = (charData: ScavengeCharacter): number => {
    const baseEnd = charData.end;
    const equipBonus = calculateEquipBonus(charData, 'end');
    const totalEnd = baseEnd + equipBonus;
    return MAX_CARRY_WEIGHT + (totalEnd - 5) * 3;
  };

  // 计算饥饿/口渴上限（耐力加成）
  const getMaxHungerThirst = (charData: ScavengeCharacter): number => {
    const totalEnd = getFinalAttr(charData, 'end');
    return 100 + (totalEnd - 5) * 5;
  };

  // 获取当前角色的完整数据
  const getCharData = () => {
    return getCharacterVar();
  };

  // 从 GameVar 获取背包数据
  const getInventory = (): InventoryItem[] => {
    const key = `scavenge_inventory_${character.id}`;
    const inventory = stageState.GameVar[key];
    if (typeof inventory === 'string') {
      try {
        const parsed = JSON.parse(inventory);
        if (Array.isArray(parsed)) {
          return parsed as unknown as InventoryItem[];
        }
      } catch {
        // ignore parse error
      }
    }
    if (Array.isArray(inventory)) {
      return inventory as unknown as InventoryItem[];
    }
    return [];
  };

  // 计算背包总重量
  const calculateWeight = (): number => {
    const inventory = getInventory();
    return inventory.reduce((total, invItem) => {
      const item = getItemById(invItem.itemId);
      if (item) {
        return total + item.weight * invItem.quantity;
      }
      return total;
    }, 0);
  };

  const inventory = getInventory();
  const totalWeight = calculateWeight();

  // 获取角色在 GameVar 中的数据
  const getCharacterVar = (): ScavengeCharacter => {
    const key = `scavenge_character_${character.id}`;
    const charData = stageState.GameVar[key];
    if (charData) {
      if (typeof charData === 'string') {
        try {
          return JSON.parse(charData) as ScavengeCharacter;
        } catch {
          return character;
        }
      }
      if (typeof charData === 'object') {
        return charData as unknown as ScavengeCharacter;
      }
    }
    return character;
  };

  // 保存角色数据到 GameVar
  const setCharacterVar = (char: ScavengeCharacter) => {
    const key = `scavenge_character_${char.id}`;
    stageStateManager.setStageVarAndCommit({ key, value: JSON.stringify(char) });
  };

  // 保存背包数据到 GameVar
  const setInventoryVar = (characterId: string, items: InventoryItem[]) => {
    const key = `scavenge_inventory_${characterId}`;
    stageStateManager.setStageVarAndCommit({ key, value: JSON.stringify(items) });
  };

  // 使用物品
  const handleUseItem = (invItem: InventoryItem) => {
    const item = getItemById(invItem.itemId);
    if (!item) return;

    if (isConsumable(invItem.itemId)) {
      const consumableItem = item as ConsumableItem;
      const charData = getCharacterVar();

      consumableItem.effects.forEach(effect => {
        const effectKey = effect.type as keyof ScavengeCharacter;
        let maxValue: number;
        switch (effect.type) {
          case 'hp':
            maxValue = getMaxHp(charData);
            break;
          case 'hunger':
            maxValue = getMaxHungerThirst(charData);
            break;
          case 'thirst':
            maxValue = getMaxHungerThirst(charData);
            break;
          case 'sanity':
            maxValue = charData.maxSanity;
            break;
          default:
            maxValue = 100;
        }
        const currentValue = charData[effectKey] as number;
        (charData as any)[effectKey] = Math.min(currentValue + effect.value, maxValue);
      });

      const currentInventory = getInventory();
      let newInventory: InventoryItem[];
      if (invItem.quantity > 1) {
        newInventory = currentInventory.map(i =>
          i.itemId === invItem.itemId ? { ...i, quantity: i.quantity - 1 } : i
        );
      } else {
        newInventory = removeFromInventory(currentInventory, invItem.itemId, 1);
      }

      setCharacterVar(charData);
      setInventoryVar(character.id, newInventory);
      refresh();
    }
  };

  // 卸下装备
  const handleUnequipItem = (slot: 'weapon' | 'armor' | 'tool') => {
    const charData = getCharacterVar();
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;
    const equipId = charData[slotKey] as string | undefined;

    if (!equipId) return;

    const currentInventory = getInventory();
    const newInventory = addToInventory(currentInventory, {
      itemId: equipId,
      quantity: 1,
      durability: (charData as any)[`${slot}Durability`] as number | undefined,
    });

    (charData as any)[slotKey] = undefined;
    (charData as any)[`${slot}Durability`] = undefined;

    // 检查属性上限变化
    const newMaxHp = getMaxHp(charData);
    if (charData.hp > newMaxHp) {
      charData.hp = newMaxHp;
    }
    const newMaxHunger = getMaxHungerThirst(charData);
    if (charData.hunger > newMaxHunger) {
      charData.hunger = newMaxHunger;
    }
    if (charData.thirst > newMaxHunger) {
      charData.thirst = newMaxHunger;
    }

    setCharacterVar(charData);
    setInventoryVar(character.id, newInventory);
    refresh();
  };

  // 装备物品
  const handleEquipItem = (invItem: InventoryItem) => {
    const slot = getEquipmentSlot(invItem.itemId);
    if (!slot) return;

    const equipItem = getItemById(invItem.itemId);
    if (!equipItem || !isEquipment(invItem.itemId)) return;

    const charData = getCharacterVar();
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;

    const currentEquipId = charData[slotKey] as string | undefined;
    const currentInventory = getInventory();
    let newInventory = [...currentInventory];

    if (currentEquipId) {
      const currentEquip = getItemById(currentEquipId);
      if (currentEquip) {
        newInventory = addToInventory(newInventory, {
          itemId: currentEquipId,
          quantity: 1,
          durability: (charData as any)[`${slot}Durability`] as number | undefined,
        });
      }
    }

    (charData as any)[slotKey] = invItem.itemId;
    const equipmentItem = equipItem as EquipmentItem;
    (charData as any)[`${slot}Durability`] = invItem.durability ?? equipmentItem.maxDurability;

    if (invItem.quantity > 1) {
      newInventory = newInventory.map(i =>
        i.itemId === invItem.itemId ? { ...i, quantity: i.quantity - 1 } : i
      );
    } else {
      newInventory = removeFromInventory(newInventory, invItem.itemId, 1);
    }

    setCharacterVar(charData);
    setInventoryVar(character.id, newInventory);
    refresh();
  };

  // 点击物品显示菜单
  const handleItemClick = (invItem: InventoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItem(invItem);
    setActionQuantity(1);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowItemMenu(true);
  };

  // 关闭物品菜单
  const closeItemMenu = () => {
    setShowItemMenu(false);
    setSelectedItem(null);
  };

  // 执行物品操作
  const executeItemAction = (action: string) => {
    if (!selectedItem) return;

    const quantity = actionQuantity;
    closeItemMenu();

    if (action === 'use' && isConsumable(selectedItem.itemId)) {
      for (let i = 0; i < quantity; i++) {
        handleUseItem({ ...selectedItem, quantity: 1 });
      }
    } else if (action === 'equip' && isEquipment(selectedItem.itemId)) {
      handleEquipItem({ ...selectedItem, quantity: 1 });
    } else if (action === 'discard') {
      const currentInventory = getInventory();
      let newInventory: InventoryItem[];
      if (selectedItem.quantity <= quantity) {
        newInventory = removeFromInventory(currentInventory, selectedItem.itemId, selectedItem.quantity);
      } else {
        newInventory = currentInventory.map(i =>
          i.itemId === selectedItem.itemId ? { ...i, quantity: i.quantity - quantity } : i
        );
      }
      setInventoryVar(character.id, newInventory);
      refresh();
    }
  };

  // 获取角色数据用于组件
  const charData = getCharData();
  const maxWeight = getMaxCarryWeight(charData);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <ScavengeCharacterHeader
          name={character.name}
          statusText={statusText}
          isExploring={character.isExploring}
          onClose={onClose}
        />

        <ScavengeCharacterStatus
          charData={charData}
          maxHp={getMaxHp(charData)}
          maxHunger={getMaxHungerThirst(charData)}
          maxThirst={getMaxHungerThirst(charData)}
        />

        <ScavengeCharacterAttributes
          charData={charData}
          strBonus={calculateEquipBonus(charData, 'str')}
          agiBonus={calculateEquipBonus(charData, 'agi')}
          endBonus={calculateEquipBonus(charData, 'end')}
          intBonus={calculateEquipBonus(charData, 'int')}
        />

        <ScavengeCharacterEquip
          charData={charData}
          onUnequip={handleUnequipItem}
        />

        <ScavengeCharacterInventory
          inventory={inventory}
          totalWeight={totalWeight}
          maxWeight={maxWeight}
          onItemClick={handleItemClick}
          itemFilter={itemFilter}
          onFilterChange={setItemFilter}
          selectedItem={selectedItem}
          showItemMenu={showItemMenu}
          menuPosition={menuPosition}
          actionQuantity={actionQuantity}
          onQuantityChange={setActionQuantity}
          onExecuteAction={executeItemAction}
          onCloseMenu={closeItemMenu}
        />
      </div>
    </div>
  );
};
