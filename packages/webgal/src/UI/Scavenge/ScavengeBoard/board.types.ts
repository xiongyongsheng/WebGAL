/**
 * 看板快照类型（2026-06-21 加：综合看板改造）
 *
 * 设计：
 * - 玩家可以反复打开看板（"上一回合的详情"）
 * - 每次 advance（时间推进）时记录一次快照
 * - 快照包含 missions + crafting + repairing + 空闲 + 无法行动
 */

import { EncounterLog, Mission } from '../ScavengeMissions/missions';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { InventoryItem } from '../ScavengeItems/inventory';

/** 任务摘要（快照里不存完整 mission，只存显示所需的字段）*/
export interface BoardMissionSummary {
  id: string;
  locationId: string;
  locationName: string;
  partyCharacterIds: string[];
  partyNames: string[];          // 缓存名字（避免重复查模板）
  encounters: EncounterLog[];
  hasOutcome: boolean;
  outcomeSuccess?: boolean;
  outcomeReason?: string;
  loot?: InventoryItem[];        // 战利品
  expGained?: number;
}

/** 制作/建造进度（角色在 crafting）*/
export interface BoardCraftingEntry {
  charId: string;
  charName: string;
  blueprintId: string;
  blueprintName: string;
  workbenchId?: string;          // 制作时才有
  endDay: number;
  endPeriod: number;
  remainingPeriods: number;       // 剩余回合数（基于快照时刻）
}

/** 修补进度（角色在 repairing）*/
export interface BoardRepairingEntry {
  charId: string;
  charName: string;
  target: 'door' | 'window';
  targetName: string;             // "门" / "窗"
  endDay: number;
  endPeriod: number;
  remainingPeriods: number;
}

/** 角色状态摘要（空闲或无法行动）*/
export interface BoardCharacterSummary {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  hunger: number;
  thirst: number;
  sanity: number;
  stamina: number;
  reasons?: string[];             // 无法行动的原因（仅 incapacitated 有）
}

/** 完整快照（每次 advance 记录一次）*/
export interface BoardSnapshot {
  /** 快照所属的 day/period（推进后） */
  day: number;
  period: number;
  /** 派遣中的任务 */
  missions: BoardMissionSummary[];
  /** 制作/建造中（character.missionPhase === 'crafting'） */
  crafting: BoardCraftingEntry[];
  /** 修补中（character.missionPhase === 'repairing'） */
  repairing: BoardRepairingEntry[];
  /** 空闲角色（missionPhase === null 且能行动） */
  idle: BoardCharacterSummary[];
  /** 无法行动角色（HP=0 或 饱食=0 或 精神=0） */
  incapacitated: BoardCharacterSummary[];
}
