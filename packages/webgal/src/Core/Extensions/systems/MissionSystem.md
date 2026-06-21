# MissionSystem

> Plan 16 Step 2 产物（2026-06-19）

## 目的

派遣系统的**业务实现**。**从** ScavengeTimeControl.handleTimeAdvance 移**出**：
- mission 循环（每**个** mission 跑 encounterCheck + completeMission）
- 写**回** missions + characters
- 瓶盖奖励**计**算**

## 之前 vs 现在

| 维度 | 之前 | 现在 |
|------|------|------|
| 代码位置 | ScavengeTimeControl.handleTimeAdvance（100+ 行）| MissionSystem.onPeriodChange（独立文件）|
| 触发方式 | 手动循环 | TimeSystem **钩**子**自**动触发 |
| 错误处理 | 散**落** try/catch | TimeSystem.runHooks **统**一处理 |
| 调试输出 | 散**落** console.log | logger.info/debug **统**一 |

## API

### 类

```ts
class MissionSystem implements ISystem {
  readonly id = 'mission';

  init(): void;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;
}
```

### 时间钩子

| 钩子 | 行为 |
|------|------|
| `beforeAdvance` | 快照 missions + characters（**用**于**下**个 onPeriodChange 读取）|
| `onPeriodChange` | **核**心：跑 mission 循环（每**个** mission 跑 encounterCheck + completeMission）|
| `afterAdvance` | 写**回** missions + characters + **计**算瓶盖奖励 |

### GameVar 订阅

| key | 行为 |
|-----|------|
| `scavenge_missions` | 调试日志（**当**前**版**本**不**做**响**应）|

## 钩**子**流**程**

```
advance()
  ├─ 1. beforeAdvance
  │     └─ MissionSystem: 快照 missions + characters
  ├─ 2. onPeriodChange
  │     └─ MissionSystem: 跑 mission 循环（**核**心**逻**辑**）
  ├─ 3. 更新 state
  ├─ 4. onAdvance
  └─ 5. afterAdvance
        └─ MissionSystem: 写**回** missions + characters
```

## 临时设计

| 项 | 临时措施 | **待**迁**移** |
|----|---------|-----------|
| `applyPeriodEffectsToCharacters` | ScavengeTimeControl **临**时**调**用 | CharacterSystem |
| `checkMerchantRefresh` | ScavengeTimeControl **临**时**调**用 | MerchantSystem |
| `saveGame(0)`（**过**夜**）| ScavengeTimeControl **临**时**调**用 | PersistenceSystem |

**之**后** CharacterSystem / MerchantSystem / PersistenceSystem **迁**移**完**成**后**，ScavengeTimeControl.handleTimeAdvance **会**变**为**只**调** `timeSystem.advance()`，**不**再**有**任**何**业务**逻**辑**。

## 使用示例

**自**动**注册**（**全**局**单**例**）**：

```ts
// Core/Extensions/index.ts
import { MissionSystem } from './systems/MissionSystem';
systemRegistry.register(new MissionSystem());
```

**手**动**触发** mission 循环（**测**试**用**）**：

```ts
await timeSystem.advance();
```

## 依赖

- `Core/Extensions/systems/ISystem` — 系统**接**口**
- `Core/Extensions/time/TimeSystem` — 时**间系统
- `Core/Extensions/state/GameVarEventBus` — GameVar **事**件总线
- `Core/util/logger` — 调试日志
- `UI/Scavenge/ScavengeMissions/missions` — 派遣业务（`encounterCheck` / `completeMission` / 等）
- `UI/Scavenge/ScavengeMap/locations` — 地点数据
