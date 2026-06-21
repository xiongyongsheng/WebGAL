# timeEvents.ts

> Plan 16 重构产物（2026-06-19）

## 目的

时间系统的**事件类型 + 钩子签名**定义。

## 导出

### 类型

#### `TimeEventName`

```ts
type TimeEventName =
  | 'beforeAdvance'      // 推进**前**（快照）
  | 'onPeriodChange'     // period 变化（**每**期触**发**）
  | 'onDayChange'        // 天变化（**仅**过夜时）
  | 'onAdvance'          // 推进**主**逻辑
  | 'afterAdvance';      // 推进**后**（持久化）
```

#### `TimeHookContext`

钩子**接**收的**上**下文。

```ts
interface TimeHookContext {
  prev: TimeState;          // **前**一个时间状态
  next: TimeState;          // **新**的时间状态
  isOvernight: boolean;    // 是否过夜
  timestamp: number;       // **事**件**发**生时**间**戳
}
```

#### `TimeHook`

```ts
type TimeHook = (ctx: TimeHookContext) => void | Promise<void>;
```

#### `Unsubscribe`

```ts
type Unsubscribe = () => void;
```

### 常量

#### `TIME_EVENTS`

```ts
const TIME_EVENTS = {
  beforeAdvance: 'beforeAdvance',
  onPeriodChange: 'onPeriodChange',
  onDayChange: 'onDayChange',
  onAdvance: 'onAdvance',
  afterAdvance: 'afterAdvance',
};
```

## 事件**触**发时机

| 事件 | **什么时**候**触**发 |
|------|---------------------|
| `beforeAdvance` | `advance()` 入口 |
| `onDayChange` | day 变化时（**仅**过夜）|
| `onPeriodChange` | periodIndex 变化时（**每**次 advance）|
| `onAdvance` | state **已**更新，**主**逻辑执**行**时 |
| `afterAdvance` | 推进**完**成，持久化时 |

## 使用示例

```ts
import type { TimeHook } from './timeEvents';

const handlePeriodChange: TimeHook = (ctx) => {
  console.log(`period: ${ctx.prev.periodIndex} → ${ctx.next.periodIndex}`);
};

time.on('onPeriodChange', handlePeriodChange);
```

## 依赖

- `timeState.ts` — `TimeState` 类型
