# SystemRegistry

> Plan 16 重构产物（2026-06-19）

## 目的

业务系统的**注册中心**。统一管理所有 `ISystem` 实现。

## 核心 API

### 构造

```ts
const time = new TimeSystem();
const bus = new GameVarEventBus();
const registry = new SystemRegistry(time, bus);
```

### `register(system): void`

注册一个系统。**自动**按**顺**序执**行**：
1. `system.init(ctx)`
2. `system.registerTimeHooks(time)`
3. `system.subscribeGameVars(bus)`
4. **记**录 `system.destroy` 用**于**关**闭**

```ts
registry.register(new MissionSystem());
registry.register(new MerchantSystem());
```

### `registerAll(systems): void`

批量注册。

```ts
registry.registerAll([
  new MissionSystem(),
  new MerchantSystem(),
  new CharacterSystem(),
]);
```

### `unregister(systemId): void`

注销系统（**调**用 `system.destroy()`）。

```ts
registry.unregister('mission');
```

### `start(): void`

启动（**目**前 no-op，因**为** init **已**在注**册**时调**用**）。

### `stop(): void`

**关**闭**所**有系统（调**用**所有 `destroy`）。

```ts
registry.stop();
```

### `get<T>(systemId): T | undefined`

获**取**系统实例。

```ts
const mission = registry.get<MissionSystem>('mission');
if (mission) {
  // ...使用 mission
}
```

### `debug(): { systems, timeHooks, busListeners }`

调试：返回**所**有系统 + 钩子 + 订阅统计。

```ts
console.log(registry.debug());
// {
//   systems: ['mission', 'merchant', 'character'],
//   timeHooks: { onPeriodChange: 5, onDayChange: 2, ... },
//   busListeners: { scavenge_missions: 3, 'scavenge_characters': 2, ... }
// }
```

## 生命周期

```
new SystemRegistry(time, bus)
  ↓
registry.register(system)
  ├─ 1. system.init(ctx)
  ├─ 2. system.registerTimeHooks(time)
  ├─ 3. system.subscribeGameVars(bus)
  └─ 4. 记录 system.destroy
  ↓
（时间推进时，钩子自动触发）
  ↓
registry.unregister(id) 或 registry.stop()
  └─ system.destroy()（清理）
```

## 设计原则

### 1. 自动顺序执行

注**册**时**自**动按**顺**序执**行** init / registerTimeHooks / subscribeGameVars。

### 2. 错误隔离

```ts
try {
  system.init(ctx);
} catch (err) {
  logger.error(`系统 ${system.id} init 失败:`, err);
  return;  // 不继续 registerTimeHooks
}

try {
  system.registerTimeHooks(time);
} catch (err) {
  logger.error(`系统 ${system.id} registerTimeHooks 失败:`, err);
  // 继续 subscribeGameVars
}
```

### 3. 依赖注入

`SystemContext` 传**入** time + bus：

```ts
const ctx: SystemContext = { time: this.time, bus: this.bus };
system.init(ctx);
```

### 4. 集中日志

注**册**、注**销**、错**误**统一**记**录，**便**于调**试**。

## 使用示例

```ts
import { SystemRegistry } from './SystemRegistry';
import { TimeSystem } from '../time/TimeSystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { MissionSystem } from './MissionSystem';
import { MerchantSystem } from './MerchantSystem';

// 1. 创建基础设施
const time = new TimeSystem();
const bus = new GameVarEventBus();
const registry = new SystemRegistry(time, bus);

// 2. 注册业务系统
registry.registerAll([
  new MissionSystem(),
  new MerchantSystem(),
]);

// 3. 时间推进（触发所有已注册钩子）
async function onAdvanceButton() {
  await time.advance();
}

// 4. 调试
console.log(registry.debug());
```

## 依赖

- `Core/Extensions/time/TimeSystem` — 时间系统
- `Core/Extensions/state/GameVarEventBus` — GameVar 事件总线
- `Core/util/logger` — 调试日志
