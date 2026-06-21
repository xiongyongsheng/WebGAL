# CharacterSystem

> Plan 16 Step 3 产物（2026-06-19）

## 目的

接管 ScavengeTimeControl 内**部**的 `applyPeriodEffectsToCharacters` 调**用**。

## 之前 vs 现在

**之前**（ScavengeTimeControl）：
```ts
const updated = applyPeriodEffectsToCharacters(chars, isOvernight);
stageStateManager.setStageVarAndCommit({ key: 'scavenge_characters', value: JSON.stringify(updated) });
```

**现在**（CharacterSystem）：
```ts
time.on('onPeriodChange', this.applyPeriodEffects);
time.on('afterAdvance', this.persistCharacters);
```

## 钩**子**流**程**

```
timeSystem.advance()
  ├─ 1. beforeAdvance：CharacterSystem **快**照** chars
  ├─ 2. onPeriodChange
  │     └─ CharacterSystem: applyPeriodEffects
  ├─ 3. onAdvance
  └─ 4. afterAdvance
        ├─ CharacterSystem: 写**回** chars（applyPeriodEffects 结**果**）
        └─ MissionSystem: 写**回** chars（合**并** mission 改**变**）
```

## 时**间**效果**调**整**

| 属性 | **每** period | 探索**中** | 过**夜**恢**复** |
|------|------|------|------|
| hunger | -8 | -12 | — |
| thirst | -10 | -15 | — |
| sanity | -3 | -4.5 | +20 |
| stamina | -5 | -7.5 | +30 |
| HP（饥/渴=0）| -5/period | — | — |

**调**参**常**量** `ScavengeTimeControl/characterTimeEffects.ts`：

```ts
export const PER_PERIOD_DELTA = { hunger: -8, thirst: -10, sanity: -3, stamina: -5 };
export const EXPLORING_MULTIPLIER = 1.5;
export const OVERNIGHT_RECOVERY = { sanity: 20, stamina: 30 };
export const STARVING_HP_DRAIN = 5;
```

## API

```ts
class CharacterSystem implements ISystem {
  readonly id = 'character';

  init(): void;
  registerTimeHooks(time: TimeSystem): void;
  subscribeGameVars(bus: GameVarEventBus): void;  // 监**听** scavenge_characters
}
```

## 依赖

- `UI/Scavenge/ScavengeTimeControl/characterTimeEffects.applyPeriodEffectsToCharacters` — 核心**算**法
- `Core/Modules/stage/stageStateManager` — GameVar 存**储**
