# TimeStateSystem

> Plan 16 Step 3 产物（2026-06-19）

## 目的

接管 ScavengeTimeControl 内**部**的时**间** state **写**回**（`current_day` / `current_period_index`）。

## 之前 vs 现在

**之前**（ScavengeTimeControl）：
```ts
stageStateManager.setStageVarAndCommit({ key: 'current_day', value: newDay });
stageStateManager.setStageVarAndCommit({ key: 'current_period_index', value: newPeriodIndex });
```

**现在**（TimeStateSystem）：
```ts
time.on('afterAdvance', this.onAfterAdvance);
```

## 钩**子**流**程**

```
timeSystem.advance()
  ├─ ...
  └─ 5. afterAdvance
        └─ TimeStateSystem: 写**回** current_day + current_period_index
```

## 数据**双**源**问**题**

**当**前**有**两**个**时**间** state 来源**：
- `TimeSystem.this.state`（**内**部** state）
- GameVar `current_day` / `current_period_index`（**外**部** state）

**两**个** state **应**该**保持**一**致**。**TimeStateSystem **负**责** GameVar **那**部分**。

**未**来**改**进**（**可**选**）：
- **让** TimeSystem **直**接**管** GameVar
- **删**除** `this.state` **内**部** state**（**单**一**来源**）

## API

```ts
class TimeStateSystem implements ISystem {
  readonly id = 'timeState';

  init(): void;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;
}
```

## 依赖

- `Core/Modules/stage/stageStateManager` — GameVar 存**储**
- `Core/Extensions/time/timeEvents.TimeHookContext.next` — **新**的**时**间** state
