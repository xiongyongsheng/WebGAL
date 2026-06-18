/**
 * 角色特性系统（2026-06-09 重构）
 *
 * 概念：
 * - **被动特性**：常驻生效（如"训练有素"、"狂战士"），不随时间消失
 * - **条件特性**：由数值触发的减益（如 hunger=0 → "饥肠辘辘"），条件满足时自动添加
 * - **时效特性**：duration 到期自动消失（如"中毒"持续 3 天）
 *
 * 数据结构：
 * - Trait：定义（名字/描述/效果/分类），存放在 TRAITS 全局表
 * - CharacterTraitInstance：角色身上的特性实例（带 expiresAt）
 *   - expiresAtDay = undefined：永久（常驻特性）
 *   - expiresAtDay = N：到第 N 天自动移除
 *
 * 自动管理（不能手动加/删）：
 * - applyAutoTraits(char, currentDay)：检查数值，自动添加/移除负面特性
 * - cleanupExpiredTraits(char, currentDay)：移除到期特性
 * - 调用方：characterTimeEffects（每 period 推进后调一次）
 *
 * 不能行动检查（任何一项为 0）：
 * - canDispatch(char)：HP/hunger/thirst/sanity/stamina 任一 = 0 → 返回 false
 *
 * 特性百科：
 * - TraitCodex 组件：按分类列出所有已注册特性
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

export type TraitCategory = 'combat' | 'survival' | 'social' | 'special' | 'condition';

export interface Trait {
  id: string;
  name: string;
  description: string;
  category: TraitCategory;
  /** 效果组（每组独立条件，可叠加） */
  effects: TraitEffect[];
  /**
   * 自动管理（2026-06-09 加）：
   * - undefined / false：常驻特性（不会自动添加/移除）
   * - true：由 applyAutoTraits 管理的"条件特性"（数值触发）
   *   例如：starving（hunger=0 时自动添加）
   */
  autoManaged?: boolean;
  /**
   * 自动添加时设置的时效（天数）。
   * - undefined：永久（直到条件反转才移除）
   * - 数字 N：添加后 N 天自动过期
   * 仅 autoManaged=true 有效
   */
  autoDurationDays?: number;
  /**
   * 自动移除的"恢复条件"（仅 autoManaged=true 有效）
   * - undefined：永不过期（直到手动移除）
   * - function：返回 true 时移除
   */
  autoRemoveCondition?: (char: ScavengeCharacter) => boolean;
}

// ============== 内置特性库 ==============

export const TRAITS: Record<string, Trait> = {
  // ===== 正面特性（常驻）=====

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

  // ===== 负面特性 / 条件效果（autoManaged=true）=====
  // 2026-06-09 改：每个数值过低的特性都加 autoManaged + autoRemoveCondition

  starving: {
    id: 'starving',
    name: '饥肠辘辘',
    description: '饥饿=0 时身体虚弱，全属性大幅下降，无法派遣。',
    category: 'condition',
    effects: [
      { str: -3, agi: -3, end: -2, int: -2 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.hunger > 10,
  },

  parched: {
    id: 'parched',
    name: '干渴难耐',
    description: '口渴=0 时反应迟钝，命中和闪避下降。',
    category: 'condition',
    effects: [
      { agi: -3, end: -2, accuracyBonus: -0.20, evasionBonus: -0.15 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.thirst > 10,
  },

  dehydrated: {
    id: 'dehydrated',
    name: '严重脱水',
    description: '饥=0 且渴=0 时陷入脱水状态，所有战斗属性严重下降。',
    category: 'condition',
    effects: [
      { str: -5, agi: -5, end: -4, int: -3, attackSpeedBonus: -20, accuracyBonus: -0.30, evasionBonus: -0.25 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.hunger > 0 && char.thirst > 0,
  },

  exhausted: {
    id: 'exhausted',
    name: '精疲力竭',
    description: '体力=0 时无法行动，不能派遣。',
    category: 'condition',
    effects: [
      { agi: -4, attackSpeedBonus: -30 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.stamina > 20,
  },

  mentally_exhausted: {
    id: 'mentally_exhausted',
    name: '精神崩溃',
    description: '精神=0 时陷入崩溃，判断力严重下降。',
    category: 'condition',
    effects: [
      { int: -5, accuracyBonus: -0.40, evasionBonus: -0.30 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.sanity > 20,
  },

  critical_injury: {
    id: 'critical_injury',
    name: '重伤',
    description: 'HP 低于 25% 时行动力严重下降，濒临死亡。',
    category: 'condition',
    effects: [
      { str: -3, end: -3, agi: -2, attackSpeedBonus: -15 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.hp / (100 + char.end * 8) >= 0.30,
  },

  dying: {
    id: 'dying',
    name: '濒死',
    description: 'HP 低于 10% 时濒临死亡，濒死状态无法派遣/战斗。',
    category: 'condition',
    effects: [
      { str: -8, agi: -8, end: -6, attackSpeedBonus: -50, accuracyBonus: -0.50 },
    ],
    autoManaged: true,
    autoRemoveCondition: (char) => char.hp / (100 + char.end * 8) >= 0.20,
  },

  // ===== 永久负面特性（占位，未来剧情可触发）=====
  // 这些是剧情给予的"永久负面"，没有 autoManaged

  scarred: {
    id: 'scarred',
    name: '伤痕累累',
    description: '受过重伤，留下永久疤痕，HP 上限降低。',
    category: 'survival',
    effects: [
      { maxHpBonus: -30 },
    ],
  },

  traumatized: {
    id: 'traumatized',
    name: '心理创伤',
    description: '经历过恐怖事件，精神上限降低。',
    category: 'survival',
    effects: [
      { maxHpBonus: -20, int: -2 },
    ],
  },

  // ===== 时效特性（autoManaged=true + autoDurationDays）=====
  // 这些是"带持续时间"的减益（如"中毒"持续 3 天）

  poisoned: {
    id: 'poisoned',
    name: '中毒',
    description: '中毒状态，每 period 额外扣 5 HP，持续 3 天。',
    category: 'condition',
    effects: [
      // 注：减 HP 的效果在 characterTimeEffects 里硬编码（识别 poisoned traitId）
    ],
    autoManaged: true,
    autoDurationDays: 3,
  },

  bleeding: {
    id: 'bleeding',
    name: '流血',
    description: '伤口未处理，持续失血，每 period 扣 3 HP，持续 2 天。',
    category: 'condition',
    effects: [],
    autoManaged: true,
    autoDurationDays: 2,
  },

  // ===== 狂战士（HP 低时伤害高）=====
  berserker: {
    id: 'berserker',
    name: '狂战士',
    description: 'HP 越低，伤害越高。濒死时爆发出惊人潜力。',
    category: 'combat',
    effects: [
      { condition: { type: 'hp_below_pct', threshold: 0.5 }, attackDamageBonus: 0.20 },
      { condition: { type: 'hp_below_pct', threshold: 0.25 }, attackDamageBonus: 0.30 },
    ],
  },
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

// ============== 角色身上的特性实例（带 expiresAt）==============

/**
 * 角色身上的特性实例（2026-06-09 加）
 *
 * 区别于 Trait（定义）：
 * - Trait 是全局定义（TRAITS 表）
 * - CharacterTraitInstance 是角色身上的实例（带过期时间）
 *
 * 用法：
 * - char.traitInstances: CharacterTraitInstance[]（持久化）
 * - char.traitIds: string[]（向后兼容，包含所有 active trait）
 *
 * 字段：
 * - id: trait 定义 ID（用于查 TRAITS）
 * - addedAtDay: 添加时的 day
 * - expiresAtDay: 过期 day（undefined = 永久）
 */
export interface CharacterTraitInstance {
  id: string;
  addedAtDay: number;
  expiresAtDay?: number;
}

// ============== 自动管理 ==============

/**
 * 自动管理角色特性（2026-06-09 加）
 *
 * 调用时机：每 period 推进后（characterTimeEffects.applyPeriodEffectsToCharacters）
 *
 * 行为：
 * 1. 遍历所有 autoManaged 特性的定义
 * 2. 对每个：
 *    - 如果角色已有该 trait 实例：
 *      - 检查 expiresAtDay 是否过期 → 移除
 *      - 检查 autoRemoveCondition → 满足则移除
 *    - 如果角色没有该 trait 实例：
 *      - 检查 autoRemoveCondition 的反条件（触发条件）→ 满足则添加
 * 3. 同步更新 char.traitIds（保持一致）
 *
 * 触发条件推断：
 * - 如果 autoRemoveCondition 是 `(char) => char.hunger > 10`
 *   → 触发条件（添加）是 `(char) => char.hunger <= 0`
 * - 用户也可以自定义（这个函数暂时没用到）
 *
 * @param char 角色（注意：函数会修改 char.traitIds 和 char.traitInstances）
 * @param currentDay 当前 day
 * @returns 修改后的 char（也直接改了 char 引用）
 */
export const applyAutoTraits = (char: ScavengeCharacter, currentDay: number): ScavengeCharacter => {
  if (!char.traitInstances) char.traitInstances = [];
  if (!char.traitIds) char.traitIds = [];

  for (const trait of Object.values(TRAITS)) {
    if (!trait.autoManaged) continue;
    const existingIdx = char.traitInstances.findIndex(inst => inst.id === trait.id);
    const hasInstance = existingIdx >= 0;
    const removeCondition = trait.autoRemoveCondition;

    if (hasInstance) {
      // 已有：检查过期 + removeCondition
      // 2026-06-09 改：只删除**确认**该删的（防止误删）
      //   - 过期：currentDay >= expiresAtDay（时效特性到期）
      //   - removeCondition：数值恢复
      //   其他情况：保留（不重复判断，防止 race condition）
      const inst = char.traitInstances[existingIdx];
      let shouldRemove = false;
      // 1. 过期检查
      if (inst.expiresAtDay !== undefined && currentDay >= inst.expiresAtDay) {
        shouldRemove = true;
      }
      // 2. removeCondition 检查
      if (!shouldRemove && removeCondition && removeCondition(char)) {
        shouldRemove = true;
      }
      if (shouldRemove) {
        char.traitInstances.splice(existingIdx, 1);
      }
      // 注意：hasInstance=true 且 shouldRemove=false → 保留（不进入 else 分支）
    } else {
      // 没有：检查是否要添加
      // 触发条件 = removeCondition 的反条件
      let shouldAdd = false;
      if (removeCondition) {
        // 反条件 = !removeCondition(char)
        shouldAdd = !removeCondition(char);
      } else if (trait.autoDurationDays && trait.autoDurationDays > 0) {
        // 时效特性：直接添加（由添加方调用 addTrait）
        shouldAdd = false;  // 不会自动加（需要其他系统调用 addTrait）
      }
      if (shouldAdd) {
        char.traitInstances.push({
          id: trait.id,
          addedAtDay: currentDay,
          expiresAtDay: trait.autoDurationDays
            ? currentDay + trait.autoDurationDays
            : undefined,
        });
      }
    }
  }

  // 2026-06-09 改：同步 traitIds = 常驻特性 + traitInstances
  // 之前 char.traitIds = char.traitInstances.map(...) → 丢失常驻手动加的特性！
  // 流程：
  //   1. 保留 char.traitIds 里所有"非 autoManaged"特性（即常驻手动加的）
  //   2. 加上 char.traitInstances 里的所有 autoManaged 特性
  // 防止自动管理删掉玩家手动加的特性（如"训练有素"）
  const autoManagedIds = new Set(char.traitInstances.map(inst => inst.id));
  const permanentIds = char.traitIds.filter(id => {
    const t = TRAITS[id];
    return t && !t.autoManaged;  // 只保留常驻（手动加的）
  });
  char.traitIds = [...permanentIds, ...char.traitInstances.map(inst => inst.id)];

  return char;
};

/**
 * 手动添加特性（仅供剧情/事件调用，玩家不能调用）
 * 通常用于添加 autoDurationDays 的时效特性（如"中毒"、"流血"）
 */
export const addTrait = (
  char: ScavengeCharacter,
  traitId: string,
  currentDay: number,
): boolean => {
  const trait = TRAITS[traitId];
  if (!trait) return false;
  if (!char.traitInstances) char.traitInstances = [];
  if (!char.traitIds) char.traitIds = [];

  // 已有则跳过（不重复添加）
  if (char.traitInstances.find(inst => inst.id === traitId)) return false;

  char.traitInstances.push({
    id: traitId,
    addedAtDay: currentDay,
    expiresAtDay: trait.autoDurationDays
      ? currentDay + trait.autoDurationDays
      : undefined,
  });
  char.traitIds = char.traitInstances.map(inst => inst.id);
  return true;
};

// ============== 派遣检查 ==============

/**
 * 检查角色是否可派遣（任一项数值为 0 → 不能派遣）
 *
 * 规则（2026-06-09 改）：
 * - hp = 0 → 死亡，不能派遣
 * - hunger = 0 → 虚弱，不能派遣
 * - thirst = 0 → 脱水，不能派遣
 * - sanity = 0 → 精神崩溃，不能派遣
 * - stamina = 0 → 精疲力竭，不能派遣
 *
 * 派不出去时给具体原因（用于 UI 提示）
 */
export interface CanDispatchResult {
  canDispatch: boolean;
  reasons: string[];  // 不能派遣的原因列表
}

export const canDispatch = (char: ScavengeCharacter): CanDispatchResult => {
  const reasons: string[] = [];
  if (char.hp <= 0) reasons.push('生命值归零（濒死/死亡）');
  if (char.hunger <= 0) reasons.push('饥饿值归零（饥肠辘辘）');
  if (char.thirst <= 0) reasons.push('口渴值归零（脱水）');
  if (char.sanity <= 0) reasons.push('精神值归零（精神崩溃）');
  if (char.stamina <= 0) reasons.push('体力值归零（精疲力竭）');
  return { canDispatch: reasons.length === 0, reasons };
};

// ============== 分类辅助 ==============

/** 按 category 分组 */
export const groupTraitsByCategory = (traits: Trait[]): Record<TraitCategory, Trait[]> => {
  const groups: Record<TraitCategory, Trait[]> = {
    combat: [],
    survival: [],
    social: [],
    special: [],
    condition: [],
  };
  for (const t of traits) {
    if (groups[t.category]) groups[t.category].push(t);
  }
  return groups;
};

/** category 标签 */
export const CATEGORY_LABELS: Record<TraitCategory, string> = {
  combat: '战斗',
  survival: '生存',
  social: '社交',
  special: '特殊',
  condition: '状态',
};
