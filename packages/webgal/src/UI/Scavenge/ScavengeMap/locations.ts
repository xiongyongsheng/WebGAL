/**
 * 拾荒系统 - 地点数据定义
 * 大都市地图中的各个探索地点
 */

// 重新导出角色类型，方便地图系统使用
export type { ScavengeCharacter } from '../ScavengeCharacter/character';

export type LocationDangerLevel = 0 | 1 | 2 | 3 | 4 | 5;

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
  /** 产出物资类型 */
  lootTypes: string[];
  /** 解锁条件 */
  unlockCondition: string;
  /** 地图坐标 */
  position: { x: number; y: number };
  /** 是否已解锁 */
  isUnlocked: boolean;
  /** 区域颜色（用于地图显示） */
  regionColor: string;
}

/**
 * 大都市地图地点数据
 */
export const SCAVENGE_LOCATIONS: ScavengeLocationItem[] = [
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
