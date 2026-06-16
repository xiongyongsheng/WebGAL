/**
 * 拾荒系统 - 角色花名册 (Character Roster)
 *
 * 2026-06-09 加：单一真相源（Single Source of Truth）
 *
 * 设计动机：
 * - 之前角色数据硬编码在 scavenge_main.txt 的 setVar 里
 *   → 新增/修改角色要改场景脚本（设计师不会改代码，但改场景文件可以）
 *   → 每个角色都把全套属性/装备/背包塞进 setVar JSON
 *   → 角色越多，存档越大
 *
 * 现在的设计：
 * - 模板（基础数据：属性 / 装备 / 背包）→ 硬编码在 CHARACTER_TEMPLATES
 * - 存档只存"已获得 ID 列表" + "运行时状态"（hp/exp/level/isExploring 等）
 * - 启动时从 templates 拉基础数据，merge 运行时 → 写入 scavenge_characters
 *
 * 后续扩展：
 * - 角色加入：setVar:scavenge_character_ids=[player_1, lucy, new_char_id]
 * - 角色基础数据改：改 templates（不需要改存档）
 * - 角色调整：runtime 字段覆盖 templates
 */

import { ScavengeCharacter, normalizeCharacter } from './character';

/** 角色基础模板（与 ScavengeCharacter 同形，但只描述"初始/默认"状态）*/
export interface CharacterTemplate {
  /** 角色唯一 ID（与 ScavengeCharacter.id 一致）*/
  id: string;
  /** 显示名 */
  name: string;
  /** 头像（可选，资源路径）*/
  avatar?: string;
  /** 基础属性 */
  str: number;
  agi: number;
  end: number;
  int: number;
  /** 资源池默认值（全 100）*/
  hp: number;
  maxHp: number;
  hunger: number;
  maxHunger: number;
  thirst: number;
  maxThirst: number;
  sanity: number;
  maxSanity: number;
  /** 体力值（运行时值，maxStamina 会按 end 公式重算）*/
  stamina: number;
  /** 最大体力值（占位，normalizeCharacter 时按 end 公式 100+end*8 重算）*/
  maxStamina: number;
  /** 经验系统 */
  exp: number;
  level: number;
  expToNext: number;
  statPoints: number;
  mainStat: 'str' | 'agi' | 'end' | 'int';
  /** 战斗策略 */
  strategy: 'combat' | 'stealth';
  /** 特性 */
  traitIds?: string[];
  /** 装备槽位（只填 itemId，instance 在 inventory 里）*/
  weaponId?: string;
  helmetId?: string;
  chestId?: string;
  armsId?: string;
  glovesId?: string;
  legsId?: string;
  bootsId?: string;
  toolId?: string;
  /** 初始背包 */
  inventory: Array<{ itemId: string; quantity: number; durability?: number }>;
}

/**
 * 所有角色模板（硬编码）
 *
 * 命名规范：
 * - 主角：player_1
 * - 重要剧情角色：<name>（如 lucy）
 * - 路人/可招募 NPC：npc_<编号>（如 npc_001）
 */
export const CHARACTER_TEMPLATES: Record<string, CharacterTemplate> = {
  // ============== 主角 ==============
  player_1: {
    id: 'player_1',
    name: '主角',
    str: 9,
    agi: 6,
    end: 6,
    int: 4,
    hp: 100, maxHp: 100,
    hunger: 100, maxHunger: 100,
    thirst: 100, maxThirst: 100,
    sanity: 100, maxSanity: 100,
    stamina: 100, maxStamina: 100,  // maxStamina 会被 normalize 按 end*8+100 重算
    exp: 0, level: 1, expToNext: 100, statPoints: 0,
    mainStat: 'str',
    strategy: 'combat',
    traitIds: ['trained_warrior', 'lucky'],
    // 装备：8 槽全装（首次 normalizeCharacter 时自动把 instance 从 inventory 移到 equipped）
    weaponId: 'weapon_crowbar',
    helmetId: 'armor_helmet',
    chestId: 'armor_vest',
    armsId: 'armor_arms_guard',
    glovesId: 'armor_gloves_work',
    legsId: 'armor_legs_pants',
    bootsId: 'armor_boots_combat',
    toolId: 'tool_flashlight',
    // 初始背包（含装备 instance，多余的 instance 在 normalizeCharacter 时会被"已装备"过滤）
    inventory: [
      { itemId: 'food_apple', quantity: 5 },
      { itemId: 'drink_water', quantity: 3 },
      { itemId: 'medicine_bandage', quantity: 2 },
      { itemId: 'weapon_crowbar', quantity: 1, durability: 85 },
      { itemId: 'weapon_knife', quantity: 1, durability: 60 },
      { itemId: 'weapon_hammer', quantity: 1, durability: 70 },
      { itemId: 'armor_vest', quantity: 1, durability: 90 },
      { itemId: 'armor_helmet', quantity: 1, durability: 180 },
      { itemId: 'armor_arms_guard', quantity: 1, durability: 80 },
      { itemId: 'armor_gloves_work', quantity: 1, durability: 70 },
      { itemId: 'armor_legs_pants', quantity: 1, durability: 100 },
      { itemId: 'armor_boots_combat', quantity: 1, durability: 90 },
      { itemId: 'tool_flashlight', quantity: 1, durability: 100 },
    ],
  },

  // ============== 露西（剧情获得）==============
  lucy: {
    id: 'lucy',
    name: '露西',
    str: 4,
    agi: 8,
    end: 4,
    int: 4,
    hp: 100, maxHp: 100,
    hunger: 100, maxHunger: 100,
    thirst: 100, maxThirst: 100,
    sanity: 100, maxSanity: 100,
    stamina: 100, maxStamina: 100,
    exp: 0, level: 1, expToNext: 100, statPoints: 0,
    mainStat: 'agi',
    strategy: 'stealth',
    traitIds: ['agile_body', 'lightweight'],
    // 装备：4 件潜行装（首次 normalizeCharacter 时自动装备）
    weaponId: 'weapon_knife',
    chestId: 'armor_chest_soft',
    glovesId: 'armor_gloves_thin',
    bootsId: 'armor_boots_soft',
    inventory: [
      { itemId: 'food_apple', quantity: 3 },
      { itemId: 'drink_water', quantity: 3 },
      { itemId: 'medicine_bandage', quantity: 2 },
      { itemId: 'weapon_knife', quantity: 1, durability: 60 },
      { itemId: 'armor_chest_soft', quantity: 1, durability: 100 },
      { itemId: 'armor_gloves_thin', quantity: 1, durability: 100 },
      { itemId: 'armor_boots_soft', quantity: 1, durability: 100 },
    ],
  },
};

/**
 * 从 template 构造完整的 ScavengeCharacter
 * @param id 角色 ID
 * @param runtimeState 存档中的运行时状态（可选，用于覆盖模板默认值）
 *                    例如玩家打了一段时间后 hp=80 → runtimeState={hp: 80}
 * @returns 完整角色对象（已 normalize），找不到模板返回 null
 */
export function buildCharacterFromTemplate(
  id: string,
  runtimeState?: Partial<ScavengeCharacter>,
): ScavengeCharacter | null {
  const template = CHARACTER_TEMPLATES[id];
  if (!template) {
    // eslint-disable-next-line no-console
    console.warn(`[CharacterRoster] 找不到角色模板: ${id}`);
    return null;
  }
  // 合并：runtime 优先（覆盖模板），但 inventory 用模板的（运行时的 inventory 不会存到 runtime）
  const merged: ScavengeCharacter = {
    ...template,
    ...(runtimeState ?? {}),
    id,  // 强制用 id（防止 runtimeState.id 写错）
    inventory: (runtimeState?.inventory as ScavengeCharacter['inventory']) ?? template.inventory as ScavengeCharacter['inventory'],
    isExploring: runtimeState?.isExploring ?? false,
  };
  return normalizeCharacter(merged);
}

/** 检查角色是否在花名册中 */
export function isKnownCharacter(id: string): boolean {
  return id in CHARACTER_TEMPLATES;
}

/** 列出所有已知角色 ID（debug / UI 用）*/
export function listAllCharacterIds(): string[] {
  return Object.keys(CHARACTER_TEMPLATES);
}
