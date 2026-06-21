# MerchantSystem

> Plan 16 Step 3 产物（2026-06-19）

## 目的

接管 ScavengeTimeControl 内**部**的 `checkMerchantRefresh` 调**用**。

## 之前 vs 现在

**之前**（ScavengeTimeControl）：
```ts
for (const c of updated) {
  const refreshResult = checkMerchantRefresh(c, newDay);
  if (refreshResult.shouldRefresh) {
    updated = updated.map(x => x.id === c.id ? refreshResult.nextMerchant : x);
  }
}
```

**现在**（MerchantSystem）：
```ts
time.on('onDayChange', this.refreshMerchants);
time.on('afterAdvance', this.persistChars);  // 只**在**过**夜**时**合**并**写**回**
```

## 钩**子**流**程**

```
timeSystem.advance()
  ├─ 1. beforeAdvance：MerchantSystem **快**照** chars
  ├─ 2. onDayChange（**如**果过**夜**）
  │     └─ MerchantSystem: 刷**新**商人（金币 + 库存）
  ├─ 3. onPeriodChange
  ├─ 4. onAdvance
  └─ 5. afterAdvance
        ├─ CharacterSystem: 写**回** chars（applyPeriodEffects）
        ├─ MerchantSystem: 写**回** chars（合**并**商人刷**新**，**只**在**过**夜**）
        └─ MissionSystem: 写**回** chars（合**并** mission 改**变**）
```

## 刷**新**规**则**

- **每**个**商**人**有**独立**的** `refreshDays`（**默**认** 2）
- `currentDay - lastRefreshDay >= refreshDays` → 刷**新**
- **刷**新**内容**：金币 → `template.initialGold`，库存 → `template.inventory`

## 合**并**模式**（**修**正** bug 2026-06-19**）

**问题**：`this.prevChars` **不**含** applyPeriodEffects **结**果**。**如**果**直**接**写**回**会**覆**盖** CharacterSystem **的**写**回**。

**解**决**：
```ts
// 读**取** GameVar chars（**已**经**有** applyPeriodEffects 结**果**）
const currentChars = JSON.parse(raw);
// 只**替**换**刷**新**的**商人**（其他**角**色**保**留** applyPeriodEffects **结**果**）
const mergedChars = currentChars.map(c => {
  const refreshedMerchant = this.prevChars.find(m => m.id === c.id);
  return refreshedMerchant ?? c;
});
```

## API

```ts
class MerchantSystem implements ISystem {
  readonly id = 'merchant';

  init(): void;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;
}
```

## 依赖

- `UI/Scavenge/Merchant/merchantRefresh.checkMerchantRefresh` — 刷**新**算**法**
- `UI/Scavenge/ScavengeCharacter/characterRoster.CHARACTER_TEMPLATES` — 商**人**模**板**
- `Core/Modules/stage/stageStateManager` — GameVar 存**储**
