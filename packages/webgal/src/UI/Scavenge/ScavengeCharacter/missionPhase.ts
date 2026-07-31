/**
 * Mission Phase 工具（2026-06-19 加：Plan 17，2026-06-19 简化：去掉 returning 阶段，2026-06-21 加 crafting/repairing）
 *
 * 用途：推进 character.missionPhase
 *
 * 阶段机制（简化后）：
 * - 'preparing' (1 回合): 准备阶段（会遇敌/扣属性）→ 改为 'scavenging' 当时间到了
 * - 'scavenging' (N 回合): 拾荒中（会遇敌/扣属性）→ 改为 null 当时间到了（mission 结算清空）
 * - 'crafting' (N 回合): 工作台制作/建造工作台 → null 当时间到了（产出物品/完成建造）
 * - 'repairing' (N 回合): 门窗修补 → null 当时间到了（HP 恢复）
 * - null: 空闲（不在派遣中）
 *
 * 注：已去掉 'returning' 阶段（2026-06-19 user 决定简化）
 */
import { ScavengeCharacter } from './character';

export const isTimeReachedForPhase = (
  currentDay: number,
  currentPeriodIndex: number,
  targetDay: number,
  targetPeriodIndex: number,
): boolean => {
  if (currentDay > targetDay) return true;
  if (currentDay < targetDay) return false;
  return currentPeriodIndex >= targetPeriodIndex;
};

/**
 * 推进所有 characters 的 mission phase
 * - 'preparing' 阶段时间到了 → 'scavenging'
 * - 'scavenging' 阶段时间到了 → null（mission 结算清空）
 * - 'crafting' 阶段时间到了 → null（产出物品由 applyCraftingResult 处理）
 * - 'repairing' 阶段时间到了 → null（HP 恢复由 applyRepairResult 处理）
 * - null 不变
 */
export const advanceMissionPhaseOfChars = (
  chars: ScavengeCharacter[],
  currentDay: number,
  currentPeriodIndex: number,
): ScavengeCharacter[] => {
  return chars.map(c => {
    if (!c.missionPhase) {
      return c;
    }
    if (c.missionPhase === 'preparing') {
      if (c.preparingEndDay !== undefined && c.preparingEndPeriodIndex !== undefined) {
        if (isTimeReachedForPhase(currentDay, currentPeriodIndex, c.preparingEndDay, c.preparingEndPeriodIndex)) {
          return { ...c, missionPhase: 'scavenging' as const };
        }
      }
    }
    // 2026-06-21 加：crafting 阶段完成 → null（产出物品由 applyCraftingResult 处理）
    if (c.missionPhase === 'crafting') {
      if (c.craftingEndDay !== undefined && c.craftingEndPeriodIndex !== undefined) {
        if (isTimeReachedForPhase(currentDay, currentPeriodIndex, c.craftingEndDay, c.craftingEndPeriodIndex)) {
          // 只清 phase，不清 craftingEndDay/Index（applyCraftingResult 读这个判断产出）
          return { ...c, missionPhase: null };
        }
      }
    }
    // 2026-06-21 加：repairing 阶段完成 → null（HP 恢复由 applyRepairResult 处理）
    if (c.missionPhase === 'repairing') {
      if (c.repairingEndDay !== undefined && c.repairingEndPeriodIndex !== undefined) {
        if (isTimeReachedForPhase(currentDay, currentPeriodIndex, c.repairingEndDay, c.repairingEndPeriodIndex)) {
          return { ...c, missionPhase: null };
        }
      }
    }
    // 2026-06-19 简化：advanceMissionPhaseOfChars 不推进 'scavenging' → null
    //   - 'scavenging' 阶段的推进由 applyMissionOutcomeToParty 处理（mission 完成时）
    //   - 避免 CharacterSystem + MissionSystem 同一个 advance 中两次调用 advanceMissionPhaseOfChars 导致的 'preparing' → 'scavenging' → null 两步推进
    return c;
  });
};
