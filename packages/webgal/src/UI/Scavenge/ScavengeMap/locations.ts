/**
 * 拾荒系统 - 地点数据定义
 * 大都市地图中的各个探索地点
 */

// 重新导出角色类型，方便地图系统使用
export type { ScavengeCharacter } from '../ScavengeCharacter/character';
import { EnemyPoolEntry, ENEMY_POOL_BY_DANGER, EnemyType } from '../ScavengeEnemies/enemies';

export type LocationDangerLevel = 0 | 1 | 2 | 3 | 4 | 5;

/** 敌人权重条目（2026-06-08 加 per-location 刷新系统） */
export interface LocationEnemyWeight {
  /** 敌人类型 */
  type: EnemyType;
  /** 基础权重 0~100（决定初始比例） */
  weight: number;
  /** 浮动范围（±jitter，每次刷新时随机偏移，让比例有变化） */
  jitter: number;
}

/** 物资权重条目（2026-06-08 加） */
export interface LocationLootWeight {
  /** 物资类型（lootTypes 里的字符串，如 'food' / 'parts'） */
  type: string;
  /** 基础权重 0~100 */
  weight: number;
  /** 浮动范围 */
  jitter: number;
}

/** 地点敌人配置（2026-06-08 加） */
export interface LocationEnemyConfig {
  /** N 天没人拾荒就刷新（与 dangerLevel 正相关） */
  refreshDays: number;
  /** 刷新时敌人总数量范围 [min, max] */
  countRange: [number, number];
  /** 敌人种类 + 权重 + 浮动 */
  types: LocationEnemyWeight[];
}

/** 地点物资配置（2026-06-08 加） */
export interface LocationLootConfig {
  /** N 天没人拾荒就刷新 */
  refreshDays: number;
  /** 物资总数量范围 */
  countRange: [number, number];
  /** 物资种类 + 权重 + 浮动 */
  types: LocationLootWeight[];
}

export interface ScavengeLocationItem {
  /** 地点唯一标识 */
  id: string;
  /** 地点名称 */
  name: string;
  /** 地点描述 */
  description: string;
  /** 区域分类 */
  region: 'safe' | 'residential' | 'commercial' | 'public' | 'government' | 'industrial';
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
  /** 敌人配置（2026-06-08 加，per-location 浮动 + 权重系统） */
  enemyConfig?: LocationEnemyConfig;
  /** 物资配置（2026-06-08 加） */
  lootConfig?: LocationLootConfig;
  /** 解锁条件 */
  unlockCondition: string;
  /** 地图坐标 */
  position: { x: number; y: number };
  /** 是否已解锁 */
  isUnlocked: boolean;
  /** 区域颜色（用于地图显示） */
  regionColor: string;
  /** 2026-06-09 加：点击跳转场景（如果有，就不打开详情面板，直接切换场景） */
  jumpScene?: string;
}

/** 读 location 的 enemyPool（fallback 到 ENEMY_POOL_BY_DANGER） */
export const getLocationEnemyPool = (location: ScavengeLocationItem): EnemyPoolEntry[] => {
  return location.enemyPool ?? ENEMY_POOL_BY_DANGER[location.dangerLevel] ?? [];
};

/**
 * 大都市地图地点数据
 *
 * 2026-06-08 改：所有 location 走"权重 + 浮动"的新系统（enemyConfig / lootConfig）
 * - 总数量在 countRange 内浮动
 * - 每种类型按 weight 比例，权重 ±jitter 随机偏移
 * - 旧字段（enemyPool / lootTypes）保留作为 fallback
 *
 * 详见 [docs/PATCHES/12-location-refresh.md](../../../../docs/PATCHES/12-location-refresh.md)
 */
const RAW_LOCATIONS: ScavengeLocationItem[] = [
  // 安全区
  {
    id: 'slums',
    name: '贫民窟',
    description: '安全的起点，你在这个世界的第一个落脚点。',
    region: 'safe',
    dangerLevel: 0,
    distance: 0,
    explorationTime: 0,
    timeDisplay: '安全屋',
    lootTypes: [],
    unlockCondition: '初始解锁',
    position: { x: 30, y: 70 },
    isUnlocked: true,
    regionColor: '#4CAF50',
    // 2026-06-09 加：点击跳转到安全屋场景
    // 但首次点击时，剧情系统会优先触发 intro（handleLocationSelect 检测红点）
    // 剧情完成后，再点 slums 才会真正跳到 safehouse
    // 2026-06-09 改：跳到 entrance（入口），不再用 safehouse_main（已拆分为多场景）
    jumpScene: './game/scene/safehouse/entrance.txt',
  },
  // 2026-06-09 加：市场（独立的交易区，不在安全屋）
  // 玩家从这里点 → 跳到 market.txt → 跟商人维克斯交易
  {
    id: 'market',
    name: '市场',
    description: '维克斯的摊位。可以用瓶盖跟他交易物资。',
    region: 'safe',
    dangerLevel: 0,
    distance: 0,
    explorationTime: 0,
    timeDisplay: '无危险',
    lootTypes: [],
    unlockCondition: '初始解锁',
    position: { x: 38, y: 60 },  // 贫民窟右上方
    isUnlocked: true,
    regionColor: '#a78bfa',  // 紫色（商人色）
    // 2026-06-09 改：不再跳到 safehouse/market.txt，改为独立场景
    jumpScene: './game/scene/market/market.txt',
  },
  {
    id: 'park',
    name: '公园',
    description: '城市中的绿洲，相对安全，适合新手探索。',
    region: 'safe',
    dangerLevel: 1,
    distance: 2,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink', 'cloth'],
    unlockCondition: '初始解锁',
    position: { x: 50, y: 55 },
    isUnlocked: true,
    regionColor: '#8BC34A',
  },

  // 居民区
  {
    id: 'apartment',
    name: '普通小区',
    description: '住宅楼群，可能找到生活物资。',
    region: 'residential',
    dangerLevel: 2,
    distance: 3,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['parts', 'tools', 'daily'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 70, y: 45 },
    isUnlocked: false,
    regionColor: '#03A9F4',
  },
  {
    id: 'villa',
    name: '别墅区',
    description: '富人区，有价值的物资较多，但风险也更高。',
    region: 'residential',
    dangerLevel: 3,
    distance: 8,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'tools', 'metal'],
    unlockCondition: '探索危险等级≥3的地点后解锁',
    position: { x: 85, y: 35 },
    isUnlocked: false,
    regionColor: '#2196F3',
  },

  // 商业区
  {
    id: 'convenience',
    name: '便利店',
    description: '小型商店，食物和饮料充足。',
    region: 'commercial',
    dangerLevel: 1,
    distance: 3,
    explorationTime: 1,
    timeDisplay: '1小时',
    lootTypes: ['food', 'drink', 'daily'],
    unlockCondition: '初始解锁',
    position: { x: 45, y: 40 },
    isUnlocked: true,
    regionColor: '#FF9800',
  },
  {
    id: 'food_street',
    name: '美食街',
    description: '餐饮集中区，食物丰富，但可能有人流。',
    region: 'commercial',
    dangerLevel: 2,
    distance: 4,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['food', 'drink', 'beverage'],
    unlockCondition: '初始解锁',
    position: { x: 55, y: 30 },
    isUnlocked: true,
    regionColor: '#FFB74D',
  },
  {
    id: 'shopping',
    name: '购物街',
    description: '商业街，各类店铺云集。',
    region: 'commercial',
    dangerLevel: 2,
    distance: 5,
    explorationTime: 2,
    timeDisplay: '2小时',
    lootTypes: ['daily', 'parts', 'tools'],
    unlockCondition: '初始解锁',
    position: { x: 40, y: 20 },
    isUnlocked: true,
    regionColor: '#FFA726',
  },
  {
    id: 'supermarket',
    name: '大型商超',
    description: '大型超市，物资丰富但风险较高。',
    region: 'commercial',
    dangerLevel: 3,
    distance: 6,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['food', 'drink', 'medicine', 'daily'],
    unlockCondition: '初始解锁',
    position: { x: 60, y: 15 },
    isUnlocked: true,
    regionColor: '#FF9800',
  },

  // 公共设施
  {
    id: 'school',
    name: '学校',
    description: '教育设施，可能找到工具和零件。',
    region: 'public',
    dangerLevel: 3,
    distance: 7,
    explorationTime: 3,
    timeDisplay: '3小时',
    lootTypes: ['parts', 'tools', 'cloth'],
    unlockCondition: '任务解锁',
    position: { x: 75, y: 60 },
    isUnlocked: false,
    regionColor: '#9C27B0',
  },
  {
    id: 'hospital',
    name: '医院',
    description: '医疗设施，药品和医疗物资丰富，但非常危险。',
    region: 'public',
    dangerLevel: 4,
    distance: 10,
    explorationTime: 5,
    timeDisplay: '5小时',
    lootTypes: ['medicine', 'bandage', 'cloth'],
    unlockCondition: '任务解锁',
    position: { x: 80, y: 50 },
    isUnlocked: false,
    regionColor: '#9C27B0',
    // 2026-06-08 加：医院有 1 个哨兵（医疗安全警卫）
    enemyPool: [
      { type: 'wanderer', min: 1, max: 2 },
      { type: 'chaser', min: 1, max: 2 },
      { type: 'rioter', min: 0, max: 1 },
      { type: 'sentinel', min: 1, max: 1 },
    ],
  },

  // 政府区域
  {
    id: 'police',
    name: '警察局',
    description: '执法机构，高风险高回报，有武器和护甲。',
    region: 'government',
    dangerLevel: 5,
    distance: 12,
    explorationTime: 6,
    timeDisplay: '6小时',
    lootTypes: ['weapon', 'armor', 'parts'],
    unlockCondition: '任务解锁',
    position: { x: 20, y: 35 },
    isUnlocked: false,
    regionColor: '#F44336',
    // 2026-06-08 加：警察局有 2 个哨兵（双岗哨）
    enemyPool: [
      { type: 'wanderer', min: 1, max: 1 },
      { type: 'chaser', min: 2, max: 3 },
      { type: 'rioter', min: 1, max: 2 },
      { type: 'sentinel', min: 2, max: 2 },
    ],
  },
  {
    id: 'government',
    name: '政府办公楼',
    description: '政府机构，资料和设备丰富。',
    region: 'government',
    dangerLevel: 4,
    distance: 15,
    explorationTime: 5,
    timeDisplay: '5小时',
    lootTypes: ['parts', 'tools', 'metal'],
    unlockCondition: '任务解锁',
    position: { x: 15, y: 25 },
    isUnlocked: false,
    regionColor: '#E91E63',
    // 2026-06-08 加：政府办公楼有 1 个哨兵（入口安检）
    enemyPool: [
      { type: 'wanderer', min: 1, max: 1 },
      { type: 'chaser', min: 1, max: 2 },
      { type: 'rioter', min: 1, max: 1 },
      { type: 'sentinel', min: 1, max: 1 },
    ],
  },

  // 工业区
  {
    id: 'industrial',
    name: '工业区',
    description: '工厂和仓库，金属和零件充足。',
    region: 'industrial',
    dangerLevel: 3,
    distance: 12,
    explorationTime: 4,
    timeDisplay: '4小时',
    lootTypes: ['parts', 'tools', 'metal'],
    unlockCondition: '任务解锁',
    position: { x: 25, y: 50 },
    isUnlocked: false,
    regionColor: '#607D8B',
  },
];

// ============== 默认 config 生成（2026-06-08 加 per-location 刷新系统）==============

/**
 * 按 dangerLevel 生成默认敌人配置（覆盖所有没显式配 enemyConfig 的 location）
 *
 * 原则：
 * - 总数量 countRange = [dangerLevel * 2, dangerLevel * 3]
 *   （danger 1: 2-3 / danger 2: 4-6 / danger 3: 6-9 / danger 4: 8-12 / danger 5: 10-15）
 * - 敌人类型按 danger 渐进：
 *   danger 1: 仅 wanderer
 *   danger 2: wanderer + chaser (轻)
 *   danger 3: wanderer + chaser + rioter (中)
 *   danger 4: 同 3（升级权重）
 *   danger 5: wanderer + chaser + rioter + sentinel
 * - sentinel 仅 danger 5 默认出现
 * - jitter 都给 5~10，让比例小幅浮动
 */
const buildDefaultEnemyConfig = (danger: LocationDangerLevel): LocationEnemyConfig => {
  // 数量范围
  const countRange: [number, number] = [danger * 2, danger * 3];
  // 类型列表（按 danger）
  let types: LocationEnemyWeight[];
  if (danger === 0) {
    types = [];  // 安全区无敌人
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
  // 刷新天数 = danger（1天~5天没人拾荒就刷新）
  return { refreshDays: danger, countRange, types };
};

/**
 * 按 location 的 lootTypes（旧字段）生成默认物资配置
 *
 * 原则：
 * - 每种类型用相等 weight（10），加 ±3 jitter
 * - 物资数量 = [dangerLevel + 1, dangerLevel + 3]
 * - 刷新天数 = max(1, dangerLevel - 1)（低危险地点物资恢复快）
 */
const buildDefaultLootConfig = (location: ScavengeLocationItem): LocationLootConfig => {
  const danger = location.dangerLevel;
  // 物资类型权重：均匀分布 + jitter
  const types: LocationLootWeight[] = (location.lootTypes ?? []).map((t) => ({
    type: t,
    weight: 50,
    jitter: 10,
  }));
  // 数量范围
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

/** 最终导出的地点列表（已注入默认 config，2026-06-08 改） */
export const SCAVENGE_LOCATIONS: ScavengeLocationItem[] = RAW_LOCATIONS.map(applyDefaultConfigs);

/**
 * 获取区域显示名称
 */
export const getRegionDisplayName = (region: ScavengeLocationItem['region']): string => {
  const regionNames: Record<ScavengeLocationItem['region'], string> = {
    safe: '安全区',
    residential: '居民区',
    commercial: '商业区',
    public: '公共设施',
    government: '政府区域',
    industrial: '工业区',
  };
  return regionNames[region];
};

/**
 * 获取危险等级星星显示
 */
export const getDangerStars = (level: LocationDangerLevel): string => {
  return '★'.repeat(level) + '☆'.repeat(5 - level);
};
