/**
 * 拾荒系统 - 角色经验/升级
 *
 * 集中"经验获得 → 升级 → 属性点"的纯函数逻辑。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 经验来源：时间推进（characterTimeEffects 里调 gainExp）+ 战斗（接口预留）+ 事件（接口预留）
 * - 升级曲线：递增（1→2=100, 2→3=200, 3→4=300, ...）
 * - 升级奖励：主属性 +2 + 未分配 statPoints +1（半自动）
 * - 玩家手动分配 statPoints
 *
 * 2026-06-05 接口预留：
 * - `gainExpFromCombat` - 战斗模块接入后调用
 * - `gainExpFromEvent` - 事件/剧本可调用
 */

import { ScavengeCharacter, MainStat } from './character';

// ============== 调参常量 ==============

/** 升级曲线：1→2=100, 2→3=200, 3→4=300, ... */
export const EXP_PER_LEVEL_INCREMENT = 100;

/** 升级时主属性自动 +N */
export const STAT_AUTO_PER_LEVEL = 2;

/** 升级时未分配 statPoints +N（玩家手动分配） */
export const STAT_MANUAL_PER_LEVEL = 1;

// ============== 经验获得 API ==============

/**
 * 给单个角色增加经验，可能触发连续升级（连升 N 级）。
 *
 * @param char 角色
 * @param amount 经验增量
 * @returns 升级后的新角色（不变更入参）
 */
export const gainExp = (char: ScavengeCharacter, amount: number): ScavengeCharacter => {
  if (amount <= 0) return char;
  let updated: ScavengeCharacter = { ...char, exp: char.exp + amount };
  // 连升循环
  while (updated.exp >= updated.expToNext) {
    updated = levelUp(updated);
  }
  return updated;
};

/**
 * 批量给一组角色增加经验（每个独立计算，可能连升）。
 */
export const gainExpToCharacters = (
  characters: ScavengeCharacter[],
  amount: number,
): ScavengeCharacter[] => {
  return characters.map(c => gainExp(c, amount));
};

/**
 * 战斗经验（接口预留，战斗模块未实装）。
 * TODO: 等战斗系统实装后接入。
 */
export const gainExpFromCombat = (char: ScavengeCharacter, amount: number): ScavengeCharacter => {
  return gainExp(char, amount);
};

/**
 * 事件经验（接口预留，剧本/事件系统可调用）。
 * 例：剧本里 setVar:scavenge_add_exp:player_1=20; → 解析后调 gainExpFromEvent
 * TODO: 等 setVar 解析层支持后接入。
 */
export const gainExpFromEvent = (char: ScavengeCharacter, amount: number): ScavengeCharacter => {
  return gainExp(char, amount);
};

// ============== 升级 API ==============

/**
 * 单次升级：+1 level, exp 扣减 expToNext, 主属性+2, statPoints+1, 下一级所需递增
 */
export const levelUp = (char: ScavengeCharacter): ScavengeCharacter => {
  return {
    ...char,
    level: char.level + 1,
    exp: char.exp - char.expToNext,
    expToNext: char.expToNext + EXP_PER_LEVEL_INCREMENT,
    statPoints: char.statPoints + STAT_MANUAL_PER_LEVEL,
    [char.mainStat]: char[char.mainStat] + STAT_AUTO_PER_LEVEL,
  } as ScavengeCharacter;
};

// ============== 手动分配 API ==============

/**
 * 玩家批量分配属性点（暂存后一次性提交）。
 *
 * 用于"暂存 + 保存"UI：玩家在 UI 上多次点 +/- 调整 pending 分布，
 * 点"保存"时调用本函数一次性写入。
 *
 * @param char 角色
 * @param pending {str,agi,end,int} 每个属性的待加点数
 * @returns 扣 statPoints + 各属性 +N 后的新角色
 *          如果 totalPending 为 0 或超过可用 statPoints，返回原角色
 */
export const applyPendingStatPoints = (
  char: ScavengeCharacter,
  pending: { str: number; agi: number; end: number; int: number },
): ScavengeCharacter => {
  const total = pending.str + pending.agi + pending.end + pending.int;
  if (total <= 0) return char;
  if (total > char.statPoints) return char;
  return {
    ...char,
    statPoints: char.statPoints - total,
    str: char.str + pending.str,
    agi: char.agi + pending.agi,
    end: char.end + pending.end,
    int: char.int + pending.int,
  } as ScavengeCharacter;
};

// ============== 调试 / 工具 ==============

/**
 * 升级进度百分比（0~1）
 */
export const getExpProgress = (char: ScavengeCharacter): number => {
  if (char.expToNext <= 0) return 0;
  return Math.max(0, Math.min(1, char.exp / char.expToNext));
};
