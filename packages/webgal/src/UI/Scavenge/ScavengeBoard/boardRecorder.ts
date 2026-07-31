/**
 * 看板快照录制（2026-06-21 加：综合看板改造）
 *
 * 职责：
 * - 从 characters + missions + state 构建 BoardSnapshot
 * - 纯函数（不读 GameVar，只读 store；不写 GameVar）
 *
 * 流程：
 * 1. 读所有 characters
 * 2. 读所有 missions
 * 3. 按 missionPhase 分类
 * 4. 输出 BoardSnapshot
 */

import {
  BoardSnapshot,
  BoardMissionSummary,
  BoardCraftingEntry,
  BoardRepairingEntry,
  BoardCharacterSummary,
} from './board.types';
import { getCharacters } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { readMissions, EncounterLog } from '../ScavengeMissions/missions';
import { SCAVENGE_LOCATIONS, ScavengeLocationItem } from '../ScavengeMap/locations';
import { WORKBENCH_BLUEPRINTS, CRAFT_BLUEPRINTS } from '../ScavengeCrafting/blueprints';
import { getMaxHp, getMaxHungerThirst, getMaxStamina } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stats';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

/** sanity 上限（静态）*/
const getMaxSanity = (_char: ReturnType<typeof getCharacters>[number]): number => 100;

/** 查 location 名称（locations 是 array，用 find）*/
const findLocation = (id: string): ScavengeLocationItem | undefined =>
  SCAVENGE_LOCATIONS.find((l: ScavengeLocationItem) => l.id === id);

/** 任务摘要 */
const buildMissionSummary = (m: any, allChars: ReturnType<typeof getCharacters>): BoardMissionSummary => {
  const loc = findLocation(m.locationId);
  const partyNames = m.partyCharacterIds.map((id: string) =>
    allChars.find(c => c.id === id)?.name ?? id
  );
  // 兼容老数据：encounters 可能在 mission.encounters，也可能 outcome 里
  const encounters: EncounterLog[] = m.encounters ?? [];
  return {
    id: m.id,
    locationId: m.locationId,
    locationName: loc?.name ?? m.locationId,
    partyCharacterIds: m.partyCharacterIds,
    partyNames,
    encounters,
    hasOutcome: !!m.outcome,
    outcomeSuccess: m.outcome?.success,
    outcomeReason: m.outcome?.reason,
    loot: m.outcome?.loot,
    expGained: m.outcome?.expGained,
  };
};

/** 制作/建造进度 */
const buildCraftingEntry = (c: ReturnType<typeof getCharacters>[number], currentDay: number, currentPeriod: number): BoardCraftingEntry | null => {
  if (c.missionPhase !== 'crafting') return null;
  if (c.craftingEndDay === undefined || c.craftingEndPeriodIndex === undefined || !c.craftingBlueprintId) return null;
  const totalRemaining = (c.craftingEndDay - currentDay) * 4 + (c.craftingEndPeriodIndex - currentPeriod);
  const remaining = Math.max(0, totalRemaining);
  const blueprintName =
    WORKBENCH_BLUEPRINTS[c.craftingBlueprintId as keyof typeof WORKBENCH_BLUEPRINTS]?.name
    ?? CRAFT_BLUEPRINTS[c.craftingBlueprintId as keyof typeof CRAFT_BLUEPRINTS]?.name
    ?? c.craftingBlueprintId;
  return {
    charId: c.id,
    charName: c.name,
    blueprintId: c.craftingBlueprintId,
    blueprintName,
    workbenchId: c.craftingWorkbenchId,
    endDay: c.craftingEndDay,
    endPeriod: c.craftingEndPeriodIndex,
    remainingPeriods: remaining,
  };
};

/** 修补进度 */
const buildRepairingEntry = (c: ReturnType<typeof getCharacters>[number], currentDay: number, currentPeriod: number): BoardRepairingEntry | null => {
  if (c.missionPhase !== 'repairing') return null;
  if (c.repairingEndDay === undefined || c.repairingEndPeriodIndex === undefined || !c.repairingTarget) return null;
  const totalRemaining = (c.repairingEndDay - currentDay) * 4 + (c.repairingEndPeriodIndex - currentPeriod);
  const remaining = Math.max(0, totalRemaining);
  return {
    charId: c.id,
    charName: c.name,
    target: c.repairingTarget,
    targetName: c.repairingTarget === 'door' ? '门' : '窗',
    endDay: c.repairingEndDay,
    endPeriod: c.repairingEndPeriodIndex,
    remainingPeriods: remaining,
  };
};

/** 角色摘要（计算是否能行动 + 原因）*/
const buildCharacterSummary = (c: ReturnType<typeof getCharacters>[number]): BoardCharacterSummary & { incapacitated: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  if (c.hp <= 0) reasons.push('HP=0（濒死/死亡）');
  if (c.hunger <= 0) reasons.push('饱食=0（饥肠辘辘）');
  if (c.thirst <= 0) reasons.push('饮水=0（脱水）');
  if (c.sanity <= 0) reasons.push('精神=0（精神崩溃）');
  if (c.stamina <= 0) reasons.push('体力=0（精疲力竭）');
  return {
    id: c.id,
    name: c.name,
    hp: c.hp,
    maxHp: getMaxHp(c),
    hunger: c.hunger,
    thirst: c.thirst,
    sanity: c.sanity,
    stamina: c.stamina,
    reasons,
    incapacitated: reasons.length > 0,
  };
};

/** 记录一次快照（纯函数：从 store 读 → 构建 snapshot）*/
export const recordBoardSnapshot = (): BoardSnapshot => {
  const characters = getCharacters();
  const missions = readMissions();
  // 排除"已完成+已展示"的（outcomeShown=true），避免旧 mission 一直堆积
  const activeMissions = missions.filter(m => !m.outcomeShown);
  const currentDay = (stageStateManager.getCalculationStageState().GameVar['current_day'] as number) ?? 1;
  const currentPeriod = (stageStateManager.getCalculationStageState().GameVar['current_period_index'] as number) ?? 0;

  const idle: BoardCharacterSummary[] = [];
  const incapacitated: BoardCharacterSummary[] = [];
  const crafting: BoardCraftingEntry[] = [];
  const repairing: BoardRepairingEntry[] = [];

  for (const c of characters) {
    // crafting / repairing 已经分类
    if (c.missionPhase === 'crafting') {
      const entry = buildCraftingEntry(c, currentDay, currentPeriod);
      if (entry) crafting.push(entry);
      continue;
    }
    if (c.missionPhase === 'repairing') {
      const entry = buildRepairingEntry(c, currentDay, currentPeriod);
      if (entry) repairing.push(entry);
      continue;
    }
    // 其他：missionPhase === null 也要分（空闲 vs 无法行动）
    const summary = buildCharacterSummary(c);
    if (summary.incapacitated) {
      incapacitated.push(summary);
    } else {
      idle.push(summary);
    }
  }

  return {
    day: currentDay,
    period: currentPeriod,
    missions: activeMissions.map(m => buildMissionSummary(m, characters)),
    crafting,
    repairing,
    idle,
    incapacitated,
  };
};
