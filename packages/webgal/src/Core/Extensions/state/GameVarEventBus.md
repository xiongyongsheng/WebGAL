# GameVarEventBus

> Plan 16 重构产物（2026-06-19）

## 目的

替代 React `useEffect` + `useStageState` 的**隐式**订阅模式。

之前：业务系统用 `useEffect(() => { ... }, [stageState])` 隐式监听，依赖 React 重渲染。
现在：`bus.subscribe(key, listener)` **显式**订阅，**不**依赖 React。

## API

### 构造

```ts
const bus = new GameVarEventBus();
```

构造时**自动**绑**定**到 `stageStateManager.setStageVar`，所**有** GameVar **写**操作**自**动发布事件。

### `subscribe(key, listener): Unsubscribe`

订阅某个 key 的变化。**立**即触发**一**次（携**带**当**前**值）。

```ts
const off = bus.subscribe('scavenge_missions', (newValue, oldValue, key) => {
  // ... 处理变化
});

// 取消订阅
off();
```

### `unsubscribe(key, listener): void`

手动取消订阅。

### `publish(key, newValue): void`

手动发布事件。**主**要用于**测**试和调**试**。**业务**系统**不**需要调**用**——**由** `setStageVarAndCommit` 自动触发。

### `debugListeners(): Record<string, number>`

调试：返回**每**个 key 的订阅者数量。

### `clear(): void`

清理所有订阅（用于测试 / 热重载）。

## 通配符

`subscribe('*', listener)` 订阅**所**有 key 的变化。

```ts
bus.subscribe('*', (newValue, oldValue, key) => {
  console.log(`${key} changed`);
});
```

## 设计原则

### 1. 订阅 / 取消订阅函数对

```ts
const off = bus.subscribe('foo', handler);
// ...later
off();  // 不漏回收
```

### 2. 错误隔离

```ts
bus.subscribe('foo', () => { throw new Error('oops'); });
bus.subscribe('foo', () => { console.log('I still run!'); });
```

### 3. 自动绑定

```ts
// 之前：需要手动 publish
bus.publish('foo', newValue);

// 现在：setStageVarAndCommit 自动 publish
stageStateManager.setStageVarAndCommit({ key: 'foo', value: newValue });
// 上面这行自动触发 bus.publish
```

## 使用场景

### 1. 业务系统订阅

```ts
class MissionSystem implements ISystem {
  subscribeGameVars(bus: GameVarEventBus) {
    bus.subscribe('scavenge_missions', this.onMissionsChange);
  }
}
```

### 2. 调试日志

```ts
bus.subscribe('*', (newValue, oldValue, key) => {
  console.log(`[GameVar] ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`);
});
```

## 依赖

- `Core/Modules/stage/stageStateManager` — GameVar 存储
- `Core/util/logger` — 调试日志
