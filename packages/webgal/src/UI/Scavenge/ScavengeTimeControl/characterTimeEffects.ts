/**
 * 拾荒系统 - 时间效果（数值消耗/恢复 + 经验获得）
 *
 * 集中所有"时间流逝 → 角色数值变化"的逻辑，便于调参和测试。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 每 period 基础消耗：hunger -8, thirst -10, sanity -3, stamina -5
 * - 探索中倍率：×1.5
 * - 过夜恢复（仅 !isExploring）：sanity +20, stamina +30
 * - 触底连锁：hunger=0 或 thirst=0 时 每 period HP -5
 * - 体力上限：100 + (end - 5) * 5（end 仅影响上限，不影响消耗/恢复速率）
 * - 经验获得：休息中 +5, 探索中 +8（升级逻辑见 characterExperience.ts）
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { gainExp } from '../ScavengeCharacter/characterExperience';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { applyAutoTraits } from '../ScavengeCharacter/traits';

// ============== 调参常量（可改） ==============

/** 每 period 基础 delta（不区分探索/休息） */
export const PER_PERIOD_DELTA = {
  hunger: -8,
  thirst: -10,
  sanity: -3,
  stamina: -5,
};

/** 探索中（isExploring=true）所有消耗/疲劳的倍率 */
export const EXPLORING_MULTIPLIER = 1.5;

/** 过夜（黑夜→清晨，isOvernight=true 且 isExploring=false）一次性恢复 */
export const OVERNIGHT_RECOVERY = {
  sanity: 20,
  stamina: 30,
};

/** 饥/渴=0 时每 period HP 损失 */
export const STARVING_HP_DRAIN = 5;

// ============== 经验/升级 调参常量 ==============

/** 每 period 经验：休息中 / 探索中（详见 characterExperience.ts） */
export const EXP_PER_PERIOD_RESTING = 5;
export const EXP_PER_PERIOD_EXPLORING = 8;

// ============== 内部工具 ==============

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/**
 * 简化版 max 计算：
 * - 饥/渴上限固定 100（生理上限，不随属性变化）
 * - sanity 上限用字段（init 时 100）
 * - 体力上限受 end 影响：100 + end * 8（2026-06-09 改：去掉 -5 基准）
 * - HP 上限受 end 影响：hpBase + end * 8（2026-06-09 改：去掉 -5 基准）
 *
 * 2026-06-05 与产品确认：
 * - max 饥/渴固定 100
 * - 体力上限受 end 影响
 *
 * 2026-06-09 改：去掉 -5 基准，直接 end * 8
 * 重要：必须与 ScavengeCharacterPanel.getMaxHp 保持一致
 * 否则每 period 推进都会把 HP/stamina clamp 到旧值，玩家会看到属性突然下降
 */
const maxHungerFor = (c: ScavengeCharacter): number => c.maxHunger;
const maxThirstFor = (c: ScavengeCharacter): number => c.maxThirst;
const maxSanityFor = (sanityBase: number): number => sanityBase;
const maxStaminaFor = (c: ScavengeCharacter): number => 100 + c.end * 8;
const maxHpFor = (hpBase: number, end: number): number => hpBase + end * 8;

// ============== 公开 API ==============

/**
 * 对一组角色应用一个 period 的时间效果（**纯函数，不修改入参**）。
 *
 * 2026-06-09 改：只对 ally（友方/队伍成员）应用时间效果
 *   - ally：玩家队伍，需要管理体力/饥渴/经验
 *   - neutral（中立，如商人）：不消耗体力，住在固定位置
 *   - enemy（敌对）：战斗单位，独立管理
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
    // 2026-06-09 加：非 ally 角色跳过时间效果
    const template = CHARACTER_TEMPLATES[c.id];
    const faction = template?.faction ?? 'ally';
    if (faction !== 'ally') {
      return c;  // 中立/敌对角色不受时间流逝影响
    }

    const isExploring = Boolean(c.isExploring);
    const factor = isExploring ? EXPLORING_MULTIPLIER : 1.0;

    const maxH = maxHungerFor(c);
    const maxT = maxThirstFor(c);
    const maxS = maxSanityFor(c.maxSanity);
    const maxST = maxStaminaFor(c);
    const maxHP = maxHpFor(c.maxHp, c.end);

    // 1) 每 period 基础消耗 + 同步 max（end 改变后，maxStamina / maxHp 会跟）
    let updated: ScavengeCharacter = {
      ...c,
      maxStamina: maxST,
      maxHp: maxHP,
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
      stamina: clamp(
        c.stamina + Math.round(PER_PERIOD_DELTA.stamina * factor),
        0, maxST,
      ),
    };

    // 2) 触底连锁：饥/渴=0 时每 period 扣 HP
    if (updated.hunger === 0 || updated.thirst === 0) {
      updated.hp = Math.max(0, updated.hp - STARVING_HP_DRAIN);
    }

    // 3) 过夜恢复：仅休息中的角色（!isExploring）
    if (isOvernight && !isExploring) {
      updated.sanity = clamp(updated.sanity + OVERNIGHT_RECOVERY.sanity, 0, maxS);
      updated.stamina = clamp(updated.stamina + OVERNIGHT_RECOVERY.stamina, 0, maxST);
    }

    // 4) HP / 体力 上限兜底
    updated.hp = clamp(updated.hp, 0, maxHP);
    updated.stamina = clamp(updated.stamina, 0, maxST);

    // 5) 经验获得（休息 +5, 探索 +8；升级逻辑由 gainExp 内部处理，可能连升 N 级）
    const expAmount = isExploring ? EXP_PER_PERIOD_EXPLORING : EXP_PER_PERIOD_RESTING;
    updated = gainExp(updated, expAmount);

    // 6) 自动特性管理（2026-06-09 加）
    //   根据数值（HP/hunger/thirst/sanity/stamina）自动添加/移除条件特性
    //   例如：hunger=0 → "饥肠辘辘"；hunger>10 → 移除
    //   不能手动加/移除：仅由 applyAutoTraits 系统管理
    // 注：currentDay 这里没有传，特性会按"未过期"处理（autoDurationDays 暂不生效）
    //   实际调用方会传 currentDay（在外层 caller）
    // 这里传 0 占位（特性不依赖 day，只依赖数值）
    updated = applyAutoTraits(updated, 0);

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
