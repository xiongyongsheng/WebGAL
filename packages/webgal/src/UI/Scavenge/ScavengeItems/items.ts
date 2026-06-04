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

/** 消耗品效果类型 */
export type EffectType = 'hp' | 'hunger' | 'thirst' | 'sanity';

/** 消耗品效果 */
export interface ConsumableEffect {
  type: EffectType;
  value: number;
}

/** 装备属性加成 */
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

/** 装备物品 */
export interface EquipmentItem extends BaseItem {
  type: 'equipment';
  /** 装备槽位 */
  slot: EquipmentSlot;
  /** 属性加成 */
  attributes: EquipmentAttribute;
  /** 最大耐久度 */
  maxDurability: number;
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
    icon: 'material-symbols:checkroom-outline',
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
    attributes: { str: 2 },
    maxDurability: 80,
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
    icon: 'material-symbols:construction-outline',
    slot: 'weapon',
    attributes: { str: 3, agi: 1 },
    maxDurability: 100,
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
    icon: 'material-symbols:content-cut-outline',
    slot: 'weapon',
    attributes: { str: 4 },
    maxDurability: 100,
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
    attributes: { str: 5 },
    maxDurability: 120,
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
    icon: 'material-symbols:weapon-outline',
    slot: 'weapon',
    attributes: { str: 3, agi: 3 },
    maxDurability: 150,
  },

  // 护甲
  {
    id: 'armor_jacket',
    name: '厚重外套',
    type: 'equipment',
    rarity: 'common',
    description: '厚实的外套，提供基础防护。',
    stackable: false,
    maxStack: 1,
    weight: 1.5,
    icon: 'material-symbols:checkroom-outline',
    slot: 'armor',
    attributes: { end: 3 },
    maxDurability: 100,
  },
  {
    id: 'armor_vest',
    name: '防刺背心',
    type: 'equipment',
    rarity: 'rare',
    description: '专业防护装备，有效减少伤害。',
    stackable: false,
    maxStack: 1,
    weight: 2.0,
    icon: 'material-symbols:shield-outline',
    slot: 'armor',
    attributes: { end: 5 },
    maxDurability: 150,
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
    attributes: { end: 4, agi: 1 },
    maxDurability: 180,
  },
  {
    id: 'armor_tactical',
    name: '战术背心',
    type: 'equipment',
    rarity: 'epic',
    description: '全套战术装备，全面防护。',
    stackable: false,
    maxStack: 1,
    weight: 3.0,
    icon: 'material-symbols:security-tech-outline',
    slot: 'armor',
    attributes: { end: 8, agi: 1 },
    maxDurability: 200,
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
