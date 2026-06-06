/**
 * 拾荒系统 - 时间效果（数值消耗/恢复）
 *
 * 集中所有"时间流逝 → 角色数值变化"的逻辑，便于调参和测试。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 每 period 基础消耗：hunger -8, thirst -10, sanity -3, fatigue +5
 * - 探索中倍率：×1.5
 * - 过夜恢复（仅 !isExploring）：sanity +20, fatigue -30
 * - 触底连锁：hunger=0 或 thirst=0 时 每 period HP -5
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';

// ============== 调参常量（可改） ==============

/** 每 period 基础 delta（不区分探索/休息） */
export const PER_PERIOD_DELTA = {
  hunger: -8,
  thirst: -10,
  sanity: -3,
  fatigue: +5,
};

/** 探索中（isExploring=true）所有消耗/疲劳的倍率 */
export const EXPLORING_MULTIPLIER = 1.5;

/** 过夜（黑夜→清晨，isOvernight=true 且 isExploring=false）一次性恢复 */
export const OVERNIGHT_RECOVERY = {
  sanity: 20,
  fatigue: -30,
};

/** 饥/渴=0 时每 period HP 损失 */
export const STARVING_HP_DRAIN = 5;

// ============== 内部工具 ==============

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/**
 * 简化版 max 计算：
 * - 饥/渴上限固定 100（生理上限，不随属性变化）
 * - sanity / fatigue 上限用字段（init 时 100，目前不随属性变化）
 * - HP 上限受 end 影响（end 越高血越多，符合直觉）
 *
 * 2026-06-05 与产品确认：max 饥/渴固定 100，end 不再跨系统干预生理上限。
 */
const maxHungerFor = (c: ScavengeCharacter): number => c.maxHunger;
const maxThirstFor = (c: ScavengeCharacter): number => c.maxThirst;
const maxSanityFor = (sanityBase: number): number => sanityBase;
const maxFatigueFor = (fatigueBase: number): number => fatigueBase;
const maxHpFor = (hpBase: number, end: number): number => hpBase + (end - 5) * 5;

// ============== 公开 API ==============

/**
 * 对一组角色应用一个 period 的时间效果（**纯函数，不修改入参**）。
 *
 * @param characters 角色数组
 * @param isOvernight 是否"过夜"（nextDay > 0，即黑夜→清晨）
 * @returns 新数组
 */
export const applyPeriodEffectsToCharacters = (
  characters: ScavengeCharacter[],
  isOvernight: boolean,
): ScavengeCharacter[] => {
  return characters.map((c) => {
    const isExploring = Boolean(c.isExploring);
    const factor = isExploring ? EXPLORING_MULTIPLIER : 1.0;

    const maxH = maxHungerFor(c);
    const maxT = maxThirstFor(c);
    const maxS = maxSanityFor(c.maxSanity);
    const maxF = maxFatigueFor(c.maxFatigue);
    const maxHP = maxHpFor(c.maxHp, c.end);

    // 1) 每 period 基础消耗
    const updated: ScavengeCharacter = {
      ...c,
      hunger: clamp(
        c.hunger + Math.round(PER_PERIOD_DELTA.hunger * factor),
        0, maxH,
      ),
      thirst: clamp(
        c.thirst + Math.round(PER_PERIOD_DELTA.thirst * factor),
        0, maxT,
      ),
      sanity: clamp(
        c.sanity + Math.round(PER_PERIOD_DELTA.sanity * factor),
        0, maxS,
      ),
      fatigue: clamp(
        c.fatigue + Math.round(PER_PERIOD_DELTA.fatigue * factor),
        0, maxF,
      ),
    };

    // 2) 触底连锁：饥/渴=0 时每 period 扣 HP
    if (updated.hunger === 0 || updated.thirst === 0) {
      updated.hp = Math.max(0, updated.hp - STARVING_HP_DRAIN);
    }

    // 3) 过夜恢复：仅休息中的角色（!isExploring）
    if (isOvernight && !isExploring) {
      updated.sanity = clamp(updated.sanity + OVERNIGHT_RECOVERY.sanity, 0, maxS);
      updated.fatigue = clamp(updated.fatigue + OVERNIGHT_RECOVERY.fatigue, 0, maxF);
    }

    // 4) HP 上限兜底（虽然我们没加 HP 上限逻辑，但保持 clamp 习惯）
    updated.hp = clamp(updated.hp, 0, maxHP);

    return updated;
  });
};

/**
 * 调试用：单角色应用一个 period 效果（返回新对象，不改入参）
 */
export const applyPeriodEffectToCharacter = (
  char: ScavengeCharacter,
  isOvernight: boolean,
): ScavengeCharacter => {
  return applyPeriodEffectsToCharacters([char], isOvernight)[0];
};
