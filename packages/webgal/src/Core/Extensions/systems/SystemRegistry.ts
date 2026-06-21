/**
 * 系统注册中心（2026-06-19 加：Plan 16 重构）
 *
 * 目的：**统**一**管**理**所**有业务系统的**注**册、生**命**周**期**
 *
 * 之前：
 * - 业务系统**各**自**手**动 init
 * - **时**间钩子**散**落各**处**
 * - 难**测**试、难**维**护
 *
 * 现在：
 * - `registry.register(new MissionSystem())` 一行**注**册**
 * - **自**动**按顺**序**执**行：init → registerTimeHooks → subscribeGameVars
 * - `registry.start()` / `registry.stop()` **统**一**控**制
 *
 * 生命**周**期：
 *   new SystemRegistry()  → 创建（**不**启动任**何**系统）
 *   registry.register(s)  → 注**册**系统
 *   registry.start()      → 启**动**（**不**需要，因**为** init **已**在注**册**时调**用**）
 *   registry.stop()       → **关**闭**所**有系统
 */
import { logger } from '@/Core/util/logger';
import type { ISystem, SystemContext } from './ISystem';
import type { TimeSystem } from '../time/TimeSystem';
import type { GameVarEventBus } from '../state/GameVarEventBus';

export class SystemRegistry {
  private systems = new Map<string, ISystem>();
  /** 销毁函数（cancel subscriptions） */
  private teardowns = new Map<string, () => void>();

  constructor(
    private time: TimeSystem,
    private bus: GameVarEventBus,
  ) {}

  /**
   * 注册系统
   *
   * 流程：
   *   1. 调 `system.init(ctx)` 启动
   *   2. 调 `system.registerTimeHooks(time)`
   *   3. 调 `system.subscribeGameVars(bus)`
   *   4. **记**录 `system.destroy()` 用**于**关**闭**时调**用**
   */
  register(system: ISystem): void {
    if (this.systems.has(system.id)) {
      logger.warn(`[SystemRegistry] 系统 ${system.id} 已**存**在，**覆**盖`);
    }

    const ctx: SystemContext = { time: this.time, bus: this.bus };

    // 1. init
    try {
      const result = system.init(ctx);
      if (result instanceof Promise) {
        logger.warn(`[SystemRegistry] 系统 ${system.id} init **返**回**了** Promise，但**未**等**待**（异**步** init **需**自**己**处**理**）`);
      }
    } catch (err) {
      logger.error(`[SystemRegistry] 系统 ${system.id} init **失**败:`, err);
      return;
    }

    // 2. registerTimeHooks
    try {
      system.registerTimeHooks(this.time);
    } catch (err) {
      logger.error(`[SystemRegistry] 系统 ${system.id} registerTimeHooks **失**败:`, err);
    }

    // 3. subscribeGameVars
    try {
      system.subscribeGameVars(this.bus);
    } catch (err) {
      logger.error(`[SystemRegistry] 系统 ${system.id} subscribeGameVars **失**败:`, err);
    }

    // 4. **记**录 teardown
    const teardown = () => {
      try {
        system.destroy?.();
      } catch (err) {
        logger.error(`[SystemRegistry] 系统 ${system.id} destroy **失**败:`, err);
      }
    };
    this.teardowns.set(system.id, teardown);

    this.systems.set(system.id, system);
    logger.info(`[SystemRegistry] 注**册**系统: ${system.id} (总计: ${this.systems.size})`);
  }

  /**
   * 批量注册
   */
  registerAll(systems: ISystem[]): void {
    for (const system of systems) {
      this.register(system);
    }
  }

  /**
   * 注销系统
   */
  unregister(systemId: string): void {
    const teardown = this.teardowns.get(systemId);
    if (teardown) {
      teardown();
      this.teardowns.delete(systemId);
    }
    this.systems.delete(systemId);
    logger.info(`[SystemRegistry] 注销系统: ${systemId}`);
  }

  /**
   * 启动（**目**前 no-op，因为 init **已**在注**册**时调**用**）
   *
   * 保留接**口**以**后**扩**展**（**例**如**："**全**部**系统**启**动**完**成"事件）
   */
  start(): void {
    logger.info(`[SystemRegistry] start: ${this.systems.size} 个系统已**就**绪`);
  }

  /**
   * 停止所有系统
   */
  stop(): void {
    for (const [id, teardown] of this.teardowns.entries()) {
      try {
        teardown();
      } catch (err) {
        logger.error(`[SystemRegistry] 系统 ${id} stop **失**败:`, err);
      }
    }
    this.teardowns.clear();
    this.systems.clear();
    logger.info(`[SystemRegistry] **所**有系统已关闭`);
  }

  /**
   * 获**取**系统实例
   */
  get<T extends ISystem>(systemId: string): T | undefined {
    return this.systems.get(systemId) as T | undefined;
  }

  /**
   * 调**试**：**获**取**所**有系统**状**态
   */
  debug(): {
    systems: string[];
    timeHooks: Record<string, number>;
    busListeners: Record<string, number>;
  } {
    return {
      systems: Array.from(this.systems.keys()),
      timeHooks: this.time.debugHooks(),
      busListeners: this.bus.debugListeners(),
    };
  }
}
