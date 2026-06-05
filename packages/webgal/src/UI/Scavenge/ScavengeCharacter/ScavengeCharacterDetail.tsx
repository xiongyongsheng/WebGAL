import { useState, useEffect } from 'react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeCharacter, getCharacterStatusText } from './character';
import { getItemById, isEquipment, isConsumable, getEquipmentSlot, ConsumableItem, EquipmentItem } from '../ScavengeItems/items';
import { InventoryItem, MAX_CARRY_WEIGHT, addToInventory, removeFromInventory, compactInventorySlots, replaceInventoryItemAt } from '../ScavengeItems/inventory';
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
  const statusText = getCharacterStatusText(character);

  // 强制刷新（用于物品操作后更新UI）
  const refresh = () => forceUpdate({});

  // 从 GameVar 获取所有角色列表
  // 注意：必须从 stageStateManager 直接读，不能用 useStageState 的 hook
  // 因为 hook 闭包在 React 重渲染前是过期的，批量操作会读到旧数据
  const getCharactersVar = (): ScavengeCharacter[] => {
    const data = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed as ScavengeCharacter[];
      } catch {
        // ignore
      }
    }
    if (Array.isArray(data)) {
      return data as unknown as ScavengeCharacter[];
    }
    return [];
  };

  // 查找当前角色（从 GameVar 中获取最新数据）
  const getCharacterVar = (): ScavengeCharacter => {
    const characters = getCharactersVar();
    return characters.find(c => c.id === character.id) ?? { ...character, inventory: [] };
  };

  // 保存角色列表到 GameVar（统一存档）
  const setCharactersVar = (characters: ScavengeCharacter[]) => {
    stageStateManager.setStageVarAndCommit({ key: 'scavenge_characters', value: JSON.stringify(characters) });
  };

  // 更新当前角色数据
  const updateCharacterInList = (updated: ScavengeCharacter) => {
    const characters = getCharactersVar();
    const index = characters.findIndex(c => c.id === updated.id);
    if (index >= 0) {
      characters[index] = updated;
      setCharactersVar(characters);
    }
  };

  // 计算装备加成
  const calculateEquipBonus = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
    let bonus = 0;
    const slots: Array<keyof ScavengeCharacter> = ['weaponId', 'armorId', 'toolId'];
    for (const slot of slots) {
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

  // 获取当前角色数据
  const charData = getCharacterVar();
  const inventory: (InventoryItem | null)[] = charData.inventory ?? [];

  // 计算背包总重量
  const totalWeight = inventory.reduce((total, invItem) => {
    if (!invItem) return total;
    const item = getItemById(invItem.itemId);
    if (item) {
      return total + item.weight * invItem.quantity;
    }
    return total;
  }, 0);

  // 整理背包：把空槽位移除
  const compactInventory = () => {
    const current = getCharacterVar();
    const currentInventory = current.inventory ?? [];
    const compacted = compactInventorySlots(currentInventory);
    if (compacted.length !== currentInventory.length) {
      updateCharacterInList({ ...current, inventory: compacted });
      refresh();
    }
  };

  // 重新打开背包时整理（按角色 ID 触发：选择不同角色也算重新打开）
  useEffect(() => {
    compactInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.id]);

  // 使用物品（每次都从 GameVar 重新读取最新数据，避免批量使用时叠加失效）
  const handleUseItem = (invItem: InventoryItem) => {
    const item = getItemById(invItem.itemId);
    if (!item) return;

    if (isConsumable(invItem.itemId)) {
      const consumableItem = item as ConsumableItem;
      // 关键：从 GameVar 读取最新数据，而不是用闭包中的 charData
      const latestChar = getCharacterVar();
      const updatedChar = { ...latestChar, inventory: [...(latestChar.inventory ?? [])] };

      consumableItem.effects.forEach(effect => {
        const effectKey = effect.type as keyof ScavengeCharacter;
        let maxValue: number;
        switch (effect.type) {
          case 'hp':
            maxValue = getMaxHp(updatedChar);
            break;
          case 'hunger':
            maxValue = getMaxHungerThirst(updatedChar);
            break;
          case 'thirst':
            maxValue = getMaxHungerThirst(updatedChar);
            break;
          case 'sanity':
            maxValue = updatedChar.maxSanity;
            break;
          default:
            maxValue = 100;
        }
        const currentValue = updatedChar[effectKey] as number;
        (updatedChar as any)[effectKey] = Math.min(currentValue + effect.value, maxValue);
      });

      // 使用物品：消耗完置空槽位
      updatedChar.inventory = removeFromInventory(updatedChar.inventory, invItem.itemId, 1);

      updateCharacterInList(updatedChar);
      refresh();
    }
  };

  // 卸下装备
  const handleUnequipItem = (slot: 'weapon' | 'armor' | 'tool') => {
    const updatedChar = { ...charData, inventory: [...(charData.inventory ?? [])] };
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;
    const durKey = `${slot}Durability` as keyof ScavengeCharacter;
    const equipId = updatedChar[slotKey] as string | undefined;

    if (!equipId) return;

    // 装备回背包：优先填入空槽
    updatedChar.inventory = addToInventory(updatedChar.inventory, {
      itemId: equipId,
      quantity: 1,
      durability: updatedChar[durKey] as number | undefined,
    });

    (updatedChar as any)[slotKey] = undefined;
    (updatedChar as any)[durKey] = undefined;

    // 检查属性上限变化
    const newMaxHp = getMaxHp(updatedChar);
    if (updatedChar.hp > newMaxHp) updatedChar.hp = newMaxHp;
    const newMaxHunger = getMaxHungerThirst(updatedChar);
    if (updatedChar.hunger > newMaxHunger) updatedChar.hunger = newMaxHunger;
    if (updatedChar.thirst > newMaxHunger) updatedChar.thirst = newMaxHunger;

    updateCharacterInList(updatedChar);
    refresh();
  };

  // 装备物品
  const handleEquipItem = (invItem: InventoryItem) => {
    const slot = getEquipmentSlot(invItem.itemId);
    if (!slot) return;

    const equipItem = getItemById(invItem.itemId);
    if (!equipItem || !isEquipment(invItem.itemId)) return;

    const updatedChar = { ...charData, inventory: [...(charData.inventory ?? [])] };
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;
    const durKey = `${slot}Durability` as keyof ScavengeCharacter;

    const currentEquipId = updatedChar[slotKey] as string | undefined;

    // 装备替换：在新装备原位置用旧装备替换（保持站位）
    const replacementItem: InventoryItem | null = currentEquipId
      ? {
          itemId: currentEquipId,
          quantity: 1,
          durability: updatedChar[durKey] as number | undefined,
        }
      : null;
    updatedChar.inventory = replaceInventoryItemAt(
      updatedChar.inventory,
      invItem.itemId,
      replacementItem
    );

    const equipmentItem = equipItem as EquipmentItem;
    (updatedChar as any)[slotKey] = invItem.itemId;
    (updatedChar as any)[durKey] = invItem.durability ?? equipmentItem.maxDurability;

    updateCharacterInList(updatedChar);
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
      const updatedChar = { ...charData, inventory: [...(charData.inventory ?? [])] };
      // 丢弃：置空槽位（不删除）
      updatedChar.inventory = replaceInventoryItemAt(
        updatedChar.inventory,
        selectedItem.itemId,
        null
      );
      updateCharacterInList(updatedChar);
      refresh();
    }
  };

  // 切换 tag 时也整理
  const handleFilterChange = (filter: 'all' | 'consumable' | 'equipment' | 'material') => {
    setItemFilter(filter);
    compactInventory();
  };

  const maxWeight = getMaxCarryWeight(charData);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <ScavengeCharacterHeader
          name={character.name}
          statusText={statusText}
          isExploring={Boolean(charData.isExploring)}
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
          onFilterChange={handleFilterChange}
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
