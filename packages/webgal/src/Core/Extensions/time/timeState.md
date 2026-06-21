# timeState.ts

> Plan 16 重构产物（2026-06-19）

## 目的

时间状态的**数据模型**。统一之前散落在 GameVar 各处的 `current_day` / `current_period_index` / `current_period`。

## 导出

### 类型

#### `TimePeriod`

```ts
type TimePeriod = '清晨' | '上午' | '下午' | '半晚' | '黑夜';
```

#### `TimeState`

```ts
interface TimeState {
  day: number;        // 天数（从 1 开始）
  periodIndex: number; // period 索引（0-4，对应 TIME_PERIODS）
}
```

### 常量

#### `TIME_PERIODS: TimePeriod[]`

```ts
['清晨', '上午', '下午', '半晚', '黑夜']
```

#### `INITIAL_TIME_STATE: TimeState`

```ts
{ day: 1, periodIndex: 0 }  // 第 1 天清晨
```

### 函数

#### `calcNextTime(state: TimeState): TimeState`

计算下一期时间。

```ts
calcNextTime({ day: 1, periodIndex: 2 }) // → { day: 1, periodIndex: 3 }
calcNextTime({ day: 1, periodIndex: 4 }) // → { day: 2, periodIndex: 0 }  // 过夜
```

#### `isOvernightTransition(prev, next): boolean`

判断**是否**过夜（day 变化）。

```ts
isOvernightTransition({day: 1, periodIndex: 4}, {day: 2, periodIndex: 0}) // → true
isOvernightTransition({day: 1, periodIndex: 0}, {day: 1, periodIndex: 1}) // → false
```

#### `getPeriodName(state: TimeState): TimePeriod`

获取 period 名称。

```ts
getPeriodName({ day: 1, periodIndex: 0 }) // → '清晨'
getPeriodName({ day: 1, periodIndex: 4 }) // → '黑夜'
```

## 使用场景

```ts
import { TimeSystem } from './TimeSystem';
import { getPeriodName, isOvernightTransition } from './timeState';

const time = new TimeSystem();

time.on('onPeriodChange', (ctx) => {
  console.log(`${getPeriodName(ctx.prev)} → ${getPeriodName(ctx.next)}`);
  if (ctx.isOvernight) {
    console.log('过夜了！');
  }
});
```

## 依赖

**无依赖**（纯数据模型 + 纯函数）。

## 设计原则

- **不可变**：所有函数返回**新**对象，**不**修改参数
- **纯函数**：`calcNextTime` / `isOvernightTransition` / `getPeriodName` 都是纯函数
- **单一数据源**：时间状态**只**在这**一个**文件里定义
