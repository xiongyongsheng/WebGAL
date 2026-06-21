/**
 * 持久化系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：接管 ScavengeTimeControl 内**部**的 `saveGame(0)` 调**用**（过夜时**自**动**存档）
 *
 * 之前：
 * - ScavengeTimeControl **手**动**调**用** saveGame(0)
 * - 业务**散**落**在** UI **组**件**里**
 *
 * 现在：
 * - PersistenceSystem.afterAdvance **检**测**过夜** → saveGame(0)
 * - **独**立**文**件**
 */
import { logger } from '@/Core/util/logger';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import type { TimeHookContext } from '../time/timeEvents';
import { saveGame } from '@/Core/controller/storage/saveGame';

export class PersistenceSystem implements ISystem {
  readonly id = 'persistence';

  // =================== ISystem 接口 ===================

  init(): void {
    logger.info('[PersistenceSystem] init');
  }

  registerTimeHooks(time: TimeSystem): void {
    time.on('afterAdvance', this.onAfterAdvance);
    logger.info('[PersistenceSystem] 时间钩子已注册');
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    // 当前不订阅
  }

  // =================== 时间钩子 ===================

  /**
   * afterAdvance：过夜时**自**动**存**档
   */
  private onAfterAdvance = (ctx: TimeHookContext): void => {
    if (!ctx.isOvernight) return;

    logger.info('[PersistenceSystem] 过夜，**自**动**存**档到**槽**位 0');
    try {
      saveGame(0);
    } catch (err) {
      logger.error('[PersistenceSystem] saveGame(0) **失**败:', err);
    }
  };
}
