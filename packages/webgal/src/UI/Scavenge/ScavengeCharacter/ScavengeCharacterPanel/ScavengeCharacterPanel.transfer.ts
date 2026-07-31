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
import { CHARACTER_TEMPLATES } from '../characterRoster';
import {
  getItemById, isEquipment, EquipmentItem,
} from '../../ScavengeItems/items';
import {
  InventoryItem, canAddToInventory, removeFromInventory, addToInventory,
  removeFromWarehouse, addToWarehouse, generateInstanceId,
} from '../../ScavengeItems/inventory';
import { getCharacters, updateCharacter, getWarehouse, setWarehouse } from './ScavengeCharacterPanel.stage';
import { TransferSource, TransferTarget, DraggedItemState } from './ScavengeCharacterPanel.types';
import { computeDisplayLevel, getAffinityLevelName } from '../affinityUtils';

// ============== 转移核心 ==============

/**
 * 检查：从其他角色背包拿出物品（to 玩家或仓库）的权限
 *
 * 2026-06-09 加：好感度门槛
 * - 与赠送门槛**镜像**：cheap 1 级，normal 2 级，precious 3 级
 *   （与赠送的 cheap 0 / normal 1 / precious 2 相反）
 * - 主角本身（player_1）拿自己的物品不受限
 * - 装备/使用（不走 executeTransfer）不受限
 */
const canTakeFromOtherCharacter = (
  charId: string,
  itemAffinityValue: string | undefined,
): boolean => {
  if (charId === 'player_1') return true;  // 主角
  if (!itemAffinityValue) return true;  // 没有 affinityValue 标记的物品不受限（如任务物品）
  const chars = getCharacters();
  const char = chars.find(c => c.id === charId);
  if (!char) return false;
  // 镜像门槛：cheap 1, normal 2, precious 3
  const level = computeDisplayLevel(char);
  const requiredLevel: Record<string, number> = { cheap: 1, normal: 2, precious: 3 };
  const required = requiredLevel[itemAffinityValue];
  if (required === undefined) return true;  // 未知档次，不限
  return level >= required;
};

/**
 * 限制检查（2026-06-09 加：Plan 3 重构 / 2026-06-21 改：customWarehouseRef 豁免）
 * 检查 source / target 是否符合 restrictTransfer + partyCharacterIds
 *
 * 2026-06-21 改：
 *   - customWarehouseRef 存在时（队伍背包），**不**触发"派遣中不能..."的拦截
 *   - 因为队伍背包的语义就是"分配"，不是永久仓库
 *   - 永久仓库（无 customWarehouseRef）依然受 restrictTransfer 限制
 *
 * @returns true = 通过，false = 触发限制（应阻止）
 */
export const checkTransferRestriction = (
  source: TransferSource,
  target: TransferTarget,
  restrictTransfer: boolean,
  partyCharacterIds: string[],
  showTransferError?: (msg: string) => void,
  hasCustomWarehouse: boolean = false,  // 2026-06-21 加：true = 队伍背包，不拦截
): boolean => {
  if (!restrictTransfer) return true;

  // 限制规则：
  // - source 必须是队内（除非是 customWarehouseRef 队伍背包，那分配就是它的用途）
  // - target 必须是队内
  // 也就是：所有转移**只能**在队内角色之间进行（+ 队伍背包）
  const inParty = (id: string) => partyCharacterIds.includes(id);

  // 2026-06-21 改：customWarehouseRef 存在时，warehouse source/target 不拦截
  //   - 队伍背包 → 角色：分配（允许）
  //   - 角色 → 队伍背包：退回（允许）
  //   - 永久仓库 → 角色：仍然拦截（restrictTransfer 阻止）
  if (source.kind === 'warehouse' && !hasCustomWarehouse) {
    if (showTransferError) {
      showTransferError('派遣中不能从仓库转移物品');
    }
    return false;
  }
  if (target.kind === 'warehouse' && !hasCustomWarehouse) {
    if (showTransferError) {
      showTransferError('派遣中不能转移到仓库');
    }
    return false;
  }
  if (source.kind === 'character' && !inParty(source.characterId)) {
    if (showTransferError) {
      const chars = getCharacters();
      const name = chars.find(c => c.id === source.characterId)?.name ?? '?';
      showTransferError(`${name} 不在拾荒队伍中，不能作为转移源`);
    }
    return false;
  }
  if (target.kind === 'character' && !inParty(target.characterId)) {
    if (showTransferError) {
      const chars = getCharacters();
      const name = chars.find(c => c.id === target.characterId)?.name ?? '?';
      showTransferError(`${name} 不在拾荒队伍中，不能作为转移目标`);
    }
    return false;
  }
  return true;
};

/** 统一执行转移（角色 ↔ 角色 / 角色 ↔ 仓库） */
export const executeTransfer = (
  source: TransferSource,
  target: TransferTarget,
  item: InventoryItem,
  quantity: number,
  refresh: () => void,
  showTransferError: (msg: string) => void,
  // 2026-06-09 加：限制参数（Plan 3 重构）
  //   - restrictTransfer=true + partyCharacterIds=[...] → 限制
  //   - 默认 false / [] = 不限
  // 2026-06-21 加：customWarehouseRef（战利品分配 modal 用）
  //   - 不传：用 getWarehouse/setWarehouse（永久仓库）
  //   - 传了：用 ref.items / ref.commit（不碰永久仓库）
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: {
      items: InventoryItem[];
      commit: (newItems: InventoryItem[]) => void;
    };
  } = {},
): boolean => {
  // 2026-06-09 改：先做限制检查（防止 UI 漏过滤）
  // 2026-06-21 改：customWarehouseRef 存在时豁免"派遣中不能从仓库..."的拦截
  if (!checkTransferRestriction(
    source, target,
    options.restrictTransfer ?? false,
    options.partyCharacterIds ?? [],
    showTransferError,
    options.customWarehouseRef !== undefined,
  )) {
    return false;
  }

  if (quantity <= 0 || quantity > item.quantity) return false;
  if (source.kind === 'character' && target.kind === 'character' && source.characterId === target.characterId) return false;
  if (source.kind === 'warehouse' && target.kind === 'warehouse') return false;

  // 2026-06-09 加：从其他角色背包拿出物品（目标不是该角色时）的权限检查
  // 拿物品的目标是：玩家自己 / 仓库 / 其他角色
  // 不包括：装备/使用（不走这里）
  const allChars = getCharacters();
  if (source.kind === 'character' && source.characterId !== 'player_1') {
    // 拿出方不是玩家自己 → 检查好感度
    const itemDef = getItemById(item.itemId);
    if (!canTakeFromOtherCharacter(source.characterId, itemDef?.affinityValue)) {
      const sourceName = allChars.find(c => c.id === source.characterId)?.name ?? '?';
      const requiredLevelName = ({ cheap: '熟悉', normal: '亲密', precious: '挚友' } as any)[itemDef?.affinityValue ?? ''] ?? '更高';
      const sourceChar = allChars.find(c => c.id === source.characterId);
      const currentLevelName = sourceChar ? getAffinityLevelName(computeDisplayLevel(sourceChar)) : '?';
      showTransferError(
        `从 ${sourceName} 拿取 ${itemDef?.name ?? item.itemId} 需要 ${requiredLevelName}以上好感度（当前是 ${currentLevelName}）`,
      );
      return false;
    }
  }

  // 目标侧容量预检（只对角色背包有意义，仓库永远能放）
  // 2026-06-09 改：商人（faction='neutral' + isMerchant=true）忽略负重检查
  //   商人有"无限货架"概念，库存不应该受 30kg 限制
  if (target.kind === 'character') {
    const chars = getCharacters();
    const char = chars.find(c => c.id === target.characterId);
    if (!char) return false;
    const nonNullInv = (char.inventory ?? []).filter((i): i is InventoryItem => i !== null);
    // 判断目标是否是商人（中立 + isMerchant）→ 跳过重量检查
    const targetTemplate = CHARACTER_TEMPLATES[char.id];
    const isMerchant = targetTemplate?.isMerchant === true
      || (targetTemplate?.faction ?? 'ally') === 'neutral';
    const check = canAddToInventory(nonNullInv, { ...item, quantity }, isMerchant);
    if (!check.canAdd || check.accepted < quantity) {
      showTransferError(check.reason || '目标无法放下该物品');
      return false;
    }
  }

  // 2026-06-21 加：自定义仓库支持（战利品分配 modal）
  //   - 有 customWarehouseRef → 走 ref.items/ref.commit
  //   - 没传 → 走 getWarehouse/setWarehouse（永久仓库）
  const whRef = options.customWarehouseRef;
  const readWh = (): InventoryItem[] => whRef ? whRef.items : getWarehouse();
  const writeWh = (items: InventoryItem[]): void => {
    if (whRef) whRef.commit(items);
    else setWarehouse(items);
  };

  // 从源移除（按 instanceId 精确寻址）
  if (source.kind === 'character') {
    const characters = getCharacters();
    const char = characters.find(c => c.id === source.characterId);
    if (!char) return false;
    const updated: ScavengeCharacter = { ...char, inventory: [...(char.inventory ?? [])] };
    updated.inventory = removeFromInventory(updated.inventory, item.instanceId, quantity);
    updateCharacter(updated);
  } else {
    const warehouseItems = readWh();
    const newWarehouse = removeFromWarehouse(warehouseItems, item.instanceId, quantity);
    writeWh(newWarehouse);
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
    const warehouseItems = readWh();
    const newWarehouse = addToWarehouse(warehouseItems, moveItem);
    writeWh(newWarehouse);
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
  // 2026-06-09 加：限制参数（Plan 3 重构）
  //   - restrictTransfer=true：派遣中
  //   - 派遣中只允许**队内**角色打开 submenu（不能从非队内角色点"转移"）
  //   - 仓库方向单独处理（handleWarehouseItemClick）
  options: { restrictTransfer?: boolean; partyCharacterIds?: string[]; showTransferError?: (msg: string) => void } = {},
) => {
  if (!selectedItem) return;

  // 2026-06-09 加：派遣中检查（source 必须是队内）
  if (options.restrictTransfer) {
    const partyIds = options.partyCharacterIds ?? [];
    if (!partyIds.includes(selectedItem.charId)) {
      const chars = getCharacters();
      const name = chars.find(c => c.id === selectedItem.charId)?.name ?? '?';
      if (options.showTransferError) {
        options.showTransferError(`${name} 不在拾荒队伍中，不能转移物品`);
      }
      return;  // 不开 submenu
    }
  }

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
  // 2026-06-09 加：限制参数
  // 2026-06-21 加：hasCustomWarehouse 字段（true = 队伍背包，不拦截）
  options: {
    restrictTransfer?: boolean;
    showTransferError?: (msg: string) => void;
    hasCustomWarehouse?: boolean;
  } = {},
) => {
  e.stopPropagation();
  closeItemMenu();

  // 2026-06-09 加：派遣中**禁**仓库 → 角色（流程图规定）
  // 2026-06-21 改：customWarehouseRef 存在时豁免（队伍背包 = "分配"用途）
  if (options.restrictTransfer && !options.hasCustomWarehouse) {
    if (options.showTransferError) {
      options.showTransferError('派遣中不能从仓库转移物品');
    }
    return;  // 不开 submenu
  }

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
  // 2026-06-09 加：限制参数（Plan 3 重构）
  // 2026-06-21 加：customWarehouseRef 透传
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: { items: InventoryItem[]; commit: (newItems: InventoryItem[]) => void };
  } = {},
) => {
  if (!transferSubmenu) return;
  const { source, item, quantity } = transferSubmenu;
  // 2026-06-09 改：传限制参数
  // 2026-06-21 改：customWarehouseRef 透传
  executeTransferFn(source, target, item, quantity, refresh, showTransferError, {
    restrictTransfer: options.restrictTransfer,
    partyCharacterIds: options.partyCharacterIds,
    customWarehouseRef: options.customWarehouseRef,
  });
  setTransferSubmenu(null);
};

/** 关闭转移子菜单 */
export const closeTransferSubmenu = (setTransferSubmenu: (s: any) => void) => {
  setTransferSubmenu(null);
};

/** 列出所有可转移目标（含容量检查状态）
 * 2026-06-21 加：过滤商人（faction='neutral' + isMerchant=true）
 *   - 商人有独立交易入口（market room），不通过 transfer submenu 转移
 *   - 之前 bug：所有角色（含商人）都进 submenu，导致 label 显示 "?"
 */
export const getTransferTargetOptions = (
  source: TransferSource,
  item: InventoryItem,
  quantity: number,
) => {
  const options: Array<{ target: TransferTarget; available: boolean; reason?: string }> = [];
  const characters = getCharacters();
  for (const char of characters) {
    if (source.kind === 'character' && char.id === source.characterId) continue;
    // 2026-06-21 加：过滤商人（不进 submenu）
    const template = CHARACTER_TEMPLATES[char.id];
    if (template?.isMerchant) continue;
    if ((template?.faction ?? 'ally') === 'neutral') continue;
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
  // 2026-06-09 加：限制参数
  // 2026-06-21 加：customWarehouseRef 透传（用于"派遣中"豁免）
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: { items: InventoryItem[]; commit: (newItems: InventoryItem[]) => void };
  } = {},
) => {
  e.preventDefault();
  setDragOverTarget(null);
  if (!draggedItem) return;
  const { source, item } = draggedItem;
  if (source.kind === 'character' && target.kind === 'character' && source.characterId === target.characterId) return;
  if (source.kind === 'warehouse' && target.kind === 'warehouse') return;
  setDraggedItem(null);

  // 2026-06-09 加：拖拽源限制检查（防止 UI 漏过滤）
  // 2026-06-21 改：customWarehouseRef 存在时豁免
  if (!checkTransferRestriction(
    source, target,
    options.restrictTransfer ?? false,
    options.partyCharacterIds ?? [],
    showTransferError,
    options.customWarehouseRef !== undefined,
  )) {
    return;
  }

  if (item.quantity === 1) {
    executeTransferFn(source, target, item, 1, refresh, showTransferError, options);
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
  // 2026-06-09 加：限制参数
  // 2026-06-21 加：customWarehouseRef 透传（用于"派遣中"豁免）
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: { items: InventoryItem[]; commit: (newItems: InventoryItem[]) => void };
  } = {},
) => {
  if (!dragQuantityDialog) return;
  const { source, item, target, quantity } = dragQuantityDialog;
  const success = executeTransferFn(source, target, item, quantity, refresh, showTransferError, options);
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
  // 2026-06-09 加：限制参数
  // 2026-06-21 加：customWarehouseRef 透传（用于"派遣中"豁免）
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: { items: InventoryItem[]; commit: (newItems: InventoryItem[]) => void };
  } = {},
) => {
  handleDrop(
    { kind: 'character', characterId: targetCharId },
    e,
    draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog,
    executeTransferFn, refresh, showTransferError,
    options,  // 2026-06-09 加：传限制
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
  // 2026-06-09 加：限制参数（拖到仓库也需要检查）
  // 2026-06-21 加：customWarehouseRef 透传（用于"派遣中"豁免）
  options: {
    restrictTransfer?: boolean;
    partyCharacterIds?: string[];
    customWarehouseRef?: { items: InventoryItem[]; commit: (newItems: InventoryItem[]) => void };
  } = {},
) => {
  handleDrop(
    { kind: 'warehouse' },
    e,
    draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog,
    executeTransferFn, refresh, showTransferError,
    options,  // 2026-06-09 加：传限制
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
