/**
 * Scavenge 角色面板 - 转移 + 拖拽逻辑（2026-06-09 拆分）
 *
 * 包含：
 * - executeTransfer: 角色/仓库 之间的物品转移
 * - handleTransferRequest: 菜单触发转移（弹子菜单）
 * - 拖拽逻辑（start / drop / over / leave / quantity dialog）
 * - calcWeight: 累加 inventory + equipped 负重
 *
 * 注：依赖 stage.ts 的数据读写 + actions.ts 的辅助函数 + UI state setters（由主组件传入）
 */

import { ScavengeCharacter } from '../character';
import {
  getItemById, isEquipment, EquipmentItem,
} from '../../ScavengeItems/items';
import {
  InventoryItem, canAddToInventory, removeFromInventory, addToInventory,
  removeFromWarehouse, addToWarehouse, generateInstanceId,
} from '../../ScavengeItems/inventory';
import { getCharacters, updateCharacter, getWarehouse, setWarehouse } from './ScavengeCharacterPanel.stage';
import { TransferSource, TransferTarget, DraggedItemState } from './ScavengeCharacterPanel.types';

// ============== 转移核心 ==============

/** 统一执行转移（角色 ↔ 角色 / 角色 ↔ 仓库） */
export const executeTransfer = (
  source: TransferSource,
  target: TransferTarget,
  item: InventoryItem,
  quantity: number,
  refresh: () => void,
  showTransferError: (msg: string) => void,
): boolean => {
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

// ============== 子菜单 ==============

/** 菜单触发转移：打开子菜单（不关主菜单，在旁边显示目标） */
export const handleTransferRequest = (
  item: InventoryItem,
  selectedItem: { charId: string; item: InventoryItem } | null,
  actionQuantity: number,
  menuPosition: { x: number; y: number },
  setTransferSubmenu: (s: any) => void,
) => {
  if (!selectedItem) return;
  setTransferSubmenu({
    source: { kind: 'character', characterId: selectedItem.charId },
    item,
    quantity: actionQuantity,
    position: menuPosition,
  });
};

/** 仓库点击物品：打开子菜单（关掉可能开的菜单） */
export const handleWarehouseItemClick = (
  item: InventoryItem,
  e: React.MouseEvent,
  closeItemMenu: () => void,
  setTransferSubmenu: (s: any) => void,
) => {
  e.stopPropagation();
  closeItemMenu();
  setTransferSubmenu({
    source: { kind: 'warehouse' },
    item,
    quantity: 1,
    position: { x: e.clientX, y: e.clientY },
  });
};

/** 子菜单点击目标 */
export const handleSubmenuTargetClick = (
  target: TransferTarget,
  transferSubmenu: { source: TransferSource; item: InventoryItem; quantity: number; position: { x: number; y: number } } | null,
  executeTransferFn: typeof executeTransfer,
  setTransferSubmenu: (s: any) => void,
  refresh: () => void,
  showTransferError: (msg: string) => void,
) => {
  if (!transferSubmenu) return;
  const { source, item, quantity } = transferSubmenu;
  executeTransferFn(source, target, item, quantity, refresh, showTransferError);
  setTransferSubmenu(null);
};

/** 关闭转移子菜单 */
export const closeTransferSubmenu = (setTransferSubmenu: (s: any) => void) => {
  setTransferSubmenu(null);
};

/** 列出所有可转移目标（含容量检查状态） */
export const getTransferTargetOptions = (
  source: TransferSource,
  item: InventoryItem,
  quantity: number,
  safeCharacters: ScavengeCharacter[],
) => {
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

// ============== 拖拽逻辑 ==============

/** 角色背包开始拖（从 dataTransfer 拿源 charId） */
export const handleInventoryItemDragStart = (
  item: InventoryItem,
  e: React.DragEvent,
  setDraggedItem: (s: DraggedItemState | null) => void,
) => {
  const charId = e.dataTransfer.getData('text/scavenge-source-char') || null;
  if (!charId) return;
  setDraggedItem({
    source: { kind: 'character', characterId: charId },
    item,
  });
};

/** 仓库物品开始拖 */
export const handleWarehouseItemDragStart = (
  item: InventoryItem,
  _e: React.DragEvent,
  setDraggedItem: (s: DraggedItemState | null) => void,
) => {
  setDraggedItem({
    source: { kind: 'warehouse' },
    item,
  });
};

/** 拖拽结束清理 */
export const handleItemDragEnd = (
  setDraggedItem: (s: DraggedItemState | null) => void,
  setDragOverTarget: (s: string | null) => void,
) => {
  setDraggedItem(null);
  setDragOverTarget(null);
};

/** drop 处理（角色/仓库）：qty=1 直接转移，qty>1 弹数量选择器 */
export const handleDrop = (
  target: TransferTarget,
  e: React.DragEvent,
  draggedItem: DraggedItemState | null,
  setDraggedItem: (s: DraggedItemState | null) => void,
  setDragOverTarget: (s: string | null) => void,
  setDragQuantityDialog: (s: any) => void,
  executeTransferFn: typeof executeTransfer,
  refresh: () => void,
  showTransferError: (msg: string) => void,
) => {
  e.preventDefault();
  setDragOverTarget(null);
  if (!draggedItem) return;
  const { source, item } = draggedItem;
  if (source.kind === 'character' && target.kind === 'character' && source.characterId === target.characterId) return;
  if (source.kind === 'warehouse' && target.kind === 'warehouse') return;
  setDraggedItem(null);

  if (item.quantity === 1) {
    executeTransferFn(source, target, item, 1, refresh, showTransferError);
  } else {
    setDragQuantityDialog({
      source,
      item,
      target,
      quantity: 1,
      position: { x: e.clientX, y: e.clientY },
    });
  }
};

/** 确认拖拽数量选择 */
export const confirmDragQuantity = (
  dragQuantityDialog: { source: TransferSource; item: InventoryItem; target: TransferTarget; quantity: number; position: { x: number; y: number } } | null,
  setDragQuantityDialog: (s: any) => void,
  setActionQuantity: (n: number) => void,
  executeTransferFn: typeof executeTransfer,
  refresh: () => void,
  showTransferError: (msg: string) => void,
) => {
  if (!dragQuantityDialog) return;
  const { source, item, target, quantity } = dragQuantityDialog;
  const success = executeTransferFn(source, target, item, quantity, refresh, showTransferError);
  setDragQuantityDialog(null);
  if (success) {
    setActionQuantity(1);
  }
};

/** 取消拖拽数量选择 */
export const cancelDragQuantity = (
  setDragQuantityDialog: (s: any) => void,
  setActionQuantity: (n: number) => void,
) => {
  setDragQuantityDialog(null);
  setActionQuantity(1);
};

/** 角色卡片 drop handler（包装） */
export const handleCardDrop = (
  targetCharId: string,
  e: React.DragEvent,
  draggedItem: DraggedItemState | null,
  setDraggedItem: (s: DraggedItemState | null) => void,
  setDragOverTarget: (s: string | null) => void,
  setDragQuantityDialog: (s: any) => void,
  executeTransferFn: typeof executeTransfer,
  refresh: () => void,
  showTransferError: (msg: string) => void,
) => {
  handleDrop(
    { kind: 'character', characterId: targetCharId },
    e,
    draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog,
    executeTransferFn, refresh, showTransferError,
  );
};

/** 角色卡片 drag over（设置 dragOverTarget） */
export const handleCardDragOver = (
  targetCharId: string,
  e: React.DragEvent,
  draggedItem: DraggedItemState | null,
  setDragOverTarget: (s: string | null) => void,
) => {
  if (draggedItem) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(targetCharId);
  }
};

/** 角色卡片 drag leave */
export const handleCardDragLeave = (
  setDragOverTarget: (s: string | null) => void,
) => {
  setDragOverTarget(null);
};

/** 仓库 drop handler */
export const handleWarehouseDrop = (
  e: React.DragEvent,
  draggedItem: DraggedItemState | null,
  setDraggedItem: (s: DraggedItemState | null) => void,
  setDragOverTarget: (s: string | null) => void,
  setDragQuantityDialog: (s: any) => void,
  executeTransferFn: typeof executeTransfer,
  refresh: () => void,
  showTransferError: (msg: string) => void,
) => {
  handleDrop(
    { kind: 'warehouse' },
    e,
    draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog,
    executeTransferFn, refresh, showTransferError,
  );
};

/** 仓库 drag over */
export const handleWarehouseDragOver = (
  e: React.DragEvent,
  draggedItem: DraggedItemState | null,
  setDragOverTarget: (s: string | null) => void,
) => {
  if (draggedItem && draggedItem.source.kind === 'character') {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget('warehouse');
  }
};

// ============== 负重计算 ==============

/** 8 个装备槽（weapon + 6 护甲 + tool） */
export const EQUIP_SLOT_KEYS = ['weapon', 'helmet', 'chest', 'arms', 'gloves', 'legs', 'boots', 'tool'] as const;

/**
 * 计算角色总负重（2026-06-09 改：inventory + equipped 累加）
 * 装备 instance 在 char.equipped 里（不在 inventory），单独累加
 */
export const calcWeight = (charData: ScavengeCharacter): number => {
  let total = 0;
  // 1. 背包里的物品
  for (const invItem of charData.inventory ?? []) {
    if (!invItem) continue;
    const def = getItemById(invItem.itemId);
    if (def) total += def.weight * invItem.quantity;
  }
  // 2. 装备栏的装备（单件，quantity=1）
  for (const slotKey of EQUIP_SLOT_KEYS) {
    const instance = charData.equipped?.[slotKey];
    if (!instance) continue;
    const def = getItemById(instance.itemId);
    if (def) total += def.weight;
  }
  return total;
};
