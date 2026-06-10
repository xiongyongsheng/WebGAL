/**
 * Scavenge 模块 - 角色面板
 *
 * 全屏弹框布局：
 * - 顶部：横向滚动的角色详情卡片（每个卡片一个角色）
 * - 底部：固定高度的仓库区域
 * - 直接在面板内完成所有操作（无需再嵌套弹框）
 * - 支持背包/仓库/角色之间的物品转移（菜单 + 拖拽）
 */
import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter, normalizeCharacter, getCharacterStatusText, EquipSlotKey } from '../character';
import {
  getItemName, getItemById, isEquipment, isConsumable, getEquipmentSlot,
  getArmorSlot, ConsumableItem, EquipmentItem, ArmorSlot,
} from '../../ScavengeItems/items';
import {
  InventoryItem, MAX_CARRY_WEIGHT, addToInventory, removeFromInventory,
  compactInventorySlots, replaceInventoryItemAt,
  addToWarehouse, removeFromWarehouse,
  generateInstanceId, migrateInventory, canAddToInventory,
  filterUnknownItems,
} from '../../ScavengeItems/inventory';
import { applyPendingStatPoints } from '../characterExperience';
import { ScavengeCharacterHeader } from '../ScavengeCharacterHeader/ScavengeCharacterHeader';
import { ScavengeCharacterStatus } from '../ScavengeCharacterStatus/ScavengeCharacterStatus';
import { ScavengeCharacterAttributes } from '../ScavengeCharacterAttributes/ScavengeCharacterAttributes';
import { ScavengeCharacterEquip } from '../ScavengeCharacterEquip/ScavengeCharacterEquip';
import { ItemTooltip, ItemTooltipData } from '../../ScavengeItems/ItemTooltip';
import { ScavengeCharacterInventory } from '../ScavengeCharacterInventory/ScavengeCharacterInventory';
import { ScavengeWarehouse } from '../../ScavengeWarehouse/ScavengeWarehouse';
import { logger } from '@/Core/util/logger';
import styles from './ScavengeCharacterPanel.module.scss';

interface ScavengeCharacterPanelProps {
  onClose: () => void;
}

// 2026-06-07：仓库未知物品警告去重（同一 ID 只 warn 一次）
const _warnedUnknownWarehouseIds = new Set<string>();
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
  // 订阅 stageState 变化：外部模块（如 ScavengeTimeControl 时间推进）改 GameVar 时自动重渲染
  // 内部修改仍然走 refresh()（forceUpdate）
  useStageState();
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

  // 2026-06-07：hover tooltip 共享 state
  const [hoveredItem, setHoveredItem] = useState<ItemTooltipData | null>(null);
  // 2026-06-08 修：mounted ref 防止"已卸载组件 setState"警告
  // 原因：用户在 panel 上快速移动鼠标时，DOM 元素可能在 mouse 事件
  // 还在队列中时被卸载，handler 仍调用 setHoveredItem → 内存泄漏警告
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  /**
   * 给一个物品生成 hover 事件处理器集合（onMouseEnter/Move/Leave）
   * 共享 panel 的 hoveredItem state，保证同一时间只显示一个 tooltip
   */
  const makeItemHoverProps = (
    itemId: string,
    instance?: InventoryItem,
    charForReq?: Pick<ScavengeCharacter, 'str' | 'agi' | 'end' | 'int'>,
  ) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      if (!isMountedRef.current) return;
      setHoveredItem({ itemId, instance, x: e.clientX, y: e.clientY, charForReq });
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!isMountedRef.current) return;
      setHoveredItem((prev) =>
        prev && prev.itemId === itemId ? { ...prev, x: e.clientX, y: e.clientY } : prev,
      );
    },
    onMouseLeave: () => {
      if (!isMountedRef.current) return;
      setHoveredItem((prev) => (prev && prev.itemId === itemId ? null : prev));
    },
  });

  // ==================== 数据读写 ====================

  const getCharacters = (): ScavengeCharacter[] => {
    const data = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          return parsed.map(c => normalizeCharacter(c as ScavengeCharacter));
        }
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
      const migrated = migrateInventory(valid);
      // 2026-06-07：清理未注册物品（同背包逻辑），避免 UI 显示"未知物品"
      const { valid: knownItems, removed } = filterUnknownItems(migrated);
      if (removed.length > 0) {
        // 只 warn 第一次见到的新 ID（避免 React 重渲染刷屏）
        const newUnknown = removed.filter((id) => !_warnedUnknownWarehouseIds.has(id));
        newUnknown.forEach((id) => _warnedUnknownWarehouseIds.add(id));
        if (newUnknown.length > 0) {
          logger.warn(
            `[Scavenge] 仓库自动清理了 ${newUnknown.length} 件未注册物品：` +
            newUnknown.map((id) => `'${id}'`).join(', ') +
            `\n→ 如果这些物品应该保留，请在 items.ts 中补全对应 ID。`,
          );
        }
        // 立即写回 GameVar，避免每次启动都 warn
        setWarehouse(knownItems);
      }
      return knownItems;
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

  const getFinalAttr = (charData: ScavengeCharacter, attr: 'str' | 'agi' | 'end' | 'int'): number => {
    return charData[attr] + calculateEquipBonus(charData, attr);
  };

  // 2026-06-09 改：HP 系数 ×5 → ×8（配合 30 级封顶 + 升级 +2/+2）
  const getMaxHp = (charData: ScavengeCharacter): number => {
    const endBonus = getFinalAttr(charData, 'end');
    return charData.maxHp + (endBonus - 5) * 8;
  };

  // 2026-06-09 改：负重系数 ×3 → ×5（配合 30 级封顶 + 升级 +2/+2）
  const getMaxCarryWeight = (charData: ScavengeCharacter): number => {
    const totalEnd = charData.end + calculateEquipBonus(charData, 'end');
    return MAX_CARRY_WEIGHT + (totalEnd - 5) * 5;
  };

  // 饥/渴上限固定 100（生理上限，不随 end / 装备变化）
  // 2026-06-05 与产品确认
  const getMaxHungerThirst = (charData: ScavengeCharacter): number => {
    return charData.maxHunger;
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

  // 每个角色独立的 filter tab 状态（默认 'all'）
  const [filtersByChar, setFiltersByChar] = useState<Record<string, 'all' | 'consumable' | 'equipment' | 'material' | 'quest'>>({});

  const handleFilterChange = (charId: string, filter: 'all' | 'consumable' | 'equipment' | 'material' | 'quest') => {
    setFiltersByChar(prev => ({ ...prev, [charId]: filter }));
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

  const handleUnequipItem = (charId: string, slot: 'weapon' | 'tool' | ArmorSlot) => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    // 2026-06-07 改：装备 instance 在 `equipped[slot]`，卸下时移到 inventory
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

  const handleEquipItem = (charId: string, invItem: InventoryItem) => {
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

    // 2026-06-07 改：装备 instance 从 inventory 移到 equipped[slotKey]
    // （不在 inventory 留副本，所以装备后背包里看不到）
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

  /**
   * 玩家点"保存加点"时：把 Attributes 组件的暂存批量写入角色数据。
   * statPoints -= total；对应属性 += pending[stat]。
   * 注：end 改变后，maxStamina / maxHp 会在下次 period effect 同步重算。
   */
  const handleApplyPending = (
    charId: string,
    pending: { str: number; agi: number; end: number; int: number },
  ) => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    const updated = applyPendingStatPoints(char, pending);
    updateCharacter(updated);
    refresh();
  };

  /**
   * 切换拾荒策略（stealth/combat）
   */
  const handleChangeStrategy = (charId: string, strategy: 'stealth' | 'combat') => {
    const characters = getCharacters();
    const char = characters.find(c => c.id === charId);
    if (!char || char.strategy === strategy) return;
    const updated = { ...char, strategy };
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

  // 2026-06-09 改：calcWeight 接受 charData，同时累加 inventory + equipped 的负重
  // 装备 instance 在 char.equipped 里（不在 inventory），所以要单独累加
  // 8 个装备槽（weapon + 6 护甲 + tool）
  const EQUIP_SLOT_KEYS = ['weapon', 'helmet', 'chest', 'arms', 'gloves', 'legs', 'boots', 'tool'] as const;

  const calcWeight = (charData: ScavengeCharacter): number => {
    let total = 0;
    // 1. 背包里的物品
    for (const invItem of charData.inventory ?? []) {
      if (!invItem) continue;
      const def = getItemById(invItem.itemId);
      if (def) total += def.weight * invItem.quantity;
    }
    // 2. 装备栏的装备（2026-06-09 改：也算负重）
    // 装备 instance 是单件（quantity=1），直接用 def.weight
    for (const slotKey of EQUIP_SLOT_KEYS) {
      const instance = charData.equipped?.[slotKey];
      if (!instance) continue;
      const def = getItemById(instance.itemId);
      if (def) total += def.weight;
    }
    return total;
  };

  const characters = getCharacters();
  // 2026-06-09 改：跑 normalizeCharacter（装备迁移：inventory → equipped + 数据验证）
  // 之前用 `({ ...c, inventory: c.inventory ?? [] })` 跳过了 normalizeCharacter
  // 导致 equipped 字段始终是空 → armorTotal = 0（bug，露西 3 件护甲却显示 0）
  const safeCharacters = characters.map(c => normalizeCharacter(c));
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
              // 2026-06-09 改：传 charData（含 equipped）
              const totalWeight = calcWeight(charData);
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
                      onApplyPending={(pending) => handleApplyPending(charData.id, pending)}
                      onChangeStrategy={(s) => handleChangeStrategy(charData.id, s)}
                    />
                    <ScavengeCharacterEquip
                      charData={charData}
                      onUnequip={(slot) => handleUnequipItem(charData.id, slot)}
                      makeItemHoverProps={makeItemHoverProps}
                    />
                    <ScavengeCharacterInventory
                      characterId={charData.id}
                      inventory={inventory}
                      totalWeight={totalWeight}
                      maxWeight={maxWeight}
                      onItemClick={(item, e) => handleItemClick(charData.id, item, e)}
                      itemFilter={filtersByChar[charData.id] ?? 'all'}
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
                      makeItemHoverProps={makeItemHoverProps}
                      charForReq={charData}
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
            makeItemHoverProps={makeItemHoverProps}
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

      {/* 物品详情 tooltip（hover 触发，portal 渲染到 body） */}
      {hoveredItem && <ItemTooltip data={hoveredItem} />}
    </div>
  );
};
