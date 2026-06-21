/**
 * 时间系统 - 事件类型定义（2026-06-19 加：Plan 16 重构）
 *
 * 时间推进过程中触发的所有事件：
 * - beforeAdvance: 推进**前**（快照、准备）
 * - onPeriodChange: period 变化
 * - onDayChange: 天变化（过夜）
 * - onAdvance: 推进**主**逻辑
 * - afterAdvance: 推进**后**（持久化、存档）
 *
 * 业务系统**订**阅这些**事**件，**不**需要**知**道时间系统**内**部**细**节
 */
import type { TimeState } from './timeState';

/** 时间事件名 */
export type TimeEventName =
  | 'beforeAdvance'      // 推进**前**（快照）
  | 'onPeriodChange'     // period 变化（每 period 触**发**）
  | 'onDayChange'        // 天变化（过夜，仅 day 改变时）
  | 'onAdvance'          // 推进**主**逻辑
  | 'afterAdvance';      // 推进**后**（持久化）

/** 时间事件名常量（避免拼**写**错**误**）*/
export const TIME_EVENTS: Record<TimeEventName, TimeEventName> = {
  beforeAdvance: 'beforeAdvance',
  onPeriodChange: 'onPeriodChange',
  onDayChange: 'onDayChange',
  onAdvance: 'onAdvance',
  afterAdvance: 'afterAdvance',
};

/** 钩子**接**收的**上**下文 */
export interface TimeHookContext {
  /** **前**一个时间状态 */
  prev: TimeState;
  /** **新**的时间状态 */
  next: TimeState;
  /** 是否过夜（next.day !== prev.day）*/
  isOvernight: boolean;
  /** 事件**发**生时**间**戳（**用**于调**试**）*/
  timestamp: number;
}

/** 钩子**函**数**类**型 */
export type TimeHook = (ctx: TimeHookContext) => void | Promise<void>;

/** 取**消**订阅**函**数**类**型 */
export type Unsubscribe = () => void;
