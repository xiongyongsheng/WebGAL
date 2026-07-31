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
import { recordCurrentBoardSnapshot } from '@/UI/Scavenge/ScavengeBoard/boardStore';

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
   * 2026-06-21 加：顺**便**记**录**看**板**快**照**（**覆**盖**上**一**次**）
   *   - 玩家**打**开**看**板**看**的**是**这**个**快**照**
   *   - 下**次** advance **之**后**才**更**新**
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
    // 2026-06-21 加：记**录**看**板**快**照**（**只**存**上**一**回**合**的**）
    recordCurrentBoardSnapshot();
    logger.debug(`[TimeStateSystem] 写**回** time state + 看板快照: day ${ctx.next.day}, period ${ctx.next.periodIndex}`);
  };
}
