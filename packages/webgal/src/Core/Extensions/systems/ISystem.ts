/**
 * 业务系统接口（2026-06-19 加：Plan 16 重构）
 *
 * 目的：统一业务系统的接入**方**式
 *
 * 每**个**业务系统**实**现 `ISystem` **接**口：
 * - `init()` 启动系统
 * - `registerTimeHooks()` 注**册**时间钩子
 * - `subscribeGameVars()` 订阅 GameVar 变化
 * - `destroy()` 关闭系统
 *
 * 之前：业务系统**散**落各**处**，**手**动**调**用**
 * 现在：业务系统**自**己**注**册**，**由** SystemRegistry **统**一**管**理
 */
import type { TimeSystem } from '../time/TimeSystem';
import type { GameVarEventBus } from '../state/GameVarEventBus';

/** 系统**接**口**上**下文（**注**册时**传**入）*/
export interface SystemContext {
  /** 时间系统实例 */
  time: TimeSystem;
  /** GameVar 事件总线 */
  bus: GameVarEventBus;
}

export interface ISystem {
  /** 系统**唯**一 ID */
  readonly id: string;

  /**
   * 启动系统（**只**调**用**一次）
   * **在** registerTimeHooks / subscribeGameVars **之**前调**用**
   */
  init(ctx: SystemContext): void | Promise<void>;

  /**
   * 注**册**时间钩子
   * 例：`time.on('onPeriodChange', this.applyEffects)`
   */
  registerTimeHooks(time: TimeSystem): void;

  /**
   * 订阅 GameVar 变化
   * 例：`bus.subscribe('scavenge_missions', this.onMissionsChange)`
   */
  subscribeGameVars(bus: GameVarEventBus): void;

  /**
   * 关闭系统（**清**理**资**源、取**消**订阅）
   * **可**选实**现**（**默**认 no-op）
   */
  destroy?(): void;
}
