# 12. 地点刷新系统（per-location 浮动 + 权重系统）

> **新增专题**（2026-06-08 加，2026-06-09 改：同步刷新 + 以 lastInteractedDay 为基准 + 最后一期也遇敌 + combat 100% 遭遇 + 胜仗 30% 额外物资 + **已清空 location 不自动刷新**）
>
> 涉及文件：
> - [locations.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts) — `enemyConfig` / `lootConfig` 字段
> - [locationState.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locationState.ts) — `LocationState` 持久化
> - [locationRefresh.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locationRefresh.ts) — 权重选 + 刷新逻辑
> - [encounterCheck.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/encounterCheck.ts) — 从 state 读 + deduct + combat 100% 遭遇
> - [ScavengeTimeControl.tsx](../../packages/webgal/src/UI/Scavenge/ScavengeTimeControl/ScavengeTimeControl.tsx) — 时间推进钩子（最后一期也跑 encounter）
> - [ScavengeMapDetail.tsx](../../packages/webgal/src/UI/Scavenge/ScavengeMap/ScavengeMapDetail.tsx) — UI 展示

## 目的

取代旧"全局硬编码 1-3 敌人 + 1-3 物资"系统。改成：

- 每个 location 有**自己的**敌人/物资配置
- 数量在 `[min, max]` 范围内**浮动**
- 各类别按 `weight` 比例，**±jitter 浮动**让比例有变化
- **时间触发**（N 天没人拾荒就刷新）+ **事件驱动**（外部 mark dirty）双触发
- 玩家可以在 UI 上看到**当前剩余**敌人/物资 + 距离下次刷新的天数

## 核心设计

### 1. 数据模型（locations.ts）

`ScavengeLocationItem` 加 2 个可选字段（用 `applyDefaultConfigs` 自动注入默认）：

```ts
enemyConfig?: {
  refreshDays: number;           // 几天没人来就刷新
  countRange: [min, max];        // 总数量浮动范围
  types: [
    { type: EnemyType, weight: number, jitter: number },
    ...
  ];
};

lootConfig?: {
  refreshDays: number;
  countRange: [min, max];
  types: [
    { type: string, weight: number, jitter: number },
    ...
  ];
};
```

### 2. 默认配置（按 dangerLevel 自动生成）

`applyDefaultConfigs` 在 `SCAVENGE_LOCATIONS.map` 时跑，没显式配的 location 自动拿默认：

| danger | enemy 数量 | enemy 类型 | loot 数量 | loot 刷新天数 |
|---|---|---|---|---|
| 0 | 0 | (无) | 0 | 1 |
| 1 | 2-3 | wanderer | 1-4 | 1 |
| 2 | 4-6 | wanderer(70) + chaser(30) | 2-5 | 1 |
| 3 | 6-9 | wanderer(50) + chaser(40) + rioter(10) | 3-6 | 2 |
| 4 | 8-12 | wanderer(35) + chaser(45) + rioter(20) | 4-7 | 3 |
| 5 | 10-15 | wanderer(20) + chaser(40) + rioter(30) + sentinel(10) | 5-8 | 4 |

`refreshDays` 也跟 danger 正相关（danger N → 敌人 N 天，物资 max(1, N-1) 天）。

**特殊 location**（hospital / police / government）的 `enemyConfig` 暂用默认（2026-06-08 暂未单独配，需要时再覆盖）。

### 3. 状态持久化（locationState.ts）

存 GameVar `scavenge_location_states`（JSON 字符串）：

```ts
interface LocationState {
  lastRefreshedDay: number;       // 上次刷新是第几天
  lastInteractedDay?: number;     // 上次派遣是第几天（UI 显示用）
  enemyCount: Record<EnemyType, number>;   // 剩余敌人（按类型）
  lootCount: Record<itemId, number>;        // 剩余物资（按 itemId）
  dirty: boolean;                 // 事件驱动刷新标记
}

type AllLocationStates = Record<locationId, LocationState>;
```

**只存"剩余数量"，不存完整 EnemyInstance**（简化，deduct/refresh 时按类型重算实例）。

### 4. 权重选（locationRefresh.ts）

```ts
function distributeByWeight(types, count):
  // 1. 浮动权重（一次性快照）：weight + random(-jitter, +jitter)
  // 2. 按浮动后的 weight 分配 count 次
```

例：types=[wanderer w=30 j=5, chaser w=50 j=5], count=10
→ 浮动后：[w=28~32, w=45~55]
→ 选 10 次按 weight 概率分配，结果可能：
- 第一次：4 wanderer + 6 chaser
- 第二次：5 wanderer + 5 chaser（jitter 不同）
- 第三次：3 wanderer + 7 chaser

→ 比例每次都微动，但基本守在 30:50。

### 5. 刷新触发（locationRefresh.ts，2026-06-09 改）

`shouldRefreshLocation(location, currentDay)` 返回 true 的条件（任一）：

1. 状态不存在（首次访问）→ 立即刷新
2. `dirty === true`（事件驱动，外部 `markLocationNeedsRefresh(locId)`）
3. **时间过期**：`currentDay - lastInteractedDay >= max(enemyConfig.refreshDays, lootConfig.refreshDays)`
   - 基准日是 **`lastInteractedDay`**（"N 天没人拾荒就刷新"，匹配原始需求）
   - fallback 到 `lastRefreshedDay`（首次派遣前）
   - 敌人/物资**同步刷新**（取两者 refreshDays 中较大）→ 状态一致
4. **新（2026-06-09）**：以上 3 条都不满足 → 仍**可能**不刷新：
   - 如果 state 已**完全清空**（`enemyCount` + `lootCount` 都 ≤ 0）→ 保持空状态，**不刷新**
   - 避免"杀光后第二天又刷新出新敌人"的 bug
   - 想强制刷新 → 外部显式 `markLocationNeedsRefresh(locId)`

`getOrRefreshLocationState(location, currentDay)` 是外部调这个就行——它会判断+刷新+返回。

`getDaysUntilRefresh(location, currentDay)` 同步用相同逻辑计算 UI 倒计时。

**调用时序**：
1. 玩家派遣 → `encounterCheck` 开头调 `touchLocationInteracted(locId, day)` → `lastInteractedDay` 更新
2. 下次 `encounterCheck` 调 `getOrRefreshLocationState` → 检查 `currentDay - lastInteractedDay`
3. 如果达到 `max(refreshDays)`，刷新 enemyCount + lootCount + 更新 `lastRefreshedDay`

### 6. 遭遇集成（encounterCheck.ts）

**资源点**（2026-06-08 改）：
```ts
// 旧：随机从 location.lootTypes 选 1 类 × 1-3 个
// 新：从 locState.lootCount 抽 1 个
const lootEntries = Object.entries(locState.lootCount).filter(([_, n]) => n > 0);
if (lootEntries.length > 0) {
  const [itemId, _] = lootEntries[Math.floor(Math.random() * lootEntries.length)];
  // ... 加到背包
  takeLootByItemId(location.id, [itemId]);  // 减 state
}
```

**丧尸遭遇**（2026-06-08 改）：
```ts
// 旧：spawnEnemiesFromPool(pool) + pickRandomEncounterEnemies 抽 1-3
// 新：从 locState.enemyCount 抽 1-3
const allEnemies = countToEnemies(locState.enemyCount);  // 从 count 重建实例
const encounterEnemies = pickRandomEncounterEnemies(allEnemies);
```

**战斗后 deduct**（2026-06-08 加）：
```ts
// 胜：扣 state 中被击败的敌人 + 抽 1 个物资
deductEnemiesByType(location.id, defeatedCounts);
takeLootByItemId(location.id, [itemId]);

// 败：扣 state 中所有遇到的敌人
deductEnemiesByType(location.id, defeatedCounts);
```

**遭遇概率（2026-06-09 改）**：
```ts
// 旧：60% 不遭遇
if (Math.random() >= 0.4) return no_encounter;

// 新：combat 策略 100% 遭遇，stealth 策略保持 60% 不遭遇
if (mission.strategy !== 'combat' && Math.random() >= 0.4) return no_encounter;
```

| strategy | 遭遇概率 | 备注 |
|---|---|---|
| `combat` | **100%** | 战斗流派必遇敌，跳过 60% no_encounter 判定 |
| `stealth` | 40% | 潜行流派保持原概率（再叠加潜行判定） |

**胜仗额外战利品（2026-06-09 加）**：
```ts
const POST_COMBAT_BONUS_LOOT_RATE = 0.3;  // 30% 概率额外抽 1 个
```

| 战斗结果 | 物资规则 |
|---|---|
| **combat 胜** | 固定 1 个 + **30% 概率再 1 个**（bonus）|
| 资源点（20% 触发）| 1 个（**不叠加** bonus）|
| 60% 不遭遇（仅 stealth）| 0 |
| 潜行成功 | 0 |
| combat 败 | 0 |

设计意图：
- 鼓励玩家**主动战斗**（胜仗有惊喜）
- 失败不奖励（让"逃跑"也有意义）
- bonus 抽完第一个后**再读 state**（已变），不会拿 2 个相同
- state 没东西了（如刚刷的空点）就跳过 bonus，**不报错**

UI 标记：`message: "战胜了 N 个敌人！（扣血 X）（额外战利品！）"`

**调用时序**（2026-06-09 改）：
1. 派遣开始 → `currentTime = startTime`
2. **推进 1 次** = 准备期（插 no_encounter 占位，不跑 encounterCheck）
3. **推进 2~N 次** = 活跃期（跑 encounterCheck，可能遇敌/战斗/资源）
4. **推进 N+1 次** = returnTime 当期（**也跑** encounterCheck，最后一战！）
   - 战斗败 → `missionOver=true` → 立即结算
   - 战斗胜/无遇敌 → `reached=true` → 正常 completeMission

之前第 4 步**不跑** encounterCheck，玩家在最后 1 期"白嫖"安全 → 已修复。

### 7. UI 展示（ScavengeMapDetail.tsx，2026-06-09 改）

地图详情面板（玩家点 location 后看到的弹窗）加 3 个 section：

| Section | 内容 | 示例 |
|---|---|---|
| **当前敌人**（共 N 个） | 按类型 + 数量 | 游荡者 ×3, 追逐者 ×2 |
| **当前物资**（共 N 个） | 按 itemId + 中文名 | 苹果 ×2, 水 ×1 |
| **下次刷新** | 距离刷新的天数（同步刷新，统一一个值） | 还剩 3 天 |

刷新机制提示：
- "暂无敌人" / "暂无物资"（被刷光）
- "首次访问，下次派遣时立即刷新"（state 不存在）
- "🔄 现在刷新（已到时间 / dirty）"

### 8. 事件驱动入口（预留接口，2026-06-08 加）

```ts
import { markLocationNeedsRefresh } from '../ScavengeMap/locationState';

// 任何想强制刷新的事件：
markLocationNeedsRefresh('hospital');
// → 下次 encounterCheck 时会立即 refresh
```

未来可能的触发场景：
- 玩家完成"清理医院"任务 → `markLocationNeedsRefresh('hospital')`
- "生化泄露"事件 → 所有 location 标 dirty
- 季节变化 → 某类 location 重刷

## 数据流图

```
玩家派遣 (startMission)
  ↓
每 period 推进 → encounterCheck
  ↓
1. getOrRefreshLocationState(loc, day)    ← 检查时间/dirty
   ↓ 过期或 dirty
   refreshLocationState(loc, day)          ← 按 enemyConfig/lootConfig 重生成
     ↓ distributeByWeight (count 个, jitter 浮动)
     ↓ setLocationState (写回 GameVar)
   否则
     getLocationState (读已有)
  ↓
2. 60% 不遭遇 / 40% 遭遇
  ↓ 遭遇
3. 80% 丧尸：从 locState.enemyCount 抽 1-3 个
   20% 资源点：从 locState.lootCount 抽 1 个
  ↓
4. 警觉判定 → 战斗
  ↓ 战斗后
5. deductEnemiesByType (扣敌人)
   takeLootByItemId (扣物资)
   setLocationState (写回)
```

## 文件结构

```
ScavengeMap/
├── locations.ts        (ScavengeLocationItem + applyDefaultConfigs)
├── locationState.ts    (新) LocationState + GameVar 读写
├── locationRefresh.ts  (新) 权重选 + 刷新逻辑 + helpers
└── ScavengeMapDetail.tsx (UI 加 3 个 section)
```

## 验证步骤

1. `localStorage.clear()` → 进新游戏
2. 派遣一次到**任何 location**（如公园）→ 回主页
3. 再次点开公园 → 应该看到：
   - **当前敌人**（共 2-3 个）：游荡者 ×3
   - **当前物资**（共 1-4 个）：苹果 ×2, 水 ×1
   - **下次刷新**：还剩 1 天（敌人 1 天 / 物资 1 天）
4. 再次派遣到同一 location → 回主页看：敌人/物资**减少**了
5. 推进时间 N 天 → 再看：状态被刷新了（数量重置）

## 项目约定：GameVar 写入（2026-06-08 记）

**统一使用** `stageStateManager.setStageVarAndCommit`：

```ts
stageStateManager.setStageVarAndCommit({
  key: 'xxx',
  value: JSON.stringify(data),  // 或 string
});
```

- ❌ **不**用 `setGameVar`（**不存在**，会 TypeError）
- ❌ **不**用 `setStageVar`（存在但**不自动** commit，UI 不会重渲染）
- ✅ 读：`stageStateManager.getCalculationStageState().GameVar[key]`

## 与 missions.ts 拆分的关系（2026-06-08）

`missions.ts`（706 行）拆成 3 个文件：
- `missions.ts`（308 行）— 入口（types + 常量 + 时间 + 创建/取消 + GameVar 读写）
- `encounterCheck.ts`（230 行）— 遭遇检查
- `missionComplete.ts`（186 行）— 完成/检查/应用

`RESOURCE_TYPE_TO_ITEM` 从 `missions.ts` 移到 `locationRefresh.ts`（避免循环依赖），`missions.ts` re-export 保持向后兼容。

## 相关文档

- 派遣机制：[04-stealth.md](./04-stealth.md)（警觉判定公式）
- 物品 ID 注册：[10-item-registry.md](./10-item-registry.md)
- 整体项目约束：[00-overview.md](./00-overview.md)
