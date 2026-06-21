# PersistenceSystem

> Plan 16 Step 3 产物（2026-06-19）

## 目的

接管 ScavengeTimeControl 内**部**的 `saveGame(0)` 调**用**（**过**夜**时**自**动**存**档**）。

## 之前 vs 现在

**之前**（ScavengeTimeControl）：
```ts
if (isOvernight) {
  console.log('新的一天开始，自动存档到槽位 0！');
  saveGame(0);
}
```

**现在**（PersistenceSystem）：
```ts
time.on('afterAdvance', this.onAfterAdvance);
```

## 钩**子**流**程**

```
timeSystem.advance()
  ├─ ...
  └─ 5. afterAdvance
        └─ PersistenceSystem: 如**果** isOvernight → saveGame(0)
```

## 触发条件

**只**在**过**夜**时**触**发**（`ctx.isOvernight === true`），**不**过**夜**不**存**档**（节**省**存**档**次**数**）。

## API

```ts
class PersistenceSystem implements ISystem {
  readonly id = 'persistence';

  init(): void;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;
}
```

## 错误处理

`saveGame(0)` **抛**异**常**时**，**捕**获**并**记**录**（**不**中**断** `advance()` 流**程**）：

```ts
try {
  saveGame(0);
} catch (err) {
  logger.error('[PersistenceSystem] saveGame(0) 失败:', err);
}
```

## 依赖

- `Core/controller/storage/saveGame` — 存**档** API
- `Core/Modules/time/timeEvents.TimeHookContext.isOvernight` — 过**夜**判**断**
