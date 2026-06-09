/**
 * 拾荒系统 - 派遣（Missions）
 *
 * 挂机派遣模式：选地点 + 选角色 → 角色锁住 N 个 period → 时间推进到点自动结算。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 单人派遣（先实现，**接口预留** 多人 partyMemberIds）
 * - 复用 isExploring + exploringLocationId，加 returnDay/returnPeriodIndex
 * - 随机事件先不做（**接口预留** MissionEvent[]）
 *
 * 存储：GameVar `scavenge_missions` 存 JSON 字符串数组。
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { gainExp } from '../ScavengeCharacter/characterExperience';
import { computeDerivedStats } from '../ScavengeCharacter/characterCombat';
import { InventoryItem, addToInventory, generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeLocationItem, getLocationEnemyPool } from '../ScavengeMap/locations';
import {
  EnemyInstance, spawnEnemiesFromPool, pickRandomEncounterEnemies,
} from '../ScavengeEnemies/enemies';
import { CombatLogEntry, runCombat } from '../ScavengeCombat/combat';

export const MISSIONS_GAMEVAR_KEY = 'scavenge_missions';

// ============== 数据模型 ==============

export type MissionStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export type MissionOutcomeReason = 'completed' | 'cancelled' | 'character_dead';

/** 派遣结算结果 */
export interface MissionOutcome {
  success: boolean;
  reason: MissionOutcomeReason;
  message: string;
  /** 获得的物品（包含 instanceId，可直接 addToInventory） */
  itemsGained: InventoryItem[];
  /** 经验获得 */
  expGained: number;
  /** 派遣期间损失（已包含 period 推进的消耗） */
  hpLost: number;
}

/** 派遣任务 */
export interface Mission {
  /** 唯一 ID */
  id: string;
  /** 派遣角色（单人；预留 partyMemberIds: string[]） */
  characterId: string;
  /** 派遣地点 */
  locationId: string;
  /** 开始：第几天 */
  startDay: number;
  /** 开始：哪个 period（0=清晨, 1=上午, ...） */
  startPeriodIndex: number;
  /** 持续多少个 period（>= 1） */
  durationPeriods: number;
  /** 结束：第几天 */
  returnDay: number;
  /** 结束：哪个 period */
  returnPeriodIndex: number;
  status: MissionStatus;
  outcome?: MissionOutcome;
  /** 结算结果是否已展示过（弹窗点过"确定"后置 true，避免刷新页面再弹） */
  outcomeShown?: boolean;
  /** ISO 时间戳 */
  createdAt: string;
  /** 随机事件占位（暂未启用，**接口预留**） */
  events?: MissionEvent[];
  // ============== 战斗系统扩展 ==============
  /** 角色 strategy 副本（派遣开始时复制） */
  strategy: 'stealth' | 'combat';
  /** 派遣期间遭遇历史（按时间顺序） */
  encounters: EncounterLog[];
  /** 是否已被玩家手动取消（UI 召回按钮用） */
  cancelled?: boolean;
}

/** 派遣期间的遭遇记录（被 encounterCheck 追加） */
export type EncounterKind =
  | 'no_encounter'             // 没遇到任何东西
  | 'evade_success'            // 隐蔽成功
  | 'evade_fail_combat_victory' // 隐蔽失败 + 战斗胜
  | 'evade_fail_combat_defeat'  // 隐蔽失败 + 战斗败
  | 'combat_victory'           // 直接战斗 + 胜
  | 'combat_defeat'            // 直接战斗 + 败
  | 'resource';                // 资源点（无敌人）

export interface EncounterLog {
  id: string;
  triggerDay: number;
  triggerPeriodIndex: number;
  kind: EncounterKind;
  /** 遭遇敌人数量 */
  enemiesEncountered?: number;
  /** 战斗日志（如果是战斗） */
  combatLog?: CombatLogEntry[];
  /** 获得的物品（资源点 / 战斗胜） */
  itemsGained?: InventoryItem[];
  /** 角色 HP 变化（负=扣，正=回，正数实际不发生） */
  hpDelta?: number;
  /** 文字说明（UI 弹窗用） */
  message: string;
  /** 弹窗是否已展示过（点过"确定"后置 true，避免刷新页面重弹） */
  shown?: boolean;
}

/** 派遣事件（**接口预留**，暂不实现） */
export interface MissionEvent {
  id: string;
  triggerDay: number;
  triggerPeriodIndex: number;
  // 未来加：text / options / effects
}

// ============== 调参常量 ==============

/** 基础经验：每个地点难度 0 → 50 exp，每升 1 难度 +10 exp */
export const MISSION_BASE_EXP = 50;
export const MISSION_EXP_PER_DANGER = 10;

/** 派遣期间 HP 损失（按危险等级） */
export const MISSION_HP_LOSS_PER_DANGER = 2;

/** lootType → itemId 映射（locations.ts 里的 lootTypes 字段） */
const LOOT_TYPE_TO_ITEM: Record<string, string> = {
  food: 'food_apple',
  drink: 'drink_water',
  beverage: 'drink_water',
  medicine: 'medicine_bandage',
  bandage: 'medicine_bandage',
  parts: 'material_parts',
  tools: 'material_tools',
  cloth: 'material_cloth',
  metal: 'material_metal',
  daily: 'material_parts',
  weapon: 'weapon_knife',
  armor: 'armor_vest',
};

// ============== 时间计算 ==============

/**
 * 计算派遣的"结束时间"：startDay/startPeriod + durationPeriods → returnDay/returnPeriod
 * 一天 5 个 period：0=清晨, 1=上午, 2=下午, 3=半晚, 4=黑夜
 */
export const calcReturnTime = (
  startDay: number,
  startPeriodIndex: number,
  durationPeriods: number,
): { day: number; periodIndex: number } => {
  let day = startDay;
  let period = startPeriodIndex + durationPeriods;
  while (period >= 5) {
    day += 1;
    period -= 5;
  }
  return { day, periodIndex: period };
};

/** 当前时间是否已到结束时间（>=） */
export const isTimeReached = (
  currentDay: number,
  currentPeriodIndex: number,
  targetDay: number,
  targetPeriodIndex: number,
): boolean => {
  if (currentDay > targetDay) return true;
  if (currentDay === targetDay && currentPeriodIndex >= targetPeriodIndex) return true;
  return false;
};

// ============== 派遣创建 / 取消 ==============

/**
 * 创建派遣任务。
 *
 * 时间模型（2026-06-05 增"准备阶段"）：
 * - 玩家在 startTime 选派遣
 * - 准备期 1 period（不计 duration）："早上选→到上午才开始"
 * - 活跃期 duration 个 period：从 startTime+1 到 startTime+duration
 * - returnTime = startTime + 1 + duration
 * - 遭遇只在活跃期跑（currentTime > startTime && currentTime < returnTime）
 *
 * 例：park (duration=1)，startTime=day1 period0（清晨）选派遣
 *   - 准备：period 0 → period 1（上午）
 *   - 活跃：period 1 → period 2（下午，returnTime=2）
 *   - 玩家需推进 2 次才完成：第 1 次（准备完）+ 第 2 次（活跃 1 期 + 结算）
 *
 * @param characterId 派遣角色 ID
 * @param location 派遣地点
 * @param currentDay 当前第几天
 * @param currentPeriodIndex 当前 period
 * @param strategy 派遣策略（从角色 strategy 复制）
 * @returns 新 Mission
 */
export const startMission = (
  characterId: string,
  location: ScavengeLocationItem,
  currentDay: number,
  currentPeriodIndex: number,
  strategy: 'stealth' | 'combat' = 'combat',
): Mission => {
  const duration = Math.max(1, location.explorationTime);
  // 加 1 期作为准备期
  const { day, periodIndex } = calcReturnTime(currentDay, currentPeriodIndex, duration + 1);
  return {
    id: generateInstanceId(),
    characterId,
    locationId: location.id,
    startDay: currentDay,
    startPeriodIndex: currentPeriodIndex,
    durationPeriods: duration,
    returnDay: day,
    returnPeriodIndex: periodIndex,
    status: 'active',
    strategy,
    encounters: [],
    createdAt: new Date().toISOString(),
  };
};

/**
 * 取消派遣（玩家主动撤回归还）。
 * 返回更新后的 mission；如果没找到返回 null。
 */
export const cancelMissionInList = (
  missions: Mission[],
  missionId: string,
): { missions: Mission[]; cancelled: Mission | null } => {
  let cancelled: Mission | null = null;
  const updated = missions.map(m => {
    if (m.id === missionId && m.status === 'active') {
      cancelled = {
        ...m,
        status: 'cancelled',
        outcome: {
          success: false,
          reason: 'cancelled',
          message: '派遣被取消',
          itemsGained: [],
          expGained: 0,
          hpLost: 0,
        },
        outcomeShown: false,
      };
      return cancelled;
    }
    return m;
  });
  return { missions: updated, cancelled };
};

// ============== 派遣完成 / 结算 ==============

// 注：原 lootCountForDanger / randInt 工具已不再使用（物品由 encounters 提供）
// 如需恢复随机基础物资，重新启用并在这里调用

/**
 * 派遣完成 → 结算
 *
 * MVP 规则（**先不做随机事件**）：
 * - 总是 success（除非角色 HP=0 → reason='character_dead'）
 * - 物品：从 location.lootTypes 随机选 N 个（N 随危险等级）+ 随机 quantity
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
  // 不再额外随机生成：避免"无遭遇也白送"的双发奖励
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

// ============== 遭遇检查（派遣中每个 period 调一次） ==============

/** 资源点类型 → itemId 映射（复用 missions.ts 里的） */
const RESOURCE_TYPE_TO_ITEM: Record<string, string> = {
  food: 'food_apple',
  drink: 'drink_water',
  beverage: 'drink_water',
  medicine: 'medicine_bandage',
  bandage: 'medicine_bandage',
  parts: 'material_parts',
  tools: 'material_tools',
  cloth: 'material_cloth',
  metal: 'material_metal',
  daily: 'material_parts',
  weapon: 'weapon_knife',
  armor: 'armor_vest',
};

/**
 * 派遣期间每个 period 调一次：决定是否遭遇 + 触发战斗/资源
 *
 * 判定流程：
 * 1. 60% 不遭遇 / 40% 遭遇
 * 2. 遭遇时 80% 丧尸 / 20% 资源点
 * 3. 丧尸：按 location.enemyPool 随机生成 1~N 个
 *    - char.strategy='stealth'：先隐蔽判定，失败再进入战斗
 *    - char.strategy='combat'：直接进入战斗
 * 4. 战斗：用 runCombat 算胜负
 *    - 胜：可获得物资 + 经验
 *    - 败：扣 HP，mission 标记失败（completeMission 时不再给奖励）
 *
 * @returns { encounter, updatedChar } encounter 记录 + 角色 HP 更新后的副本
 */
export const encounterCheck = (
  mission: Mission,
  character: ScavengeCharacter,
  location: ScavengeLocationItem,
  triggerDay: number,
  triggerPeriodIndex: number,
): { encounter: EncounterLog; updatedChar: ScavengeCharacter; missionOver: boolean } => {
  const encId = generateInstanceId();
  const baseItems: InventoryItem[] = [];

  // 1. 60% 不遭遇
  if (Math.random() >= 0.4) {
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'no_encounter',
        message: '这一段路没遇到任何威胁',
      },
      updatedChar: character,
      missionOver: false,
    };
  }

  // 2. 遭遇：80% 丧尸 / 20% 资源点
  const isResource = Math.random() < 0.2;
  if (isResource) {
    // 资源点：按 location.lootTypes 随机 1 类
    const available = location.lootTypes ?? [];
    if (available.length > 0) {
      const loot = available[Math.floor(Math.random() * available.length)];
      const itemId = RESOURCE_TYPE_TO_ITEM[loot];
      if (itemId) {
        const item: InventoryItem = {
          instanceId: generateInstanceId(),
          itemId,
          quantity: 1 + Math.floor(Math.random() * 3), // 1~3
        };
        baseItems.push(item);
      }
    }
    let updatedChar: ScavengeCharacter = character;
    if (baseItems.length > 0) {
      updatedChar = {
        ...character,
        inventory: addToInventory(character.inventory ?? [], baseItems[0]),
      };
    }
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'resource',
        itemsGained: baseItems,
        message: baseItems.length > 0 ? '发现了一处资源点！' : '看上去像资源点，但已经被人搜刮过了',
      },
      updatedChar,
      missionOver: false,
    };
  }

  // 3. 丧尸：从 location.enemyPool 生成 1~N 个
  const pool = getLocationEnemyPool(location);
  if (pool.length === 0) {
    // 没有敌人池（很罕见，比如 danger=0）→ 当成不遭遇
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'no_encounter',
        message: '没有发现敌人',
      },
      updatedChar: character,
      missionOver: false,
    };
  }
  const allEnemies = spawnEnemiesFromPool(pool);
  const encounterEnemies = pickRandomEncounterEnemies(allEnemies);

  // 4. 警觉判定（2026-06-08 第四次改：Luce choice 非对称公式）：
  // 角色 stealth = Σ(equipped.stealth) × (1 + agi/10)  （integer，computeDerivedStats 算好）
  // 敌人 detection = integer 25/50/75/90
  //
  // 单敌人成功潜行率 = char / (char + enemy)        ← 非对称！
  //   char 主导（大于 enemy）→ success 偏高
  //   enemy 主导（大于 char）→ success 偏低
  //   char == enemy           → 50% 掷硬币
  //
  // 与上一版区别：上一版用 1 - min/max 是对称的，char=22 vs enemy=90 给 76% 成功（反直觉）
  // 新版：char=22 vs enemy=90 → 22/112 = 19.6%（enemy 主导，潜行难）
  //
  // 例：char=50, enemy=25 → 50/75 = 66.7%   (char 主导，合理的高)
  //   char=50, enemy=75 → 50/125 = 40%    (enemy 主导，合理的低)
  //   char=22, enemy=25 → 22/47 = 46.8%   (略低于敌人，掷硬币)
  //   char=22, enemy=90 → 22/112 = 19.6%  (差很多，难)
  //   char=53, enemy=90 → 53/143 = 37.1%  (好装备也勉强)
  //
  // 全部敌人都没发现 → evade_success
  // 至少一个发现 → combat，发现的敌人 ATB 起始 50（首轮先手）
  // char ≤ 0（装备总暴露或无潜行装备） → 强制被发现（success = 0）
  // enemy ≤ 0（特殊敌人不警觉） → 100% 潜行成功
  const isNight = triggerPeriodIndex === 4; // 黑夜
  const stats = computeDerivedStats(character, isNight);
  const charStealth = stats.stealth;  // integer
  const isTooExposed = charStealth <= 0;  // 装备总潜行值 ≤ 0 = 必被发现
  const detectedFlags: boolean[] = encounterEnemies.map((e) => {
    if (isTooExposed) return true;  // 装备总暴露或无潜行装备
    if (e.detection <= 0) return false;  // 敌人永远不察觉
    const success = charStealth / (charStealth + e.detection);
    return Math.random() >= success;  // 不成功 = 被发现
  });
  if (encounterEnemies.length > 0 && !detectedFlags.some((d) => d)) {
    // 全部没察觉 → 潜行成功
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'evade_success',
        enemiesEncountered: encounterEnemies.length,
        message: `遭遇 ${encounterEnemies.length} 个敌人，隐蔽成功！悄悄溜过`,
      },
      updatedChar: character,
      missionOver: false,
    };
  }
  // 设置被发现敌人的 startAtb = 50（首轮先手）
  for (let i = 0; i < encounterEnemies.length; i++) {
    if (detectedFlags[i]) {
      encounterEnemies[i].startAtb = 50;
    }
  }

  // 战斗
  const combatResult = runCombat(character, encounterEnemies);
  const hpDelta = combatResult.characterFinalHp - character.hp;
  const updatedChar: ScavengeCharacter = {
    ...character,
    hp: Math.max(0, combatResult.characterFinalHp),
  };

  if (combatResult.characterWon) {
    // 胜：随机给点物资（来自 location.lootTypes）
    const available = location.lootTypes ?? [];
    if (available.length > 0) {
      const loot = available[Math.floor(Math.random() * available.length)];
      const itemId = RESOURCE_TYPE_TO_ITEM[loot];
      if (itemId) {
        baseItems.push({
          instanceId: generateInstanceId(),
          itemId,
          quantity: 1 + Math.floor(Math.random() * 2), // 1~2
        });
        // 加到角色背包
        updatedChar.inventory = addToInventory(updatedChar.inventory ?? [], baseItems[0]);
      }
    }
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: combatResult.characterWon ? (mission.strategy === 'stealth' ? 'evade_fail_combat_victory' : 'combat_victory') : 'combat_defeat',
        enemiesEncountered: encounterEnemies.length,
        combatLog: combatResult.log,
        itemsGained: baseItems.length > 0 ? baseItems : undefined,
        hpDelta,
        message: `战胜了 ${encounterEnemies.length} 个敌人！${hpDelta < 0 ? `（扣血 ${-hpDelta}）` : ''}`,
      },
      updatedChar,
      missionOver: false, // 战斗胜不结束 mission，继续探索
    };
  }

  // 败：mission 失败
  return {
    encounter: {
      id: encId,
      triggerDay,
      triggerPeriodIndex,
      kind: mission.strategy === 'stealth' ? 'evade_fail_combat_defeat' : 'combat_defeat',
      enemiesEncountered: encounterEnemies.length,
      combatLog: combatResult.log,
      hpDelta,
      message: `被 ${encounterEnemies.length} 个敌人击败！任务失败，紧急撤退`,
    },
    updatedChar,
    missionOver: true, // 战斗败 → 立即结束 mission
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
      // 已经结算过的，保留
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
      // 数据异常，标记为 cancelled
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

  return updated;
};

// ============== GameVar 读写 ==============

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

/** 读 missions（GameVar JSON 字符串 → Mission[]，缺 outcomeShown 时补 false） */
export const readMissions = (): Mission[] => {
  const raw = stageStateManager.getCalculationStageState().GameVar[MISSIONS_GAMEVAR_KEY];
  const migrate = (arr: unknown[]): Mission[] => {
    return arr
      .filter((m): m is Mission => m !== null && typeof m === 'object' && 'id' in m)
      .map(m => ({
        ...(m as Mission),
        outcomeShown: (m as Mission).outcomeShown ?? false,
      }));
  };
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return migrate(parsed);
    } catch { /* ignore */ }
  }
  if (Array.isArray(raw)) {
    return migrate(raw as unknown[]);
  }
  return [];
};

/** 写 missions */
export const writeMissions = (missions: Mission[]): void => {
  stageStateManager.setStageVarAndCommit({
    key: MISSIONS_GAMEVAR_KEY,
    value: JSON.stringify(missions),
  });
};

/** 标记某个 mission 的 outcome 已展示（避免刷新重弹） */
export const markMissionOutcomeShown = (missionId: string): void => {
  const missions = readMissions();
  const updated = missions.map(m =>
    m.id === missionId ? { ...m, outcomeShown: true } : m,
  );
  writeMissions(updated);
};

/** 标记某个 encounter 已展示（按 missionId + encounterId） */
export const markEncounterShown = (missionId: string, encounterId: string): void => {
  const missions = readMissions();
  const updated = missions.map(m => {
    if (m.id !== missionId) return m;
    return {
      ...m,
      encounters: (m.encounters ?? []).map(e =>
        e.id === encounterId ? { ...e, shown: true } : e
      ),
    };
  });
  writeMissions(updated);
};
