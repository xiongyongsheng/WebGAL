/**
 * 拾荒系统 - 战斗判定（ATB 1vN 版本，2026-06-05 重构）
 *
 * ATB 累加器：每个参战者（角色 + 所有敌人）有 currentTick：
 * - 战斗开始：所有 currentTick = 0
 * - 每 tick：所有人 currentTick += attackSpeed
 * - 谁先 currentTick >= 100 → 触发行动（攻击），重置 currentTick -= 100 保留余数
 * - 行动完后所有存活者继续累加
 * - 角色 HP=0 或所有敌人 HP=0 → 战斗结束
 *
 * 目标选择：
 * - 角色触发：选当前 HP 最少的存活敌人
 * - 敌人触发：永远攻击角色
 *
 * 攻击流程（每次触发 1 次）：
 * 1. 命中判定：attacker.accuracy vs defender.evasion
 * 2. 暴击判定（仅命中）：attacker.critRate
 * 3. 伤害 = max(1, attacker.attackDamage * (暴击? critMultiplier: 1) - defender.armor)
 * 4. defender.currentHp -= damage
 *
 * 设计（2026-06-05 与产品确认）：
 * - 角色 attackSpeed = agi * 6（基础 5 时 = 30，约 3.3 tick 触发一次）
 * - 敌人 attackSpeed 固定：游荡者 20 / 追逐者 30 / 防暴者 15
 * - 战斗无轮数上限，跑到一方全倒为止（防御性 MAX_TICKS 兜底）
 * - 1vN：多敌人一起战斗，不是 1v1
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { computeDerivedStats, DerivedCombatStats } from '../ScavengeCharacter/characterCombat';
import { ENEMY_TEMPLATES, EnemyInstance, EnemyType } from '../ScavengeEnemies/enemies';

// ============== 战斗日志 ==============

export type CombatLogKind = 'attack' | 'hit' | 'crit' | 'miss' | 'death' | 'system';

export interface CombatLogEntry {
  /** 唯一 ID（用于 React key） */
  id: string;
  /** tick 序号（1 起） */
  tick: number;
  /** 日志类型 */
  kind: CombatLogKind;
  /** 攻击者名字（角色或敌人 + 编号） */
  attackerName: string;
  /** 防御者名字 */
  defenderName: string;
  /** 攻击伤害（未命中时为 0） */
  damage: number;
  /** 防御者剩余 HP */
  defenderHp: number;
  /** 防御者最大 HP */
  defenderMaxHp: number;
  /** 额外文本（"暴击"等） */
  flavor?: string;
}

// ============== 调参常量 ==============

/** ATB 触发阈值 */
const ATB_THRESHOLD = 100;

/** 防御性 tick 上限（防死循环；正常战斗几十 tick 内结束） */
const MAX_TICKS = 500;

// ============== 内部数据结构 ==============

/** 战斗参战者（统一类型：角色或敌人） */
interface Combatant {
  /** 唯一 key（敌人用 #N 编号） */
  name: string;
  /** true=角色（行动不会变） */
  isCharacter: boolean;
  currentHp: number;
  maxHp: number;
  attackDamage: number;
  attackSpeed: number;
  armor: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  critMultiplier: number;
  currentTick: number;
}

let _logIdCounter = 0;
const nextLogId = (): string => `log_${Date.now()}_${_logIdCounter++}`;

// ============== 判定工具 ==============

const rollHit = (attackerAcc: number, defenderEva: number): boolean => {
  return Math.random() < attackerAcc - defenderEva;
};

const rollCrit = (critRate: number): boolean => {
  return Math.random() < critRate;
};

const calcDamage = (attackDamage: number, critMult: number, armor: number): number => {
  return Math.max(1, Math.floor(attackDamage * critMult - armor));
};

// ============== 公共 API ==============

export interface CombatResult {
  characterWon: boolean;
  log: CombatLogEntry[];
  characterFinalHp: number;
  enemiesFinalHp: number[];
  totalTicks: number;
}

/**
 * 跑一场 ATB 1vN 战斗
 */
export const runCombat = (
  character: ScavengeCharacter,
  enemies: EnemyInstance[],
): CombatResult => {
  const charStats = computeDerivedStats(character);
  const charCombatant: Combatant = {
    name: character.name,
    isCharacter: true,
    currentHp: character.hp,
    maxHp: character.hp,
    attackDamage: charStats.attackDamage,
    attackSpeed: charStats.attackSpeed,
    armor: charStats.armor,
    accuracy: charStats.accuracy,
    evasion: charStats.evasion,
    critRate: charStats.critRate,
    critMultiplier: 1.5, // 角色暴击倍率固定 1.5
    currentTick: 0,
  };

  // 敌人参战者（多敌人时加 #1 #2 ... 编号）
  const enemyCombatants: Combatant[] = enemies.map((e, idx) => {
    const t = ENEMY_TEMPLATES[e.type];
    const suffix = enemies.length > 1 ? ` #${idx + 1}` : '';
    return {
      name: t.name + suffix,
      isCharacter: false,
      currentHp: e.currentHp,
      maxHp: e.maxHp,
      attackDamage: t.attackDamage,
      attackSpeed: e.attackSpeed,
      armor: t.armor,
      accuracy: t.accuracy,
      evasion: t.evasion,
      critRate: t.critRate,
      critMultiplier: t.critMultiplier,
      currentTick: 0,
    };
  });

  // 全部参战者（含角色，isCharacter 区分）
  const all: Combatant[] = [charCombatant, ...enemyCombatants];
  // 单独的敌人数组（用于"选血最少的敌人"）
  const aliveEnemies = (): Combatant[] => all.filter(c => !c.isCharacter && c.currentHp > 0);

  const log: CombatLogEntry[] = [];

  // 空敌人直接胜利
  if (enemies.length === 0) {
    return {
      characterWon: true,
      log,
      characterFinalHp: charCombatant.currentHp,
      enemiesFinalHp: [],
      totalTicks: 0,
    };
  }

  // ATB 主循环
  let tick = 0;
  while (tick < MAX_TICKS) {
    tick++;
    // 1. 累加（所有存活者）
    all.forEach(c => {
      if (c.currentHp > 0) c.currentTick += c.attackSpeed;
    });

    // 2. 检查结束条件
    if (charCombatant.currentHp <= 0) break;
    if (aliveEnemies().length === 0) break;

    // 3. 找谁先触发（currentTick >= 100）
    //    注意：可能多人都触发，按 currentTick 大小顺序处理
    let actor: Combatant | null = null;
    let maxTick = ATB_THRESHOLD;
    for (const c of all) {
      if (c.currentHp <= 0) continue;
      if (c.currentTick >= ATB_THRESHOLD) {
        if (c.currentTick > maxTick) {
          maxTick = c.currentTick;
          actor = c;
        } else if (actor === null) {
          // 平手：取第一个
          actor = c;
          maxTick = c.currentTick;
        }
      }
    }
    if (!actor) continue; // 没人触发，下一 tick

    // 4. 触发：扣减 currentTick（保留余数）
    actor.currentTick -= ATB_THRESHOLD;

    // 5. 决定目标
    let target: Combatant | null = null;
    if (actor.isCharacter) {
      // 角色触发：选 HP 最少的存活敌人
      const alive = aliveEnemies();
      if (alive.length === 0) break;
      target = alive.reduce((a, b) => (a.currentHp <= b.currentHp ? a : b));
    } else {
      // 敌人触发：永远攻击角色
      if (charCombatant.currentHp <= 0) break;
      target = charCombatant;
    }

    // 6. 命中/暴击/伤害
    const hit = rollHit(actor.accuracy, target.evasion);
    if (!hit) {
      log.push({
        id: nextLogId(),
        tick,
        kind: 'miss',
        attackerName: actor.name,
        defenderName: target.name,
        damage: 0,
        defenderHp: target.currentHp,
        defenderMaxHp: target.maxHp,
        flavor: '未命中',
      });
      continue;
    }

    const crit = rollCrit(actor.critRate);
    const damage = calcDamage(actor.attackDamage, crit ? actor.critMultiplier : 1, target.armor);
    target.currentHp = Math.max(0, target.currentHp - damage);
    log.push({
      id: nextLogId(),
      tick,
      kind: crit ? 'crit' : 'hit',
      attackerName: actor.name,
      defenderName: target.name,
      damage,
      defenderHp: target.currentHp,
      defenderMaxHp: target.maxHp,
      flavor: crit ? '暴击！' : undefined,
    });

    // 7. 死亡记录（敌人死了才记"被击倒"）
    if (target.currentHp <= 0 && !target.isCharacter) {
      log.push({
        id: nextLogId(),
        tick,
        kind: 'death',
        attackerName: actor.name,
        defenderName: target.name,
        damage: 0,
        defenderHp: 0,
        defenderMaxHp: target.maxHp,
        flavor: '被击倒',
      });
    }

    // 8. 角色死了立即结束
    if (charCombatant.currentHp <= 0) break;
    if (aliveEnemies().length === 0) break;
  }

  // 写回敌人 currentHp
  enemies.forEach((e, idx) => {
    if (enemyCombatants[idx]) e.currentHp = enemyCombatants[idx].currentHp;
  });

  return {
    characterWon: charCombatant.currentHp > 0,
    log,
    characterFinalHp: charCombatant.currentHp,
    enemiesFinalHp: enemyCombatants.map(c => c.currentHp),
    totalTicks: tick,
  };
};

// ============== 隐蔽率判定 ==============

/**
 * 隐蔽判定：成功则本次遭遇不算遇敌；失败则进入战斗
 * @returns evaded: true=成功回避，false=进入战斗
 */
export const rollStealth = (character: ScavengeCharacter): boolean => {
  const stats = computeDerivedStats(character);
  return Math.random() < stats.stealth;
};
