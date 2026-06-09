/**
 * 拾荒系统 - 派遣遭遇检查（2026-06-08 拆分自 missions.ts）
 *
 * 遭遇检查：每个 period 调一次
 * 1. 60% 不遭遇 / 40% 遭遇
 * 2. 遭遇时 80% 丧尸 / 20% 资源点
 * 3. 丧尸：从 locationState.enemyCount 抽 1~3 个
 *    - char.strategy='stealth'：先隐蔽判定，失败再进入战斗
 *    - char.strategy='combat'：直接进入战斗
 * 4. 战斗：用 runCombat 算胜负
 *    - 胜：可获得物资 + 经验
 *    - 败：扣 HP，mission 标记失败（completeMission 时不再给奖励）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { computeDerivedStats } from '../ScavengeCharacter/characterCombat';
import { InventoryItem, addToInventory, generateInstanceId } from '../ScavengeItems/inventory';
import { ScavengeLocationItem } from '../ScavengeMap/locations';
import {
  getOrRefreshLocationState,
  deductEnemiesByType,
  takeLootByItemId,
  countToEnemies,
  touchLocationInteracted,
} from '../ScavengeMap/locationRefresh';
import { pickRandomEncounterEnemies } from '../ScavengeEnemies/enemies';
import { runCombat } from '../ScavengeCombat/combat';
import { Mission, EncounterLog } from './missions';

/**
 * 胜仗后额外抽 1 个物资的概率（2026-06-09 加）
 * - 30% = 100 次战斗约 30 次额外出 1 个
 * - 第一个固定抽完后再判定（防止一次拿 2 个相同）
 * - 失败不抽（鼓励"慎战"）
 */
const POST_COMBAT_BONUS_LOOT_RATE = 0.3;

/**
 * 派遣期间每个 period 调一次：决定是否遭遇 + 触发战斗/资源
 *
 * @returns { encounter, updatedChar, missionOver } encounter 记录 + 角色 HP 更新后的副本 + 是否立即结束 mission
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

  // 2026-06-08 加：取/刷新 location 状态（如果时间过期或 dirty）
  const locState = getOrRefreshLocationState(location, triggerDay);
  // 记录派遣（用于 UI 显示"X 天没人来"）
  touchLocationInteracted(location.id, triggerDay);

  // 1. 60% 不遭遇（2026-06-09 改：combat 策略 100% 遭遇，跳过此检查）
  if (mission.strategy !== 'combat' && Math.random() >= 0.4) {
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
    // 2026-06-08 改：从 locationState.lootCount 抽（state 没东西就 no_encounter）
    const lootEntries = Object.entries(locState.lootCount).filter(([_, n]) => n > 0);
    let updatedChar: ScavengeCharacter = character;
    if (lootEntries.length > 0) {
      // 选一个
      const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
      const item: InventoryItem = {
        instanceId: generateInstanceId(),
        itemId,
        quantity: 1,  // 每个"点"代表 1 个
      };
      baseItems.push(item);
      // 减 state
      takeLootByItemId(location.id, [itemId]);
      // 加到角色背包
      updatedChar = {
        ...character,
        inventory: addToInventory(character.inventory ?? [], item),
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

  // 3. 丧尸：从 locationState.enemyCount 抽 1~3 个
  const allEnemies = countToEnemies(locState.enemyCount);
  if (allEnemies.length === 0) {
    // state 没敌人了（已被刷光 / 危险等级 0）
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
  // 抽 1~min(3, allEnemies.length) 个
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
    // 全部没察觉 → 潜行成功（**不**减敌人，敌人还活着，下次还能遇到）
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
      updatedChar.inventory = addToInventory(updatedChar.inventory ?? [], item);
    }
    // 2026-06-09 加：胜仗 30% 概率额外抽 1 个物资（bonus loot）
    // 抽完第一个后再读 state（已变化），最多 1 个 bonus
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
        updatedChar.inventory = addToInventory(updatedChar.inventory ?? [], item);
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
        message: `战胜了 ${encounterEnemies.length} 个敌人！${hpDelta < 0 ? `（扣血 ${-hpDelta}）` : ''}${bonusLootCount > 0 ? '（额外战利品！）' : ''}`,
      },
      updatedChar,
      missionOver: false, // 战斗胜不结束 mission，继续探索
    };
  }

  // 败：扣 state 中所有遇到的敌人（虽然没全部击败，但遇到了就是遇到了）
  const defeatedCounts: Record<string, number> = {};
  for (const e of encounterEnemies) {
    defeatedCounts[e.type] = (defeatedCounts[e.type] ?? 0) + 1;
  }
  deductEnemiesByType(location.id, defeatedCounts);

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
