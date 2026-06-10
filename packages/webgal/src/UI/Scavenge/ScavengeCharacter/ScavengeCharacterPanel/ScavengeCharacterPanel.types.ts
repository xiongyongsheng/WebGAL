/**
 * Scavenge 角色面板 - 共享类型（2026-06-09 拆分）
 *
 * 包含：
 * - 物品菜单/转移菜单的状态类型
 * - 转移 source/target 描述
 * - 拖拽状态类型
 */

import { InventoryItem } from '../../ScavengeItems/inventory';

/** 物品菜单状态（哪个物品、哪个角色、菜单位置） */
export interface ItemMenuState {
  charId: string;
  item: InventoryItem;
}

/** 转移源：某个角色 或 仓库 */
export type TransferSource =
  | { kind: 'character'; characterId: string }
  | { kind: 'warehouse' };

/** 转移目标：某个角色 或 仓库 */
export type TransferTarget =
  | { kind: 'character'; characterId: string }
  | { kind: 'warehouse' };

/** 转移子菜单状态（菜单点击"转移"后弹出，列出可转移目标） */
export interface TransferSubmenuState {
  source: TransferSource;
  item: InventoryItem;
  quantity: number;
  position: { x: number; y: number };
}

/** 拖拽时数量选择对话框（拖 qty>1 的物品时，松开弹出选择器） */
export interface DragQuantityDialogState {
  source: TransferSource;
  item: InventoryItem;
  target: TransferTarget;
  quantity: number;
  position: { x: number; y: number };
}

/** 拖拽状态（当前正在拖的物品 + 来源） */
export interface DraggedItemState {
  source: TransferSource;
  item: InventoryItem;
}

/** 仓库未知物品警告去重（同一 ID 只 warn 一次，2026-06-07 加） */
export const _warnedUnknownWarehouseIds: Set<string> = new Set();
