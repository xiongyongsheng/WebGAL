/**
 * 好感度工具函数（2026-06-09 加）
 *
 * 提供：
 * - 当前等级计算（基于 affinity 数值 + 门控）
 * - 升级判断（是否允许升级到下一级）
 * - 等级名 / 等级图标（UI 用）
 * - 物品赠送门槛检查
 *
 * 设计原则：
 * - 纯函数，无副作用（便于测试）
 * - 数据驱动（thresholds/names/permissions 都从 characterRoster 来）
 */

import type { ScavengeCharacter } from './character';
import { CHARACTER_TEMPLATES } from './characterRoster';

/** 好感度等级（4 级）*/
export type AffinityLevelIndex = 0 | 1 | 2 | 3;

/** 默认阈值（4 级：陌生/熟悉/亲密/挚友）*/
export const DEFAULT_AFFINITY_THRESHOLDS = [0, 30, 60, 90] as const;

/** 默认等级名 */
export const DEFAULT_AFFINITY_LEVEL_NAMES = ['陌生', '熟悉', '亲密', '挚友'] as const;

/** 计算当前等级（不带门控，仅按数值）*/
export function computeAffinityLevel(affinity: number, thresholds: readonly number[]): AffinityLevelIndex {
  // thresholds[0] 通常是 0（陌生起点）
  // 找到 affinity 所在的区间
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (affinity >= thresholds[i]) {
      return i as AffinityLevelIndex;
    }
  }
  return 0;
}

/**
 * 计算"展示等级"（带门控）
 *
 * 门控逻辑：
 * - affinity 达到阈值 i → 想升级到第 i+1 级
 * - 但 completedAffinityStoryLevels 必须包含 i 才能升级
 * - 否则保持第 i 级
 */
export function computeDisplayLevel(
  character: ScavengeCharacter,
  thresholds: readonly number[] = DEFAULT_AFFINITY_THRESHOLDS,
): AffinityLevelIndex {
  const numericLevel = computeAffinityLevel(character.affinity, thresholds);
  const completed = new Set(character.completedAffinityStoryLevels);

  // 如果 numericLevel 是 0（陌生），直接返回（不需要任何门控）
  if (numericLevel === 0) return 0;

  // 检查门控：要从 i-1 升级到 i，需要 completedAffinityStoryLevels 包含 i-1
  // 例：affinity 60 → numericLevel=2（亲密），但需要 completed 包含 1（熟悉）才能显示 2
  // 否则保持 1
  let displayLevel: AffinityLevelIndex = 0;
  for (let i = 0; i <= numericLevel; i++) {
    if (i === 0) {
      // 第 0 级（陌生）不需要门控
      displayLevel = 0;
    } else {
      // 第 i 级需要 i-1 的剧情已完成
      if (completed.has(i - 1)) {
        displayLevel = i as AffinityLevelIndex;
      } else {
        // 卡在 i-1 级
        break;
      }
    }
  }

  return displayLevel;
}

/** 获取等级名 */
export function getAffinityLevelName(
  level: AffinityLevelIndex,
  levelNames: readonly string[] = DEFAULT_AFFINITY_LEVEL_NAMES,
): string {
  return levelNames[level] ?? '未知';
}

/**
 * 检查是否可以升级到下一级
 * @returns true 表示已达到下一阈值且门控已满足
 */
export function canLevelUp(character: ScavengeCharacter): boolean {
  const template = CHARACTER_TEMPLATES[character.id];
  const thresholds = template?.affinityThresholds ?? DEFAULT_AFFINITY_THRESHOLDS;
  const numericLevel = computeAffinityLevel(character.affinity, thresholds);
  const displayLevel = computeDisplayLevel(character, thresholds);

  // 数值等级 > 显示等级 → 想升级但被门控挡住
  return numericLevel > displayLevel;
}

/**
 * 获取"距离下一级"的信息（UI 用）
 */
export function getNextLevelProgress(
  character: ScavengeCharacter,
): {
  current: AffinityLevelIndex;
  next: AffinityLevelIndex | null;
  required: number;
  progress: number; // 0~1
  locked: boolean; // 是否卡在门控
} {
  const template = CHARACTER_TEMPLATES[character.id];
  const thresholds = template?.affinityThresholds ?? DEFAULT_AFFINITY_THRESHOLDS;
  const displayLevel = computeDisplayLevel(character, thresholds);

  // 已是最高级
  if (displayLevel >= thresholds.length - 1) {
    return {
      current: displayLevel,
      next: null,
      required: 0,
      progress: 1,
      locked: false,
    };
  }

  const currentThreshold = thresholds[displayLevel];
  const nextThreshold = thresholds[displayLevel + 1];
  const span = nextThreshold - currentThreshold;
  const earned = character.affinity - currentThreshold;
  const progress = Math.max(0, Math.min(1, earned / span));
  const locked = character.affinity >= nextThreshold;

  return {
    current: displayLevel,
    next: (displayLevel + 1) as AffinityLevelIndex,
    required: nextThreshold,
    progress,
    locked,
  };
}

/**
 * 检查是否能赠送某档次物品
 * @param affinityValue 物品档次 'cheap' | 'normal' | 'precious'
 *
 * 逻辑：物品档次 → 角色 giftAccessMap 里查找需要的最低等级 → 检查当前 displayLevel
 */
export function canGiftItem(character: ScavengeCharacter, affinityValue: string): boolean {
  if (character.id === 'player_1') return false;  // 主角不接
  const template = CHARACTER_TEMPLATES[character.id];
  if (!template) return false;
  const requiredLevel = template.giftAccessMap[affinityValue];
  if (requiredLevel === undefined) return false;
  const displayLevel = computeDisplayLevel(character);
  return displayLevel >= requiredLevel;
}

/**
 * 检查是否能聊某话题
 * @param topicLevel 话题分级 'casual' | 'personal' | 'secret'
 */
export function canChatTopic(character: ScavengeCharacter, topicLevel: string): boolean {
  if (character.id === 'player_1') return false;
  const template = CHARACTER_TEMPLATES[character.id];
  if (!template) return false;
  const requiredLevel = template.chatAccessMap[topicLevel];
  if (requiredLevel === undefined) return false;
  const displayLevel = computeDisplayLevel(character);
  return displayLevel >= requiredLevel;
}

/**
 * 修改好感度（返回新值，钳制到 [-100, 100]）
 */
export function clampAffinity(value: number): number {
  return Math.max(-100, Math.min(100, value));
}

/** 等级对应的颜色（UI 用）*/
export function getAffinityLevelColor(level: AffinityLevelIndex): string {
  switch (level) {
    case 0: return '#9E9E9E';  // 灰 - 陌生
    case 1: return '#8BC34A';  // 绿 - 熟悉
    case 2: return '#2196F3';  // 蓝 - 亲密
    case 3: return '#E91E63';  // 粉 - 挚友
    default: return '#9E9E9E';
  }
}

/** 等级对应的图标 emoji（占位，UI 用）*/
export function getAffinityLevelIcon(level: AffinityLevelIndex): string {
  switch (level) {
    case 0: return '?';
    case 1: return '○';
    case 2: return '◐';
    case 3: return '●';
    default: return '?';
  }
}