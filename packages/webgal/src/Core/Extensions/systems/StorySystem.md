# StorySystem

> Plan 16 Step 4 产物（2026-06-19）

## 目的

接管 `StoryManager.tsx` 内 4 个 useEffect 的 GameVar 监听。

## 之前 vs 现在

**之前**（StoryManager.tsx）：

```tsx
export const StoryManager = () => {
  const stageState = useStageState();
  const engineRef = useRef<StoryEngine | null>(null);

  // 4 个 useEffect 监听
  useEffect(() => {
    const cur = stageState.GameVar['current_location_id'];
    if (cur) engineRef.current?.onLocationEnter(cur);
  }, [stageState.GameVar['current_location_id']]);

  useEffect(() => {
    const day = stageState.GameVar['current_day'];
    if (day !== undefined) engineRef.current?.onTimeAdvance(day, ...);
  }, [stageState.GameVar['current_day'], stageState.GameVar['current_period_index']]);

  useEffect(() => {
    engineRef.current?.onItemChange(...);
  }, [stageState.GameVar['scavenge_warehouse']]);

  useEffect(() => {
    engineRef.current?.selectChoice(...);
  }, [stageState.GameVar['pending_story_choice']]);

  return null;
};
```

**现在**（StorySystem + 空 StoryManager）：

```tsx
// StoryManager.tsx（空实现）
export const StoryManager = () => null;

// StorySystem.ts
class StorySystem implements ISystem {
  subscribeGameVars(bus: GameVarEventBus) {
    bus.subscribe('current_location_id', (newValue) => {
      this.engine?.onLocationEnter(newValue as string);
    });
    bus.subscribe('current_period_index', () => {
      this.engine?.onTimeAdvance(...);
    });
    bus.subscribe('scavenge_warehouse', (newValue) => {
      this.engine?.onItemChange(...);
    });
    bus.subscribe('pending_story_choice', (newValue) => {
      this.engine?.selectChoice(...);
    });
  }
}
```

## 订阅的 4 个 key

| key | 触发 | engine 方法 |
|-----|------|------------|
| `current_location_id` | 玩家进入地点 | `onLocationEnter` |
| `current_period_index` | 时间推进 | `onTimeAdvance` |
| `scavenge_warehouse` | 物品变化 | `onItemChange` |
| `pending_story_choice` | 玩家选择 | `selectChoice` |

**注意**：之前 useEffect 同时监听 `current_day` 和 `current_period_index`。
现在只监听 `current_period_index`（每次 advance 都会变），day 信息从 `stageState` 实时读取。

## API

### 类

```ts
class StorySystem implements ISystem {
  readonly id = 'story';

  init(): void;  // 创建 StoryEngine + initializeAll
  registerTimeHooks(time: TimeSystem): void;  // 空
  subscribeGameVars(bus: GameVarEventBus): void;  // 订阅 4 个 key
}
```

### 流程

```
GameVar 变化
  ↓
bus.publish(key, newValue)
  ↓
StorySystem listener
  ↓
engine.onXxx(...)
  ↓
StoryAction[]
  ↓
applyAction
  ├─ play_scene: changeScene(sceneUrl)
  ├─ show_choice: setStageVar(pending_story_choice)
  └─ noop
```

## 关键设计

### 1. 空 StoryManager 组件

`StoryManager.tsx` 简化为返回 `null`，所有逻辑移到 `StorySystem`。`ScavengeMain` 仍引用 `<StoryManager />`（**不**报错）。

**未来**可以**完全删除** `ScavengeMain` 的引用。

### 2. `pending_story_choice` 防止循环

```ts
bus.subscribe('pending_story_choice', (newValue) => {
  if (typeof newValue !== 'string' || !newValue) return;  // ← 防循环
  // ... 处理选择 ...
  stageStateManager.setStageVarAndCommit({ key: 'pending_story_choice', value: '' });
});
```

清空 `pending_story_choice = ''` 会再次触发 bus，但因为**空字符串**就 return，**不**会死循环。

### 3. 复用 `applyAction` + `buildGameState`

`StoryManager.tsx` 内的 `applyAction` 和 `buildGameState` **复**用**到 `StorySystem`：
- 减少重复代码
- 行为**完全一致**

## 依赖

- `Core/Extensions/state/GameVarEventBus` — 事件总线
- `Core/Extensions/systems/ISystem` — 系统接口
- `UI/Scavenge/Story/StoryEngine` — 剧情引擎（**未**改）
- `UI/Scavenge/Story/storyTypes` — 类型定义
- `Core/controller/scene/changeScene` — 场景切换（异步 import）
