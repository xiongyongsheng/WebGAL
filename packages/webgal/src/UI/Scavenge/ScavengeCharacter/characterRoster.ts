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

/** 角色阵营（2026-06-09 加）
 *  - ally（友方/队伍成员）：在 scavenge_character_ids 花名册里
 *  - neutral（中立）：商人、可雇佣 NPC；不进花名册，单独管理
 *  - enemy（敌对）：敌人；不进花名册，战斗时动态生成
 */
export type CharacterFaction = 'ally' | 'neutral' | 'enemy';

/** 角色基础模板（与 ScavengeCharacter 同形，但只描述"初始/默认"状态）*/
export interface CharacterTemplate {
  /** 角色唯一 ID（与 ScavengeCharacter.id 一致）*/
  id: string;
  /** 显示名 */
  name: string;
  /** 头像（可选，资源路径）*/
  avatar?: string;
  // ============== 阵营（2026-06-09 加）==============
  /** 角色阵营
   *  - 默认 'ally'（友方/队伍成员）
   *  - 'neutral' = 中立（商人、可雇佣 NPC）
   *  - 'enemy' = 敌对
   */
  faction?: CharacterFaction;
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
  // ============== 好感度系统（2026-06-09 加）==============
  /** 好感度初始值（-100 ~ 100）*/
  initialAffinity: number;
  /** 好感度等级阈值（升阶所需分数）
   *  例：[0, 30, 60, 90] → 4 级
   *  - 默认 0 = 陌生（第一级）
   *  - 30 = 熟悉
   *  - 60 = 亲密
   *  - 90 = 挚友
   */
  affinityThresholds: number[];
  /** 好感度等级名称（与阈值一一对应，长度 = thresholds.length + 1）
   *  例：['陌生', '熟悉', '亲密', '挚友']
   */
  affinityLevelNames: string[];
  /** 物品档次 → 需要的最低好感等级
   *  例：{ cheap: 0, normal: 1, precious: 2 }
   *  物品档次在 items.ts 里定义（affinityValue 字段）
   *  - cheap（廉价）: 任何好感度都能送
   *  - normal（普通）: 熟悉以上
   *  - precious（珍贵）: 亲密以上
   */
  giftAccessMap: Record<string, number>;
  /** 话题级别 → 需要的最低好感等级
   *  例：{ casual: 0, personal: 1, secret: 2 }
   *  话题级别由场景脚本或 chatTopics.ts 定义
   */
  chatAccessMap: Record<string, number>;
  /** 角色的"家"位置（安全屋哪个房间）
   *  例：'living_room' / 'bedroom_main' / 'corridor'
   */
  homeRoom: string;
  // ============== 物品偏好系统（M2 阶段，2026-06-21 加）==============
  /**
   * 角色对物品分类的偏好权重（M2 阶段用于推荐分配）
   * - key: ItemCategory（'food' | 'medicine' | 'weapon' | 'armor' | ...）
   * - value: 权重（0 = 无感；正数 = 偏好；负数 = 不喜欢）
   *
   * 注：
   * - 这里是**基础**偏好，反映角色性格（如医生喜欢医疗、战士喜欢武器）
   * - 不随状态变化（"当前需求"是另一套机制，由 computeCharacterNeeds 算）
   * - 缺省 = 0（中性）
   */
  preferences?: Partial<Record<'food' | 'drink' | 'medicine' | 'sanity' | 'weapon' | 'armor' | 'tool' | 'material' | 'quest' | 'other', number>>;
  // ============== 商人系统（2026-06-09 加，可选）==============
  /** 是否是商人（true = 该角色是商人，可交易）*/
  isMerchant?: boolean;
  /** 商人初始好感度（独立字段 merchantAffection，不与普通 affinity 共用）*/
  initialMerchantAffection?: number;
  /** 商人好感度等级阈值（-100~100 范围，可负数）*/
  merchantAffectionThresholds?: number[];
  /** 商人好感度等级名 */
  merchantAffectionLevelNames?: string[];
  /** 商人折扣率（每个等级对应折扣，例如 {0: 1.0, 1: 0.9, 2: 0.8, 3: 0.7}）*/
  merchantDiscountMap?: Record<number, number>;
  // ============== 商人经济系统（2026-06-09 加，可选）==============
  /** 商人初始金币（首次创建时 gold 字段的初值）*/
  initialGold?: number;
  /** 商人金币上限（不能无限收，防止玩家卖垃圾刷爆商人钱包）*/
  maxGold?: number;
  /** 商人刷新周期（每 N 天重置金币到 initialGold + 物品到 template inventory）*/
  refreshDays?: number;
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
    // 好感度系统（2026-06-09 加）
    initialAffinity: 0,  // 主角默认无好感度（因为是主角自己）
    affinityThresholds: [0, 30, 60, 90],
    affinityLevelNames: ['陌生', '熟悉', '亲密', '挚友'],
    giftAccessMap: {},  // 主角不接礼物
    chatAccessMap: {},
    homeRoom: 'living_room',
    faction: 'ally',  // 2026-06-09 加：主角是友方
    // 2026-06-21 加：M2 偏好（主角偏好战斗 + 实用工具）
    preferences: {
      weapon: 5,  // 主角喜欢武器
      armor: 4,   // 护甲也喜欢
      tool: 3,    // 工具还行
      food: 1,    // 食物不讨厌
      medicine: 1,
    },
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
    // 好感度系统（2026-06-09 加）
    initialAffinity: 25,  // 露西对主角初始好感（剧情建立信任后）
    affinityThresholds: [0, 30, 60, 90],
    affinityLevelNames: ['陌生', '熟悉', '亲密', '挚友'],
    // 露西的赠送门槛：
    // - cheap（廉价）: 陌生（0）以上
    // - normal（普通）: 熟悉（1）以上
    // - precious（珍贵）: 亲密（2）以上
    giftAccessMap: { cheap: 0, normal: 1, precious: 2 },
    // 露西的聊天门槛：
    // - casual（日常）: 陌生（0）以上
    // - personal（私人）: 熟悉（1）以上
    // - secret（秘密）: 亲密（2）以上
    chatAccessMap: { casual: 0, personal: 1, secret: 2 },
    homeRoom: 'living_room',  // 露西住在客厅
    faction: 'ally',  // 2026-06-09 加：露西是友方（剧情加入队伍）
    // 2026-06-21 加：M2 偏好（露西偏好潜行/医疗）
    preferences: {
      tool: 5,        // 工具（撬锁、医疗工具等）
      medicine: 4,    // 医疗
      food: 2,        // 食物
      drink: 2,       // 饮水
      weapon: -2,     // 不太喜欢重武器（潜行流）
      armor: -1,      // 不喜欢重甲（影响潜行）
    },
  },

  // ============== 商人：维克斯（中立角色，2026-06-09 加）==============
  // 设计：
  //   - 阵营 = 'neutral'（中立，不进 scavenge_character_ids 花名册）
  //   - 商人住在 safehouse 的 market 房间
  //   - 有独立的好感度（merchantAffection），不影响玩家与露西的 affinity
  //   - 折扣率：陌生 100% / 熟客 90% / 老主顾 80% / 至交 70%
  //   - 数据由 CharacterRosterManager 单独管理（faction='neutral' 不会被 ally 花名册过滤掉）
  merchant_vix: {
    id: 'merchant_vix',
    name: '维克斯',
    str: 4,
    agi: 6,
    end: 5,
    int: 8,
    hp: 80,
    maxHp: 80,
    hunger: 100,
    maxHunger: 100,
    thirst: 100,
    maxThirst: 100,
    sanity: 100,
    maxSanity: 100,
    stamina: 100,
    maxStamina: 100,
    exp: 0,
    level: 1,
    expToNext: 100,
    statPoints: 0,
    mainStat: 'int',
    strategy: 'stealth',
    traitIds: [],
    // 商人商品（来源：基类物品 + 价格由 items.ts.price 决定）
    inventory: [
      { itemId: 'food_apple', quantity: 20 },
      { itemId: 'drink_water', quantity: 20 },
      { itemId: 'medicine_bandage', quantity: 15 },
      { itemId: 'food_canned', quantity: 10 },
      { itemId: 'drink_soda', quantity: 10 },
      { itemId: 'material_parts', quantity: 30 },
      { itemId: 'material_cloth', quantity: 20 },
      { itemId: 'weapon_crowbar', quantity: 2, durability: 120 },
      { itemId: 'armor_vest', quantity: 2, durability: 120 },
      { itemId: 'tool_flashlight', quantity: 5, durability: 100 },
    ],
    // 好感度系统（普通 NPC 部分，商人模式下不用，但保留以防 NPC 逻辑冲突）
    initialAffinity: 0,
    affinityThresholds: [0, 30, 60, 90],
    affinityLevelNames: ['陌生', '熟悉', '亲密', '挚友'],
    giftAccessMap: {},
    chatAccessMap: {},
    homeRoom: 'market_stall',  // 2026-06-09 改：商人搬到外面的"市场摊位"（不再是 safehouse 房间）
    // ============== 商人特有配置 ==============
    faction: 'neutral',  // 2026-06-09 加：阵营 = 中立（不进花名册，单独管理）
    isMerchant: true,
    initialMerchantAffection: 0,
    // 商人好感度阈值（独立计算）
    // 陌生（< 30）：原价
    // 熟客（>= 30）：9 折
    // 老主顾（>= 60）：8 折
    // 至交（>= 90）：7 折
    merchantAffectionThresholds: [30, 60, 90],
    merchantAffectionLevelNames: ['陌生', '熟客', '老主顾', '至交'],
    merchantDiscountMap: { 0: 1.0, 1: 0.9, 2: 0.8, 3: 0.7 },
    // ============== 2026-06-09 加：商人经济系统 ==============
    initialGold: 200,            // 商人初始金币
    maxGold: 500,               // 商人金币上限（不能无限收）
    refreshDays: 2,             // 每 2 天刷新一次（金币 + 物品回满）
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
    // 好感度 runtime 字段：模板提供 initial, runtime 可以覆盖
    affinity: runtimeState?.affinity ?? template.initialAffinity,
    completedAffinityStoryLevels: runtimeState?.completedAffinityStoryLevels ?? [],
    // 商人好感度（独立字段）
    merchantAffection: runtimeState?.merchantAffection ?? template.initialMerchantAffection ?? 0,
    // 2026-06-09 加：商人金币 + 刷新时间（首次创建时初始化）
    gold: runtimeState?.gold ?? template.initialGold ?? 0,
    lastRefreshDay: runtimeState?.lastRefreshDay ?? 0,  // 0 = 首次进入时刷新
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
