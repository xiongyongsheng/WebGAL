/**
 * 拾荒系统 - 派遣遭遇检查（2026-06-09 重构：多角色队伍）
 *
 * 遭遇检查：每个 period 调一次
 * 1. 60% 不遭遇 / 40% 遭遇
 * 2. 遭遇时 80% 丧尸 / 20% 资源点
 * 3. 丧尸：从 locationState.enemyCount 抽 1~3 个
 *    - char.strategy='stealth'：先隐蔽判定，失败再进入战斗
 *    - char.strategy='combat'：直接进入战斗
 * 4. 战斗：用 runCombat 算胜负（**主队员 party[0] 参战**，其他队员挂机）
 *    - 胜：可获得物资 + 经验
 *    - 败：扣 HP，mission 标记失败（completeMission 时不再给奖励）
 *
 * ===== 2026-06-09 改：多角色队伍 =====
 * - party: 队伍（1-3 人）
 * - party[0] = 主派遣角色（参与战斗）
 * - 其他队员 = 挂机（HP 不变，但 applyAutoTraits 还是会跑）
 * - 经验按 party.length 平分（Math.floor）
 * - 资源都给 party[0]（物品入主队员背包）
 *   后续可改：资源入"公用背包"或"按需分配"
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { applyAutoTraits } from '../ScavengeCharacter/traits';
import { computeDerivedStats } from '../ScavengeCharacter/characterCombat';
import { InventoryItem, removeFromInventory, generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';
import {
  getOrRefreshLocationState,
  deductEnemiesByType,
  takeLootByItemId,
  countToEnemies,
  touchLocationInteracted,
} from '../ScavengeMap/locationRefresh';
import { pickRandomEncounterEnemies, createAbstractWanderers } from '../ScavengeEnemies/enemies';
import { runCombat } from '../ScavengeCombat/combat';
import { Mission, EncounterLog } from './missions';
import { calculateLostItems } from './missionComplete';

/**
 * 胜仗后额外抽 1 个物资的概率（2026-06-09 加）
 * - 30% = 100 次战斗约 30 次额外出 1 个
 * - 第一个固定抽完后再判定（防止一次拿 2 个相同）
 * - 失败不抽（鼓励"慎战"）
 */
const POST_COMBAT_BONUS_LOOT_RATE = 0.3;

/**
 * 2026-06-09 加：潜行成功给物资概率（**不**与战斗胜冲突）
 * - 潜行成功 (`evade_success`) 时，**额外**抽 1 个物资（**没**有 bonus）
 * - 设计：潜行成功 = 绕过敌人 + 顺手拿点东西
 * - 概率 100%（潜行**有**额外奖励）
 */
const EVADE_SUCCESS_LOOT_RATE = 1.0;

/**
 * 派遣期间每个 period 调一次：决定是否遭遇 + 触发战斗/资源
 *
 * @param mission 派遣任务
 * @param party 队伍（2026-06-09 改：1-3 人）
 *   - party[0] 是主派遣角色（参与战斗）
 * @param location 派遣地点
 * @param triggerDay 当前 day
 * @param triggerPeriodIndex 当前 period
 * @param phase 2026-06-21 加：'prep' = 准备阶段（路上，只遇游荡者，不消耗 locationState.enemyCount）
 *                     'scavenge' = 拾荒阶段（地点内，完整流程）
 * @returns { encounter, updatedParty, missionOver, restAvailable }
 *   - encounter 记录
 *   - updatedParty 队伍中所有角色更新后的副本（每个角色都跑 applyAutoTraits）
 *   - missionOver 是否立即结束 mission
 *   - restAvailable 2026-06-09 加：是否可休整（战斗胜 → true）
 */
export const encounterCheck = (
  mission: Mission,
  party: ScavengeCharacter[],
  location: ScavengeLocationItem,
  triggerDay: number,
  triggerPeriodIndex: number,
  phase: 'prep' | 'scavenge' = 'scavenge',
): { encounter: EncounterLog; updatedParty: ScavengeCharacter[]; missionOver: boolean; restAvailable: boolean } => {
  if (party.length === 0) {
    throw new Error('encounterCheck: party 不能为空');
  }
  const character = party[0];  // 主派遣角色（参与战斗）

  const encId = generateInstanceId();
  const baseItems: InventoryItem[] = [];

  // 2026-06-09 改：每个队员独立跑 applyAutoTraits（不依赖下一次时间推进）
  //   派遣中每个队员的状态都各自更新（HP/饥/渴 变化都可能触发特性）
  //   战斗用 combatResult.partyHpDelta 算所有队员 HP
  const updateParty = (newMainChar: ScavengeCharacter, partyHpDelta?: Record<string, number>): ScavengeCharacter[] => {
    return party.map((c) => {
      // 2026-06-09 改：如果有 partyHpDelta → 用 delta 更新 HP
      if (partyHpDelta && partyHpDelta[c.id] !== undefined) {
        const newHp = Math.max(0, c.hp + partyHpDelta[c.id]);
        return applyAutoTraits({ ...c, hp: newHp }, 0);
      }
      // 兼容旧（只有主角被更新）
      if (c.id === newMainChar.id) {
        return applyAutoTraits(newMainChar, 0);
      }
      // 其他队员：仅跑 applyAutoTraits（HP 不变，但特性可能变化）
      return applyAutoTraits(c, 0);
    });
  };
  const wrap = (result: { encounter: EncounterLog; updatedChar: ScavengeCharacter; missionOver: boolean; partyHpDelta?: Record<string, number> }) => ({
    encounter: result.encounter,
    updatedParty: updateParty(result.updatedChar, result.partyHpDelta),
    missionOver: result.missionOver,
    restAvailable: false,  // 2026-06-09 加：默认不可休整（只有战斗胜才 true）
  });

  // 2026-06-08 加：取/刷新 location 状态（如果时间过期或 dirty）
  const locState = getOrRefreshLocationState(location, triggerDay);
  // 记录派遣（用于 UI 显示"X 天没人来"）
  touchLocationInteracted(location.id, triggerDay);

  // ========== 2026-06-21 加：准备阶段专有逻辑 ==========
  if (phase === 'prep') {
    return runPrepPhase({
      encId, triggerDay, triggerPeriodIndex, character, party, location, locState, updateParty, wrap,
    });
  }

  // ========== 2026-06-21 加：拾荒阶段「敌人被清光」短路 ==========
  //   - 之前：allEnemies.length === 0 → 返回 no_encounter（被看板 filter 掉，玩家看不到）
  //   - 现在：先看 loot
  //     - 没敌人 + 没物资 → location_cleared（提示玩家"地点已清空"）
  //     - 没敌人 + 有物资 → 100% 给物资（跳过 60% 潜行检查，直接走 resource 路径）
  const allEnemies = countToEnemies(locState.enemyCount);
  const lootEntries = Object.entries(locState.lootCount).filter(([_, n]) => n > 0);
  if (allEnemies.length === 0) {
    if (lootEntries.length === 0) {
      return wrap({
        encounter: {
          id: encId,
          triggerDay,
          triggerPeriodIndex,
          kind: 'location_cleared',
          message: '该地点的敌人和物资都已被清理，队伍空手而归',
        },
        updatedChar: character,
        missionOver: false,
      });
    }
    // 强制给物资（跳过潜行 60% 判定）
    //   这里复用下方 isResource 分支的逻辑（直接 return resource）
    //   不下推到 isResource 路径是因为语义不同：
    //     - 正常 resource = 80% 敌人中的 20% 资源点（玩家是"找"到的）
    //     - 这里 resource = 敌人清光后的必给（玩家是"收"剩下的）
    //   但 encounter.kind 保持 'resource' 即可，message 区分
    return giveForcedLoot({
      encId, triggerDay, triggerPeriodIndex, character, location, lootEntries, wrap,
    });
  }

  // 1. 60% 不遭遇（2026-06-09 改：combat 策略 100% 遭遇，跳过此检查）
  // 2026-06-09 改：用 'stealth_clear' 区分**准备期**的 no_encounter
  //   之前 stealth 60% 用 'no_encounter' → 与准备期冲突
  //   → filter 排除 no_encounter → 潜行 mission **不**进 board modal
  //   改：stealth 用 'stealth_clear'，filter 显示 stealth_clear
  // 2026-06-09 加：潜行通过**也**抽 1 个物资（走过地点顺手拿点东西）
  if (mission.strategy !== 'combat' && Math.random() >= 0.4) {
    // 抽 1 个物资
    const stealthItems: InventoryItem[] = [];
    const stealthLootEntries = Object.entries(getOrRefreshLocationState(location, triggerDay).lootCount)
      .filter(([_, n]) => n > 0);
    if (stealthLootEntries.length > 0) {
      const [itemId, _] = stealthLootEntries[Math.floor(Math.random() * stealthLootEntries.length)];
      const item: InventoryItem = {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,
      };
      stealthItems.push(item);
      takeLootByItemId(location.id, [itemId]);
      // 2026-06-21 改：不再直接 addToInventory(character.inventory)
      //   物品分配交给 MissionSystem.onPeriodChange 调 tryAddToParty 处理
    }
    return wrap({
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'stealth_clear',
        itemsGained: stealthItems.length > 0 ? stealthItems : undefined,
        message: stealthItems.length > 0
          ? '这一段路没遇到任何威胁（顺手拿了点东西）'
          : '这一段路没遇到任何威胁',
      },
      updatedChar: character,
      missionOver: false,
    });
  }

  // 2. 遭遇：80% 丧尸 / 20% 资源点
  const isResource = Math.random() < 0.2;
  if (isResource) {
    // 2026-06-08 改：从 locationState.lootCount 抽（state 没东西就 no_encounter）
    const resLootEntries = Object.entries(locState.lootCount).filter(([_, n]) => n > 0);
    if (resLootEntries.length > 0) {
      // 选一个
      const [itemId, _] = resLootEntries[Math.floor(Math.random() * resLootEntries.length)];
      const item: InventoryItem = {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,  // 每个"点"代表 1 个
      };
      baseItems.push(item);
      // 减 state
      takeLootByItemId(location.id, [itemId]);
      // 2026-06-21 改：不再 addToInventory(character.inventory)
      //   物品分配交给 MissionSystem.onPeriodChange 调 tryAddToParty
    }
    return wrap({
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'resource',
        itemsGained: baseItems,
        message: baseItems.length > 0 ? '发现了一处资源点！' : '看上去像资源点，但已经被人搜刮过了',
      },
      updatedChar: character,
      missionOver: false,
    });
  }

  // 3. 丧尸：从 locationState.enemyCount 抽 1~min(3, allEnemies.length) 个
  // 注：上面已检查 allEnemies.length === 0 → 这里 length > 0
  // 抽 1~min(3, allEnemies.length) 个
  const encounterEnemies = pickRandomEncounterEnemies(allEnemies);

  // 4. 警觉判定（主队员 stealth）
  // 2026-06-09 注：暂用 party[0] 的 stealth（可改为"取全队最大 stealth"）
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
    // 全部没察觉 → 潜行成功（**不**减敌人，敌人还活着，下次还能遇到）
    // 2026-06-09 加：潜行成功**也**抽 1 个物资（绕过敌人 + 顺手拿点东西）
    //   之前**只**战斗胜 + resource 给物资，潜行成功**没**给
    //   现在 4 种来源：1) resource 2) 战斗胜 3) 战斗胜 30% bonus 4) 潜行成功 100%
    const evadeItems: InventoryItem[] = [];
    if (Math.random() < EVADE_SUCCESS_LOOT_RATE) {
      const lootEntries = Object.entries(getOrRefreshLocationState(location, triggerDay).lootCount)
        .filter(([_, n]) => n > 0);
      if (lootEntries.length > 0) {
        const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
        const item: InventoryItem = {
          instanceId: generateInstanceId(),
          itemId,
          quantity: 1,
        };
        evadeItems.push(item);
        takeLootByItemId(location.id, [itemId]);
        // 2026-06-21 改：不再 addToInventory(character.inventory)
      }
    }
    return wrap({
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'evade_success',
        enemiesEncountered: encounterEnemies.length,
        itemsGained: evadeItems.length > 0 ? evadeItems : undefined,  // 2026-06-09 加：潜行成功拿的东西
        message: evadeItems.length > 0
          ? `遭遇 ${encounterEnemies.length} 个敌人，隐蔽成功！悄悄溜过（顺手拿了点东西）`
          : `遭遇 ${encounterEnemies.length} 个敌人，隐蔽成功！悄悄溜过`,
      },
      updatedChar: character,
      missionOver: false,
    });
  }
  // 设置被发现敌人的 startAtb = 50（首轮先手）
  for (let i = 0; i < encounterEnemies.length; i++) {
    if (detectedFlags[i]) {
      encounterEnemies[i].startAtb = 50;
    }
  }

  // 战斗（2026-06-09 改：全队 party 参战）
  //   - 每个队员是一个 Combatant
  //   - 敌人攻击随机选一个活着的队员
  //   - 我方有任一 alive 即继续，**全部**死亡才败
  //   - 兼容 runCombat(character) 单参（自动包成 [character]）
  const combatResult = runCombat(party, encounterEnemies);
  const hpDelta = combatResult.partyHpDelta[character.id] ?? 0;  // 主角的 HP delta（兼容旧）
  // 2026-06-09 改：所有队员的 HP 都被 combat 更新（用 partyHpDelta）
  const updatedChar: ScavengeCharacter = {
    ...character,
    hp: Math.max(0, combatResult.partyFinalHp[character.id] ?? character.hp),
  };

  if (combatResult.characterWon) {
    // 胜：扣 state 中被击败的敌人 + 抽 1 个物资
    const defeatedCounts: Record<string, number> = {};
    for (const e of encounterEnemies) {
      defeatedCounts[e.type] = (defeatedCounts[e.type] ?? 0) + 1;
    }
    deductEnemiesByType(location.id, defeatedCounts);
    // 给物资（从 state 抽 1 个，2026-06-09 改：胜仗后追加 30% 概率额外抽）
    const lootEntries = Object.entries(getOrRefreshLocationState(location, triggerDay).lootCount)
      .filter(([_, n]) => n > 0);
    if (lootEntries.length > 0) {
      const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
      const item: InventoryItem = {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,
      };
      baseItems.push(item);
      takeLootByItemId(location.id, [itemId]);
      // 2026-06-21 改：不再 updatedChar.inventory = addToInventory(...)
    }
    // 2026-06-09 加：胜仗 30% 概率额外抽 1 个物资（bonus loot）
    let bonusLootCount = 0;
    if (Math.random() < POST_COMBAT_BONUS_LOOT_RATE) {
      const bonusLootEntries = Object.entries(getOrRefreshLocationState(location, triggerDay).lootCount)
        .filter(([_, n]) => n > 0);
      if (bonusLootEntries.length > 0) {
        const [itemId, _] = bonusLootEntries[Math.floor(Math.random() * bonusLootEntries.length)];
        const item: InventoryItem = {
          instanceId: generateInstanceId(),
          itemId,
          quantity: 1,
        };
        baseItems.push(item);
        takeLootByItemId(location.id, [itemId]);
        // 2026-06-21 改：不再 updatedChar.inventory = addToInventory(...)
        bonusLootCount = 1;
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
        // 2026-06-09 加：每个队员的 HP delta（用于 outcome modal 显示）
        partyHpDelta: combatResult.partyHpDelta,
        message: `战胜了 ${encounterEnemies.length} 个敌人！${hpDelta < 0 ? `（扣血 ${-hpDelta}）` : ''}${bonusLootCount > 0 ? '（额外战利品！）' : ''}`,
      },
      updatedParty: updateParty(updatedChar, combatResult.partyHpDelta),
      missionOver: false, // 战斗胜不结束 mission，继续探索
      // 2026-06-09 加：Plan 3 战斗胜利 → 标记可休整
      restAvailable: true,
    };
  }

  // 败：扣 state 中所有遇到的敌人
  const defeatedCounts: Record<string, number> = {};
  for (const e of encounterEnemies) {
    defeatedCounts[e.type] = (defeatedCounts[e.type] ?? 0) + 1;
  }
  deductEnemiesByType(location.id, defeatedCounts);

  // 2026-06-19 加：战斗失败丢物品（Plan 17）
  //   - 50% 概率触发
  //   - 装备/任务物品保留
  //   - 扣物品到 updatedChar.inventory
  const lostItems = calculateLostItems(updatedChar);
  if (lostItems.length > 0) {
    let newInv = updatedChar.inventory ?? [];
    for (const lost of lostItems) {
      newInv = removeFromInventory(newInv, lost.item.itemId, lost.lostCount);
    }
    updatedChar.inventory = newInv;
  }

  // 败：mission 失败
  return wrap({
    encounter: {
      id: encId,
      triggerDay,
      triggerPeriodIndex,
      kind: mission.strategy === 'stealth' ? 'evade_fail_combat_defeat' : 'combat_defeat',
      enemiesEncountered: encounterEnemies.length,
      combatLog: combatResult.log,
      hpDelta,
      // 2026-06-09 加：每个队员的 HP delta
      partyHpDelta: combatResult.partyHpDelta,
      // 2026-06-19 加：丢失物品（Plan 17）
      lostItems,
      message: lostItems.length > 0
        ? `被 ${encounterEnemies.length} 个敌人击败！任务失败，紧急撤退（丢失 ${lostItems.length} 类物品）`
        : `被 ${encounterEnemies.length} 个敌人击败！任务失败，紧急撤退`,
    },
    updatedChar,
    missionOver: true, // 战斗败 → 立即结束 mission
  });
};

/**
 * 计算经验平分（2026-06-09 加：全队平分）
 * @param totalExp 总经验
 * @param partySize 队伍人数
 * @returns 每人经验（向下取整）
 */
export const splitExpAmongParty = (totalExp: number, partySize: number): number => {
  if (partySize <= 0) return 0;
  return Math.floor(totalExp / partySize);
};

// ============================================================
// 2026-06-21 加：准备阶段 + 「敌人被清光」短路
//   - runPrepPhase：抽 1-2 个抽象游荡者，60% 潜行 / 40% 战斗
//     （不消耗 locationState.enemyCount，因为游荡者不是地点驻扎的）
//   - giveForcedLoot：敌人被清光后 100% 给物资（跳过 60% 潜行检查）
// ============================================================

/**
 * 准备阶段遭遇（2026-06-21 加）
 *
 * 设计：
 * - 只生成 1-2 个抽象游荡者（不消耗 locationState）
 * - 60% 潜行通过（可拿路边的物资）
 * - 40% 战斗游荡者
 *   - 警觉判定失败 → 战斗（不扣 locationState，败也不丢物品）
 *   - 警觉判定成功 → 潜行成功（不拿物资，因为没到地点）
 *
 * 资源来源：locationState.lootCount（路上能捡到场所里的东西，逻辑上可以理解为 "周围环境"）
 */
const runPrepPhase = (ctx: {
  encId: string;
  triggerDay: number;
  triggerPeriodIndex: number;
  character: ScavengeCharacter;
  party: ScavengeCharacter[];
  location: ScavengeLocationItem;
  locState: ReturnType<typeof getOrRefreshLocationState>;
  // 复用主函数的 updateParty / runCombat
  updateParty: (newMainChar: ScavengeCharacter, partyHpDelta?: Record<string, number>) => ScavengeCharacter[];
  wrap: (result: { encounter: EncounterLog; updatedChar: ScavengeCharacter; missionOver: boolean; partyHpDelta?: Record<string, number> }) => {
    encounter: EncounterLog;
    updatedParty: ScavengeCharacter[];
    missionOver: boolean;
    restAvailable: boolean;
  };
}): {
  encounter: EncounterLog;
  updatedParty: ScavengeCharacter[];
  missionOver: boolean;
  restAvailable: boolean;
} => {
  const { encId, triggerDay, triggerPeriodIndex, character, party, location, locState, updateParty, wrap } = ctx;

  // 60% 潜行通过（与 scavenge 阶段一致）
  if (Math.random() >= 0.4) {
    const stealthItems: InventoryItem[] = [];
    const lootEntries = Object.entries(locState.lootCount).filter(([_, n]) => n > 0);
    if (lootEntries.length > 0) {
      const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
      const item: InventoryItem = {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,
      };
      stealthItems.push(item);
      takeLootByItemId(location.id, [itemId]);
      // 2026-06-21 改：不再 addToInventory
    }
    return wrap({
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'stealth_clear',
        itemsGained: stealthItems.length > 0 ? stealthItems : undefined,
        message: stealthItems.length > 0
          ? '路上没遇到游荡者（顺手捡了点东西）'
          : '路上没遇到游荡者，队伍顺利前进',
      },
      updatedChar: character,
      missionOver: false,
    });
  }

  // 40% 遇游荡者（抽 1-2 个抽象实例）
  const wanderers = createAbstractWanderers();

  // 警觉判定
  const isNight = triggerPeriodIndex === 4;
  const stats = computeDerivedStats(character, isNight);
  const charStealth = stats.stealth;
  const isTooExposed = charStealth <= 0;
  const detectedFlags: boolean[] = wanderers.map((e) => {
    if (isTooExposed) return true;
    if (e.detection <= 0) return false;
    const success = charStealth / (charStealth + e.detection);
    return Math.random() >= success;
  });

  if (!detectedFlags.some((d) => d)) {
    // 全部没察觉 → 潜行成功（不扣 locationState）
    //   准备阶段不抽物资（路上没什么好拿的）
    return wrap({
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'evade_success',
        enemiesEncountered: wanderers.length,
        message: `路上遇到 ${wanderers.length} 个游荡者，隐蔽成功！悄悄溜过`,
      },
      updatedChar: character,
      missionOver: false,
    });
  }

  // 战斗（游荡者 = 抽象，不扣 locationState.enemyCount）
  for (let i = 0; i < wanderers.length; i++) {
    if (detectedFlags[i]) {
      wanderers[i].startAtb = 50;
    }
  }
  const combatResult = runCombat(party, wanderers);
  const hpDelta = combatResult.partyHpDelta[character.id] ?? 0;
  const updatedChar: ScavengeCharacter = {
    ...character,
    hp: Math.max(0, combatResult.partyFinalHp[character.id] ?? character.hp),
  };

  if (combatResult.characterWon) {
    return {
      encounter: {
        id: encId,
        triggerDay,
        triggerPeriodIndex,
        kind: 'combat_victory',
        enemiesEncountered: wanderers.length,
        combatLog: combatResult.log,
        hpDelta,
        partyHpDelta: combatResult.partyHpDelta,
        message: `击退了 ${wanderers.length} 个游荡者！${hpDelta < 0 ? `（扣血 ${-hpDelta}）` : ''}`,
      },
      updatedParty: updateParty(updatedChar, combatResult.partyHpDelta),
      missionOver: false,
      restAvailable: false,  // 准备阶段战斗不触发休整 modal
    };
  }

  // 败：抽象游荡者战斗失败（不扣 locationState，不丢物品 —— 路上没东西可丢）
  return wrap({
    encounter: {
      id: encId,
      triggerDay,
      triggerPeriodIndex,
      kind: 'combat_defeat',
      enemiesEncountered: wanderers.length,
      combatLog: combatResult.log,
      hpDelta,
      partyHpDelta: combatResult.partyHpDelta,
      message: `被 ${wanderers.length} 个游荡者击退，队伍受伤撤退`,
    },
    updatedChar,
    missionOver: true,  // 准备阶段失败 → 立即结束 mission
  });
};

/**
 * 强制给物资（2026-06-21 加）
 *
 * 场景：拾荒阶段 allEnemies.length === 0 但 lootEntries.length > 0
 *   - 玩家已经把敌人清光了，下次再进入就只剩物资
 *   - 不希望"扑空"，所以 100% 给物资（跳过 60% 潜行检查）
 */
const giveForcedLoot = (ctx: {
  encId: string;
  triggerDay: number;
  triggerPeriodIndex: number;
  character: ScavengeCharacter;
  location: ScavengeLocationItem;
  lootEntries: Array<[string, number]>;
  wrap: (result: { encounter: EncounterLog; updatedChar: ScavengeCharacter; missionOver: boolean; partyHpDelta?: Record<string, number> }) => {
    encounter: EncounterLog;
    updatedParty: ScavengeCharacter[];
    missionOver: boolean;
    restAvailable: boolean;
  };
}): {
  encounter: EncounterLog;
  updatedParty: ScavengeCharacter[];
  missionOver: boolean;
  restAvailable: boolean;
} => {
  const { encId, triggerDay, triggerPeriodIndex, character, location, lootEntries, wrap } = ctx;

  const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
  const item: InventoryItem = {
    instanceId: generateInstanceId(),
    itemId,
    quantity: 1,
  };
  takeLootByItemId(location.id, [itemId]);
  // 2026-06-21 改：不再 addToInventory，物品分配交给 MissionSystem

  return wrap({
    encounter: {
      id: encId,
      triggerDay,
      triggerPeriodIndex,
      kind: 'resource',
      itemsGained: [item],
      message: '该地点已被清空，队伍收拾了一些残余物资',
    },
    updatedChar: character,
    missionOver: false,
  });
};
