/**
 * 时间系统 - 核**心**实现（2026-06-19 加：Plan 16 重构）
 *
 * 目的：**中**央化时间推进逻辑，提供**声**明式钩子机制
 *
 * 之前：
 * - ScavengeTimeControl.handleTimeAdvance 100+ 行，**混**合**所**有业务
 * - 各业务系统**被**动**监**听 GameVar
 * - 加新系统**需**改核心
 *
 * 现在：
 * - TimeSystem 30 行，**只**管时间
 * - 业务系统**注**册钩子（`on('beforeAdvance', ...)`）
 * - 加新系统 = **注**册**新**钩子
 *
 * 设**计**原则：
 * - 钩子**可**以**异**步（**用** Promise）
 * - 钩子抛异常**不**中**断**后**续**（**统**一错**误**处理）
 * - 钩子**顺**序执**行**（**可**控）
 * - 钩子**可**以**取**消订阅（返**回** Unsubscribe）
 *
 * 钩子**执**行顺**序**：
 *   1. beforeAdvance（**所**有）
 *   2. onDayChange（**如**果过夜）
 *   3. onPeriodChange（**每**次推进）
 *   4. onAdvance（**主**逻辑）
 *   5. afterAdvance（持久化）
 */
import { logger } from '@/Core/util/logger';
import {
  INITIAL_TIME_STATE,
  TimeState,
  calcNextTime,
  isOvernightTransition,
} from './timeState';
import {
  TimeEventName,
  TimeHook,
  TimeHookContext,
  Unsubscribe,
} from './timeEvents';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';

/**
 * TimeSystem（2026-06-21 架构层重构）
 *
 * 单一数据源：所有时间状态都从 GameVar `current_day` / `current_period_index` 读取
 *   - 之前：TimeSystem 内部持有 `this.state`，与 GameVar 形成双数据源
 *     → saveGame 不存 this.state、loadGame 不重置 → 读档后 advance() 跳任务
 *   - 现在：TimeSystem 不再持有持久状态，prev 直接从 GameVar 读
 *     → loadGame / saveGame 都不用关心 TimeSystem
 *     → 外部代码、React 组件读 timeSystem.getState() 也是 GameVar 的最新值
 */
export class TimeSystem {
  private hooks: Map<TimeEventName, Set<TimeHook>> = new Map();
  private isAdvancing = false;  // 防止重入

  /**
   * 获**取**当前时间状态（从 GameVar 读取，唯一数据源）
   *
   * 注：与之前 `this.state` 的行为不同 —— 现在返回的是 GameVar 实时值，
   *     任何 GameVar 写入都会立即反映到 getState() 返回值上。
   */
  getState(): TimeState {
    const calcState = stageStateManager.getCalculationStageState().GameVar;
    return {
      day: (calcState['current_day'] as number) ?? INITIAL_TIME_STATE.day,
      periodIndex: (calcState['current_period_index'] as number) ?? INITIAL_TIME_STATE.periodIndex,
    };
  }

  /**
   * 注**册**时间钩子
   * @returns 取**消**订阅**函**数
   */
  on(event: TimeEventName, hook: TimeHook): Unsubscribe {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, new Set());
    }
    this.hooks.get(event)!.add(hook);
    logger.debug(`[TimeSystem] 注**册**钩子: ${event} (总计: ${this.hooks.get(event)!.size})`);

    // 返**回**取**消**订阅**函**数
    return () => this.off(event, hook);
  }

  /**
   * 取**消**订阅
   */
  off(event: TimeEventName, hook: TimeHook): void {
    this.hooks.get(event)?.delete(hook);
  }

  /**
   * 推进 1 期时间
   *
   * 流程：
   *   1. 从 GameVar 读 prev
   *   2. 算 next
   *   3. 触发 beforeAdvance 钩子
   *   4. **如**果过夜 → 触发 onDayChange 钩子
   *   5. 触发 onPeriodChange 钩子
   *   6. 触发 onAdvance 钩子
   *   7. 触发 afterAdvance 钩子（TimeStateSystem 在此写回 GameVar）
   *
   * @throws {Error} **如**果**正**在推进中（防止重入）
   */
  async advance(): Promise<void> {
    if (this.isAdvancing) {
      logger.warn('[TimeSystem] advance() **正**在执**行**中，**忽**略重入调**用**');
      return;
    }
    this.isAdvancing = true;

    try {
      // 关键：从 GameVar 读 prev（不是 this.state）
      //   这样 loadGame 后第一次 advance() 自动从存档时间点开始算
      const prev = this.getState();
      const next = calcNextTime(prev);
      const isOvernight = isOvernightTransition(prev, next);
      const ctx: TimeHookContext = {
        prev,
        next,
        isOvernight,
        timestamp: Date.now(),
      };

      logger.info(`[TimeSystem] advance: day ${prev.day} ${prev.periodIndex} → day ${next.day} ${next.periodIndex}${isOvernight ? ' (过夜)' : ''}`);

      // 1. beforeAdvance（**准**备、快照）
      await this.runHooks(TIME_EVENT_NAMES.beforeAdvance, ctx);

      // 2. onDayChange（**如**果过夜）
      if (isOvernight) {
        await this.runHooks(TIME_EVENT_NAMES.onDayChange, ctx);
      }

      // 3. onPeriodChange
      await this.runHooks(TIME_EVENT_NAMES.onPeriodChange, ctx);

      // 4. onAdvance（**主**逻辑）
      await this.runHooks(TIME_EVENT_NAMES.onAdvance, ctx);

      // 5. afterAdvance（持久化 —— TimeStateSystem 写回 GameVar）
      await this.runHooks(TIME_EVENT_NAMES.afterAdvance, ctx);

      logger.info(`[TimeSystem] advance **完**成`);
    } finally {
      this.isAdvancing = false;
    }
  }

  /**
   * **执**行所**有**指**定**事件的钩子
   *
   * 错**误**处理策略：
   * - 一个钩子抛异常 → 记**录** + **继**续执**行**后**续**钩子
   * - 不**中**断整**体**推进流程
   */
  private async runHooks(event: TimeEventName, ctx: TimeHookContext): Promise<void> {
    const hooks = this.hooks.get(event);
    if (!hooks || hooks.size === 0) return;

    logger.debug(`[TimeSystem] runHooks: ${event} (${hooks.size} 个)`);

    for (const hook of hooks) {
      try {
        await hook(ctx);
      } catch (err) {
        logger.error(`[TimeSystem] ${event} 钩子**执**行**失**败:`, err);
        // **不**抛出，**继**续**后**续钩子
      }
    }
  }

  /**
   * 调**试**：**获**取**所**有注**册**的钩子**信**息
   */
  debugHooks(): Record<TimeEventName, number> {
    const result = {} as Record<TimeEventName, number>;
    for (const [event, hooks] of this.hooks.entries()) {
      result[event] = hooks.size;
    }
    return result;
  }
}

// **导**出事件名**常**量**避**免拼**写错**误
const TIME_EVENT_NAMES = {
  beforeAdvance: 'beforeAdvance' as const,
  onDayChange: 'onDayChange' as const,
  onPeriodChange: 'onPeriodChange' as const,
  onAdvance: 'onAdvance' as const,
  afterAdvance: 'afterAdvance' as const,
};
