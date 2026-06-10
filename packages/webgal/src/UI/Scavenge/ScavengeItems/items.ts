/**
 * 拾荒系统 - 物品管理模块
 * 所有物品数据定义，通过物品ID获取具体数据
 */

// ============== 枚举定义 ==============

/** 物品类型 */
export type ItemType = 'consumable' | 'material' | 'equipment' | 'quest';

/** 物品稀有度 */
export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

/** 装备槽位 */
export type EquipmentSlot = 'weapon' | 'armor' | 'tool';

/**
 * 护甲子槽位（2026-06-07 改）：
 * 6 个部位 - 头盔 / 躯干（盔甲） / 护臂 / 手套 / 护腿 / 靴子
 * 每次被击中随机选一个有耐久的部位扣耐久，超出归 HP
 */
export type ArmorSlot = 'helmet' | 'chest' | 'arms' | 'gloves' | 'legs' | 'boots';

/** 武器速度标签（2026-06-07 改）：
 *  - fast: attackSpeed × 1.3
 *  - normal: × 1.0
 *  - slow: × 0.7
 */
export type WeaponSpeedModifier = 'fast' | 'normal' | 'slow';

/** 消耗品效果类型 */
export type EffectType = 'hp' | 'hunger' | 'thirst' | 'sanity';

/** 消耗品效果 */
export interface ConsumableEffect {
  type: EffectType;
  value: number;
}

/** 装备属性加成 / 装备使用门槛（共用同一组 key） */
export interface EquipmentAttribute {
  str?: number;
  agi?: number;
  end?: number;
  int?: number;
}

// ============== 物品基础接口 ==============

/** 物品基础属性（所有物品都有的属性） */
export interface BaseItem {
  /** 物品唯一ID */
  id: string;
  /** 物品名称 */
  name: string;
  /** 物品类型 */
  type: ItemType;
  /** 物品稀有度 */
  rarity: ItemRarity;
  /** 物品描述 */
  description: string;
  /** 是否可堆叠 */
  stackable: boolean;
  /** 最大堆叠数量 */
  maxStack: number;
  /** 单个物品重量 */
  weight: number;
  /** 物品图标 */
  icon: string;
}

/** 消耗品物品 */
export interface ConsumableItem extends BaseItem {
  type: 'consumable';
  /** 使用效果 */
  effects: ConsumableEffect[];
}

/** 材料物品 */
export interface MaterialItem extends BaseItem {
  type: 'material';
}

/** 装备物品
 *
 * 字段约定（2026-06-07 改）：
 * - 通用：`requirements`（使用门槛）、`attributes`（属性加成）、`stealth`（潜行值，2026-06-08 改）
 * - 武器（slot==='weapon'）：`damageRange`（每件独立浮动）、`speedModifier`
 * - 护甲（slot==='armor'）：`armorSlot`（6 个部位之一）
 * - 工具（slot==='tool'）：只加属性，不参与战斗伤害
 *
 * 潜行值（stealth）说明（2026-06-08）：
 * - 大多数护甲 stealth 为负（沉重/会响 → 容易被发现）
 * - 顶级特战装备 stealth 为正（轻量/消音 → 增强隐蔽）
 * - 公式：角色潜行率 = 0.05 + Σ(equipped.stealth)/100 + agi×0.5%
 * - 详细见 PATCHES.md
 */
export interface EquipmentItem extends BaseItem {
  type: 'equipment';
  /** 装备槽位 */
  slot: EquipmentSlot;
  /** 属性加成 */
  attributes: EquipmentAttribute;
  /** 最大耐久度（=新装备时设置的 durability 上限） */
  maxDurability: number;
  /** 使用门槛（任一属性 < 门槛则无法使用 / 装备）；不设 = 无门槛 */
  requirements?: EquipmentAttribute;
  /**
   * 潜行值（2026-06-08 加）：
   * - 大多数护甲为负（-2 ~ -10）
   * - 顶级特战装备为正（+3 ~ +15）
   * - 武器/工具一般不设（=0）
   * 公式：每 100 点 = +100% 潜行率（可叠加，可正可负）
   */
  stealth?: number;
  // ----- 武器专属 -----
  /** 武器伤害浮动范围 [min, max]（每次命中在范围内随机） */
  damageRange?: [number, number];
  /** 武器攻击速度标签 */
  speedModifier?: WeaponSpeedModifier;
  // ----- 护甲专属 -----
  /** 护甲部位（helmet/chest/arms/gloves/legs/boots） */
  armorSlot?: ArmorSlot;
  /**
   * 减伤值（2026-06-09 加）：
   * - 满耐久时的"减伤点数"
   * - 战斗公式：damage_taken = enemy_dmg * (1 - armor/(armor+50))，cap 80%
   * - 实际生效 = defense * (currentDurability / maxDurability)（按耐久比例缩放）
   * - 例如 defense=6 满耐久 → 6 减伤点
   * - 武器/工具不设 = 0
   */
  defense?: number;
}

/** 任务物品 */
export interface QuestItem extends BaseItem {
  type: 'quest';
}

// 联合类型
export type Item = ConsumableItem | MaterialItem | EquipmentItem | QuestItem;

// ============== 稀有度相关 ==============

/** 稀有度颜色 */
export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: '#9E9E9E',     // 灰色
  rare: '#2196F3',        // 蓝色
  epic: '#9C27B0',        // 紫色
  legendary: '#FF9800',  // 橙色
};

/** 稀有度显示名称 */
export const RARITY_NAMES: Record<ItemRarity, string> = {
  common: '普通',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
};

// ============== 物品数据定义 ==============

/**
 * 所有消耗品物品定义
 * ID格式：{itemId}_{rarity} 如 food_apple_common
 */
export const CONSUMABLE_ITEMS: ConsumableItem[] = [
  // 食物类
  {
    id: 'food_apple',
    name: '苹果',
    type: 'consumable',
    rarity: 'common',
    description: '新鲜的苹果，可以恢复饥饿值。',
    stackable: true,
    maxStack: 999,
    weight: 0.2,
    icon: 'material-symbols:nutrition-outline',
    effects: [{ type: 'hunger', value: 15 }],
  },
  {
    id: 'food_canned',
    name: '罐头食品',
    type: 'consumable',
    rarity: 'common',
    description: '密封的罐头食品，饱腹感强。',
    stackable: true,
    maxStack: 999,
    weight: 0.5,
    icon: 'material-symbols:nutrition-outline',
    effects: [{ type: 'hunger', value: 35 }],
  },
  {
    id: 'food_chocolate',
    name: '巧克力',
    type: 'consumable',
    rarity: 'rare',
    description: '高热量食物，还能小幅恢复精神。',
    stackable: true,
    maxStack: 999,
    weight: 0.1,
    icon: 'material-symbols:nutrition-outline',
    effects: [
      { type: 'hunger', value: 20 },
      { type: 'sanity', value: 5 },
    ],
  },

  // 饮水类
  {
    id: 'drink_water',
    name: '饮用水',
    type: 'consumable',
    rarity: 'common',
    description: '干净的饮用水。',
    stackable: true,
    maxStack: 999,
    weight: 0.3,
    icon: 'material-symbols:water-drop-outline',
    effects: [{ type: 'thirst', value: 40 }],
  },
  {
    id: 'drink_soda',
    name: '汽水',
    type: 'consumable',
    rarity: 'common',
    description: '冰凉的汽水，解渴又好喝。',
    stackable: true,
    maxStack: 999,
    weight: 0.3,
    icon: 'material-symbols:water-drop-outline',
    effects: [{ type: 'thirst', value: 25 }],
  },
  {
    id: 'drink_coffee',
    name: '咖啡',
    type: 'consumable',
    rarity: 'rare',
    description: '提神醒脑，小幅恢复精神。',
    stackable: true,
    maxStack: 999,
    weight: 0.2,
    icon: 'material-symbols:coffee-outline',
    effects: [
      { type: 'thirst', value: 20 },
      { type: 'sanity', value: 10 },
    ],
  },

  // 药品类
  {
    id: 'medicine_bandage',
    name: '绷带',
    type: 'consumable',
    rarity: 'common',
    description: '干净的绷带，可以包扎伤口。',
    stackable: true,
    maxStack: 999,
    weight: 0.1,
    icon: 'material-symbols:healing-outline',
    effects: [{ type: 'hp', value: 20 }],
  },
  {
    id: 'medicine_pills',
    name: '药品',
    type: 'consumable',
    rarity: 'rare',
    description: '常见的药品，可以治疗较重的伤势。',
    stackable: true,
    maxStack: 999,
    weight: 0.05,
    icon: 'material-symbols:medication-outline',
    effects: [{ type: 'hp', value: 50 }],
  },
  {
    id: 'medicine_firstaid',
    name: '急救箱',
    type: 'consumable',
    rarity: 'epic',
    description: '完整的急救用品，可治疗严重伤势。',
    stackable: true,
    maxStack: 999,
    weight: 0.5,
    icon: 'material-symbols:medical-services-outline',
    effects: [{ type: 'hp', value: 80 }],
  },

  // 恢复精神类
  {
    id: 'item_sedative',
    name: '镇定剂',
    type: 'consumable',
    rarity: 'rare',
    description: '可以稳定情绪，恢复精神值。',
    stackable: true,
    maxStack: 999,
    weight: 0.05,
    icon: 'material-symbols:psychology-outline',
    effects: [{ type: 'sanity', value: 25 }],
  },
];

/**
 * 所有材料物品定义
 */
export const MATERIAL_ITEMS: MaterialItem[] = [
  {
    id: 'material_parts',
    name: '零件',
    type: 'material',
    rarity: 'common',
    description: '各种机械零件，可用于修复和制作。',
    stackable: true,
    maxStack: 999,
    weight: 0.3,
    icon: 'material-symbols:build-outline',
  },
  {
    id: 'material_tools',
    name: '工具',
    type: 'material',
    rarity: 'common',
    description: '基础工具，修复和制作必需品。',
    stackable: true,
    maxStack: 999,
    weight: 0.5,
    icon: 'material-symbols:handyman-outline',
  },
  {
    id: 'material_cloth',
    name: '布料',
    type: 'material',
    rarity: 'common',
    description: '各种布料，可制作绷带等物品。',
    stackable: true,
    maxStack: 999,
    weight: 0.2,
    icon: 'material-symbols:checkroom',
  },
  {
    id: 'material_metal',
    name: '金属',
    type: 'material',
    rarity: 'common',
    description: '各种金属材料，可用于制作和强化装备。',
    stackable: true,
    maxStack: 999,
    weight: 1.0,
    icon: 'material-symbols:hardware-outline',
  },
  {
    id: 'material_circuit',
    name: '电路板',
    type: 'material',
    rarity: 'rare',
    description: '完整的电路板，高级制作材料。',
    stackable: true,
    maxStack: 999,
    weight: 0.2,
    icon: 'material-symbols:memory-outline',
  },
];

/**
 * 所有装备物品定义
 * ID格式：{slot}_{name}_{rarity}
 */
export const EQUIPMENT_ITEMS: EquipmentItem[] = [
  // 武器
  {
    id: 'weapon_stick',
    name: '木棍',
    type: 'equipment',
    rarity: 'common',
    description: '简单的木棍，可用于防身。',
    stackable: false,
    maxStack: 1,
    weight: 1.0,
    icon: 'material-symbols:sports-baseball-outline',
    slot: 'weapon',
    attributes: {},
    maxDurability: 80,
    damageRange: [5, 6],
    speedModifier: 'slow',
    requirements: { str: 3 },
  },
  {
    id: 'weapon_crowbar',
    name: '撬棍',
    type: 'equipment',
    rarity: 'common',
    description: '坚固的撬棍，既能战斗又能撬锁。',
    stackable: false,
    maxStack: 1,
    weight: 1.5,
    icon: 'material-symbols:construction',
    slot: 'weapon',
    attributes: {},
    maxDurability: 100,
    damageRange: [6, 7],
    speedModifier: 'normal',
    requirements: { str: 4 },
  },
  {
    id: 'weapon_knife',
    name: '砍刀',
    type: 'equipment',
    rarity: 'common',
    description: '锋利的砍刀，攻击力不错。',
    stackable: false,
    maxStack: 1,
    weight: 1.2,
    icon: 'material-symbols:content-cut',
    slot: 'weapon',
    attributes: {},
    maxDurability: 100,
    damageRange: [7, 8],
    speedModifier: 'fast',
    requirements: { str: 4, agi: 4 },
  },
  {
    id: 'weapon_axe',
    name: '消防斧',
    type: 'equipment',
    rarity: 'rare',
    description: '消防员配备的斧头，威力强大。',
    stackable: false,
    maxStack: 1,
    weight: 2.0,
    icon: 'material-symbols:forest-outline',
    slot: 'weapon',
    attributes: {},
    maxDurability: 120,
    damageRange: [10, 12],
    speedModifier: 'slow',
    requirements: { str: 6 },
  },
  {
    id: 'weapon_hammer',
    name: '铁锤',
    type: 'equipment',
    rarity: 'common',
    description: '建筑工用的铁锤，沉重但伤害可观。',
    stackable: false,
    maxStack: 1,
    weight: 1.8,
    icon: 'material-symbols:hardware',
    slot: 'weapon',
    attributes: {},
    maxDurability: 90,
    damageRange: [8, 10],
    speedModifier: 'slow',
    requirements: { str: 5 },
  },
  {
    id: 'weapon_dagger',
    name: '战术匕首',
    type: 'equipment',
    rarity: 'rare',
    description: '精致的战术匕首，攻守兼备。',
    stackable: false,
    maxStack: 1,
    weight: 0.5,
    icon: 'material-symbols:gavel',
    slot: 'weapon',
    attributes: {},
    maxDurability: 150,
    damageRange: [6, 8],
    speedModifier: 'fast',
    requirements: { agi: 5 },
  },

  // 护甲
  {
    id: 'armor_jacket',
    name: '厚重外套',
    type: 'equipment',
    rarity: 'common',
    description: '厚实的外套，提供基础躯干防护。',
    stackable: false,
    maxStack: 1,
    weight: 1.5,
    icon: 'material-symbols:checkroom',
    slot: 'armor',
    attributes: {},
    maxDurability: 100,
    armorSlot: 'chest',
    stealth: -3,
  },
  {
    id: 'armor_vest',
    name: '防刺背心',
    type: 'equipment',
    rarity: 'rare',
    description: '专业防护装备，有效减少躯干伤害。',
    stackable: false,
    maxStack: 1,
    weight: 2.0,
    icon: 'material-symbols:shield-outline',
    slot: 'armor',
    attributes: {},
    maxDurability: 150,
    defense: 6,
    armorSlot: 'chest',
    requirements: { str: 4 },
    stealth: -5,
  },
  {
    id: 'armor_helmet',
    name: '军用头盔',
    type: 'equipment',
    rarity: 'rare',
    description: '军用头盔，防护头部。',
    stackable: false,
    maxStack: 1,
    weight: 1.0,
    icon: 'material-symbols:military-tech-outline',
    slot: 'armor',
    attributes: {},
    maxDurability: 180,
    defense: 5,
    armorSlot: 'helmet',
    requirements: { str: 3 },
    stealth: -2,
  },
  {
    id: 'armor_tactical',
    name: '战术背心',
    type: 'equipment',
    rarity: 'epic',
    description: '全套战术装备，全面防护躯干。',
    stackable: false,
    maxStack: 1,
    weight: 3.0,
    icon: 'material-symbols:security',
    slot: 'armor',
    attributes: {},
    maxDurability: 200,
    defense: 9,
    armorSlot: 'chest',
    requirements: { str: 5 },
    stealth: -8,
  },
  // ----- 护臂 / 手套 / 护腿 / 靴子（2026-06-07 新增）-----
  {
    id: 'armor_arms_guard',
    name: '防割护臂',
    type: 'equipment',
    rarity: 'common',
    description: '简易护臂，抵御刀割与擦伤。',
    stackable: false,
    maxStack: 1,
    weight: 0.6,
    icon: 'material-symbols:back-hand-outline',
    slot: 'armor',
    attributes: {},
    maxDurability: 80,
    defense: 3,
    armorSlot: 'arms',
    stealth: -2,
  },
  {
    id: 'armor_arms_tactical',
    name: '战术护臂',
    type: 'equipment',
    rarity: 'rare',
    description: '硬质护臂，防护更佳。',
    stackable: false,
    maxStack: 1,
    weight: 1.0,
    icon: 'material-symbols:back-hand',
    slot: 'armor',
    attributes: {},
    maxDurability: 130,
    defense: 5,
    armorSlot: 'arms',
    requirements: { str: 3 },
    stealth: -4,
  },
  {
    id: 'armor_gloves_work',
    name: '劳保手套',
    type: 'equipment',
    rarity: 'common',
    description: '厚实的劳保手套，基础防护。',
    stackable: false,
    maxStack: 1,
    weight: 0.3,
    icon: 'material-symbols:pan-tool-outline',
    slot: 'armor',
    attributes: {},
    maxDurability: 70,
    defense: 2,
    armorSlot: 'gloves',
    stealth: -1,
  },
  {
    id: 'armor_gloves_tactical',
    name: '战术手套',
    type: 'equipment',
    rarity: 'rare',
    description: '带硬质护甲的战术手套。',
    stackable: false,
    maxStack: 1,
    weight: 0.5,
    icon: 'material-symbols:pan-tool',
    slot: 'armor',
    attributes: {},
    maxDurability: 110,
    defense: 3,
    armorSlot: 'gloves',
    requirements: { agi: 4 },
    stealth: -2,
  },
  {
    id: 'armor_legs_pants',
    name: '加厚作战裤',
    type: 'equipment',
    rarity: 'common',
    description: '加固的裤子，保护腿部。',
    stackable: false,
    maxStack: 1,
    weight: 1.2,
    icon: 'material-symbols:airline-seat-legroom-extra',
    slot: 'armor',
    attributes: {},
    maxDurability: 100,
    defense: 4,
    armorSlot: 'legs',
    stealth: -3,
  },
  {
    id: 'armor_legs_tactical',
    name: '战术护腿',
    type: 'equipment',
    rarity: 'rare',
    description: '硬质战术护腿，防御力优秀。',
    stackable: false,
    maxStack: 1,
    weight: 1.8,
    icon: 'material-symbols:airline-seat-legroom-normal',
    slot: 'armor',
    attributes: {},
    maxDurability: 150,
    defense: 6,
    armorSlot: 'legs',
    requirements: { str: 4 },
    stealth: -5,
  },
  {
    id: 'armor_boots_combat',
    name: '作战靴',
    type: 'equipment',
    rarity: 'common',
    description: '坚固的作战靴，保护双脚。',
    stackable: false,
    maxStack: 1,
    weight: 1.4,
    icon: 'material-symbols:hiking',
    slot: 'armor',
    attributes: {},
    maxDurability: 90,
    defense: 3,
    armorSlot: 'boots',
    stealth: -2,
  },
  {
    id: 'armor_boots_tactical',
    name: '战术靴',
    type: 'equipment',
    rarity: 'rare',
    description: '高帮战术靴，带金属护甲。',
    stackable: false,
    maxStack: 1,
    weight: 2.0,
    icon: 'material-symbols:do-not-step',
    slot: 'armor',
    attributes: {},
    maxDurability: 140,
    armorSlot: 'boots',
    requirements: { str: 4 },
    stealth: -3,
  },

  // ----- Epic 进阶（2026-06-07 新增，每部位 1 件）-----
  {
    id: 'armor_helmet_riot',
    name: '防暴头盔',
    type: 'equipment',
    rarity: 'epic',
    description: '防暴警察专用头盔，带面罩。',
    stackable: false,
    maxStack: 1,
    weight: 1.6,
    icon: 'material-symbols:sports-mma',
    slot: 'armor',
    attributes: {},
    maxDurability: 220,
    armorSlot: 'helmet',
    requirements: { str: 5 },
    stealth: -4,
  },
  {
    id: 'armor_chest_heavy',
    name: '重型护甲',
    type: 'equipment',
    rarity: 'epic',
    description: '重型复合护甲，防护力极佳但笨重。',
    stackable: false,
    maxStack: 1,
    weight: 4.5,
    icon: 'material-symbols:shield',
    slot: 'armor',
    attributes: {},
    maxDurability: 260,
    armorSlot: 'chest',
    requirements: { str: 6 },
    stealth: -10,
  },
  {
    id: 'armor_arms_heavy',
    name: '重型护臂',
    type: 'equipment',
    rarity: 'epic',
    description: '钢板加固的护臂，保护前臂不受重击。',
    stackable: false,
    maxStack: 1,
    weight: 1.6,
    icon: 'material-symbols:front-hand',
    slot: 'armor',
    attributes: {},
    maxDurability: 180,
    armorSlot: 'arms',
    requirements: { str: 5 },
    stealth: -6,
  },
  {
    id: 'armor_gloves_pro',
    name: '专业战术手套',
    type: 'equipment',
    rarity: 'epic',
    description: '高灵活性的硬质战术手套，不影响精细操作。',
    stackable: false,
    maxStack: 1,
    weight: 0.7,
    icon: 'material-symbols:back-hand',
    slot: 'armor',
    attributes: {},
    maxDurability: 160,
    armorSlot: 'gloves',
    requirements: { agi: 6 },
    stealth: -3,
  },
  {
    id: 'armor_legs_heavy',
    name: '重型护腿',
    type: 'equipment',
    rarity: 'epic',
    description: '膝盖带硬质护甲的重型护腿。',
    stackable: false,
    maxStack: 1,
    weight: 2.5,
    icon: 'material-symbols:airline-seat-recline-extra',
    slot: 'armor',
    attributes: {},
    maxDurability: 200,
    armorSlot: 'legs',
    requirements: { str: 6 },
    stealth: -7,
  },
  {
    id: 'armor_boots_heavy',
    name: '重型战术靴',
    type: 'equipment',
    rarity: 'epic',
    description: '钢头钢底的重型战术靴。',
    stackable: false,
    maxStack: 1,
    weight: 2.8,
    icon: 'material-symbols:do-not-step',
    slot: 'armor',
    attributes: {},
    maxDurability: 200,
    armorSlot: 'boots',
    requirements: { str: 5 },
    stealth: -4,
  },

  // ----- 潜行护甲（2026-06-08 新增，2026-06-08 改耐久 1/3）-----
  // 耐久规则：潜行型护甲 maxDurability ≈ 同稀有度同部位普通护甲的 1/3
  // 潜行值按当前耐久缩放：currentStealth = baseStealth × (dur / maxDur)
  {
    id: 'armor_chest_soft',
    name: '软质内甲',
    type: 'equipment',
    rarity: 'rare',
    description: '贴身软质内甲，便于隐蔽。',
    stackable: false,
    maxStack: 1,
    weight: 0.8,
    icon: 'material-symbols:layers',
    slot: 'armor',
    attributes: {},
    // 同稀有度 chest 150 → 1/3 ≈ 50
    maxDurability: 50,
    armorSlot: 'chest',
    requirements: { str: 3 },
    defense: 2,  // 2026-06-09 改：低防御换高潜行（标准 chest 6）
    stealth: 5,
  },
  {
    id: 'armor_chest_ghillie',
    name: '吉利服',
    type: 'equipment',
    rarity: 'epic',
    description: '伪装用吉利服，破损快但极难被察觉。',
    stackable: false,
    maxStack: 1,
    weight: 1.5,
    icon: 'material-symbols:grass',
    slot: 'armor',
    attributes: {},
    // 同稀有度 epic chest 200 → 1/3 ≈ 67
    maxDurability: 67,
    armorSlot: 'chest',
    defense: 3,  // 2026-06-09 改：低防御（标准 epic chest 9）
    stealth: 15,
  },
  {
    id: 'armor_chest_cloak',
    name: '战术斗篷',
    type: 'equipment',
    rarity: 'epic',
    description: '轻便披风，可裹住装备降低轮廓。',
    stackable: false,
    maxStack: 1,
    weight: 1.0,
    icon: 'material-symbols:checkroom-outline',
    slot: 'armor',
    attributes: {},
    // 同稀有度 epic chest 200 → 1/3 ≈ 67
    maxDurability: 67,
    armorSlot: 'chest',
    defense: 3,  // 2026-06-09 改：低防御（标准 epic chest 9）
    stealth: 8,
  },
  {
    id: 'armor_boots_soft',
    name: '软底靴',
    type: 'equipment',
    rarity: 'rare',
    description: '静音鞋底，行走无声。',
    stackable: false,
    maxStack: 1,
    weight: 0.6,
    icon: 'material-symbols:do-not-touch',
    slot: 'armor',
    attributes: {},
    // 同稀有度 rare boots 90 → 1/3 = 30
    maxDurability: 30,
    armorSlot: 'boots',
    defense: 1,  // 2026-06-09 改：低防御（标准 rare boots 3）
    stealth: 4,
  },
  {
    id: 'armor_gloves_thin',
    name: '薄手套',
    type: 'equipment',
    rarity: 'rare',
    description: '超薄手套，不影响精细操作。',
    stackable: false,
    maxStack: 1,
    weight: 0.2,
    icon: 'material-symbols:pan-tool-alt',
    slot: 'armor',
    attributes: {},
    // 同稀有度 rare gloves 70 → 1/3 ≈ 23
    maxDurability: 23,
    armorSlot: 'gloves',
    defense: 1,  // 2026-06-09 改：低防御（标准 rare gloves 2）
    stealth: 3,
  },

  // 工具
  {
    id: 'tool_flashlight',
    name: '手电筒',
    type: 'equipment',
    rarity: 'common',
    description: '明亮的手电筒，黑暗中必备。',
    stackable: false,
    maxStack: 1,
    weight: 0.5,
    icon: 'material-symbols:flashlight-on-outline',
    slot: 'tool',
    attributes: { int: 2 },
    maxDurability: 100,
  },
  {
    id: 'tool_lockpick',
    name: '撬锁工具',
    type: 'equipment',
    rarity: 'common',
    description: '专业撬锁工具，可以打开上锁的门。',
    stackable: false,
    maxStack: 1,
    weight: 0.3,
    icon: 'material-symbols:lock-outline',
    slot: 'tool',
    attributes: { agi: 4 },
    maxDurability: 80,
  },
  {
    id: 'tool_multitool',
    name: '多功能工具',
    type: 'equipment',
    rarity: 'rare',
    description: '瑞士军刀多功能版，样样精通。',
    stackable: false,
    maxStack: 1,
    weight: 0.4,
    icon: 'material-symbols:build-outline',
    slot: 'tool',
    attributes: { agi: 3, int: 2 },
    maxDurability: 120,
  },
  {
    id: 'tool_nightvision',
    name: '夜视仪',
    type: 'equipment',
    rarity: 'epic',
    description: '高科技夜视设备，黑夜行动必备。',
    stackable: false,
    maxStack: 1,
    weight: 0.8,
    icon: 'material-symbols:visibility-outline',
    slot: 'tool',
    attributes: { agi: 5, int: 2 },
    maxDurability: 150,
  },
];

/**
 * 所有任务物品定义
 */
export const QUEST_ITEMS: QuestItem[] = [
  {
    id: 'quest_key',
    name: '钥匙碎片',
    type: 'quest',
    rarity: 'common',
    description: '一把古老的钥匙碎片，似乎可以拼凑。',
    stackable: true,
    maxStack: 5,
    weight: 0.1,
    icon: 'material-symbols:key-outline',
  },
  {
    id: 'quest_map',
    name: '地图碎片',
    type: 'quest',
    rarity: 'rare',
    description: '城市地图的碎片，收集完整可解锁新区域。',
    stackable: true,
    maxStack: 10,
    weight: 0.05,
    icon: 'material-symbols:map-outline',
  },
];

// ============== 合并所有物品（Map结构优化查询性能） ==============

/** 所有物品（Map结构，O(1) 查找性能） */
export const ALL_ITEMS_MAP: Record<string, Item> = {
  ...CONSUMABLE_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
  ...MATERIAL_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
  ...EQUIPMENT_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
  ...QUEST_ITEMS.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
};

/** 所有物品数组（保留兼容性） */
export const ALL_ITEMS: Item[] = Object.values(ALL_ITEMS_MAP);

// ============== 辅助函数 ==============

/**
 * 通过物品ID获取物品数据
 * @param itemId 物品ID
 * @returns 物品数据，如果不存在返回 undefined
 */
export const getItemById = (itemId: string): Item | undefined => {
  return ALL_ITEMS_MAP[itemId];
};

/**
 * 获取物品图标
 * @param itemId 物品ID
 * @returns 图标名称
 */
export const getItemIcon = (itemId: string): string => {
  const item = getItemById(itemId);
  return item?.icon ?? 'material-symbols:question-mark';
};

/**
 * 获取物品名称
 * @param itemId 物品ID
 * @returns 物品名称
 */
export const getItemName = (itemId: string): string => {
  const item = getItemById(itemId);
  return item?.name ?? '未知物品';
};

/**
 * 获取物品稀有度颜色
 * @param itemId 物品ID
 * @returns 稀有度颜色
 */
export const getItemRarityColor = (itemId: string): string => {
  const item = getItemById(itemId);
  return item ? RARITY_COLORS[item.rarity] : RARITY_COLORS.common;
};

/**
 * 获取物品稀有度名称
 * @param itemId 物品ID
 * @returns 稀有度显示名称
 */
export const getItemRarityName = (itemId: string): string => {
  const item = getItemById(itemId);
  return item ? RARITY_NAMES[item.rarity] : '普通';
};

/**
 * 判断是否为消耗品
 */
export const isConsumable = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'consumable';
};

/**
 * 判断是否为装备
 */
export const isEquipment = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'equipment';
};

/**
 * 判断是否为材料
 */
export const isMaterial = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'material';
};

/**
 * 判断是否为任务物品
 */
export const isQuestItem = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'quest';
};

/**
 * 获取装备槽位
 */
export const getEquipmentSlot = (itemId: string): EquipmentSlot | null => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment') {
    return item.slot;
  }
  return null;
};

/**
 * 获取装备最大耐久
 */
export const getEquipmentMaxDurability = (itemId: string): number => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment') {
    return item.maxDurability;
  }
  return 0;
};

// ============== 2026-06-07 战斗系统重构：武器/护甲分类辅助 ==============

/** 判断是否为武器 */
export const isWeapon = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'equipment' && item.slot === 'weapon';
};

/** 判断是否为护甲 */
export const isArmor = (itemId: string): boolean => {
  const item = getItemById(itemId);
  return item?.type === 'equipment' && item.slot === 'armor';
};

/** 获取武器伤害范围 */
export const getWeaponDamageRange = (itemId: string): [number, number] | null => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment' && item.slot === 'weapon' && item.damageRange) {
    return item.damageRange;
  }
  return null;
};

/** 获取武器速度标签（默认 normal） */
export const getWeaponSpeedModifier = (itemId: string): WeaponSpeedModifier => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment' && item.slot === 'weapon' && item.speedModifier) {
    return item.speedModifier;
  }
  return 'normal';
};

/** 获取护甲部位 */
export const getArmorSlot = (itemId: string): ArmorSlot | null => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment' && item.slot === 'armor' && item.armorSlot) {
    return item.armorSlot;
  }
  return null;
};

/** 获取装备使用门槛（任一属性 < 门槛则无法使用） */
export const getEquipmentRequirements = (itemId: string): EquipmentAttribute | null => {
  const item = getItemById(itemId);
  if (item?.type === 'equipment' && item.requirements) {
    return item.requirements;
  }
  return null;
};

/**
 * 判定角色是否满足装备使用门槛
 * @param char 主属性 (str/agi/end/int)
 * @param requirements 门槛定义（任一不达标即 false）
 */
export const meetsEquipmentRequirements = (
  char: { str: number; agi: number; end: number; int: number },
  requirements: EquipmentAttribute | null,
): boolean => {
  if (!requirements) return true;
  if (requirements.str !== undefined && char.str < requirements.str) return false;
  if (requirements.agi !== undefined && char.agi < requirements.agi) return false;
  if (requirements.end !== undefined && char.end < requirements.end) return false;
  if (requirements.int !== undefined && char.int < requirements.int) return false;
  return true;
};

/**
 * 在武器伤害范围内随机取一个整数伤害值
 */
export const rollWeaponDamage = (itemId: string): number => {
  const range = getWeaponDamageRange(itemId);
  if (!range) return 0;
  const [min, max] = range;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/** 速度标签对应的攻击速度系数（fast=1.3, normal=1.0, slow=0.7） */
export const SPEED_MODIFIER_MULTIPLIER: Record<WeaponSpeedModifier, number> = {
  fast: 1.3,
  normal: 1.0,
  slow: 0.7,
};

/** 护甲部位中文名（UI 显示） */
export const ARMOR_SLOT_NAMES: Record<ArmorSlot, string> = {
  helmet: '头盔',
  chest: '盔甲',
  arms: '护臂',
  gloves: '手套',
  legs: '护腿',
  boots: '靴子',
};
