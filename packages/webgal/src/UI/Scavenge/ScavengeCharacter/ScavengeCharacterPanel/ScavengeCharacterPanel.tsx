/**
 * Scavenge 模块 - 角色面板
 *
 * 全屏弹框布局：
 * - 顶部：横向滚动的角色详情卡片（每个卡片一个角色）
 * - 底部：固定高度的仓库区域
 * - 直接在面板内完成所有操作（无需再嵌套弹框）
 */
import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeCharacter, normalizeCharacter, getCharacterStatusText } from '../character';
import {
  getItemById, isEquipment, isConsumable, getEquipmentSlot,
  ConsumableItem, EquipmentItem,
} from '../../ScavengeItems/items';
import {
  InventoryItem, MAX_CARRY_WEIGHT, addToInventory, removeFromInventory,
  compactInventorySlots, replaceInventoryItemAt,
} from '../../ScavengeItems/inventory';
import { ScavengeCharacterHeader } from '../ScavengeCharacterHeader/ScavengeCharacterHeader';
import { ScavengeCharacterStatus } from '../ScavengeCharacterStatus/ScavengeCharacterStatus';
import { ScavengeCharacterAttributes } from '../ScavengeCharacterAttributes/ScavengeCharacterAttributes';
import { ScavengeCharacterEquip } from '../ScavengeCharacterEquip/ScavengeCharacterEquip';
import { ScavengeCharacterInventory } from '../ScavengeCharacterInventory/ScavengeCharacterInventory';
import { ScavengeWarehouse } from '../../ScavengeWarehouse/ScavengeWarehouse';
import styles from './ScavengeCharacterPanel.module.scss';

interface ScavengeCharacterPanelProps {
  onClose: () => void;
}

export const ScavengeCharacterPanel = ({ onClose }: ScavengeCharacterPanelProps) => {
  // 强制刷新用
  const [, forceUpdate] = useState({});
  const refresh = () => forceUpdate({});

  // 当前打开的物品菜单
  const [menuCharId, setMenuCharId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ charId: string; item: InventoryItem } | null>(null);
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [actionQuantity, setActionQuantity] = useState(1);

  // ==================== 数据读写（直接走 stageStateManager，避免闭包过期） ====================

  // 读取所有角色
  const getCharacters = (): ScavengeCharacter[] => {
    const data = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed.map(c => normalizeCharacter(c as ScavengeCharacter));
      } catch { /* ignore */ }
    }
    if (Array.isArray(data)) {
      return (data as unknown as ScavengeCharacter[]).map(c => normalizeCharacter(c));
    }
    return [];
  };

  // 写所有角色
  const setCharacters = (characters: ScavengeCharacter[]) => {
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(characters),
    });
  };

  // 更新单个角色
  const updateCharacter = (updated: ScavengeCharacter) => {
    const characters = getCharacters();
    const index = characters.findIndex(c => c.id === updated.id);
    if (index >= 0) {
      characters[index] = updated;
      setCharacters(characters);
    }
  };

  // ==================== 属性计算 ====================

  const calculateEquipBonus = (
    charData: ScavengeCharacter,
    attr: 'str' | 'agi' | 'end' | 'int',
  ): number => {
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

  const getFinalAttr = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
    return charData[attr] + calculateEquipBonus(charData, attr);
  };

  const getMaxHp = (charData: ScavengeCharacter): number => {
    const endBonus = getFinalAttr(charData, 'end');
    return charData.maxHp + (endBonus - 5) * 5;
  };

  const getMaxCarryWeight = (charData: ScavengeCharacter): number => {
    const totalEnd = charData.end + calculateEquipBonus(charData, 'end');
    return MAX_CARRY_WEIGHT + (totalEnd - 5) * 3;
  };

  const getMaxHungerThirst = (charData: ScavengeCharacter): number => {
    const totalEnd = getFinalAttr(charData, 'end');
    return 100 + (totalEnd - 5) * 5;
  };

  // 整理单个角色的背包
  const compactCharacter = (charId: string) => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const inventory = char.inventory ?? [];
    const compacted = compactInventorySlots(inventory);
    if (compacted.length !== inventory.length) {
      const updated = { ...char, inventory: compacted };
      updateCharacter(updated);
      refresh();
    }
  };

  // 整理所有角色
  const compactAll = () => {
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
      refresh();
    }
  };

  // 进入时整理全部
  useEffect(() => {
    compactAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切换 tag 时也整理
  const handleFilterChange = (charId: string, _filter: string) => {
    compactCharacter(charId);
  };

  // ==================== 操作 ====================

  const handleUseItem = (charId: string, invItem: InventoryItem) => {
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

    updated.inventory = removeFromInventory(updated.inventory, invItem.itemId, 1);
    updateCharacter(updated);
    refresh();
  };

  const handleUnequipItem = (charId: string, slot: 'weapon' | 'armor' | 'tool') => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;
    const durKey = `${slot}Durability` as keyof ScavengeCharacter;
    const equipId = updated[slotKey] as string | undefined;
    if (!equipId) return;

    updated.inventory = addToInventory(updated.inventory, {
      itemId: equipId,
      quantity: 1,
      durability: updated[durKey] as number | undefined,
    });
    (updated as any)[slotKey] = undefined;
    (updated as any)[durKey] = undefined;

    // 调整属性上限
    const newMaxHp = getMaxHp(updated);
    if (updated.hp > newMaxHp) updated.hp = newMaxHp;
    const newMaxHunger = getMaxHungerThirst(updated);
    if (updated.hunger > newMaxHunger) updated.hunger = newMaxHunger;
    if (updated.thirst > newMaxHunger) updated.thirst = newMaxHunger;

    updateCharacter(updated);
    refresh();
  };

  const handleEquipItem = (charId: string, invItem: InventoryItem) => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const slot = getEquipmentSlot(invItem.itemId);
    if (!slot) return;
    const equipItem = getItemById(invItem.itemId);
    if (!equipItem || !isEquipment(invItem.itemId)) return;

    const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
    const slotKey = `${slot}Id` as keyof ScavengeCharacter;
    const durKey = `${slot}Durability` as keyof ScavengeCharacter;
    const currentEquipId = updated[slotKey] as string | undefined;

    // 装备替换：在新装备原位置用旧装备替换
    const replacement: InventoryItem | null = currentEquipId
      ? { itemId: currentEquipId, quantity: 1, durability: updated[durKey] as number | undefined }
      : null;
    updated.inventory = replaceInventoryItemAt(updated.inventory, invItem.itemId, replacement);

    const equipmentItem = equipItem as EquipmentItem;
    (updated as any)[slotKey] = invItem.itemId;
    (updated as any)[durKey] = invItem.durability ?? equipmentItem.maxDurability;

    updateCharacter(updated);
    refresh();
  };

  // 点击物品：显示菜单
  const handleItemClick = (charId: string, invItem: InventoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuCharId(charId);
    setSelectedItem({ charId, item: invItem });
    setActionQuantity(1);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowItemMenu(true);
  };

  const closeItemMenu = () => {
    setShowItemMenu(false);
    setSelectedItem(null);
    setMenuCharId(null);
  };

  // 执行物品操作
  const executeItemAction = (action: string) => {
    if (!selectedItem) return;
    const { charId, item } = selectedItem;
    const quantity = actionQuantity;
    closeItemMenu();

    if (action === 'use' && isConsumable(item.itemId)) {
      for (let i = 0; i < quantity; i++) {
        handleUseItem(charId, { ...item, quantity: 1 });
      }
    } else if (action === 'equip' && isEquipment(item.itemId)) {
      handleEquipItem(charId, { ...item, quantity: 1 });
    } else if (action === 'discard') {
      const characters = getCharacters();
      const char = characters.find(c => c.id === charId);
      if (!char) return;
      const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
      updated.inventory = replaceInventoryItemAt(updated.inventory, item.itemId, null);
      updateCharacter(updated);
      refresh();
    }
  };

  // 计算单个角色当前重量
  const calcWeight = (items: (InventoryItem | null)[]): number => {
    return items.reduce((total, invItem) => {
      if (!invItem) return total;
      const item = getItemById(invItem.itemId);
      if (item) return total + item.weight * invItem.quantity;
      return total;
    }, 0);
  };

  const characters = getCharacters();
  // 兼容旧数据中没有 inventory 的角色
  const safeCharacters = characters.map(c => ({ ...c, inventory: c.inventory ?? [] }));

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题 */}
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>角色列表</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 角色详情卡片（横向滚动） */}
        <div className={styles.charactersRow}>
          {safeCharacters.length === 0 ? (
            <div className={styles.empty}>暂无角色</div>
          ) : (
            safeCharacters.map(char => {
              const charData = char;
              const inventory = charData.inventory;
              const totalWeight = calcWeight(inventory);
              const maxWeight = getMaxCarryWeight(charData);
              return (
                <div key={charData.id} className={styles.characterCard}>
                  <ScavengeCharacterHeader
                    name={charData.name}
                    statusText={getCharacterStatusText(charData)}
                    isExploring={Boolean(charData.isExploring)}
                    onClose={() => {}}
                  />
                  <div className={styles.cardContent}>
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
                      onUnequip={(slot) => handleUnequipItem(charData.id, slot)}
                    />
                    <ScavengeCharacterInventory
                      inventory={inventory}
                      totalWeight={totalWeight}
                      maxWeight={maxWeight}
                      onItemClick={(item, e) => handleItemClick(charData.id, item, e)}
                      itemFilter="all"
                      onFilterChange={(f) => handleFilterChange(charData.id, f)}
                      selectedItem={menuCharId === charData.id ? selectedItem?.item ?? null : null}
                      showItemMenu={showItemMenu && menuCharId === charData.id}
                      menuPosition={menuPosition}
                      actionQuantity={actionQuantity}
                      onQuantityChange={setActionQuantity}
                      onExecuteAction={executeItemAction}
                      onCloseMenu={closeItemMenu}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部仓库（固定高度） */}
        <div className={styles.warehouseSection}>
          <ScavengeWarehouse onClose={() => {}} embedded />
        </div>
      </div>
    </div>
  );
};
