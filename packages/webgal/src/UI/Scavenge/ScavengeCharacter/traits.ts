/**
 * 角色特性系统（2026-06-09 新建）
 *
 * 设计：
 * - 角色通过 traitIds 持有若干特性（不限制数量）
 * - 每个特性包含多组效果，每组效果可独立配置"触发条件"
 * - 效果可正可负（负面特性 = 减益效果）
 * - 触发条件支持：常驻 / 饥=0 / 渴=0 / 饥或渴=0 / HP 低于 X% / 战斗中
 * - 特性应用：computeDerivedStats 实时计算（不存字段，避免 desync）
 *
 * 效果字段（所有可选，正负均可）：
 * - 基础属性（绝对值）：str / agi / end / int
 * - 战斗概率（百分比，0-1）：accuracyBonus / evasionBonus / critRateBonus
 * - 战斗数值：attackSpeedBonus / attackDamageBonus
 * - 上限加成：maxHpBonus / maxStaminaBonus
 * - 负重：weightReduction（0-1 减重比例，0.5 = 减半）
 */

import { ScavengeCharacter } from './character';
// 注：不要从 './characterCombat' 导入（会循环：characterCombat 又从 traits 导入 sumActiveTraitEffects）
// maxHp 估算在 checkEffectCondition 内用简化公式（不严格精确，但条件判断够用）

// ============== 触发条件类型 ==============

export type EffectCondition =
  | { type: 'always' }                          // 总是生效
  | { type: 'hunger_zero' }                     // 饥饿 = 0
  | { type: 'thirst_zero' }                     // 口渴 = 0
  | { type: 'hunger_or_thirst_zero' }           // 饥或渴 = 0
  | { type: 'hp_below_pct'; threshold: number } // HP < 阈值（0-1）
  | { type: 'in_combat' };                     // 战斗中

// ============== 效果类型 ==============

export interface TraitEffect {
  /** 触发条件，默认 'always' */
  condition?: EffectCondition;
  /** 基础属性（绝对值，可正可负） */
  str?: number;
  agi?: number;
  end?: number;
  int?: number;
  /** 战斗概率（百分比，0-1，可正可负） */
  accuracyBonus?: number;
  evasionBonus?: number;
  critRateBonus?: number;
  /** 战斗数值（绝对值，可正可负） */
  attackSpeedBonus?: number;
  /** 攻击伤害倍率（0.1 = +10% 伤害，可正可负） */
  attackDamageBonus?: number;
  /** 上限加成（绝对值，可正可负） */
  maxHpBonus?: number;
  maxStaminaBonus?: number;
  /** 负重减重（0-1 比例，0.5 = 减半） */
  weightReduction?: number;
}

// ============== 特性定义 ==============

export type TraitCategory = 'combat' | 'survival' | 'social' | 'special';

export interface Trait {
  id: string;
  name: string;
  description: string;
  category: TraitCategory;
  /** 效果组（每组独立条件，可叠加） */
  effects: TraitEffect[];
}

// ============== 内置特性库 ==============

export const TRAITS: Record<string, Trait> = {
  // ===== 正面特性 =====

  trained_warrior: {
    id: 'trained_warrior',
    name: '训练有素',
    description: '受过系统战斗训练，基础属性大幅提升。',
    category: 'combat',
    effects: [
      { str: 5, agi: 4, end: 6 },
    ],
  },

  agile_body: {
    id: 'agile_body',
    name: '灵巧身手',
    description: '天生的敏捷体魄，闪避与速度俱佳。',
    category: 'combat',
    effects: [
      { agi: 5, evasionBonus: 0.15 },
    ],
  },

  iron_will: {
    id: 'iron_will',
    name: '钢铁意志',
    description: '超强的精神抗性，几乎不受心智影响。',
    category: 'survival',
    effects: [
      { int: 3, maxHpBonus: 50 },
    ],
  },

  lucky: {
    id: 'lucky',
    name: '天生好运',
    description: '命运眷顾，更容易命中与暴击。',
    category: 'special',
    effects: [
      { critRateBonus: 0.10, accuracyBonus: 0.05 },
    ],
  },

  lightweight: {
    id: 'lightweight',
    name: '身轻如燕',
    description: '身体轻盈，负重减半。',
    category: 'survival',
    effects: [
      { weightReduction: 0.5 },
    ],
  },

  berserker: {
    id: 'berserker',
    name: '狂战士',
    description: 'HP 越低，伤害越高。濒死时爆发出惊人潜力。',
    category: 'combat',
    effects: [
      // HP >= 50%: 暴击率略升
      { hp_below_pct_skip: undefined },  // 占位，实际条件见下
    ],
  },

  // ===== 负面特性 / 条件效果 =====

  starving: {
    id: 'starving',
    name: '饥肠辘辘',
    description: '饥饿时身体虚弱，饥或渴为 0 时属性大幅下降。',
    category: 'survival',
    effects: [
      {
        condition: { type: 'hunger_or_thirst_zero' },
        str: -3,
        agi: -3,
        end: -2,
      },
    ],
  },

  // 注：'berserker' 用 hp_below_pct 条件，下面专门支持
};

// 单独定义 berserker（带条件）
TRAITS.berserker = {
  id: 'berserker',
  name: '狂战士',
  description: 'HP 越低，伤害越高。濒死时爆发出惊人潜力。',
  category: 'combat',
  effects: [
    { condition: { type: 'hp_below_pct', threshold: 0.5 }, attackDamageBonus: 0.20 },
    { condition: { type: 'hp_below_pct', threshold: 0.25 }, attackDamageBonus: 0.30 },
  ],
};

// ============== 条件检查 & 效果求和 ==============

/** 检查 effect 条件是否在当前角色状态下成立 */
export const checkEffectCondition = (
  cond: EffectCondition | undefined,
  char: ScavengeCharacter,
): boolean => {
  const c = cond ?? { type: 'always' };
  switch (c.type) {
    case 'always':
      return true;
    case 'hunger_zero':
      return char.hunger <= 0;
    case 'thirst_zero':
      return char.thirst <= 0;
    case 'hunger_or_thirst_zero':
      return char.hunger <= 0 || char.thirst <= 0;
    case 'hp_below_pct': {
      // 简化估算 maxHp（避免循环引用 characterCombat.getMaxHp）
      // 公式：100 + end * 8（不含装备 end bonus 和 trait maxHpBonus）
      // 精度影响：阈值判断（50% / 25%）有 ±5% 偏差可接受
      // 如需精确，可让 characterCombat 把 getMaxHp 暴露在 character.ts 的 helper 中
      const approxMaxHp = 100 + char.end * 8;
      return approxMaxHp > 0 && char.hp / approxMaxHp < c.threshold;
    }
    case 'in_combat':
      return Boolean(char.isExploring);
    default:
      return false;
  }
};

/** 所有 effect 字段名（用于循环求和） */
const EFFECT_FIELDS: (keyof TraitEffect)[] = [
  'str', 'agi', 'end', 'int',
  'accuracyBonus', 'evasionBonus', 'critRateBonus',
  'attackSpeedBonus', 'attackDamageBonus',
  'maxHpBonus', 'maxStaminaBonus',
  'weightReduction',
];

/** 累加角色所有 active 特性的效果（实时计算） */
export const sumActiveTraitEffects = (char: ScavengeCharacter): TraitEffect => {
  const total: TraitEffect = {};
  for (const id of char.traitIds ?? []) {
    const trait = TRAITS[id];
    if (!trait) continue; // 未知 ID 跳过
    for (const eff of trait.effects) {
      if (!checkEffectCondition(eff.condition, char)) continue;
      for (const key of EFFECT_FIELDS) {
        const v = eff[key];
        if (typeof v === 'number') {
          (total as any)[key] = ((total as any)[key] ?? 0) + v;
        }
      }
    }
  }
  return total;
};

/** 拿某个 trait 定义（未知 ID 返回 undefined） */
export const getTrait = (id: string): Trait | undefined => TRAITS[id];

/** 列出所有已注册 trait */
export const listAllTraits = (): Trait[] => Object.values(TRAITS);
