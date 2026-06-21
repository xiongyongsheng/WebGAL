/**
 * 时间系统 - 时间状态模型（2026-06-19 加：Plan 16 重构）
 *
 * 单一数据源：所有"时间"相关 state 都**走**这里
 * 之前：current_day / current_period_index / current_period 散**在** GameVar 各**处**
 * 现在：统一为 TimeState 对象
 */

export type TimePeriod = '清晨' | '上午' | '下午' | '半晚' | '黑夜';

export const TIME_PERIODS: TimePeriod[] = ['清晨', '上午', '下午', '半晚', '黑夜'];

/** 时间状态 */
export interface TimeState {
  /** 当前天数（从 1 开始） */
  day: number;
  /** 当前 period index（0-4，对应 TIME_PERIODS） */
  periodIndex: number;
}

/** 初始时间状态 */
export const INITIAL_TIME_STATE: TimeState = {
  day: 1,
  periodIndex: 0,  // 清晨
};

/**
 * 推进 1 期时间（periodIndex +1，超过 4 → 进入下一天）
 */
export const calcNextTime = (state: TimeState): TimeState => {
  let nextPeriodIndex = state.periodIndex + 1;
  let nextDay = state.day;
  if (nextPeriodIndex >= TIME_PERIODS.length) {
    nextPeriodIndex = 0;
    nextDay = state.day + 1;
  }
  return { day: nextDay, periodIndex: nextPeriodIndex };
};

/** 当前 period 是否过夜（period 4 → 0） */
export const isOvernightTransition = (prev: TimeState, next: TimeState): boolean => {
  return next.day !== prev.day;
};

/** 当前 period 名称 */
export const getPeriodName = (state: TimeState): TimePeriod => {
  return TIME_PERIODS[state.periodIndex] ?? '清晨';
};
