# State Module（状态模块）

> Plan 16 重构产物（2026-06-19）

## 目的

提供**显式**的 GameVar 订阅机制，替代之前 `useEffect` 隐式监听模式。

## 文件清单

| 文件 | 职责 | 文档 |
|------|------|------|
| [GameVarEventBus.ts](./GameVarEventBus.ts) | GameVar 事件总线 | [GameVarEventBus.md](./GameVarEventBus.md) |
| [stageStateManager.ts](../stage/stageStateManager.ts) | **现有** stage state 管理 | （**不**在本模块）|

## 快速上手

```ts
import { GameVarEventBus } from './GameVarEventBus';

const bus = new GameVarEventBus();

// 订阅
const unsubscribe = bus.subscribe('scavenge_missions', (newValue, oldValue, key) => {
  console.log(`${key}: ${oldValue} → ${newValue}`);
});

// 取消订阅
unsubscribe();

// 订阅所有 key
bus.subscribe('*', (newValue, oldValue, key) => {
  console.log(`any key ${key} changed`);
});
```

## 设计原则

- **订阅 / 取消订阅函数对**（不会漏回收）
- **错误隔离**（一个订阅抛错不影响其他）
- **支持通配符** `subscribe('*', ...)`（订阅所有 key）

## 依赖

- `Core/Modules/stage/stageStateManager` — GameVar 存储
- `Core/util/logger` — 调试日志
