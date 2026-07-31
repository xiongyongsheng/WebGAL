/**
 * 建造系统 - 类型定义（2026-06-21 加）
 *
 * 3 大子系统：
 * 1. 工作台（workbench）- 在安全屋/厨房建造 + 制作物品
 * 2. 制作（crafting）- 角色在工作台工作，消耗时间+材料产出物品
 * 3. 门窗修补（repair）- 角色在安全屋修补门窗，消耗时间+木板
 *
 * 共同特点：
 * - 时间推进（character.missionPhase = 'crafting' | 'repairing'）
 * - 角色单线程（一个角色同时只能做 1 件事）
 * - 完成后由 CharacterSystem 在下一次 advance 时统一结算
 */

import { InventoryItem } from '../ScavengeItems/inventory';

// ============== 工作台类型 ==============

/** 工作台类型 */
export type WorkbenchType = 'melee' | 'armor' | 'cooking';

/** 工作台位置 */
export type WorkbenchLocation = 'safehouse' | 'kitchen';

/** 制作中的工作（单队列） */
export interface CraftJob {
  /** 蓝图 ID（WorkbenchBlueprint 或 CraftBlueprint） */
  blueprintId: string;
  /** 制作人角色 ID */
  crafterCharId: string;
  /** 开始时间 */
  startDay: number;
  startPeriod: number;
  /** 结束时间 */
  endDay: number;
  endPeriod: number;
  /** 蓝图类型（用于完成时调用不同 action）*/
  blueprintKind: 'workbench' | 'item';
}

/** 工作台 */
export interface Workbench {
  id: string;
  type: WorkbenchType;
  name: string;
  location: WorkbenchLocation;
  /** 当前耐久（暂时不损耗，预留字段）*/
  hp: number;
  maxHp: number;
  /** 建造完成的日子 */
  buildDay: number;
  /** 当前制作中的工作（单队列） */
  currentJob: CraftJob | null;
}

// ============== 蓝图 ==============

/** 材料清单 */
export interface MaterialCost {
  itemId: string;
  quantity: number;
}

/** 工作台建造蓝图（玩家用这个来造工作台）*/
export interface WorkbenchBlueprint {
  id: string;
  name: string;
  workbenchType: WorkbenchType;
  description: string;
  materials: MaterialCost[];
  buildTime: number;  // 回合数（period）
  /** 图纸本身的来源（拾荒/任务/商人）*/
  source: 'loot' | 'mission' | 'merchant';
  /** 2026-06-21 加：解锁提示（告诉玩家怎么获得这张图纸） */
  unlockHint: string;
}

/** 物品制作蓝图（玩家用这个在工作台造物品）*/
export interface CraftBlueprint {
  id: string;
  name: string;
  workbenchType: WorkbenchType;
  resultItemId: string;
  description: string;
  materials: MaterialCost[];
  craftTime: number;  // 回合数（period）
  /** 制作难度（影响成功率，2026-06-21 暂未实现，先 100% 成功）*/
  difficulty?: 'easy' | 'normal' | 'hard';
  /** 2026-06-21 加：解锁提示 */
  unlockHint?: string;
}

// ============== 安全屋结构 ==============

/** 修补目标 */
export type RepairTarget = 'door' | 'window';

/** 门窗状态 */
export interface DoorState {
  hp: number;
  maxHp: number;
}

export interface WindowState {
  /** 单扇窗的 HP（所有窗同步损耗）*/
  eachHp: number;
  eachMaxHp: number;
  /** 窗的数量 */
  count: number;
}

/** 修补工作（也走单队列） */
export interface RepairJob {
  charId: string;
  target: RepairTarget;
  startDay: number;
  startPeriod: number;
  endDay: number;
  endPeriod: number;
}

/** 安全屋结构（门窗状态） */
export interface SafehouseStructure {
  door: DoorState;
  windows: WindowState;
  /** 当前修补中的工作（门窗各 1 队列） */
  doorRepairJob: RepairJob | null;
  windowRepairJob: RepairJob | null;
}

// ============== GameVar 读写 ==============

/** 玩家 GameVar 中的 workbenches GameVar key */
export const WORKBENCHES_GAMEVAR = 'scavenge_workbenches';
/** 安全屋结构 GameVar key */
export const SAFEHOUSE_GAMEVAR = 'scavenge_safehouse';
// 2026-06-21 删：蓝图**不**再**独**立 GameVar（**入**仓库**普**通物**品**）
