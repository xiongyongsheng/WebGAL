/**
 * 拾荒系统 - 角色管理模块
 * 角色数据定义和操作
 */

import { InventoryItem, migrateInventory } from '../ScavengeItems/inventory';

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
  /** 疲劳值 */
  fatigue: number;
  /** 最大疲劳值 */
  maxFatigue: number;
  /** 装备的武器ID */
  weaponId?: string;
  /** 装备的护甲ID */
  armorId?: string;
  /** 装备的工具ID */
  toolId?: string;
  /** 是否在探索中 */
  isExploring: boolean;
  /** 探索地点ID */
  exploringLocationId?: string;
  /** 武器耐久度 */
  weaponDurability?: number;
  /** 护甲耐久度 */
  armorDurability?: number;
  /** 工具耐久度 */
  toolDurability?: number;
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
  fatigue: 0,
  maxFatigue: 100,
  isExploring: false,
  inventory: [],
};

/**
 * 角色状态显示辅助函数
 */
export const getCharacterStatusText = (character: ScavengeCharacter): string => {
  if (character.isExploring) {
    return '探索中';
  }
  if (character.hp <= 0) {
    return '无法行动';
  }
  if (character.fatigue >= 80) {
    return '疲劳';
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
 * 规范化角色数据（处理 0/1 转 boolean 等类型问题 + 迁移旧 inventory 数据）
 *
 * 迁移内容：旧数据可能没有 `instanceId`，这里统一补一个；同时过滤掉 null 槽位之间的非法值。
 */
export const normalizeCharacter = (char: ScavengeCharacter): ScavengeCharacter => {
  const rawInventory = char.inventory ?? [];
  // 给非 null 的 entry 补 instanceId，null 槽位保留
  const migrated: (InventoryItem | null)[] = rawInventory.map((slot) => {
    if (slot === null) return null;
    return slot;
  });
  // 一次性把 null 之间的非 null 项提取出来补 instanceId
  const nonNullEntries = migrated.filter((s): s is InventoryItem => s !== null);
  const migratedNonNull = migrateInventory(nonNullEntries);
  // 还原到原数组（保持 null 位置不变）
  let cursor = 0;
  const finalInventory: (InventoryItem | null)[] = migrated.map((slot) => {
    if (slot === null) return null;
    return migratedNonNull[cursor++];
  });
  return {
    ...char,
    isExploring: Boolean(char.isExploring),
    inventory: finalInventory,
  };
};
