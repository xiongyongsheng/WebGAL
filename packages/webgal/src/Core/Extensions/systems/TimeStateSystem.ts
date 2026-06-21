/**
 * 时间状态系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：接管 ScavengeTimeControl 内**部**的时**间** state **写**回**（`current_day` / `current_period_index`）
 *
 * 之前：
 * - ScavengeTimeControl **手**动**写**时**间** state
 * - 业务**散**落**在** UI **组**件**里**
 *
 * 现在：
 * - TimeStateSystem.afterAdvance 写**回** `current_day` / `current_period_index`
 * - ScavengeTimeControl **从** GameVar **读**（**与**现**有** UI **兼**容**）
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import type { TimeHookContext } from '../time/timeEvents';

export class TimeStateSystem implements ISystem {
  readonly id = 'timeState';

  // =================== ISystem 接口 ===================

  init(): void {
    logger.info('[TimeStateSystem] init');
  }

  registerTimeHooks(time: TimeSystem): void {
    time.on('afterAdvance', this.onAfterAdvance);
    logger.info('[TimeStateSystem] 时间钩子已注册');
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    // 当前不订阅
  }

  // =================== 时间钩子 ===================

  /**
   * afterAdvance：写**回** `current_day` / `current_period_index`
   */
  private onAfterAdvance = (ctx: TimeHookContext): void => {
    stageStateManager.setStageVarAndCommit({
      key: 'current_day',
      value: ctx.next.day,
    });
    stageStateManager.setStageVarAndCommit({
      key: 'current_period_index',
      value: ctx.next.periodIndex,
    });
    logger.debug(`[TimeStateSystem] 写**回** time state: day ${ctx.next.day}, period ${ctx.next.periodIndex}`);
  };
}
