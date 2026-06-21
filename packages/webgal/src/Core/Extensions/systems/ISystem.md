# ISystem

> Plan 16 重构产物（2026-06-19）

## 目的

业务系统的**统一接口**。所有业务系统**实**现 `ISystem`，**由** `SystemRegistry` 统一管理。

## 接口

```ts
export interface ISystem {
  readonly id: string;

  init(ctx: SystemContext): void | Promise<void>;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;
  destroy?(): void;
}
```

## 字段

### `id: string`

系统**唯**一 ID。**用**于 `SystemRegistry` **查**找系统。

```ts
readonly id = 'mission';
```

## 方法

### `init(ctx): void | Promise<void>`

**启动**系统。**只**调**用**一次，**在** registerTimeHooks / subscribeGameVars **之**前。

```ts
init(ctx: SystemContext): void {
  console.log(`${this.id} system started`);
}
```

**`ctx` 包**含**：
- `time: TimeSystem` — 时间系统
- `bus: GameVarEventBus` — GameVar 事件总线

### `registerTimeHooks(time): void`

注**册**时间钩子。

```ts
registerTimeHooks(time: TimeSystem): void {
  time.on('onPeriodChange', this.applyEffects);
  time.on('onDayChange', this.refresh);
}
```

### `subscribeGameVars(bus): void`

订阅 GameVar 变化。

```ts
subscribeGameVars(bus: GameVarEventBus): void {
  bus.subscribe('scavenge_missions', this.onMissionsChange);
}
```

### `destroy?(): void`

**关**闭系统（**可**选）。用**于**清理**资**源、取**消**订阅。

```ts
destroy(): void {
  this.unsubscribe();
}
```

## 完整示例

```ts
import type { ISystem, SystemContext } from './ISystem';
import type { TimeSystem, TimeHookContext } from '../time/TimeSystem';
import type { GameVarEventBus } from '../state/GameVarEventBus';

export class MissionSystem implements ISystem {
  readonly id = 'mission';

  init(ctx: SystemContext): void {
    console.log(`${this.id} system init`);
  }

  registerTimeHooks(time: TimeSystem): void {
    time.on('beforeAdvance', this.snapshot);
    time.on('onPeriodChange', this.processMissions);
    time.on('afterAdvance', this.persistMissions);
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    bus.subscribe('scavenge_missions', this.onMissionsChange);
  }

  destroy(): void {
    // 清理资源
  }

  // ===== 私有方法 =====

  private snapshot = (ctx: TimeHookContext) => {
    // ...快照
  };

  private processMissions = (ctx: TimeHookContext) => {
    // ...处理派遣
  };

  private persistMissions = (ctx: TimeHookContext) => {
    // ...持久化
  };

  private onMissionsChange = (newValue, oldValue, key) => {
    // ...响应 missions 变化
  };
}
```

## 设计原则

### 1. 单一接口

所有业务系统**必**须**实**现 4 个方法（destroy 可选）。

### 2. 错误隔离

`SystemRegistry` 会**包**裹**每**个**方**法的**try/catch`：
- init 失**败** → 整个系统**不**注**册**
- registerTimeHooks 失**败** → 记**录** + **继**续
- subscribeGameVars 失**败** → 记**录** + **继**续

### 3. 依赖注入

`SystemContext` 传**入** time + bus，系统**不**需要**自**己**创**建。

## 依赖

- `Core/Extensions/time/TimeSystem` — 时间系统类型
- `Core/Extensions/state/GameVarEventBus` — GameVar 事件总线类型
