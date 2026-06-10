/**
 * 拾荒系统 - 战斗判定（2026-06-07 重构：ATB 1vN + 武器/护甲耐久系统）
 *
 * ATB 累加器：每个参战者（角色 + 所有敌人）有 currentTick：
 * - 战斗开始：所有 currentTick = 0
 * - 每 tick：所有人 currentTick += attackSpeed
 * - 谁先 currentTick >= 100 → 触发行动（攻击），重置 currentTick -= 100 保留余数
 * - 行动完后所有存活者继续累加
 * - 角色 HP=0 或所有敌人 HP=0 → 战斗结束
 *
 * ===== 武器系统（2026-06-07）=====
 * - 当前武器耐久 = 0 → 触发 weapon_break 日志 → 自动扫描背包找可用武器
 * - 找不到 → 触发 fist_fallback 日志，使用拳头（FIST_DAMAGE = 2）
 * - 每次成功命中消耗 1 点武器耐久
 *
 * ===== 护甲系统（2026-06-07）=====
 * - 6 个护甲 slot（helmet/chest/arms/gloves/legs/boots）
 * - 每次被击中：随机选一个"还有耐久"的 slot 扣耐久，超出归 HP
 * - 角色面板的 armor 派生值 = 6 slot 当前耐久之和（不是减伤值）
 *
 * ===== 伤害公式（2026-06-07）=====
 * - 角色攻击：rollWeaponDamage(weapon.id) * (1 + str/100) * critMult，floor
 * - 敌人攻击：attackDamage * critMult - flatArmor，floor（保持旧公式）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import {
  computeDerivedStats, FIST_DAMAGE, ARMOR_SLOT_KINDS,
  getEquippedWeapon, getEquippedArmorPieces, findUsableWeaponInInventory,
  rollWeaponDamage, getItemDurability, isItemBroken,
} from '../ScavengeCharacter/characterCombat';
import { ENEMY_TEMPLATES, EnemyInstance, EnemyType } from '../ScavengeEnemies/enemies';
import {
  getItemById, getItemName, ArmorSlot, getWeaponSpeedModifier,
  SPEED_MODIFIER_MULTIPLIER, ARMOR_SLOT_NAMES, EquipmentItem,
} from '../ScavengeItems/items';
import { InventoryItem, damageItem } from '../ScavengeItems/inventory';

// ============== 战斗日志 ==============

export type CombatLogKind =
  | 'attack' | 'hit' | 'crit' | 'miss' | 'death' | 'system'
  | 'weapon_durability_loss' | 'weapon_break' | 'weapon_switch'
  | 'fist_fallback' | 'armor_absorb';

export interface CombatLogEntry {
  id: string;
  tick: number;
  kind: CombatLogKind;
  attackerName: string;
  defenderName: string;
  damage: number;
  defenderHp: number;
  defenderMaxHp: number;
  flavor?: string;
}

// ============== 调参常量 ==============

const ATB_THRESHOLD = 100;
const MAX_TICKS = 500;
const WEAPON_DURABILITY_PER_HIT = 1; // 每次成功命中扣 1 点

// ============== 内部数据结构 ==============

interface Combatant {
  name: string;
  isCharacter: boolean;
  currentHp: number;
  maxHp: number;
  attackSpeed: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  critMultiplier: number;
  currentTick: number;
  // Enemy 专属
  attackDamage: number;
  armor: number;
  // Character 专属
  weaponInstance: InventoryItem | null;
  weaponDef: EquipmentItem | null;
  armorPieces: Record<ArmorSlot, { def: EquipmentItem; instance: InventoryItem } | null>;
  isFists: boolean;
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

/** 敌人攻击伤害（2026-06-09 改：百分比减伤公式，cap 80%）
 *
 * 旧公式：attackDamage * critMult - flatArmor → 永远 1 滴血（armorTotal=610 远大于 dmg）
 * 新公式：armor 改为"减伤点数"（armor_vest 满耐久 = 6），用百分比减伤：
 *   reduction = armor / (armor + 50)  （cap 0.8，避免堆甲无敌）
 *   final_dmg = attackDamage * critMult * (1 - reduction)
 *
 * 例：armor=22（满耐久 6 件），wanderer 12 dmg：
 *   reduction = 22 / 72 = 30.5%
 *   12 * 0.695 = 8.3 → 8 伤害（合理）
 * 例：armor=50（顶级套），wanderer 12 dmg：
 *   reduction = 50/100 = 50%
 *   12 * 0.5 = 6 伤害
 * 例：armor=0（裸体），wanderer 12 dmg：
 *   reduction = 0
 *   12 * 1 = 12 伤害
 */
const calcEnemyDamage = (attackDamage: number, critMult: number, armor: number): number => {
  const reduction = Math.min(0.8, armor / (armor + 50));
  return Math.max(1, Math.floor(attackDamage * critMult * (1 - reduction)));
};

/** 角色攻击伤害（2026-06-09 改：平方根递增）
 *
 * 公式：floor( base × (1 + sqrt(str)/10) × critMult )
 * - base = rollWeaponDamage(武器)
 * - str 倍率 = 1 + sqrt(str)/10（取代旧的 1 + str/100）
 * - 平方根递增：低 str 增长快、高 str 增长慢（避免堆 str 一边倒）
 *   str 5  → 1.22x  | str 10 → 1.32x  | str 20 → 1.45x  | str 30 → 1.55x
 */
const calcCharacterDamage = (char: ScavengeCharacter, combatant: Combatant, critMult: number): number => {
  let base: number;
  if (combatant.isFists || !combatant.weaponDef) {
    base = FIST_DAMAGE;
  } else {
    base = rollWeaponDamage(combatant.weaponDef.id);
  }
  const strMult = 1 + Math.sqrt(char.str) / 10;
  return Math.max(1, Math.floor(base * strMult * critMult));
};

/** 角色 attackSpeed（按当前武器/fist 状态计算） */
const computeCharacterAttackSpeed = (char: ScavengeCharacter, combatant: Combatant): number => {
  // 2026-06-09 改：平方根递增（取代旧的 agi*6 * speedMult 线性公式）
  // - agi 5  → sqrt(5) * 6 ≈ 13.4
  // - agi 8  → sqrt(8) * 6 ≈ 17.0
  // - agi 15 → sqrt(15) * 6 ≈ 23.2
  // - agi 30 → sqrt(30) * 6 ≈ 32.9
  // 平方根递增：低 agi 提升快，高 agi 提升慢（避免堆 agi 一边倒）
  const baseSpeed = Math.sqrt(char.agi) * 6;
  if (combatant.isFists || !combatant.weaponDef) {
    return baseSpeed;
  }
  const speedMod = getWeaponSpeedModifier(combatant.weaponDef.id);
  const speedMult = SPEED_MODIFIER_MULTIPLIER[speedMod];
  const weaponAgiBonus = combatant.weaponDef.attributes?.agi
    ? combatant.weaponDef.attributes.agi * 0.5
    : 0;
  return baseSpeed * speedMult + weaponAgiBonus;
};

// ============== 护甲吸收伤害 ==============

/**
 * 对角色施加伤害（走护甲吸收流程）：
 * - 找一个 random slot（有耐久的）
 * - 扣该 slot 耐久，剩余伤害走 HP
 */
const applyDamageToCharacter = (
  combatant: Combatant,
  damage: number,
  log: CombatLogEntry[],
  tick: number,
): { excess: number; absorbed: number } => {
  // 找所有有耐久的 slot
  // 2026-06-07 修复：必须用 ARMOR_SLOT_KINDS（ArmorSlot 值），不能用 ARMOR_SLOT_IDS（字段名）
  // 否则 `armorPieces[helmetId]` 是 undefined，命中检测全空，走"无护甲"分支
  const availableSlots: ArmorSlot[] = [];
  for (const slot of ARMOR_SLOT_KINDS) {
    const piece = combatant.armorPieces[slot];
    if (piece && getItemDurability(piece.instance) > 0) {
      availableSlots.push(slot);
    }
  }

  if (availableSlots.length === 0) {
    // 没护甲：全吃
    combatant.currentHp = Math.max(0, combatant.currentHp - damage);
    return { excess: damage, absorbed: 0 };
  }

  // 随机选一个 slot
  const randomSlot = availableSlots[Math.floor(Math.random() * availableSlots.length)];
  const piece = combatant.armorPieces[randomSlot]!;
  const slotDurBefore = getItemDurability(piece.instance);
  const absorbed = Math.min(damage, slotDurBefore);
  const excess = damage - absorbed;

  // 扣耐久
  damageItem(piece.instance, absorbed);
  const slotDurAfter = getItemDurability(piece.instance);

  // 日志：护甲吸收
  log.push({
    id: nextLogId(),
    tick,
    kind: 'armor_absorb',
    attackerName: '',
    defenderName: piece.def.name,
    damage: absorbed,
    defenderHp: slotDurAfter,
    defenderMaxHp: piece.def.maxDurability,
    flavor: `护甲 [${ARMOR_SLOT_NAMES[randomSlot]}] 抵消 ${absorbed} 伤害`,
  });

  // 剩余伤害走 HP
  if (excess > 0) {
    combatant.currentHp = Math.max(0, combatant.currentHp - excess);
  }
  return { excess, absorbed };
};

// ============== 武器可用性检查 ==============

/**
 * 角色行动前检查：当前武器是否还能用（耐久 > 0）
 * - 不可用 → 触发 weapon_break 日志 → 找背包里可用的武器
 * - 找到 → 触发 weapon_switch 日志，切换
 * - 找不到 → 触发 fist_fallback 日志，使用拳头
 *
 * @returns true = 武器/fist 状态有变化（已处理日志），false = 状态没变
 */
const ensureUsableWeapon = (
  character: ScavengeCharacter,
  combatant: Combatant,
  log: CombatLogEntry[],
  tick: number,
): void => {
  if (!combatant.isCharacter) return;

  // 没武器（或拳头状态）：不做
  if (combatant.isFists) return;

  if (combatant.weaponInstance && isItemBroken(combatant.weaponInstance)) {
    // 当前武器已坏
    const oldWeaponName = combatant.weaponDef ? getItemName(combatant.weaponDef.id) : '武器';
    const brokenInstanceId = combatant.weaponInstance.instanceId;

    log.push({
      id: nextLogId(),
      tick,
      kind: 'weapon_break',
      attackerName: combatant.name,
      defenderName: oldWeaponName,
      damage: 0,
      defenderHp: 0,
      defenderMaxHp: 0,
      flavor: `${oldWeaponName} 已损坏`,
    });

    const newWeapon = findUsableWeaponInInventory(character, brokenInstanceId);
    if (newWeapon) {
      const newDef = getItemById(newWeapon.itemId) as EquipmentItem;
      log.push({
        id: nextLogId(),
        tick,
        kind: 'weapon_switch',
        attackerName: combatant.name,
        defenderName: getItemName(newWeapon.itemId),
        damage: 0,
        defenderHp: 0,
        defenderMaxHp: 0,
        flavor: `自动切换到 ${getItemName(newWeapon.itemId)}`,
      });
      combatant.weaponInstance = newWeapon;
      combatant.weaponDef = newDef;
      combatant.isFists = false;
      combatant.attackSpeed = computeCharacterAttackSpeed(character, combatant);
    } else {
      // 找不到可用武器，用拳头
      log.push({
        id: nextLogId(),
        tick,
        kind: 'fist_fallback',
        attackerName: combatant.name,
        defenderName: '',
        damage: 0,
        defenderHp: 0,
        defenderMaxHp: 0,
        flavor: '无武器可用，使用拳头',
      });
      combatant.weaponInstance = null;
      combatant.weaponDef = null;
      combatant.isFists = true;
      combatant.attackSpeed = computeCharacterAttackSpeed(character, combatant);
    }
  }
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
  // ----- 角色参战者初始化 -----
  const equippedWeapon = getEquippedWeapon(character);
  const armorPieces = getEquippedArmorPieces(character);

  let weaponInstance: InventoryItem | null = null;
  let weaponDef: EquipmentItem | null = null;
  let isFists = false;

  if (equippedWeapon) {
    if (isItemBroken(equippedWeapon.instance)) {
      // 装备的武器已坏：找背包里其他可用的
      const replacement = findUsableWeaponInInventory(character, equippedWeapon.instance.instanceId);
      if (replacement) {
        weaponInstance = replacement;
        weaponDef = getItemById(replacement.itemId) as EquipmentItem;
      } else {
        isFists = true;
      }
    } else {
      weaponInstance = equippedWeapon.instance;
      weaponDef = equippedWeapon.def;
    }
  } else {
    isFists = true;
  }

  const charStats = computeDerivedStats(character);
  const charCombatant: Combatant = {
    name: character.name,
    isCharacter: true,
    currentHp: character.hp,
    maxHp: character.hp,
    attackSpeed: 0, // 下面用 computeCharacterAttackSpeed 算
    attackDamage: charStats.attackDamage, // UI 显示用
    armor: charStats.armor, // UI 显示用（=6 slot 耐久总和）
    accuracy: charStats.accuracy,
    evasion: charStats.evasion,
    critRate: charStats.critRate,
    critMultiplier: 1.5,
    currentTick: 0,
    weaponInstance,
    weaponDef,
    armorPieces,
    isFists,
  };
  charCombatant.attackSpeed = computeCharacterAttackSpeed(character, charCombatant);

  // ----- 敌人参战者 -----
  const enemyCombatants: Combatant[] = enemies.map((e, idx) => {
    const t = ENEMY_TEMPLATES[e.type];
    const suffix = enemies.length > 1 ? ` #${idx + 1}` : '';
    return {
      name: t.name + suffix,
      isCharacter: false,
      currentHp: e.currentHp,
      maxHp: e.maxHp,
      attackSpeed: e.attackSpeed,
      attackDamage: t.attackDamage,
      armor: t.armor,
      accuracy: t.accuracy,
      evasion: t.evasion,
      critRate: t.critRate,
      critMultiplier: t.critMultiplier,
      // 2026-06-08 改：用 e.startAtb 作为初始 ATB（警觉判定中发现的敌人 startAtb=50）
      currentTick: e.startAtb ?? 0,
      weaponInstance: null,
      weaponDef: null,
      armorPieces: { helmet: null, chest: null, arms: null, gloves: null, legs: null, boots: null },
      isFists: false,
    };
  });

  const all: Combatant[] = [charCombatant, ...enemyCombatants];
  const aliveEnemies = (): Combatant[] => all.filter(c => !c.isCharacter && c.currentHp > 0);

  const log: CombatLogEntry[] = [];

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
    // 1. 累加
    all.forEach(c => {
      if (c.currentHp > 0) c.currentTick += c.attackSpeed;
    });

    if (charCombatant.currentHp <= 0) break;
    if (aliveEnemies().length === 0) break;

    // 2. 找 actor
    let actor: Combatant | null = null;
    let maxTick = ATB_THRESHOLD;
    for (const c of all) {
      if (c.currentHp <= 0) continue;
      if (c.currentTick >= ATB_THRESHOLD) {
        if (c.currentTick > maxTick) {
          maxTick = c.currentTick;
          actor = c;
        } else if (actor === null) {
          actor = c;
          maxTick = c.currentTick;
        }
      }
    }
    if (!actor) continue;

    actor.currentTick -= ATB_THRESHOLD;

    // 3. 角色行动前确保武器可用
    if (actor.isCharacter) {
      ensureUsableWeapon(character, actor, log, tick);
      if (charCombatant.currentHp <= 0) break;
    }

    // 4. 目标选择
    let target: Combatant | null = null;
    if (actor.isCharacter) {
      const alive = aliveEnemies();
      if (alive.length === 0) break;
      target = alive.reduce((a, b) => (a.currentHp <= b.currentHp ? a : b));
    } else {
      if (charCombatant.currentHp <= 0) break;
      target = charCombatant;
    }

    // 5. 命中判定
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

    // 6. 暴击
    const crit = rollCrit(actor.critRate);

    // 7. 伤害计算
    let damage: number;
    if (actor.isCharacter) {
      damage = calcCharacterDamage(character, actor, crit ? actor.critMultiplier : 1);
    } else {
      damage = calcEnemyDamage(actor.attackDamage, crit ? actor.critMultiplier : 1, target.armor);
    }

    // 8. 应用伤害
    let actualHpDamage = damage;  // 实际扣 HP（护甲吸收后剩余）
    if (target.isCharacter) {
      // 走护甲吸收（2026-06-09 改：返回 excess，用于决定是否推冗余 hit 日志）
      const { excess, absorbed } = applyDamageToCharacter(target, damage, log, tick);
      actualHpDamage = excess;
      // 2026-06-09 改：护甲全吸时（excess===0），不推冗余的 hit 日志
      // （armor_absorb 日志已经说"抵消 X 伤害"，再发 hit 反而误导玩家）
      if (excess === 0) {
        // 完全吸收 → 跳过 hit 日志
        if (charCombatant.currentHp <= 0) break;
        if (aliveEnemies().length === 0) break;
        continue;
      }
    } else {
      // 敌人：直接扣 HP
      target.currentHp = Math.max(0, target.currentHp - damage);
    }

    // 9. 攻击日志（2026-06-09 改：damage 改用 actualHpDamage，部分吸时显示真实 HP 损失）
    log.push({
      id: nextLogId(),
      tick,
      kind: crit ? 'crit' : 'hit',
      attackerName: actor.name,
      defenderName: target.name,
      damage: actualHpDamage,
      defenderHp: target.currentHp,
      defenderMaxHp: target.maxHp,
      flavor: crit ? '暴击！' : undefined,
    });

    // 10. 死亡日志
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

    // 11. 角色攻击成功后：扣武器耐久
    if (actor.isCharacter && !actor.isFists && actor.weaponInstance) {
      damageItem(actor.weaponInstance, WEAPON_DURABILITY_PER_HIT);
    }

    // 12. 结束检查
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
