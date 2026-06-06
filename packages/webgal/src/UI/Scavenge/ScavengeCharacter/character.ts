/**
 * 拾荒系统 - 角色管理模块
 * 角色数据定义和操作
 */

import { InventoryItem, migrateInventory } from '../ScavengeItems/inventory';

/** 主属性（升级时自动 +2 的属性） */
export type MainStat = 'str' | 'agi' | 'end' | 'int';

export interface ScavengeCharacter {
  /** 角色ID */
  id: string;
  /** 角色名称 */
  name: string;
  /** 角色图标/头像 */
  avatar?: string;
  /** 力量属性 */
  str: number;
  /** 敏捷属性 */
  agi: number;
  /** 耐力属性 */
  end: number;
  /** 智力属性 */
  int: number;
  /** 当前HP */
  hp: number;
  /** 最大HP */
  maxHp: number;
  /** 饥饿值 */
  hunger: number;
  /** 最大饥饿值 */
  maxHunger: number;
  /** 口渴值 */
  thirst: number;
  /** 最大口渴值 */
  maxThirst: number;
  /** 精神值 */
  sanity: number;
  /** 最大精神值 */
  maxSanity: number;
  /** 体力值（剩余体力，0 = 精疲力竭） */
  stamina: number;
  /** 最大体力值（受 end 影响：100 + (end-5)*5） */
  maxStamina: number;
  /** 装备的武器ID */
  weaponId?: string;
  /** 装备的护甲ID */
  armorId?: string;
  /** 装备的工具ID */
  toolId?: string;
  /** 是否在探索中（包含派遣：派遣期间 isExploring=true，角色被锁） */
  isExploring: boolean;
  /** 探索地点ID */
  exploringLocationId?: string;
  /** 派遣/探索结束时间：第几天（与 isExploring + exploringLocationId 配合使用） */
  returnDay?: number;
  /** 派遣/探索结束时间：哪个 period（0=清晨, 1=上午, 2=下午, 3=半晚, 4=黑夜） */
  returnPeriodIndex?: number;
  /** 武器耐久度 */
  weaponDurability?: number;
  /** 护甲耐久度 */
  armorDurability?: number;
  /** 工具耐久度 */
  toolDurability?: number;
  // ============== 经验/升级系统 ==============
  /** 当前经验值 */
  exp: number;
  /** 当前等级（1 起） */
  level: number;
  /** 升到下一级所需经验 */
  expToNext: number;
  /** 未分配的属性点（升级 +1） */
  statPoints: number;
  /** 主属性：升级时自动 +2 */
  mainStat: MainStat;
  /** 背包物品列表（属于角色数据的一部分，null 表示空槽位） */
  inventory: (InventoryItem | null)[];
}

/**
 * 默认主角角色数据
 */
export const DEFAULT_CHARACTER: ScavengeCharacter = {
  id: 'player_1',
  name: '主角',
  str: 5,
  agi: 5,
  end: 5,
  int: 5,
  hp: 100,
  maxHp: 100,
  hunger: 100,
  maxHunger: 100,
  thirst: 100,
  maxThirst: 100,
  sanity: 100,
  maxSanity: 100,
  stamina: 100,
  maxStamina: 100,
  isExploring: false,
  exp: 0,
  level: 1,
  expToNext: 100,
  statPoints: 0,
  mainStat: 'str',
  inventory: [],
};

/**
 * 角色状态显示辅助函数
 */
export const getCharacterStatusText = (character: ScavengeCharacter): string => {
  if (character.isExploring) {
    return '派遣中';
  }
  if (character.hp <= 0) {
    return '无法行动';
  }
  // 体力 < 20 算"精疲力竭"
  if (character.stamina < 20) {
    return '精疲力竭';
  }
  if (character.hunger <= 30 || character.thirst <= 30) {
    return '需要物资';
  }
  return '待命';
};

/**
 * 获取状态条颜色
 */
export const getStatusBarColor = (value: number, maxValue: number = 100): string => {
  const percentage = (value / maxValue) * 100;
  if (percentage >= 70) return '#4CAF50';
  if (percentage >= 40) return '#FFC107';
  return '#F44336';
};

/**
 * 规范化角色数据（处理 0/1 转 boolean 等类型问题 + 迁移旧 inventory 数据 + 旧字段兼容）
 *
 * 迁移内容：
 * 1. inventory 槽位可能没有 `instanceId`，统一补一个
 * 2. 旧数据使用 `fatigue` / `maxFatigue` → 改名为 `stamina` / `maxStamina`
 * 3. 旧数据可能没有 exp/level/statPoints/mainStat 字段，初始化默认值
 * 4. 旧数据的 `stamina`（如果之前是 fatigue 字段）可能从 0 开始累积，迁移时把 (maxFatigue - fatigue) 作为新 stamina 初值
 */
export const normalizeCharacter = (char: ScavengeCharacter): ScavengeCharacter => {
  const rawInventory = char.inventory ?? [];
  // 给非 null 的 entry 补 instanceId，null 槽位保留
  const migrated: (InventoryItem | null)[] = rawInventory.map((slot) => {
    if (slot === null) return null;
    return slot;
  });
  const nonNullEntries = migrated.filter((s): s is InventoryItem => s !== null);
  const migratedNonNull = migrateInventory(nonNullEntries);
  let cursor = 0;
  const finalInventory: (InventoryItem | null)[] = migrated.map((slot) => {
    if (slot === null) return null;
    return migratedNonNull[cursor++];
  });

  // 旧字段兼容：fatigue → stamina
  // 旧 stamina = maxFatigue - fatigue（剩余体力 = 上限 - 累积疲劳）
  const legacyFatigue = (char as unknown as { fatigue?: number; maxFatigue?: number }).fatigue;
  const legacyMaxFatigue = (char as unknown as { maxFatigue?: number }).maxFatigue ?? 100;
  const migratedStamina = char.stamina ?? Math.max(0, legacyMaxFatigue - (legacyFatigue ?? 0));
  const migratedMaxStamina = char.maxStamina ?? 100;

  // 派遣字段兜底：旧数据 isExploring=true 但缺 returnDay/PeriodIndex 时
  // 视为"立即返回"（返回时间=当前 0/0），下次推进会被 checkMissionsProgress 结算/清空
  const isExploring = Boolean(char.isExploring);
  const returnDay = isExploring ? (char.returnDay ?? 0) : char.returnDay;
  const returnPeriodIndex = isExploring ? (char.returnPeriodIndex ?? 0) : char.returnPeriodIndex;

  return {
    ...char,
    isExploring,
    returnDay,
    returnPeriodIndex,
    stamina: migratedStamina,
    maxStamina: migratedMaxStamina,
    exp: char.exp ?? 0,
    level: char.level ?? 1,
    expToNext: char.expToNext ?? 100,
    statPoints: char.statPoints ?? 0,
    mainStat: char.mainStat ?? 'str',
    inventory: finalInventory,
  };
};

/**
 * 主属性名（中英映射，给 UI 显示用）
 */
export const MAIN_STAT_NAMES: Record<MainStat, string> = {
  str: '力量',
  agi: '敏捷',
  end: '耐力',
  int: '智力',
};
