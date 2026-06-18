/**
 * 拾荒系统 - 派遣完成 / 结算（2026-06-08 拆分自 missions.ts）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { gainExp } from '../ScavengeCharacter/characterExperience';
import { applyAutoTraits } from '../ScavengeCharacter/traits';
import { InventoryItem, addToInventory } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';
import {
  Mission,
  MissionOutcome,
  MISSION_BASE_EXP,
  MISSION_EXP_PER_DANGER,
  MISSION_HP_LOSS_PER_DANGER,
  isTimeReached,
} from './missions';

// ============== 派遣完成 / 结算 ==============

/**
 * 派遣完成 → 结算
 *
 * MVP 规则（**先不做随机事件**）：
 * - 总是 success（除非角色 HP=0 → reason='character_dead'）
 * - 物品：从 mission.encounters 累计获取（资源点 / 战斗胜）
 * - 经验：50 + dangerLevel * 10
 * - HP 损失：dangerLevel * 2
 *
 * @param mission 派遣任务（status 必须是 'active'）
 * @param char 派遣角色
 * @param location 派遣地点
 * @returns 已填入 outcome 的 mission
 */
export const completeMission = (
  mission: Mission,
  char: ScavengeCharacter,
  location: ScavengeLocationItem,
): Mission => {
  // 角色死亡（HP=0）：失败
  if (char.hp <= 0) {
    return {
      ...mission,
      status: 'failed',
      outcome: {
        success: false,
        reason: 'character_dead',
        message: '任务失败，角色在派遣途中倒下',
        itemsGained: [],
        expGained: 0,
        hpLost: 0,
      },
      outcomeShown: false,
    };
  }

  // 物资 = 派遣期间 encounters 累计获取（资源点 / 战斗胜）
  const itemsGained: InventoryItem[] = (mission.encounters ?? [])
    .flatMap((e) => e.itemsGained ?? []);

  // 经验
  const expGained = MISSION_BASE_EXP + location.dangerLevel * MISSION_EXP_PER_DANGER;

  // HP 损失
  const hpLost = location.dangerLevel * MISSION_HP_LOSS_PER_DANGER;

  return {
    ...mission,
    status: 'completed',
    outcome: {
      success: true,
      reason: 'completed',
      message: itemsGained.length > 0
        ? `任务完成！从【${location.name}】带回 ${itemsGained.length} 类物资，获得 ${expGained} 经验。`
        : `任务完成。获得 ${expGained} 经验（未获取物资）。`,
      itemsGained,
      expGained,
      hpLost,
    },
    outcomeShown: false,
  };
};

// ============== 派遣检查（时间推进钩子用） ==============

export interface MissionCheckResult {
  active: Mission[];        // 仍在进行中的
  justCompleted: Mission[]; // 刚刚到时间的（已填入 outcome）
}

/**
 * 检查所有 missions 状态：
 * - active 且时间到 → 调 completeMission 填入 outcome（status 保持 'active' 由调用方改为 'completed'）
 * - active 但时间未到 → 保留
 * - 非 active → 保留
 */
export const checkMissionsProgress = (
  missions: Mission[],
  characters: ScavengeCharacter[],
  locations: ScavengeLocationItem[],
  currentDay: number,
  currentPeriodIndex: number,
): MissionCheckResult => {
  const active: Mission[] = [];
  const justCompleted: Mission[] = [];

  for (const m of missions) {
    if (m.status !== 'active') {
      continue;
    }
    if (!isTimeReached(currentDay, currentPeriodIndex, m.returnDay, m.returnPeriodIndex)) {
      active.push(m);
      continue;
    }
    // 时间到，结算
    const char = characters.find(c => c.id === m.characterId);
    const loc = locations.find(l => l.id === m.locationId);
    if (!char || !loc) {
      active.push({
        ...m,
        status: 'cancelled',
        outcome: {
          success: false,
          reason: 'cancelled',
          message: '数据异常，派遣被取消',
          itemsGained: [],
          expGained: 0,
          hpLost: 0,
        },
        outcomeShown: false,
      });
      continue;
    }
    const completed = completeMission(m, char, loc);
    justCompleted.push(completed);
  }

  return { active, justCompleted };
};

// ============== 应用结算到角色 ==============

/**
 * 把 mission outcome 应用到角色：
 * - 物品：加到背包
 * - 经验：gainExp
 * - HP：扣 hpLost
 * - 状态：isExploring = false, exploringLocationId = undefined
 *         returnDay = undefined, returnPeriodIndex = undefined
 */
export const applyMissionOutcomeToCharacter = (
  char: ScavengeCharacter,
  outcome: MissionOutcome,
): ScavengeCharacter => {
  let updated: ScavengeCharacter = { ...char };

  // 状态字段清空
  updated = {
    ...updated,
    isExploring: false,
    exploringLocationId: undefined,
    returnDay: undefined,
    returnPeriodIndex: undefined,
  };

  // HP
  if (outcome.hpLost > 0) {
    updated.hp = Math.max(0, updated.hp - outcome.hpLost);
  }

  // 物品进背包
  if (outcome.itemsGained.length > 0) {
    let inv = [...(updated.inventory ?? [])];
    for (const item of outcome.itemsGained) {
      inv = addToInventory(inv, item);
    }
    updated.inventory = inv;
  }

  // 经验（可能连升）
  if (outcome.expGained > 0) {
    updated = gainExp(updated, outcome.expGained);
  }

  // 2026-06-09 加：自动特性更新
  // 战斗/派遣结束后 HP/hunger/thirst/sanity/stamina 都可能变
  // （HP 减少最多 → 触发重伤/濒死等）
  // 调 applyAutoTraits 自动添加/移除条件特性
  // currentDay 传 0：派送内不依赖 day，只看数值条件
  updated = applyAutoTraits(updated, 0);

  return updated;
};
