/**
 * 商人系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：接管 ScavengeTimeControl 内**部**的 `checkMerchantRefresh` 调**用**
 *
 * 之前：
 * - ScavengeTimeControl **手**动**循**环**调**用** checkMerchantRefresh
 * - **手**动**写**回** characters
 * - 商人刷新**与**角色时间效果**混**在**一**起**
 *
 * 现在：
 * - MerchantSystem.onDayChange **调**用** checkMerchantRefresh
 * - 写**回** characters
 * - **独**立**文**件**
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import type { TimeHookContext } from '../time/timeEvents';
import { ScavengeCharacter } from '../../../UI/Scavenge/ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../../../UI/Scavenge/ScavengeCharacter/characterRoster';
import { checkMerchantRefresh } from '../../../UI/Scavenge/Merchant/merchantRefresh';

export class MerchantSystem implements ISystem {
  readonly id = 'merchant';

  private prevChars: ScavengeCharacter[] = [];

  // =================== ISystem 接口 ===================

  init(): void {
    logger.info('[MerchantSystem] init');
  }

  registerTimeHooks(time: TimeSystem): void {
    time.on('beforeAdvance', this.onBeforeAdvance);
    // 商人刷新在过夜时触发（每天检查）
    time.on('onDayChange', this.refreshMerchants);
    time.on('afterAdvance', this.persistChars);

    logger.info('[MerchantSystem] 时间钩子已注册');
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    // 当前不订阅
  }

  // =================== 时间钩子 ===================

  private onBeforeAdvance = (_ctx: TimeHookContext): void => {
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    this.prevChars = typeof raw === 'string' ? JSON.parse(raw) : [];
  };

  /**
   * onDayChange：过夜时检查所有商人是否需要刷新
   */
  private refreshMerchants = (ctx: TimeHookContext): void => {
    const newDay = ctx.next.day;
    let updated = [...this.prevChars];
    for (const c of updated) {
      const refreshResult = checkMerchantRefresh(c, newDay);
      if (refreshResult.shouldRefresh) {
        updated = updated.map(x => x.id === c.id ? refreshResult.nextMerchant : x);
        const template = CHARACTER_TEMPLATES[c.id];
        logger.info(
          `[商人/刷新] ${c.name} 在第${newDay}天刷新（金币→${template?.initialGold ?? 0}，库存重置）`,
        );
      }
    }
    this.prevChars = updated;
  };

  private persistChars = (ctx: TimeHookContext): void => {
    // 2026-06-19 修：只**在**过**夜**时**写**回**，**并**且**用**合**并**模**式**（**不**覆**盖** CharacterSystem **的**写**回**结果**）
    //   **之**前**每**次**都**写**回** `this.prevChars`（**没**有** applyPeriodEffects 结**果**）**→ 覆**盖** hunger/thirst/sanity **减**少**的**值**
    //   现**在**：读**取** GameVar chars（**已**经**有** applyPeriodEffects 结**果**），**只**合**并**商人**刷**新**的**部**分**
    if (!ctx.isOvernight) {
      logger.debug('[MerchantSystem/afterAdvance] 不**过**夜，**跳**过**写**回**');
      return;
    }

    // 读**取** GameVar chars（**已**经**写**过** applyPeriodEffects）
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof raw === 'string') {
      const currentChars: ScavengeCharacter[] = JSON.parse(raw);
      // 合**并**：currentChars **是** applyPeriodEffects 后**的**结**果**，**只**覆**盖**刷**新**的**商人**（其他**角**色**保**留** applyPeriodEffects **结**果**）
      const mergedChars = currentChars.map(c => {
        const refreshedMerchant = this.prevChars.find(m => m.id === c.id);
        return refreshedMerchant ?? c;
      });
      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(mergedChars),
      });
      logger.info('[MerchantSystem/afterAdvance] 过**夜**合**并** characters（含商人刷新）');
    }
  };
}
