# Systems Module（业务系统模块）

> Plan 16 重构产物（2026-06-19）

## 目的

统一业务系统的**接入方式**和**生命周期**管理。

## 文件清单

| 文件 | 职责 | 文档 |
|------|------|------|
| [ISystem.ts](./ISystem.ts) | 系统接口 | [ISystem.md](./ISystem.md) |
| [SystemRegistry.ts](./SystemRegistry.ts) | 系统注册中心 | [SystemRegistry.md](./SystemRegistry.md) |

## 快速上手

```ts
import { TimeSystem } from '../time/TimeSystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { SystemRegistry } from './SystemRegistry';
import { MissionSystem } from './MissionSystem';

const time = new TimeSystem();
const bus = new GameVarEventBus();
const registry = new SystemRegistry(time, bus);

registry.register(new MissionSystem());

// 推进时间（触发所有已注册钩子）
await time.advance();
```

## 业务系统示例

```ts
import type { ISystem, SystemContext } from './ISystem';
import type { TimeSystem } from '../time/TimeSystem';
import type { GameVarEventBus } from '../state/GameVarEventBus';

export class MerchantSystem implements ISystem {
  readonly id = 'merchant';

  init(ctx: SystemContext): void {
    console.log('merchant system init');
  }

  registerTimeHooks(time: TimeSystem): void {
    time.on('onDayChange', this.checkRefresh);
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    bus.subscribe('scavenge_merchants', this.onMerchantsChange);
  }

  private checkRefresh = (ctx: TimeHookContext) => {
    // ... 商人刷新逻辑
  };

  private onMerchantsChange = (newValue, oldValue, key) => {
    // ... 商人数据变化
  };
}
```

## 设计原则

- **统一接口**：所有业务系统**实**现 `ISystem`
- **自动注册**：`SystemRegistry` 统一**按**顺序执**行** init / registerTimeHooks / subscribeGameVars
- **错误隔离**：单个系统**失**败**不**影响其他系统

## 依赖

- `Core/Extensions/time/TimeSystem` — 时间系统
- `Core/Extensions/state/GameVarEventBus` — GameVar 事件总线
- `Core/util/logger` — 调试日志
