/**
 * 角色系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：接管 ScavengeTimeControl 内**部**的 `applyPeriodEffectsToCharacters` 调**用**
 *
 * 之前：
 * - ScavengeTimeControl **手**动**调**用** applyPeriodEffectsToCharacters
 * - **手**动**写**回** characters
 * - 业务**散**落**在** UI **组**件**里**
 *
 * 现在：
 * - CharacterSystem.onPeriodChange **调**用** applyPeriodEffectsToCharacters
 * - CharacterSystem.afterAdvance 写**回** characters
 * - **独**立**文**件**、**独**立**测**试**
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import type { TimeHookContext } from '../time/timeEvents';
import { ScavengeCharacter } from '../../../UI/Scavenge/ScavengeCharacter/character';
import { advanceMissionPhaseOfChars } from '../../../UI/Scavenge/ScavengeCharacter/missionPhase';
import { applyPeriodEffectsToCharacters } from '../../../UI/Scavenge/ScavengeTimeControl/characterTimeEffects';
import { applyCraftingResults, applyDailyStructureDamage } from '../../../UI/Scavenge/ScavengeCrafting/craftingActions';

export class CharacterSystem implements ISystem {
  readonly id = 'character';

  /** 上一**次** tick 的 characters（beforeAdvance **快**照**）*/
  private prevChars: ScavengeCharacter[] = [];

  /** 应用时间效果**之**后**的**新** characters（afterAdvance **写**回**这**个**）*/
  private updatedChars: ScavengeCharacter[] = [];

  // =================== ISystem 接口 ===================

  init(): void {
    logger.info('[CharacterSystem] init');
  }

  registerTimeHooks(time: TimeSystem): void {
    // 1. beforeAdvance：快照 characters
    time.on('beforeAdvance', this.onBeforeAdvance);

    // 2. onPeriodChange：应用时间效果
    time.on('onPeriodChange', this.applyPeriodEffects);

    // 3. afterAdvance：写回 characters
    //   **注**：MissionSystem 也**改** characters（HP/items），**会**在 MissionSystem.afterAdvance **合**并**并**覆**盖**这**里**的**写**回**
    time.on('afterAdvance', this.persistCharacters);

    logger.info('[CharacterSystem] 时间钩子已注册');
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    // 监**听** characters **变**化（**用**于**扩**展**，**当**前**未**用**）
    bus.subscribe('scavenge_characters', () => {
      logger.debug('[CharacterSystem] characters **变**化');
    });
  }

  // =================== 时间钩子 ===================

  private onBeforeAdvance = (_ctx: TimeHookContext): void => {
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    this.prevChars = typeof raw === 'string' ? JSON.parse(raw) : [];
    logger.debug(`[CharacterSystem/beforeAdvance] 快照: ${this.prevChars.length} chars`);
  };

  private applyPeriodEffects = (ctx: TimeHookContext): void => {
    console.log(
      `%c [CharacterSystem/applyPeriodEffects] ctx=(${ctx.next.day},${ctx.next.periodIndex}) 调**用** advanceMissionPhaseOfChars`,
      'font-size:13px; background:lightblue; color:blue;',
    );
    this.updatedChars = applyPeriodEffectsToCharacters(this.prevChars, ctx.isOvernight);
    // 2026-06-19 改：Plan 17 - 推进 phase（用公**用**函**数**，与 MissionSystem 同**步**）
    this.updatedChars = advanceMissionPhaseOfChars(this.updatedChars, ctx.next.day, ctx.next.periodIndex);
    logger.debug(`[CharacterSystem/onPeriodChange] 应用时间效果: ${this.updatedChars.length} chars`);
  };

  private persistCharacters = (_ctx: TimeHookContext): void => {
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(this.updatedChars),
    });
    logger.debug(`[CharacterSystem/afterAdvance] 写**回** characters`);
  };
}
