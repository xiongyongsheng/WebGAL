/**
 * 拾荒系统 - 地点数据定义
 * 大都市地图中的各个探索地点
 *
 * 2026-06-21 重构：按用户要求重新设计地点系统
 * - 替换原 region 字段为 category（业态分类）
 * - 加 ownerName/brandName/establishedYear/briefHistory 元数据
 * - 加 scenes 字段：每个 location 关联多个场景（前台/后厨/仓库等）
 * - 危险等级金字塔分布：1★=15, 2★=12, 3★=8, 4★=5, 5★=2
 * - 共 42 个 location（涵盖教育/医疗/食品/政府/公共服务/娱乐/金融/科研/零售/住宅/工业/安全区）
 */

// 重新导出角色类型，方便地图系统使用
export type { ScavengeCharacter } from '../ScavengeCharacter/character';
import { EnemyPoolEntry, ENEMY_POOL_BY_DANGER, EnemyType } from '../ScavengeEnemies/enemies';

export type LocationDangerLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** 业态分类（2026-06-21 改：替代原 region）*/
export type LocationCategory =
  | 'safe'            // 安全区（家、市场）
  | 'food'            // 食品（餐厅、超市、菜市场）
  | 'retail'          // 零售（服装、五金、便利店）
  | 'education'       // 教育（学校、培训）
  | 'medical'         // 医疗（医院、诊所、药店）
  | 'government'      // 政府（警察局、消防、市政）
  | 'public_service'  // 公共服务（图书馆、博物馆、邮局）
  | 'entertainment'   // 娱乐（影院、KTV、网咖、健身房、公园）
  | 'financial'       // 金融（银行、ATM、保险）
  | 'research'        // 科研（研究所、实验室）
  | 'residential'     // 住宅（公寓、别墅、小区）
  | 'industrial';     // 工业（工厂、仓库、车间）

/** 敌人权重条目 */
export interface LocationEnemyWeight {
  type: EnemyType;
  weight: number;
  jitter: number;
}

/** 物资权重条目 */
export interface LocationLootWeight {
  type: string;
  weight: number;
  jitter: number;
}

/** 地点敌人配置 */
export interface LocationEnemyConfig {
  refreshDays: number;
  countRange: [number, number];
  types: LocationEnemyWeight[];
}

/** 地点物资配置 */
export interface LocationLootConfig {
  refreshDays: number;
  countRange: [number, number];
  types: LocationLootWeight[];
}

/** 场景引用（2026-06-21 加：每个 location 有多个场景）
 *  - sceneId 唯一标识（用于跨文件引用）
 *  - filePath 场景文件相对路径（WebGAL 格式）
 *  - displayName 场景显示名（"前台" / "后厨" 等）
 *  - isDefault 是否默认进入（每个 location 至少 1 个 default）
 */
export interface LocationSceneRef {
  sceneId: string;
  filePath: string;        // 例如 './game/scene/locations/billy_hardware/front_desk.txt'
  displayName: string;     // 例如 '前台'
  isDefault?: boolean;
}

export interface ScavengeLocationItem {
  /** 地点唯一标识（snake_case）*/
  id: string;
  /** 地点完整名称（如"老比利的五金店"）*/
  name: string;
  /** 地点描述（中文，给玩家看的简介）*/
  description: string;
  /** 业态分类（2026-06-21 替换原 region）*/
  category: LocationCategory;
  /** 危险等级 0-5 星 */
  dangerLevel: LocationDangerLevel;
  /** 距离（小时） */
  distance: number;
  /** 探索耗时（小时） */
  explorationTime: number;
  /** 预计耗时显示文本 */
  timeDisplay: string;
  /** 产出物资类型（**旧字段**，保留兼容；新配置走 lootConfig.types） */
  lootTypes: string[];
  /** 敌人分布（旧字段，保留兼容；新配置走 enemyConfig.types） */
  enemyPool?: EnemyPoolEntry[];
  /** 敌人配置（per-location 浮动 + 权重系统）*/
  enemyConfig?: LocationEnemyConfig;
  /** 物资配置 */
  lootConfig?: LocationLootConfig;
  /** 解锁条件 */
  unlockCondition: string;
  /** 地图坐标 */
  position: { x: number; y: number };
  /** 是否已解锁 */
  isUnlocked: boolean;
  /** 业态色（用于地图显示，2026-06-21 替换原 regionColor）*/
  categoryColor: string;
  /** 店主 / 负责人（可选）*/
  ownerName?: string;
  /** 品牌名（可选，用于连锁店/品牌店）*/
  brandName?: string;
  /** 成立年份（剧情向）*/
  establishedYear?: number;
  /** 简介/历史（1-2 句，给剧情脚本用）*/
  briefHistory?: string;
  /** 场景列表（2026-06-21 加：每个 location 至少 1 个）*/
  scenes: LocationSceneRef[];
  /** 默认进入的场景（不传则用 scenes[0]）*/
  jumpScene?: string;
}

/** 读 location 的 enemyPool（fallback 到 ENEMY_POOL_BY_DANGER） */
export const getLocationEnemyPool = (location: ScavengeLocationItem): EnemyPoolEntry[] => {
  return location.enemyPool ?? ENEMY_POOL_BY_DANGER[location.dangerLevel] ?? [];
};

/** 读 location 的默认 jump scene（fallback 到 scenes[0]） */
export const getDefaultJumpScene = (location: ScavengeLocationItem): string | undefined => {
  if (location.jumpScene) return location.jumpScene;
  const def = location.scenes.find(s => s.isDefault);
  return def?.filePath ?? location.scenes[0]?.filePath;
};

/** 业态色（按 category 给一个标志性颜色）*/
export const getCategoryColor = (category: LocationCategory): string => {
  const map: Record<LocationCategory, string> = {
    safe: '#4CAF50',            // 绿（安全）
    food: '#FF9800',            // 橙（食品）
    retail: '#FFB300',          // 黄（零售）
    education: '#3F51B5',       // 蓝（教育）
    medical: '#E91E63',         // 粉（医疗）
    government: '#F44336',      // 红（政府）
    public_service: '#00BCD4',  // 青（公共服务）
    entertainment: '#9C27B0',   // 紫（娱乐）
    financial: '#4CAF50',       // 绿（金融）
    research: '#009688',        // 墨绿（科研）
    residential: '#03A9F4',     // 浅蓝（住宅）
    industrial: '#607D8B',      // 蓝灰（工业）
  };
  return map[category] ?? '#9E9E9E';
};

/** 业态显示名 */
export const getCategoryDisplayName = (category: LocationCategory): string => {
  const map: Record<LocationCategory, string> = {
    safe: '安全区',
    food: '食品',
    retail: '零售',
    education: '教育',
    medical: '医疗',
    government: '政府',
    public_service: '公共服务',
    entertainment: '娱乐',
    financial: '金融',
    research: '科研',
    residential: '住宅',
    industrial: '工业',
  };
  return map[category] ?? category;
};

/** 危险等级星星显示 */
export const getDangerStars = (level: LocationDangerLevel): string => {
  return '★'.repeat(level) + '☆'.repeat(5 - level);
};

/** 默认敌人配置生成（按 dangerLevel）*/
const buildDefaultEnemyConfig = (danger: LocationDangerLevel): LocationEnemyConfig => {
  const countRange: [number, number] = [danger * 2, danger * 3];
  let types: LocationEnemyWeight[];
  if (danger === 0) {
    types = [];
  } else if (danger === 1) {
    types = [{ type: 'wanderer', weight: 100, jitter: 10 }];
  } else if (danger === 2) {
    types = [
      { type: 'wanderer', weight: 70, jitter: 8 },
      { type: 'chaser', weight: 30, jitter: 5 },
    ];
  } else if (danger === 3) {
    types = [
      { type: 'wanderer', weight: 50, jitter: 8 },
      { type: 'chaser', weight: 40, jitter: 6 },
      { type: 'rioter', weight: 10, jitter: 3 },
    ];
  } else if (danger === 4) {
    types = [
      { type: 'wanderer', weight: 35, jitter: 6 },
      { type: 'chaser', weight: 45, jitter: 6 },
      { type: 'rioter', weight: 20, jitter: 4 },
    ];
  } else { // danger 5
    types = [
      { type: 'wanderer', weight: 20, jitter: 5 },
      { type: 'chaser', weight: 40, jitter: 6 },
      { type: 'rioter', weight: 30, jitter: 5 },
      { type: 'sentinel', weight: 10, jitter: 3 },
    ];
  }
  return { refreshDays: danger, countRange, types };
};

/** 默认物资配置生成（按 dangerLevel + lootTypes）*/
const buildDefaultLootConfig = (location: ScavengeLocationItem): LocationLootConfig => {
  const danger = location.dangerLevel;
  const types: LocationLootWeight[] = (location.lootTypes ?? []).map((t) => ({
    type: t,
    weight: 50,
    jitter: 10,
  }));
  // 2026-06-21 加：蓝图掉落（默认根据 danger 加 1-3 种蓝图 type，权重低）
  //   蓝图 type = 'bp_xxx' 或 'craft_xxx'（**不**走 RESOURCE_TYPE_TO_ITEM）
  if (danger >= 1) {
    // 危险 ≥ 1 都可能掉蓝图（rare）
    const blueprintWeight = Math.max(5, 30 - danger * 5);  // danger 1: 25, danger 5: 5
    types.push({ type: 'bp_melee_workbench', weight: blueprintWeight, jitter: 3 });
    types.push({ type: 'bp_armor_workbench', weight: blueprintWeight, jitter: 3 });
    if (danger >= 2) {
      types.push({ type: 'bp_cooking_workbench', weight: blueprintWeight, jitter: 3 });
    }
    if (danger >= 3) {
      // 危险 ≥ 3 加 craft 蓝图
      types.push({ type: 'craft_machete', weight: blueprintWeight * 2, jitter: 3 });
      types.push({ type: 'craft_leather_armor', weight: blueprintWeight * 2, jitter: 3 });
    }
  }
  const countRange: [number, number] = [Math.max(1, danger), danger + 3];
  return {
    refreshDays: Math.max(1, danger - 1),
    countRange,
    types,
  };
};

/** 给 location 注入默认 enemyConfig/lootConfig（已显式配的跳过） */
const applyDefaultConfigs = (loc: ScavengeLocationItem): ScavengeLocationItem => {
  if (loc.dangerLevel > 0 && !loc.enemyConfig) {
    loc.enemyConfig = buildDefaultEnemyConfig(loc.dangerLevel);
  }
  if (loc.dangerLevel > 0 && !loc.lootConfig) {
    loc.lootConfig = buildDefaultLootConfig(loc);
  }
  return loc;
};

// ============== 42 个 location 详细数据 ==============

/** 场景路径前缀（所有 location 场景都在 game/scene/locations/<id>/ 下） */
const scenePath = (locId: string, sceneId: string) =>
  `./game/scene/locations/${locId}/${sceneId}.txt`;

const RAW_LOCATIONS: ScavengeLocationItem[] = [
  // ============== safe (0★, 2 个) ==============
  {
    id: 'safehouse',
    name: '安全屋',
    description: '你在这个世界的第一个落脚点，也是你的家。',
    category: 'safe',
    dangerLevel: 0,
    distance: 0,
    explorationTime: 0,
    timeDisplay: '安全屋',
    lootTypes: [],
    unlockCondition: '初始解锁',
    position: { x: 30, y: 70 },
    isUnlocked: true,
    categoryColor: getCategoryColor('safe'),
    ownerName: '主角',
    establishedYear: 2045,
    briefHistory: '废土上一栋被改造的旧公寓，主人用铁皮加固过。',
    scenes: [
      { sceneId: 'entrance', filePath: './game/scene/safehouse/entrance.txt', displayName: '玄关', isDefault: true },
      { sceneId: 'living_room', filePath: './game/scene/safehouse/living_room.txt', displayName: '客厅' },
      { sceneId: 'bedroom', filePath: './game/scene/safehouse/bedroom.txt', displayName: '卧室' },
      { sceneId: 'basement', filePath: './game/scene/safehouse/basement.txt', displayName: '地下室' },
    ],
    jumpScene: './game/scene/safehouse/entrance.txt',
  },
  {
    id: 'market',
    name: '市场',
    description: '维克斯的摊位。可以用瓶盖跟他交易物资。',
    category: 'safe',
    dangerLevel: 0,
    distance: 0,
    explorationTime: 0,
    timeDisplay: '无危险',
    lootTypes: [],
    unlockCondition: '初始解锁',
    position: { x: 38, y: 60 },
    isUnlocked: true,
    categoryColor: getCategoryColor('safe'),
    ownerName: '维克斯',
    establishedYear: 2045,
    briefHistory: '原是农贸市场，废土后被维克斯一人占据做了私人商铺。',
    scenes: [
      { sceneId: 'entrance', filePath: './game/scene/market/market.txt', displayName: '摊位', isDefault: true },
      { sceneId: 'stall', filePath: scenePath('market', 'stall'), displayName: '杂货摊' },
      { sceneId: 'storage', filePath: scenePath('market', 'storage'), displayName: '存货区' },
    ],
    jumpScene: './game/scene/market/market.txt',
  },

  // ============== food (1-3★, 6 个) ==============
  {
    id: 'lao_wang_noodles',
    name: "老王面馆",
    description: '苍蝇小馆，份量十足，老板总在门口招徕客人。',
    category: 'food',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink'],
    unlockCondition: '初始解锁',
    position: { x: 42, y: 50 },
    isUnlocked: true,
    categoryColor: getCategoryColor('food'),
    ownerName: '老王',
    establishedYear: 2035,
    briefHistory: '老王从开张到废土前都守着这家小面馆，从没涨过价。',
    scenes: [
      { sceneId: 'front', filePath: scenePath('lao_wang_noodles', 'front'), displayName: '前厅', isDefault: true },
      { sceneId: 'kitchen', filePath: scenePath('lao_wang_noodles', 'kitchen'), displayName: '后厨' },
      { sceneId: 'storage', filePath: scenePath('lao_wang_noodles', 'storage'), displayName: '小仓库' },
      { sceneId: 'restroom', filePath: scenePath('lao_wang_noodles', 'restroom'), displayName: '卫生间' },
    ],
  },
  {
    id: 'ah_zhen_milk_tea',
    name: '阿珍奶茶店',
    description: '小清新奶茶店，墙上手绘菜单，玻璃柜里一排小摆件。',
    category: 'food',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['drink', 'food'],
    unlockCondition: '初始解锁',
    position: { x: 35, y: 55 },
    isUnlocked: true,
    categoryColor: getCategoryColor('food'),
    ownerName: '阿珍',
    establishedYear: 2040,
    briefHistory: '老板娘是设计专业出身，店面装修成她梦想中的样子。',
    scenes: [
      { sceneId: 'counter', filePath: scenePath('ah_zhen_milk_tea', 'counter'), displayName: '吧台', isDefault: true },
      { sceneId: 'seating', filePath: scenePath('ah_zhen_milk_tea', 'seating'), displayName: '卡座区' },
      { sceneId: 'backroom', filePath: scenePath('ah_zhen_milk_tea', 'backroom'), displayName: '后间' },
    ],
  },
  {
    id: 'mckinley_fast_food',
    name: '麦肯基快餐',
    description: '全国连锁快餐店，套餐便宜量大。',
    category: 'food',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink'],
    unlockCondition: '初始解锁',
    position: { x: 50, y: 40 },
    isUnlocked: true,
    categoryColor: getCategoryColor('food'),
    brandName: '麦肯基',
    establishedYear: 2020,
    briefHistory: '全国连锁店，废土前是大街小巷最常见的快餐品牌。',
    scenes: [
      { sceneId: 'counter', filePath: scenePath('mckinley_fast_food', 'counter'), displayName: '点餐区', isDefault: true },
      { sceneId: 'seating', filePath: scenePath('mckinley_fast_food', 'seating'), displayName: '用餐区' },
      { sceneId: 'restroom', filePath: scenePath('mckinley_fast_food', 'restroom'), displayName: '卫生间' },
      { sceneId: 'back', filePath: scenePath('mckinley_fast_food', 'back'), displayName: '员工通道' },
    ],
  },
  {
    id: 'east_market',
    name: '城东菜市场',
    description: '居民区菜场，卖菜卖肉卖水产，嘈杂又鲜活。',
    category: 'food',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['food', 'drink'],
    unlockCondition: '初始解锁',
    position: { x: 65, y: 45 },
    isUnlocked: true,
    categoryColor: getCategoryColor('food'),
    establishedYear: 2005,
    briefHistory: '城东最大的菜场，承载了几代人的厨房记忆。',
    scenes: [
      { sceneId: 'entrance', filePath: scenePath('east_market', 'entrance'), displayName: '入口', isDefault: true },
      { sceneId: 'vegetable', filePath: scenePath('east_market', 'vegetable'), displayName: '蔬菜区' },
      { sceneId: 'meat', filePath: scenePath('east_market', 'meat'), displayName: '肉类区' },
      { sceneId: 'storage', filePath: scenePath('east_market', 'storage'), displayName: '仓库' },
      { sceneId: 'office', filePath: scenePath('east_market', 'office'), displayName: '管理处' },
    ],
  },
  {
    id: 'old_place_restaurant',
    name: '老地方小炒',
    description: '开了十几年的老店，菜单写在墙上，老板娘嗓门最大。',
    category: 'food',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['food', 'drink'],
    unlockCondition: '初始解锁',
    position: { x: 55, y: 30 },
    isUnlocked: true,
    categoryColor: getCategoryColor('food'),
    ownerName: '陈大姐',
    establishedYear: 2010,
    briefHistory: '十多年的街坊食堂，承载了附近居民的学生时代。',
    scenes: [
      { sceneId: 'front', filePath: scenePath('old_place_restaurant', 'front'), displayName: '前厅', isDefault: true },
      { sceneId: 'kitchen', filePath: scenePath('old_place_restaurant', 'kitchen'), displayName: '厨房' },
      { sceneId: 'storage', filePath: scenePath('old_place_restaurant', 'storage'), displayName: '储物间' },
      { sceneId: 'private_room', filePath: scenePath('old_place_restaurant', 'private_room'), displayName: '包间' },
      { sceneId: 'restroom', filePath: scenePath('old_place_restaurant', 'restroom'), displayName: '卫生间' },
    ],
  },
  {
    id: 'mary_western',
    name: '玛丽西餐厅',
    description: '有情调的西餐厅，墙上挂着油画，每桌都点蜡烛。',
    category: 'food',
    dangerLevel: 3,
    distance: 6,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['food', 'drink', 'luxury'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 60, y: 15 },
    isUnlocked: false,
    categoryColor: getCategoryColor('food'),
    ownerName: '玛丽',
    brandName: '玛丽西餐厅',
    establishedYear: 2028,
    briefHistory: '从法国留学回来的玛丽开的西餐厅，是本城小资最爱的约会地。',
    scenes: [
      { sceneId: 'reception', filePath: scenePath('mary_western', 'reception'), displayName: '迎宾前台', isDefault: true },
      { sceneId: 'dining', filePath: scenePath('mary_western', 'dining'), displayName: '用餐区' },
      { sceneId: 'kitchen', filePath: scenePath('mary_western', 'kitchen'), displayName: '开放式厨房' },
      { sceneId: 'wine_cellar', filePath: scenePath('mary_western', 'wine_cellar'), displayName: '酒窖' },
      { sceneId: 'private_room', filePath: scenePath('mary_western', 'private_room'), displayName: 'VIP 包间' },
      { sceneId: 'staff_room', filePath: scenePath('mary_western', 'staff_room'), displayName: '员工休息室' },
    ],
  },

  // ============== retail (1-3★, 5 个) ==============
  {
    id: 'billy_hardware',
    name: '老比利的五金店',
    description: '本地开了几十年的老店，货架上各种零件工具都有。',
    category: 'retail',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['parts', 'tools', 'metal'],
    unlockCondition: '初始解锁',
    position: { x: 45, y: 60 },
    isUnlocked: true,
    categoryColor: getCategoryColor('retail'),
    ownerName: '老比利',
    establishedYear: 1998,
    briefHistory: '老比利从他父亲手里接过这家店，修了半个城市的工具。',
    scenes: [
      { sceneId: 'front_desk', filePath: scenePath('billy_hardware', 'front_desk'), displayName: '柜台', isDefault: true },
      { sceneId: 'aisle', filePath: scenePath('billy_hardware', 'aisle'), displayName: '货架区' },
      { sceneId: 'storage', filePath: scenePath('billy_hardware', 'storage'), displayName: '后仓' },
      { sceneId: 'workshop', filePath: scenePath('billy_hardware', 'workshop'), displayName: '维修间' },
      { sceneId: 'office', filePath: scenePath('billy_hardware', 'office'), displayName: '办公区' },
    ],
  },
  {
    id: 'mary_clothing',
    name: '玛丽服装店',
    description: '街角的精品服装店，橱窗里摆着当季新款。',
    category: 'retail',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['cloth', 'daily'],
    unlockCondition: '初始解锁',
    position: { x: 40, y: 20 },
    isUnlocked: true,
    categoryColor: getCategoryColor('retail'),
    ownerName: '玛丽',
    brandName: '玛丽服装店',
    establishedYear: 2018,
    briefHistory: '玛丽从设计师转行开的小店，每件衣服都亲自挑选面料。',
    scenes: [
      { sceneId: 'showroom', filePath: scenePath('mary_clothing', 'showroom'), displayName: '展示区', isDefault: true },
      { sceneId: 'fitting_room', filePath: scenePath('mary_clothing', 'fitting_room'), displayName: '试衣间' },
      { sceneId: 'storage', filePath: scenePath('mary_clothing', 'storage'), displayName: '仓库' },
      { sceneId: 'office', filePath: scenePath('mary_clothing', 'office'), displayName: '办公区' },
    ],
  },
  {
    id: 'duoduo_flowers',
    name: '朵朵花店',
    description: '街角的小花店，门口永远摆着时令鲜花。',
    category: 'retail',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['daily', 'cloth'],
    unlockCondition: '初始解锁',
    position: { x: 32, y: 65 },
    isUnlocked: true,
    categoryColor: getCategoryColor('retail'),
    ownerName: '朵朵',
    establishedYear: 2038,
    briefHistory: '花艺师朵朵独立开的花店，是城里最有情调的小店。',
    scenes: [
      { sceneId: 'showroom', filePath: scenePath('duoduo_flowers', 'showroom'), displayName: '展示区', isDefault: true },
      { sceneId: 'refrigerator', filePath: scenePath('duoduo_flowers', 'refrigerator'), displayName: '冷库' },
      { sceneId: 'workshop', filePath: scenePath('duoduo_flowers', 'workshop'), displayName: '花艺工作间' },
    ],
  },
  {
    id: 'yonghui_mart',
    name: '永辉生活超市',
    description: '永辉旗下社区超市，日用品齐全。',
    category: 'retail',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['food', 'drink', 'daily', 'parts'],
    unlockCondition: '初始解锁',
    position: { x: 47, y: 25 },
    isUnlocked: true,
    categoryColor: getCategoryColor('retail'),
    brandName: '永辉',
    establishedYear: 2015,
    briefHistory: '全国连锁的社区超市，废土前是每个小区门口的标配。',
    scenes: [
      { sceneId: 'entrance', filePath: scenePath('yonghui_mart', 'entrance'), displayName: '入口', isDefault: true },
      { sceneId: 'fresh', filePath: scenePath('yonghui_mart', 'fresh'), displayName: '生鲜区' },
      { sceneId: 'daily', filePath: scenePath('yonghui_mart', 'daily'), displayName: '日用品区' },
      { sceneId: 'storage', filePath: scenePath('yonghui_mart', 'storage'), displayName: '仓库' },
      { sceneId: 'office', filePath: scenePath('yonghui_mart', 'office'), displayName: '办公区' },
    ],
  },
  {
    id: 'meiyue_mart',
    name: '美优精品超市',
    description: '进口精品超市，价格贵但商品质量好。',
    category: 'retail',
    dangerLevel: 3,
    distance: 7,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['food', 'drink', 'luxury', 'medicine'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 75, y: 25 },
    isUnlocked: false,
    categoryColor: getCategoryColor('retail'),
    brandName: '美优精品',
    establishedYear: 2025,
    briefHistory: '进口商品超市，是富人区消费升级的代表。',
    scenes: [
      { sceneId: 'entrance', filePath: scenePath('meiyue_mart', 'entrance'), displayName: '入口', isDefault: true },
      { sceneId: 'fresh', filePath: scenePath('meiyue_mart', 'fresh'), displayName: '生鲜区' },
      { sceneId: 'import', filePath: scenePath('meiyue_mart', 'import'), displayName: '进口区' },
      { sceneId: 'storage', filePath: scenePath('meiyue_mart', 'storage'), displayName: '仓库' },
      { sceneId: 'staff', filePath: scenePath('meiyue_mart', 'staff'), displayName: '员工区' },
    ],
  },

  // ============== education (1-4★, 4 个) ==============
  {
    id: 'sunshine_kindergarten',
    name: '阳光幼儿园',
    description: '彩色外墙的幼儿园，门口还有小滑梯。',
    category: 'education',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'cloth', 'daily'],
    unlockCondition: '初始解锁',
    position: { x: 25, y: 65 },
    isUnlocked: true,
    categoryColor: getCategoryColor('education'),
    establishedYear: 2019,
    briefHistory: '城东最大的私立幼儿园，墙上有孩子们的画。',
    scenes: [
      { sceneId: 'entrance', filePath: scenePath('sunshine_kindergarten', 'entrance'), displayName: '门厅', isDefault: true },
      { sceneId: 'classroom', filePath: scenePath('sunshine_kindergarten', 'classroom'), displayName: '教室' },
      { sceneId: 'playground', filePath: scenePath('sunshine_kindergarten', 'playground'), displayName: '操场' },
      { sceneId: 'kitchen', filePath: scenePath('sunshine_kindergarten', 'kitchen'), displayName: '厨房' },
      { sceneId: 'office', filePath: scenePath('sunshine_kindergarten', 'office'), displayName: '园长室' },
    ],
  },
  {
    id: 'experimental_primary',
    name: '实验小学',
    description: '市重点小学，操场大，教室多。',
    category: 'education',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['parts', 'tools', 'cloth', 'daily'],
    unlockCondition: '初始解锁',
    position: { x: 75, y: 60 },
    isUnlocked: true,
    categoryColor: getCategoryColor('education'),
    establishedYear: 1995,
    briefHistory: '老牌重点小学，培养了城里好几代人。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('experimental_primary', 'gate'), displayName: '校门', isDefault: true },
      { sceneId: 'classroom', filePath: scenePath('experimental_primary', 'classroom'), displayName: '教室楼' },
      { sceneId: 'library', filePath: scenePath('experimental_primary', 'library'), displayName: '图书馆' },
      { sceneId: 'gym', filePath: scenePath('experimental_primary', 'gym'), displayName: '体育馆' },
      { sceneId: 'office', filePath: scenePath('experimental_primary', 'office'), displayName: '行政楼' },
    ],
  },
  {
    id: 'no_3_middle_school',
    name: '市第三中学',
    description: '百年老校，红砖教学楼，校园里很多老树。',
    category: 'education',
    dangerLevel: 3,
    distance: 7,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'tools', 'metal'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 20, y: 35 },
    isUnlocked: false,
    categoryColor: getCategoryColor('education'),
    establishedYear: 1920,
    briefHistory: '百年老校，培养了无数本城精英。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('no_3_middle_school', 'gate'), displayName: '校门', isDefault: true },
      { sceneId: 'classroom', filePath: scenePath('no_3_middle_school', 'classroom'), displayName: '教学楼' },
      { sceneId: 'lab', filePath: scenePath('no_3_middle_school', 'lab'), displayName: '实验楼' },
      { sceneId: 'library', filePath: scenePath('no_3_middle_school', 'library'), displayName: '图书馆' },
      { sceneId: 'gym', filePath: scenePath('no_3_middle_school', 'gym'), displayName: '体育馆' },
      { sceneId: 'dorm', filePath: scenePath('no_3_middle_school', 'dorm'), displayName: '宿舍楼' },
    ],
  },
  {
    id: 'tech_university',
    name: '理工大学',
    description: '本城最大的综合性大学，校园像公园。',
    category: 'education',
    dangerLevel: 4,
    distance: 12,
    explorationTime: 5,
    timeDisplay: '5小时',
    lootTypes: ['parts', 'tools', 'metal', 'research'],
    unlockCondition: '任务解锁',
    position: { x: 10, y: 20 },
    isUnlocked: false,
    categoryColor: getCategoryColor('education'),
    establishedYear: 1958,
    briefHistory: '省内顶尖理工科院校，校园面积大，学科齐全。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('tech_university', 'gate'), displayName: '校门', isDefault: true },
      { sceneId: 'classroom', filePath: scenePath('tech_university', 'classroom'), displayName: '教学楼' },
      { sceneId: 'lab_building', filePath: scenePath('tech_university', 'lab_building'), displayName: '实验楼群' },
      { sceneId: 'library', filePath: scenePath('tech_university', 'library'), displayName: '图书馆' },
      { sceneId: 'dorm', filePath: scenePath('tech_university', 'dorm'), displayName: '宿舍区' },
      { sceneId: 'cafeteria', filePath: scenePath('tech_university', 'cafeteria'), displayName: '食堂' },
      { sceneId: 'admin', filePath: scenePath('tech_university', 'admin'), displayName: '行政楼' },
    ],
  },

  // ============== medical (1-4★, 5 个) ==============
  {
    id: 'yimin_pharmacy',
    name: '益民大药房',
    description: '社区药房的连锁店，常见药齐全。',
    category: 'medical',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['medicine', 'bandage'],
    unlockCondition: '初始解锁',
    position: { x: 33, y: 50 },
    isUnlocked: true,
    categoryColor: getCategoryColor('medical'),
    brandName: '益民',
    establishedYear: 2012,
    briefHistory: '全国连锁的社区药房，废土前每个小区门口都有一家。',
    scenes: [
      { sceneId: 'counter', filePath: scenePath('yimin_pharmacy', 'counter'), displayName: '前台', isDefault: true },
      { sceneId: 'shelf', filePath: scenePath('yimin_pharmacy', 'shelf'), displayName: '货架' },
      { sceneId: 'storage', filePath: scenePath('yimin_pharmacy', 'storage'), displayName: '仓库' },
      { sceneId: 'office', filePath: scenePath('yimin_pharmacy', 'office'), displayName: '办公区' },
    ],
  },
  {
    id: 'south_clinic',
    name: '城南小诊所',
    description: '社区医生开的小诊所，街坊感冒发烧都来这。',
    category: 'medical',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['medicine', 'bandage'],
    unlockCondition: '初始解锁',
    position: { x: 28, y: 60 },
    isUnlocked: true,
    categoryColor: getCategoryColor('medical'),
    ownerName: '李医生',
    establishedYear: 2008,
    briefHistory: '李医生从医 30 年，是社区最受信赖的家庭医生。',
    scenes: [
      { sceneId: 'waiting', filePath: scenePath('south_clinic', 'waiting'), displayName: '候诊区', isDefault: true },
      { sceneId: 'consulting', filePath: scenePath('south_clinic', 'consulting'), displayName: '诊室' },
      { sceneId: 'pharmacy', filePath: scenePath('south_clinic', 'pharmacy'), displayName: '药房' },
      { sceneId: 'treatment', filePath: scenePath('south_clinic', 'treatment'), displayName: '治疗室' },
    ],
  },
  {
    id: 'oral_clinic',
    name: '口腔专科诊所',
    description: '专做牙齿的小型诊所，环境整洁。',
    category: 'medical',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['medicine', 'bandage'],
    unlockCondition: '初始解锁',
    position: { x: 48, y: 35 },
    isUnlocked: true,
    categoryColor: getCategoryColor('medical'),
    ownerName: '王医生',
    establishedYear: 2017,
    briefHistory: '王医生是留学归来的牙科专家，诊所设备先进。',
    scenes: [
      { sceneId: 'waiting', filePath: scenePath('oral_clinic', 'waiting'), displayName: '候诊区', isDefault: true },
      { sceneId: 'consulting', filePath: scenePath('oral_clinic', 'consulting'), displayName: '诊室' },
      { sceneId: 'x_ray', filePath: scenePath('oral_clinic', 'x_ray'), displayName: 'X 光室' },
      { sceneId: 'storage', filePath: scenePath('oral_clinic', 'storage'), displayName: '消毒间' },
    ],
  },
  {
    id: 'renhe_hospital',
    name: '仁和医院（私立）',
    description: '私立高端医院，环境优雅但价格不菲。',
    category: 'medical',
    dangerLevel: 3,
    distance: 8,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['medicine', 'bandage', 'luxury'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 80, y: 50 },
    isUnlocked: false,
    categoryColor: getCategoryColor('medical'),
    brandName: '仁和医疗',
    establishedYear: 2008,
    briefHistory: '高端私立医院，是富人阶层就医的首选。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('renhe_hospital', 'lobby'), displayName: '大厅', isDefault: true },
      { sceneId: 'consulting', filePath: scenePath('renhe_hospital', 'consulting'), displayName: '诊室区' },
      { sceneId: 'pharmacy', filePath: scenePath('renhe_hospital', 'pharmacy'), displayName: '药房' },
      { sceneId: 'ward', filePath: scenePath('renhe_hospital', 'ward'), displayName: '病房' },
      { sceneId: 'surgery', filePath: scenePath('renhe_hospital', 'surgery'), displayName: '手术室' },
      { sceneId: 'office', filePath: scenePath('renhe_hospital', 'office'), displayName: '行政楼' },
    ],
  },
  {
    id: 'first_peoples_hospital',
    name: '市第一人民医院（公立）',
    description: '三甲公立医院，科室齐全，是本城医疗的核心。',
    category: 'medical',
    dangerLevel: 4,
    distance: 10,
    explorationTime: 5,
    timeDisplay: '5小时',
    lootTypes: ['medicine', 'bandage'],
    unlockCondition: '任务解锁',
    position: { x: 80, y: 50 },
    isUnlocked: false,
    categoryColor: getCategoryColor('medical'),
    establishedYear: 1952,
    briefHistory: '市内最大的三甲公立医院，每天接诊数千人。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('first_peoples_hospital', 'lobby'), displayName: '门诊大厅', isDefault: true },
      { sceneId: 'consulting', filePath: scenePath('first_peoples_hospital', 'consulting'), displayName: '门诊区' },
      { sceneId: 'pharmacy', filePath: scenePath('first_peoples_hospital', 'pharmacy'), displayName: '药房' },
      { sceneId: 'ward', filePath: scenePath('first_peoples_hospital', 'ward'), displayName: '住院部' },
      { sceneId: 'surgery', filePath: scenePath('first_peoples_hospital', 'surgery'), displayName: '手术室' },
      { sceneId: 'icu', filePath: scenePath('first_peoples_hospital', 'icu'), displayName: 'ICU' },
      { sceneId: 'morgue', filePath: scenePath('first_peoples_hospital', 'morgue'), displayName: '太平间' },
    ],
  },

  // ============== government (3-5★, 3 个) ==============
  {
    id: 'south_police_station',
    name: '城南派出所',
    description: '社区派出所，负责周边治安。',
    category: 'government',
    dangerLevel: 3,
    distance: 5,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['weapon', 'armor', 'parts'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 22, y: 30 },
    isUnlocked: false,
    categoryColor: getCategoryColor('government'),
    establishedYear: 2000,
    briefHistory: '城南社区的执法机构，废土前是地区治安的核心。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('south_police_station', 'lobby'), displayName: '值班大厅', isDefault: true },
      { sceneId: 'office', filePath: scenePath('south_police_station', 'office'), displayName: '办公室' },
      { sceneId: 'armory', filePath: scenePath('south_police_station', 'armory'), displayName: '装备库' },
      { sceneId: 'detention', filePath: scenePath('south_police_station', 'detention'), displayName: '拘留室' },
    ],
  },
  {
    id: 'fire_dept',
    name: '市消防支队',
    description: '城市消防的核心力量，红色大门停着消防车。',
    category: 'government',
    dangerLevel: 3,
    distance: 5,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['tool', 'parts', 'armor'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 15, y: 40 },
    isUnlocked: false,
    categoryColor: getCategoryColor('government'),
    establishedYear: 1995,
    briefHistory: '市内最大消防队，装备精良。',
    scenes: [
      { sceneId: 'garage', filePath: scenePath('fire_dept', 'garage'), displayName: '车库', isDefault: true },
      { sceneId: 'office', filePath: scenePath('fire_dept', 'office'), displayName: '办公区' },
      { sceneId: 'dorm', filePath: scenePath('fire_dept', 'dorm'), displayName: '宿舍' },
      { sceneId: 'storage', filePath: scenePath('fire_dept', 'storage'), displayName: '装备库' },
    ],
  },
  {
    id: 'central_police_station',
    name: '中央警察局',
    description: '本城最大的警察机构，戒备森严。',
    category: 'government',
    dangerLevel: 5,
    distance: 15,
    explorationTime: 6,
    timeDisplay: '6小时',
    lootTypes: ['weapon', 'armor', 'parts'],
    unlockCondition: '任务解锁',
    position: { x: 20, y: 35 },
    isUnlocked: false,
    categoryColor: getCategoryColor('government'),
    establishedYear: 1980,
    briefHistory: '市内最高级别执法机构，废土前是治安铁拳。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('central_police_station', 'lobby'), displayName: '大厅', isDefault: true },
      { sceneId: 'office', filePath: scenePath('central_police_station', 'office'), displayName: '办公区' },
      { sceneId: 'armory', filePath: scenePath('central_police_station', 'armory'), displayName: '武器库' },
      { sceneId: 'detention', filePath: scenePath('central_police_station', 'detention'), displayName: '拘留区' },
      { sceneId: 'basement', filePath: scenePath('central_police_station', 'basement'), displayName: '地下档案室' },
    ],
    enemyConfig: {
      refreshDays: 5,
      countRange: [10, 15],
      types: [
        { type: 'wanderer', weight: 15, jitter: 5 },
        { type: 'chaser', weight: 35, jitter: 6 },
        { type: 'rioter', weight: 30, jitter: 5 },
        { type: 'sentinel', weight: 20, jitter: 4 },
      ],
    },
  },

  // ============== public_service (1-2★, 4 个) ==============
  {
    id: 'city_park',
    name: '城市公园',
    description: '城市里的绿洲，草坪、湖水和长椅。',
    category: 'public_service',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink'],
    unlockCondition: '初始解锁',
    position: { x: 50, y: 55 },
    isUnlocked: true,
    categoryColor: getCategoryColor('public_service'),
    establishedYear: 1990,
    briefHistory: '城中心的老公园，承载了几代人的童年记忆。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('city_park', 'gate'), displayName: '入口', isDefault: true },
      { sceneId: 'lawn', filePath: scenePath('city_park', 'lawn'), displayName: '草坪区' },
      { sceneId: 'lake', filePath: scenePath('city_park', 'lake'), displayName: '湖区' },
      { sceneId: 'pavilion', filePath: scenePath('city_park', 'pavilion'), displayName: '凉亭' },
      { sceneId: 'service', filePath: scenePath('city_park', 'service'), displayName: '服务站' },
    ],
  },
  {
    id: 'district_library',
    name: '区图书馆',
    description: '老式图书馆，架子上满满的书。',
    category: 'public_service',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['cloth', 'daily', 'parts'],
    unlockCondition: '初始解锁',
    position: { x: 40, y: 50 },
    isUnlocked: true,
    categoryColor: getCategoryColor('public_service'),
    establishedYear: 1985,
    briefHistory: '区级公共图书馆，藏书丰富。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('district_library', 'lobby'), displayName: '大厅', isDefault: true },
      { sceneId: 'reading', filePath: scenePath('district_library', 'reading'), displayName: '阅览室' },
      { sceneId: 'storage', filePath: scenePath('district_library', 'storage'), displayName: '书库' },
      { sceneId: 'office', filePath: scenePath('district_library', 'office'), displayName: '办公室' },
    ],
  },
  {
    id: 'community_center',
    name: '社区文化中心',
    description: '社区活动中心，平时办展览和培训。',
    category: 'public_service',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'daily', 'cloth'],
    unlockCondition: '初始解锁',
    position: { x: 36, y: 68 },
    isUnlocked: true,
    categoryColor: getCategoryColor('public_service'),
    establishedYear: 2014,
    briefHistory: '社区居民的活动场所，附近老人小孩常来。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('community_center', 'lobby'), displayName: '门厅', isDefault: true },
      { sceneId: 'activity', filePath: scenePath('community_center', 'activity'), displayName: '活动室' },
      { sceneId: 'kitchen', filePath: scenePath('community_center', 'kitchen'), displayName: '厨房' },
      { sceneId: 'office', filePath: scenePath('community_center', 'office'), displayName: '办公室' },
    ],
  },
  {
    id: 'city_museum',
    name: '城市博物馆',
    description: '本城最大的博物馆，收藏本地历史文物。',
    category: 'public_service',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['luxury', 'parts', 'tool'],
    unlockCondition: '初始解锁',
    position: { x: 45, y: 30 },
    isUnlocked: true,
    categoryColor: getCategoryColor('public_service'),
    establishedYear: 1978,
    briefHistory: '记录本城千年历史的博物馆。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('city_museum', 'lobby'), displayName: '大厅', isDefault: true },
      { sceneId: 'exhibition', filePath: scenePath('city_museum', 'exhibition'), displayName: '展厅' },
      { sceneId: 'storage', filePath: scenePath('city_museum', 'storage'), displayName: '库房' },
      { sceneId: 'office', filePath: scenePath('city_museum', 'office'), displayName: '办公区' },
      { sceneId: 'restroom', filePath: scenePath('city_museum', 'restroom'), displayName: '卫生间' },
    ],
  },

  // ============== entertainment (1-2★, 3 个) ==============
  {
    id: 'shencai_internet',
    name: '神采飞扬网咖',
    description: '24 小时营业的网咖，开黑圣地。',
    category: 'entertainment',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink', 'parts', 'tool'],
    unlockCondition: '初始解锁',
    position: { x: 38, y: 45 },
    isUnlocked: true,
    categoryColor: getCategoryColor('entertainment'),
    brandName: '神采飞扬',
    establishedYear: 2010,
    briefHistory: '年轻人的聚集地，曾经彻夜灯火通明。',
    scenes: [
      { sceneId: 'counter', filePath: scenePath('shencai_internet', 'counter'), displayName: '前台', isDefault: true },
      { sceneId: 'gaming', filePath: scenePath('shencai_internet', 'gaming'), displayName: '游戏区' },
      { sceneId: 'smoking', filePath: scenePath('shencai_internet', 'smoking'), displayName: '吸烟室' },
      { sceneId: 'restroom', filePath: scenePath('shencai_internet', 'restroom'), displayName: '卫生间' },
    ],
  },
  {
    id: 'starlight_cinema',
    name: '星光影城',
    description: '本城最大的电影院，多厅多场。',
    category: 'entertainment',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['food', 'drink', 'luxury'],
    unlockCondition: '初始解锁',
    position: { x: 55, y: 40 },
    isUnlocked: true,
    categoryColor: getCategoryColor('entertainment'),
    brandName: '星光影城',
    establishedYear: 2012,
    briefHistory: '本城最大的连锁影城，约会圣地。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('starlight_cinema', 'lobby'), displayName: '大堂', isDefault: true },
      { sceneId: 'hall_a', filePath: scenePath('starlight_cinema', 'hall_a'), displayName: '1 号厅' },
      { sceneId: 'hall_b', filePath: scenePath('starlight_cinema', 'hall_b'), displayName: '2 号厅' },
      { sceneId: 'snack', filePath: scenePath('starlight_cinema', 'snack'), displayName: '卖品部' },
      { sceneId: 'office', filePath: scenePath('starlight_cinema', 'office'), displayName: '办公区' },
    ],
  },
  {
    id: 'feidian_ktv',
    name: '沸点 KTV',
    description: '潮流 KTV，包间里五颜六色的灯。',
    category: 'entertainment',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['drink', 'luxury', 'cloth'],
    unlockCondition: '初始解锁',
    position: { x: 60, y: 22 },
    isUnlocked: true,
    categoryColor: getCategoryColor('entertainment'),
    brandName: '沸点',
    establishedYear: 2015,
    briefHistory: '年轻人爱去的 KTV，通宵是常态。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('feidian_ktv', 'lobby'), displayName: '前台', isDefault: true },
      { sceneId: 'room', filePath: scenePath('feidian_ktv', 'room'), displayName: '包间区' },
      { sceneId: 'bar', filePath: scenePath('feidian_ktv', 'bar'), displayName: '吧台' },
      { sceneId: 'restroom', filePath: scenePath('feidian_ktv', 'restroom'), displayName: '卫生间' },
      { sceneId: 'office', filePath: scenePath('feidian_ktv', 'office'), displayName: '办公区' },
    ],
  },

  // ============== financial (2-3★, 2 个) ==============
  {
    id: 'icbc_atm',
    name: '24 小时自助银行',
    description: '工商银行 ATM 自助网点，小亭子式。',
    category: 'financial',
    dangerLevel: 2,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['parts', 'tool'],
    unlockCondition: '初始解锁',
    position: { x: 50, y: 25 },
    isUnlocked: true,
    categoryColor: getCategoryColor('financial'),
    brandName: '工商银行',
    establishedYear: 2018,
    briefHistory: '街边常见的 ATM 自助银行。',
    scenes: [
      { sceneId: 'atm', filePath: scenePath('icbc_atm', 'atm'), displayName: 'ATM 区', isDefault: true },
      { sceneId: 'office', filePath: scenePath('icbc_atm', 'office'), displayName: '维护间' },
    ],
  },
  {
    id: 'icbc_branch',
    name: '工商银行支行',
    description: '工商银行本城支行，营业大厅。',
    category: 'financial',
    dangerLevel: 3,
    distance: 6,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'tool', 'luxury'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 50, y: 18 },
    isUnlocked: false,
    categoryColor: getCategoryColor('financial'),
    brandName: '工商银行',
    establishedYear: 1992,
    briefHistory: '本地最大国有银行支行。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('icbc_branch', 'lobby'), displayName: '营业厅', isDefault: true },
      { sceneId: 'vip', filePath: scenePath('icbc_branch', 'vip'), displayName: 'VIP 区' },
      { sceneId: 'vault', filePath: scenePath('icbc_branch', 'vault'), displayName: '金库' },
      { sceneId: 'office', filePath: scenePath('icbc_branch', 'office'), displayName: '办公区' },
      { sceneId: 'storage', filePath: scenePath('icbc_branch', 'storage'), displayName: '档案室' },
    ],
    enemyConfig: {
      refreshDays: 4,
      countRange: [6, 9],
      types: [
        { type: 'wanderer', weight: 35, jitter: 6 },
        { type: 'chaser', weight: 45, jitter: 6 },
        { type: 'rioter', weight: 20, jitter: 4 },
      ],
    },
  },

  // ============== research (3-4★, 2 个) ==============
  {
    id: 'env_monitor',
    name: '市环境监测站',
    description: '政府下属的环境监测机构，监测空气质量和水质。',
    category: 'research',
    dangerLevel: 3,
    distance: 7,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'tool', 'research'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 12, y: 50 },
    isUnlocked: false,
    categoryColor: getCategoryColor('research'),
    establishedYear: 2002,
    briefHistory: '环境监测的基层机构。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('env_monitor', 'lobby'), displayName: '门厅', isDefault: true },
      { sceneId: 'lab', filePath: scenePath('env_monitor', 'lab'), displayName: '实验室' },
      { sceneId: 'office', filePath: scenePath('env_monitor', 'office'), displayName: '办公区' },
      { sceneId: 'sample', filePath: scenePath('env_monitor', 'sample'), displayName: '样品库' },
    ],
  },
  {
    id: 'huada_research',
    name: '华大基因研究所',
    description: '生物科技研究所，配备先进的基因测序设备。',
    category: 'research',
    dangerLevel: 4,
    distance: 12,
    explorationTime: 5,
    timeDisplay: '5小时',
    lootTypes: ['medicine', 'parts', 'research'],
    unlockCondition: '任务解锁',
    position: { x: 8, y: 30 },
    isUnlocked: false,
    categoryColor: getCategoryColor('research'),
    brandName: '华大基因',
    establishedYear: 2010,
    briefHistory: '国内顶尖基因研究机构，技术领先。',
    scenes: [
      { sceneId: 'lobby', filePath: scenePath('huada_research', 'lobby'), displayName: '大厅', isDefault: true },
      { sceneId: 'lab_1', filePath: scenePath('huada_research', 'lab_1'), displayName: '一号实验室' },
      { sceneId: 'lab_2', filePath: scenePath('huada_research', 'lab_2'), displayName: '二号实验室' },
      { sceneId: 'cold', filePath: scenePath('huada_research', 'cold'), displayName: '冷藏室' },
      { sceneId: 'sample', filePath: scenePath('huada_research', 'sample'), displayName: '样品库' },
      { sceneId: 'office', filePath: scenePath('huada_research', 'office'), displayName: '办公区' },
      { sceneId: 'basement', filePath: scenePath('huada_research', 'basement'), displayName: '地下设备间' },
    ],
    enemyConfig: {
      refreshDays: 4,
      countRange: [8, 12],
      types: [
        { type: 'wanderer', weight: 30, jitter: 5 },
        { type: 'chaser', weight: 45, jitter: 6 },
        { type: 'rioter', weight: 20, jitter: 4 },
        { type: 'sentinel', weight: 5, jitter: 2 },
      ],
    },
  },

  // ============== residential (1-3★, 3 个) ==============
  {
    id: 'old_apartment',
    name: '老旧小区',
    description: '八九十年代的老公房，楼道昏暗。',
    category: 'residential',
    dangerLevel: 1,
    distance: 1,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['cloth', 'daily', 'parts'],
    unlockCondition: '初始解锁',
    position: { x: 70, y: 45 },
    isUnlocked: true,
    categoryColor: getCategoryColor('residential'),
    establishedYear: 1985,
    briefHistory: '本城最大的老旧小区，住了几代人。',
    scenes: [
      { sceneId: 'entrance', filePath: scenePath('old_apartment', 'entrance'), displayName: '入口', isDefault: true },
      { sceneId: 'unit_1', filePath: scenePath('old_apartment', 'unit_1'), displayName: '1 单元' },
      { sceneId: 'unit_2', filePath: scenePath('old_apartment', 'unit_2'), displayName: '2 单元' },
      { sceneId: 'yard', filePath: scenePath('old_apartment', 'yard'), displayName: '院子' },
    ],
  },
  {
    id: 'east_apartment',
    name: '城东公寓',
    description: '现代化的小区，有门禁和保安亭。',
    category: 'residential',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['cloth', 'daily', 'parts', 'luxury'],
    unlockCondition: '初始解锁',
    position: { x: 78, y: 30 },
    isUnlocked: true,
    categoryColor: getCategoryColor('residential'),
    establishedYear: 2010,
    briefHistory: '现代化的中产住宅小区。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('east_apartment', 'gate'), displayName: '大门', isDefault: true },
      { sceneId: 'building_a', filePath: scenePath('east_apartment', 'building_a'), displayName: 'A 栋' },
      { sceneId: 'building_b', filePath: scenePath('east_apartment', 'building_b'), displayName: 'B 栋' },
      { sceneId: 'underground', filePath: scenePath('east_apartment', 'underground'), displayName: '地下车库' },
      { sceneId: 'service', filePath: scenePath('east_apartment', 'service'), displayName: '物业中心' },
    ],
  },
  {
    id: 'lake_villa',
    name: '湖景别墅',
    description: '湖边的高档别墅区，每栋都有独立花园。',
    category: 'residential',
    dangerLevel: 3,
    distance: 8,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['cloth', 'luxury', 'parts', 'tool'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 85, y: 35 },
    isUnlocked: false,
    categoryColor: getCategoryColor('residential'),
    establishedYear: 2005,
    briefHistory: '本城最贵的别墅区，非富即贵。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('lake_villa', 'gate'), displayName: '入口', isDefault: true },
      { sceneId: 'villa_1', filePath: scenePath('lake_villa', 'villa_1'), displayName: '1 号别墅', isDefault: true },
      { sceneId: 'villa_2', filePath: scenePath('lake_villa', 'villa_2'), displayName: '2 号别墅' },
      { sceneId: 'club', filePath: scenePath('lake_villa', 'club'), displayName: '会所' },
    ],
  },

  // ============== industrial (2-4★, 3 个) ==============
  {
    id: 'south_warehouse',
    name: '城南仓库',
    description: '物流公司的仓库，堆满各种货物。',
    category: 'industrial',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['parts', 'tool', 'metal'],
    unlockCondition: '初始解锁',
    position: { x: 25, y: 50 },
    isUnlocked: true,
    categoryColor: getCategoryColor('industrial'),
    establishedYear: 2000,
    briefHistory: '物流公司的中心仓库，存储各种日用品。',
    scenes: [
      { sceneId: 'office', filePath: scenePath('south_warehouse', 'office'), displayName: '办公区', isDefault: true },
      { sceneId: 'warehouse_a', filePath: scenePath('south_warehouse', 'warehouse_a'), displayName: 'A 仓' },
      { sceneId: 'warehouse_b', filePath: scenePath('south_warehouse', 'warehouse_b'), displayName: 'B 仓' },
      { sceneId: 'loading', filePath: scenePath('south_warehouse', 'loading'), displayName: '装卸区' },
    ],
  },
  {
    id: 'yongsheng_factory',
    name: '永盛五金加工厂',
    description: '中型五金加工厂，主要生产标准件。',
    category: 'industrial',
    dangerLevel: 3,
    distance: 7,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'metal', 'tool'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 18, y: 55 },
    isUnlocked: false,
    categoryColor: getCategoryColor('industrial'),
    brandName: '永盛',
    establishedYear: 1995,
    briefHistory: '本地老牌五金厂，产品供应全国。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('yongsheng_factory', 'gate'), displayName: '大门', isDefault: true },
      { sceneId: 'workshop_1', filePath: scenePath('yongsheng_factory', 'workshop_1'), displayName: '一号车间' },
      { sceneId: 'workshop_2', filePath: scenePath('yongsheng_factory', 'workshop_2'), displayName: '二号车间' },
      { sceneId: 'office', filePath: scenePath('yongsheng_factory', 'office'), displayName: '办公楼' },
      { sceneId: 'dorm', filePath: scenePath('yongsheng_factory', 'dorm'), displayName: '宿舍' },
    ],
  },
  {
    id: 'junkyard',
    name: '报废汽车拆解厂',
    description: '城市边缘的报废车拆解厂，到处是生锈的车壳。',
    category: 'industrial',
    dangerLevel: 4,
    distance: 10,
    explorationTime: 4,
    timeDisplay: '4小时',
    lootTypes: ['parts', 'metal', 'tool', 'weapon'],
    unlockCondition: '任务解锁',
    position: { x: 8, y: 60 },
    isUnlocked: false,
    categoryColor: getCategoryColor('industrial'),
    establishedYear: 1990,
    briefHistory: '城市报废汽车回收点，已经运行 30 多年。',
    scenes: [
      { sceneId: 'gate', filePath: scenePath('junkyard', 'gate'), displayName: '大门', isDefault: true },
      { sceneId: 'dismantle', filePath: scenePath('junkyard', 'dismantle'), displayName: '拆解区' },
      { sceneId: 'parts_storage', filePath: scenePath('junkyard', 'parts_storage'), displayName: '零件库' },
      { sceneId: 'office', filePath: scenePath('junkyard', 'office'), displayName: '办公区' },
      { sceneId: 'metal_yard', filePath: scenePath('junkyard', 'metal_yard'), displayName: '废铁场' },
    ],
  },
];

/** 最终导出的地点列表（已注入默认 config） */
export const SCAVENGE_LOCATIONS: ScavengeLocationItem[] = RAW_LOCATIONS.map(applyDefaultConfigs);
