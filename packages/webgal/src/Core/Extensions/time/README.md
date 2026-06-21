# Time Module（时间系统模块）

> Plan 16 重构产物（2026-06-19）

## 目的

中央化时间推进逻辑，提供**声明式钩子机制**。

之前 `ScavengeTimeControl.handleTimeAdvance` 100+ 行混合所有业务；现在 TimeSystem 30 行只管时间，业务系统**自己注册**钩子。

## 文件清单

| 文件 | 职责 | 文档 |
|------|------|------|
| [TimeSystem.ts](./TimeSystem.ts) | 核心类，**中央**化时间推进 | [TimeSystem.md](./TimeSystem.md) |
| [timeState.ts](./timeState.ts) | 时间状态模型（`TimeState`）| [timeState.md](./timeState.md) |
| [timeEvents.ts](./timeEvents.ts) | 事件类型 + 钩子签名 | [timeEvents.md](./timeEvents.md) |

## 快速上手

```ts
import { TimeSystem } from '@/Core/Extensions/time/TimeSystem';

const time = new TimeSystem();

// 注册钩子
time.on('onPeriodChange', (ctx) => {
  console.log(`day ${ctx.prev.day} → ${ctx.next.day}`);
});

// 推进时间
await time.advance();
```

## 钩子流程

```
advance()
  ├── 1. beforeAdvance  ← 准备、快照
  ├── 2. onDayChange    ← (仅过夜时)
  ├── 3. onPeriodChange ← 每期触发
  ├── 4. 更新 state
  ├── 5. onAdvance      ← 主逻辑
  └── 6. afterAdvance   ← 持久化、存档
```

## 设计原则

- **钩子可异步**（用 `Promise`）
- **钩子抛异常不中断**后续（统一错误处理）
- **钩子顺序执行**（可控制）
- **钩子可取消订阅**（返回 `Unsubscribe`）

## 依赖

- `Core/util/logger` — 调试日志
- `timeState` — 时间状态模型
- `timeEvents` — 事件类型
