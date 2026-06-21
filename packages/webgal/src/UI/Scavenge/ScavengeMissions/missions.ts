/**
 * 拾荒系统 - 派遣（Missions）入口（2026-06-08 拆分）
 *
 * 2026-06-08 改：missions.ts 缩为入口（types + 常量 + 时间计算 + 派遣创建/取消 + GameVar 读写），
 * 详细逻辑移到子文件：
 *   - [./encounterCheck.ts](./encounterCheck.ts) — 遭遇检查 + 战斗扣血 + 资源分发
 *   - [./missionComplete.ts](./missionComplete.ts) — 派遣完成 + 推进检查 + 应用结算到角色
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
import { InventoryItem, addToInventory, generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CombatLogEntry } from '../ScavengeCombat/combat';

export const MISSIONS_GAMEVAR_KEY = 'scavenge_missions';

// 2026-06-08 改：re-export RESOURCE_TYPE_TO_ITEM（从 locationRefresh 移过来），保持向后兼容
export { RESOURCE_TYPE_TO_ITEM } from '../ScavengeMap/locationRefresh';

// ============== 数据模型 ==============

export type MissionStatus = 'active' | 'completed' | 'cancelled' | 'failed';
//   - 'active': 派遣中
//   - 'completed': 正常完成
//   - 'cancelled': 玩家主动取消（提前返回，奖励 50%）
//   - 'failed': 战斗失败
// （2026-06-19 简化：去掉 'returning' 状态）

export type MissionOutcomeReason = 'completed' | 'cancelled' | 'character_dead' | 'early_return';
//   - 'completed': 正常完成
//   - 'cancelled': 玩家主动取消（提前返回，奖励 50%）
//   - 'character_dead': 角色死亡失败
//   - 'early_return': 提前返回（2026-06-09 加：Plan 4，等同 cancelled，区分来源）
// （2026-06-19 简化：去掉 'return_home'）

/** 派遣结算结果 */

/**
 * 战斗失败时丢失的物品（2026-06-09 加：Plan 2 - 50% 丢物品）
 * - item: 原始 inventory slot（含 instanceId）
 * - lostCount: 丢失的数量
 */
export interface LostItem {
  item: InventoryItem;
  lostCount: number;
}

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
  /** 瓶盖获得（2026-06-09 加：拾荒每个物品给 1-5 瓶盖） */
  bottlecapsGained?: number;
  /**
   * 战斗失败时丢失的物品（2026-06-09 加：Plan 2）
   * - 50% 概率触发（每次失败独立判定）
   * - 触发时：从主队员背包随机抽 50% 数量的物品
   * - 装备优先保留（不被丢）
   * - 任务失败时记录，UI modal 显示
   */
  lostItems?: LostItem[];
}

/** 派遣任务 */
export interface Mission {
  /** 唯一 ID */
  id: string;
  /**
   * 派遣角色（**保留兼容**）
   * - 等于 partyCharacterIds[0]（主派遣角色）
   * - 老数据（无 partyCharacterIds）兼容：旧 mission 仍能跑（用 characterId 作为单人 party）
   * @deprecated 2026-06-09 推荐用 partyCharacterIds（多角色队伍）
   */
  characterId: string;
  /**
   * 派遣队伍（2026-06-09 加：多角色队伍）
   * - 最多 3 人（MAX_PARTY_SIZE = 3）
   * - 队员状态独立（HP/饥/渴/特性 各自独立）
   * - 经验全队平分（Math.floor）
   * - 共享 strategy（队伍级）
   */
  partyCharacterIds: string[];
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
  /** 队伍 strategy（队伍级，2026-06-09 改：所有队员共享） */
  strategy: 'stealth' | 'combat';
  /** 派遣期间遭遇历史（按时间顺序） */
  encounters: EncounterLog[];
  /** 是否已被玩家手动取消（UI 召回按钮用） */
  cancelled?: boolean;
  // ============== 2026-06-21 加：M1 队伍共享临时仓库 ==============
  /**
   * 队伍共享临时仓库（M1 阶段，2026-06-21 加）
   *
   * 设计：
   * - 拾荒期间物品溢出（所有角色背包都满）→ 进这里
   * - 容量 = sum(party[].maxCarry - party[].currentUsedWeight)
   *   也就是队伍剩余负重的总和
   * - 任务结束 + 分配完成 → 删除整个字段
   * - 跳过分配 → 全部转入永久仓库（ScavengeWarehouse）
   * - 战斗失败时也走这个流程（用户要求："只要队伍背包里面有物资就要走分配流程"）
   *
   * 不持久化到 saveGame 之外的地方，任务结束自动清理。
   */
  tempLoot?: InventoryItem[];
  /**
   * 物资分配是否完成（M1 阶段，2026-06-21 加）
   * - false / undefined = 还没分配（弹 ScavengeLootDistributionModal）
   * - true = 已完成分配（无论"确认"还是"跳过"都算完成）
   *
   * 区分"未分配"和"已分配但 tempLoot 还在"：
   * 确认分配后，tempLoot 会被清空；
   * 跳过分配时，tempLoot 会被移到永久仓库后清空；
   * 两种情况都设 tempLootDistributed=true，触发 modal 时检查这个标志。
   */
  tempLootDistributed?: boolean;
}

/** 队伍上限（2026-06-09 加）*/
export const MAX_PARTY_SIZE = 3;

/** 派遣期间的遭遇记录（被 encounterCheck 追加） */
export type EncounterKind =
  | 'no_encounter'             // 准备期占位（**不**是真实遭遇，**不**显示）
  | 'stealth_clear'            // 潜行通过（2026-06-09 加：潜行策略 60% 走这条路**不**遇敌，**与**准备期区分）
  | 'evade_success'            // 隐蔽成功
  | 'evade_fail_combat_victory' // 隐蔽失败 + 战斗胜
  | 'evade_fail_combat_defeat'  // 隐蔽失败 + 战斗败
  | 'combat_victory'           // 直接战斗 + 胜
  | 'combat_defeat'            // 直接战斗 + 败
  | 'resource'                 // 资源点（无敌人）
  | 'rest_pending'             // 战斗后弹休整 modal（2026-06-09 加：Plan 3）
  | 'location_cleared';        // 2026-06-21 加：地点已清空（敌人 + 物资都没了，提示玩家）

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
  /**
   * 2026-06-09 加：组队战斗 — 每个队员的 HP delta
   * key = characterId, value = hpDelta
   * 兼容（hpDelta 保留）：只反映主角（party[0]）
   */
  partyHpDelta?: Record<string, number>;
  /**
   * 2026-06-19 加：战斗失败丢失的物品（Plan 17）
   * - 50% 概率触发
   * - 每个 entry 50% 概率丢一半数量
   * - 装备和任务物品保留
   * - UI modal 显示
   */
  lostItems?: LostItem[];
  /** 文字说明（UI 弹窗用） */
  message: string;
  /**
   * 休整结果（2026-06-09 加：Plan 3）
   * - 玩家选"休整" → 'rest'（记录已休整，modal 关闭）
   * - 玩家选"继续" → 'continue'（继续派遣）
   * - 未选择 → undefined
   */
  restChoice?: 'rest' | 'continue';
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
 * @param characterIds 派遣队伍 ID 列表（2026-06-09 改：多角色）
 *   - 长度限制：1-3 人（MAX_PARTY_SIZE）
 *   - 第一人是主派遣角色（= characterId 兼容）
 * @param location 派遣地点
 * @param currentDay 当前第几天
 * @param currentPeriodIndex 当前 period
 * @param strategy 派遣策略（队伍级共享）
 * @returns 新 Mission
 */
export const startMission = (
  characterIds: string[],
  location: ScavengeLocationItem,
  currentDay: number,
  currentPeriodIndex: number,
  strategy: 'stealth' | 'combat' = 'combat',
): Mission => {
  // 2026-06-09 改：多角色队伍（partyCharacterIds + 兼容 characterId）
  if (characterIds.length === 0) {
    throw new Error('startMission: characterIds 不能为空');
  }
  if (characterIds.length > MAX_PARTY_SIZE) {
    throw new Error(`startMission: 队伍人数 ${characterIds.length} 超过上限 ${MAX_PARTY_SIZE}`);
  }
  const primaryCharacterId = characterIds[0];
  const duration = Math.max(1, location.explorationTime);
  // 2026-06-19 改：Plan 17 - preparing(1) + scavenging(duration) + returning(1) = duration + 2
  //   - 准备 1 个 period
  //   - 拾荒 duration 个 period
  //   - 返**回** 1 **个** period（2026-06-19 简化：去掉 returning 阶段，**但** mission **完**成**时**间**仍**然**包**含** "**完**成**结算**"** 这** 1 **回**合**）**
  // 2026-06-19 简化：preparing(1) + scavenging(duration) = duration + 1
  const { day, periodIndex } = calcReturnTime(currentDay, currentPeriodIndex, duration + 1);
  return {
    id: generateInstanceId(),
    characterId: primaryCharacterId,  // 兼容字段
    partyCharacterIds: characterIds,  // 2026-06-09 加
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

// ============== GameVar 读写 ==============

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

// ============== re-export 详细逻辑（2026-06-08 拆分后） ==============

export { encounterCheck, splitExpAmongParty } from './encounterCheck';
export {
  completeMission,
  checkMissionsProgress,
  calculateLostItems,
  applyMissionOutcomeToCharacter,
  applyMissionOutcomeToParty,
  buildEarlyReturnMission,
} from './missionComplete';
