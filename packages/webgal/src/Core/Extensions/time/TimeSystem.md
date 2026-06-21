# TimeSystem

> Plan 16 重构产物（2026-06-19）

## 目的

时间推进的**中央**控制器。提供**声明式钩子机制**，让业务系统**自己**注册时间相关行为。

## API

### 构造

```ts
const time = new TimeSystem();
```

### `getState(): TimeState`

获取当前时间状态（**不**触发钩子）。

```ts
const { day, periodIndex } = time.getState();
```

### `setState(state: TimeState): void`

**同步**设置时间状态。**仅**用于从 GameVar **加载**，**不**触发钩子。

```ts
time.setState({ day: 1, periodIndex: 0 });
```

### `on(event, hook): Unsubscribe`

注册时间钩子。返回**取消订阅**函数。

```ts
const off = time.on('onPeriodChange', (ctx) => {
  console.log(`period: ${ctx.prev.periodIndex} → ${ctx.next.periodIndex}`);
});

// 取消订阅
off();
```

### `off(event, hook): void`

手动取消订阅。

### `advance(): Promise<void>`

推进 1 期时间。**异步**（钩子**可**以返回 Promise）。

**流程**：
1. 计算下一个 time state
2. 触发 `beforeAdvance` 钩子
3. **如果过夜** → 触发 `onDayChange` 钩子
4. 触发 `onPeriodChange` 钩子
5. 更新 state
6. 触发 `onAdvance` 钩子
7. 触发 `afterAdvance` 钩子

**防止重入**：如果 `advance()` 正在执行，再次调用会被**忽略**。

### `debugHooks(): Record<TimeEventName, number>`

调试：返回**每个**事件的钩子数量。

```ts
console.log(time.debugHooks());
// { beforeAdvance: 2, onPeriodChange: 5, onAdvance: 1, ... }
```

## 设计原则

### 1. 钩子**可**异步

```ts
time.on('onPeriodChange', async (ctx) => {
  await fetchSomeData();
  // ...
});
```

### 2. 钩子抛异常**不**中断

```ts
time.on('onPeriodChange', () => {
  throw new Error('oops');
});

time.on('onPeriodChange', () => {
  console.log('I still run!');  // ← 仍然执行
});
```

### 3. 钩子**顺**序执行

同**一个**事件的多个钩子**按**注册顺序执行（`Set` 保持插入顺序）。

### 4. 钩子**可**取消订阅

```ts
const off = time.on('onDayChange', handler);
// ...
off();
```

## 依赖

- `timeState.ts` — `TimeState`、`calcNextTime`、`isOvernightTransition`
- `timeEvents.ts` — 事件类型 + 钩子签名
- `Core/util/logger` — 调试日志
