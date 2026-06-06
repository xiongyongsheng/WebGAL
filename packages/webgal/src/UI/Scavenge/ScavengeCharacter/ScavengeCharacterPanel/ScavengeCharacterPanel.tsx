/**
 * Scavenge 模块 - 角色面板
 *
 * 全屏弹框布局：
 * - 顶部：横向滚动的角色详情卡片（每个卡片一个角色）
 * - 底部：固定高度的仓库区域
 * - 直接在面板内完成所有操作（无需再嵌套弹框）
 * - 支持背包/仓库/角色之间的物品转移（菜单 + 拖拽）
 */
import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeCharacter, normalizeCharacter, getCharacterStatusText } from '../character';
import {
  getItemName, getItemById, isEquipment, isConsumable, getEquipmentSlot,
  ConsumableItem, EquipmentItem,
} from '../../ScavengeItems/items';
import {
  InventoryItem, MAX_CARRY_WEIGHT, addToInventory, removeFromInventory,
  compactInventorySlots, replaceInventoryItemAt,
  addToWarehouse, removeFromWarehouse,
  generateInstanceId, migrateInventory, canAddToInventory,
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

// 转移操作的源/目标
type TransferSource =
  | { kind: 'character'; characterId: string }
  | { kind: 'warehouse' };

type TransferTarget =
  | { kind: 'character'; characterId: string }
  | { kind: 'warehouse' };

// 转移子菜单状态（菜单点击 转移 后弹出，列出可转移目标）
interface TransferSubmenuState {
  source: TransferSource;
  item: InventoryItem;
  quantity: number;
  position: { x: number; y: number };
}

// 拖拽时数量选择状态（拖拽 qty>1 的物品时，松开弹出选择器）
interface DragQuantityDialogState {
  source: TransferSource;
  item: InventoryItem;
  target: TransferTarget;
  quantity: number;
  position: { x: number; y: number };
}

export const ScavengeCharacterPanel = ({ onClose }: ScavengeCharacterPanelProps) => {
  // 强制刷新
  const [, forceUpdate] = useState({});
  const refresh = () => forceUpdate({});

  // 当前打开的物品菜单
  const [menuCharId, setMenuCharId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<{ charId: string; item: InventoryItem } | null>(null);
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [actionQuantity, setActionQuantity] = useState(1);

  // 转移子菜单（菜单点击 转移 后弹出，列出目标）
  const [transferSubmenu, setTransferSubmenu] = useState<TransferSubmenuState | null>(null);

  // 拖拽时数量选择对话框
  const [dragQuantityDialog, setDragQuantityDialog] = useState<DragQuantityDialogState | null>(null);

  // 错误提示
  const [transferError, setTransferError] = useState<string | null>(null);

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<{
    source: TransferSource;
    item: InventoryItem;
  } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // 'warehouse' | characterId

  // ==================== 数据读写 ====================

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

  const setCharacters = (characters: ScavengeCharacter[]) => {
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(characters),
    });
  };

  const updateCharacter = (updated: ScavengeCharacter) => {
    const characters = getCharacters();
    const index = characters.findIndex(c => c.id === updated.id);
    if (index >= 0) {
      characters[index] = updated;
      setCharacters(characters);
    }
  };

  const getWarehouse = (): InventoryItem[] => {
    const data = stageStateManager.getCalculationStageState().GameVar['scavenge_warehouse'];
    const normalize = (arr: unknown[]): InventoryItem[] => {
      // 仓库只存储物品（无 null 槽位），过滤掉可能存在的脏数据，并补 instanceId
      const valid = arr.filter(
        (i): i is InventoryItem => i !== null && typeof i === 'object' && 'itemId' in (i as object),
      );
      return migrateInventory(valid);
    };
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return normalize(parsed);
      } catch { /* ignore */ }
    }
    if (Array.isArray(data)) {
      return normalize(data as unknown[]);
    }
    return [];
  };

  const setWarehouse = (items: InventoryItem[]) => {
    // 防御性：仓库永远不存 null 槽位
    const clean = items.filter((i): i is InventoryItem => i !== null);
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_warehouse',
      value: JSON.stringify(clean),
    });
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

  useEffect(() => {
    compactAll();
    // 启动数据迁移：把 normalize / migrate 后的结果写回 GameVar
    // 这样后续 getCharacters / getWarehouse 拿到的 instanceId 是稳定的，
    // 避免拖拽期间 ID 漂移导致 executeTransfer 找不到源 entry
    const chars = getCharacters();
    setCharacters(chars);
    const wh = getWarehouse();
    setWarehouse(wh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (_charId: string, _filter: string) => {
    // tag 切换不需要做任何处理（过滤在组件内完成）
  };

  // ==================== 角色物品操作 ====================

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

    updated.inventory = removeFromInventory(updated.inventory, invItem.instanceId, 1);
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
      instanceId: generateInstanceId(),
      itemId: equipId,
      quantity: 1,
      durability: updated[durKey] as number | undefined,
    });
    (updated as any)[slotKey] = undefined;
    (updated as any)[durKey] = undefined;

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

    const replacement: InventoryItem | null = currentEquipId
      ? { instanceId: generateInstanceId(), itemId: currentEquipId, quantity: 1, durability: updated[durKey] as number | undefined }
      : null;
    updated.inventory = replaceInventoryItemAt(updated.inventory, invItem.instanceId, replacement);

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
      updated.inventory = replaceInventoryItemAt(updated.inventory, item.instanceId, null);
      updateCharacter(updated);
      refresh();
    }
  };

  // ==================== 转移逻辑 ====================

  // 提示并延时清理
  const showTransferError = (msg: string) => {
    setTransferError(msg);
    setTimeout(() => setTransferError(null), 3000);
  };

  // 统一执行转移
  // - 按 instanceId 精确寻址源 entry
  // - 目标侧的"能否放下"由 canAddToInventory 统一把关（负重 + 堆叠上限）
  // - 转移到新位置时生成新 instanceId（避免同一 instanceId 出现两处）
  const executeTransfer = (source: TransferSource, target: TransferTarget, item: InventoryItem, quantity: number): boolean => {
    if (quantity <= 0 || quantity > item.quantity) return false;
    if (source.kind === 'character' && target.kind === 'character' && source.characterId === target.characterId) return false;
    if (source.kind === 'warehouse' && target.kind === 'warehouse') return false;

    // 目标侧容量预检（只对角色背包有意义，仓库永远能放）
    if (target.kind === 'character') {
      const chars = getCharacters();
      const char = chars.find(c => c.id === target.characterId);
      if (!char) return false;
      const nonNullInv = (char.inventory ?? []).filter((i): i is InventoryItem => i !== null);
      const check = canAddToInventory(nonNullInv, { ...item, quantity });
      if (!check.canAdd || check.accepted < quantity) {
        showTransferError(check.reason || '目标无法放下该物品');
        return false;
      }
    }

    // 从源移除（按 instanceId 精确寻址）
    if (source.kind === 'character') {
      const characters = getCharacters();
      const char = characters.find(c => c.id === source.characterId);
      if (!char) return false;
      const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
      updated.inventory = removeFromInventory(updated.inventory, item.instanceId, quantity);
      updateCharacter(updated);
    } else {
      const warehouseItems = getWarehouse();
      const newWarehouse = removeFromWarehouse(warehouseItems, item.instanceId, quantity);
      setWarehouse(newWarehouse);
    }

    // 添加到目标（生成新 instanceId，避免和源冲突）
    const moveItem: InventoryItem = {
      instanceId: generateInstanceId(),
      itemId: item.itemId,
      quantity,
      durability: item.durability,
    };
    if (target.kind === 'character') {
      const characters = getCharacters();
      const char = characters.find(c => c.id === target.characterId);
      if (!char) return false;
      const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
      updated.inventory = addToInventory(updated.inventory, moveItem);
      updateCharacter(updated);
    } else {
      const warehouseItems = getWarehouse();
      const newWarehouse = addToWarehouse(warehouseItems, moveItem);
      setWarehouse(newWarehouse);
    }

    refresh();
    return true;
  };

  // 菜单触发转移：打开子菜单（不关主菜单，在旁边显示目标）
  const handleTransferRequest = (item: InventoryItem) => {
    if (!selectedItem) return;
    setTransferSubmenu({
      source: { kind: 'character', characterId: selectedItem.charId },
      item,
      quantity: actionQuantity,
      position: menuPosition,
    });
  };

  // 仓库点击物品：打开子菜单（关掉可能开的菜单）
  const handleWarehouseItemClick = (item: InventoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    closeItemMenu();
    setTransferSubmenu({
      source: { kind: 'warehouse' },
      item,
      quantity: 1,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  // 子菜单点击目标
  const handleSubmenuTargetClick = (target: TransferTarget) => {
    if (!transferSubmenu) return;
    const { source, item, quantity } = transferSubmenu;
    executeTransfer(source, target, item, quantity);
    setTransferSubmenu(null);
  };

  // 关闭转移子菜单
  const closeTransferSubmenu = () => {
    setTransferSubmenu(null);
  };

  // 列出所有可转移目标（含容量检查状态）
  const getTransferTargetOptions = (source: TransferSource, item: InventoryItem, quantity: number) => {
    const options: Array<{ target: TransferTarget; available: boolean; reason?: string }> = [];
    for (const char of safeCharacters) {
      if (source.kind === 'character' && char.id === source.characterId) continue;
      const target: TransferTarget = { kind: 'character', characterId: char.id };
      const nonNullInv = (char.inventory ?? []).filter((i): i is InventoryItem => i !== null);
      const check = canAddToInventory(nonNullInv, { ...item, quantity });
      options.push({
        target,
        available: check.canAdd,
        reason: check.canAdd ? undefined : check.reason || '无法放下',
      });
    }
    if (source.kind !== 'warehouse') {
      options.push({
        target: { kind: 'warehouse' },
        available: true,
      });
    }
    return options;
  };

  // 拖拽逻辑 ====================

  const handleInventoryItemDragStart = (item: InventoryItem, e: React.DragEvent) => {
    // 从 dataTransfer 拿到角色 ID（由 inventory 写入）
    const charId = e.dataTransfer.getData('text/scavenge-source-char') || null;
    if (!charId) return;
    setDraggedItem({
      source: { kind: 'character', characterId: charId },
      item,
    });
  };

  const handleWarehouseItemDragStart = (item: InventoryItem, _e: React.DragEvent) => {
    setDraggedItem({
      source: { kind: 'warehouse' },
      item,
    });
  };

  const handleItemDragEnd = () => {
    setDraggedItem(null);
    setDragOverTarget(null);
  };

  // 角色卡片 drop（来自其他角色或仓库的物品）
  // 处理角色/仓库 drop：qty=1 直接转移，qty>1 弹数量选择器
  const handleDrop = (target: TransferTarget, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverTarget(null);
    if (!draggedItem) return;
    const { source, item } = draggedItem;
    // 同源不处理
    if (source.kind === 'character' && target.kind === 'character' && source.characterId === target.characterId) return;
    if (source.kind === 'warehouse' && target.kind === 'warehouse') return;
    setDraggedItem(null);

    if (item.quantity === 1) {
      // qty=1：直接转移
      executeTransfer(source, target, item, 1);
    } else {
      // qty>1：弹数量选择器（在松开位置）
      setDragQuantityDialog({
        source,
        item,
        target,
        quantity: 1,
        position: { x: e.clientX, y: e.clientY },
      });
    }
  };

  // 确认拖拽数量选择
  const confirmDragQuantity = () => {
    if (!dragQuantityDialog) return;
    const { source, item, target, quantity } = dragQuantityDialog;
    const success = executeTransfer(source, target, item, quantity);
    setDragQuantityDialog(null);
    if (success) {
      setActionQuantity(1);
    }
  };

  // 取消拖拽数量选择
  const cancelDragQuantity = () => {
    setDragQuantityDialog(null);
    setActionQuantity(1);
  };

  const handleCardDrop = (targetCharId: string) => (e: React.DragEvent) => {
    handleDrop({ kind: 'character', characterId: targetCharId }, e);
  };

  const handleCardDragOver = (targetCharId: string) => (e: React.DragEvent) => {
    if (draggedItem) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget(targetCharId);
    }
  };

  const handleCardDragLeave = () => {
    setDragOverTarget(null);
  };

  // 仓库 drop
  const handleWarehouseDrop = (e: React.DragEvent) => {
    handleDrop({ kind: 'warehouse' }, e);
  };

  const handleWarehouseDragOver = (e: React.DragEvent) => {
    if (draggedItem && draggedItem.source.kind === 'character') {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget('warehouse');
    }
  };

  // ==================== 工具函数 ====================

  const calcWeight = (items: (InventoryItem | null)[]): number => {
    return items.reduce((total, invItem) => {
      if (!invItem) return total;
      const item = getItemById(invItem.itemId);
      if (item) return total + item.weight * invItem.quantity;
      return total;
    }, 0);
  };

  const characters = getCharacters();
  const safeCharacters = characters.map(c => ({ ...c, inventory: c.inventory ?? [] }));
  const warehouseItems = getWarehouse();

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
              const isOver = dragOverTarget === charData.id;
              return (
                <div
                  key={charData.id}
                  className={`${styles.characterCard} ${isOver ? styles.cardDragOver : ''}`}
                  onDragOver={handleCardDragOver(charData.id)}
                  onDragLeave={handleCardDragLeave}
                  onDrop={handleCardDrop(charData.id)}
                >
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
                      characterId={charData.id}
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
                      onTransferRequest={handleTransferRequest}
                      onItemDragStart={handleInventoryItemDragStart}
                      onItemDragEnd={handleItemDragEnd}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部仓库（固定高度） */}
        <div
          className={styles.warehouseSection}
          onDragOver={handleWarehouseDragOver}
          onDragLeave={handleCardDragLeave}
          onDrop={handleWarehouseDrop}
        >
          <ScavengeWarehouse
            onClose={() => {}}
            embedded
            items={warehouseItems}
            onItemClick={handleWarehouseItemClick}
            onItemDragStart={handleWarehouseItemDragStart}
            onItemDragEnd={handleItemDragEnd}
            isDragOver={dragOverTarget === 'warehouse'}
          />
        </div>

        {/* 转移子菜单（菜单触发：显示在主菜单旁边） */}
        {transferSubmenu && (() => {
          const options = getTransferTargetOptions(transferSubmenu.source, transferSubmenu.item, transferSubmenu.quantity);
          // 计算子菜单位置：主菜单右侧 8px 间距，超出屏幕则左侧
          const MENU_WIDTH_ESTIMATE = 220;
          const left = transferSubmenu.position.x + MENU_WIDTH_ESTIMATE + 8;
          const finalLeft = left + 220 > window.innerWidth
            ? Math.max(8, transferSubmenu.position.x - 220 - 8)
            : left;
          return (
            <div
              className={styles.transferSubmenu}
              style={{ left: finalLeft, top: transferSubmenu.position.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.submenuHeader}>
                <Icon icon="material-symbols:swap-horiz" />
                <span>转移「{getItemName(transferSubmenu.item.itemId)}」</span>
                {transferSubmenu.quantity > 1 && (
                  <span className={styles.submenuQtyBadge}>x{transferSubmenu.quantity}</span>
                )}
              </div>
              <div className={styles.submenuTargets}>
                {options.map((opt) => {
                  const isChar = opt.target.kind === 'character';
                  const label = isChar
                    ? safeCharacters.find(c => c.id === (opt.target as any).characterId)?.name ?? '?'
                    : '仓库';
                  const icon = isChar ? 'material-symbols:person' : 'material-symbols:warehouse-outline';
                  return (
                    <button
                      key={isChar ? (opt.target as any).characterId : 'warehouse'}
                      className={`${styles.submenuTargetBtn} ${!opt.available ? styles.submenuTargetDisabled : ''}`}
                      disabled={!opt.available}
                      onClick={() => opt.available && handleSubmenuTargetClick(opt.target)}
                      title={opt.reason}
                    >
                      <Icon icon={icon} />
                      <span>{label}</span>
                      {!opt.available && <span className={styles.submenuUnavailable}>负重不足</span>}
                    </button>
                  );
                })}
              </div>
              <button className={styles.submenuCancelBtn} onClick={closeTransferSubmenu}>
                取消
              </button>
            </div>
          );
        })()}

        {/* 拖拽数量选择器（qty>1 时显示在松手位置） */}
        {dragQuantityDialog && (() => {
          const itemDef = getItemById(dragQuantityDialog.item.itemId);
          const w = itemDef?.weight ?? 0;
          return (
            <div
              className={styles.dragQuantityOverlay}
              style={{ left: dragQuantityDialog.position.x, top: dragQuantityDialog.position.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.dragQuantityDialog}>
                <div className={styles.dragQuantityItem}>
                  <Icon
                    icon={itemDef ? `material-symbols:${itemDef.icon?.split(':')[1] ?? 'checkroom'}` : 'material-symbols:checkroom'}
                    className={styles.dragQuantityIcon}
                  />
                  <span>{getItemName(dragQuantityDialog.item.itemId)}</span>
                  <span className={styles.dragQuantityTotal}>x{dragQuantityDialog.item.quantity}</span>
                </div>
                <div className={styles.dragQuantityControls}>
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: Math.max(1, dragQuantityDialog.quantity - 1),
                    })}
                  >-</button>
                  <input
                    type="number"
                    className={styles.quantityInput}
                    value={dragQuantityDialog.quantity}
                    min={1}
                    max={dragQuantityDialog.item.quantity}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      setDragQuantityDialog({
                        ...dragQuantityDialog,
                        quantity: Math.min(dragQuantityDialog.item.quantity, Math.max(1, v)),
                      });
                    }}
                  />
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: Math.min(dragQuantityDialog.item.quantity, dragQuantityDialog.quantity + 1),
                    })}
                  >+</button>
                  <button
                    className={styles.quantityMaxBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: dragQuantityDialog.item.quantity,
                    })}
                    disabled={dragQuantityDialog.quantity >= dragQuantityDialog.item.quantity}
                    title="设为最大"
                  >
                    MAX
                  </button>
                </div>
                <div className={styles.dragQuantitySlider}>
                  <input
                    type="range"
                    min={1}
                    max={dragQuantityDialog.item.quantity}
                    value={dragQuantityDialog.quantity}
                    onChange={(e) => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: parseInt(e.target.value),
                    })}
                  />
                </div>
                <div className={styles.dragQuantityWeight}>
                  重量：{(w * dragQuantityDialog.quantity).toFixed(1)}kg
                </div>
                <div className={styles.dragQuantityActions}>
                  <button className={styles.dragQtyCancelBtn} onClick={cancelDragQuantity}>
                    取消
                  </button>
                  <button className={styles.dragQtyConfirmBtn} onClick={confirmDragQuantity}>
                    确认转移
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 错误提示 toast */}
        {transferError && (
          <div className={styles.errorToast}>
            <Icon icon="material-symbols:error" />
            {transferError}
          </div>
        )}
      </div>
    </div>
  );
};
