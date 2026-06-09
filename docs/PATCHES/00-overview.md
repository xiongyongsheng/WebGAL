# 0. 总览与项目约束

> **任何战斗相关修改前必查本文件**。这是战斗系统的整体设计骨架，其他子文档（01-06）都在本骨架上扩展。

## 补丁索引（顶层）

| 补丁 ID | 文件 | 性质 |
|--------|------|------|
| [`combat-system-design`](#a-角色派生属性公式) | `packages/webgal/src/UI/Scavenge/Scavenge*` | 📋 流程规则（核心机制） |
| [`item-id-must-be-registered`](./10-item-registry.md) | [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) | 📋 流程规则（物品注册） |
| [`setVar-true-false-strict`](./11-setVar-strict.md) | [setVar.ts](../../packages/webgal/src/Core/gameScripts/setVar.ts) | ✅ 已修复（核心） |
| [`data-validation-system`](./06-data-validation.md) | [characterValidate.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts) | ✅ 已修复（数据） |

## 项目约束（流程规则，**任何修改前必查**）

### `combat-system-design`

战斗系统整体设计决策（2026-06-05 立项，2026-06-07 武器/护甲耐久系统重构，**任何战斗相关修改前必查**）：

#### A. 角色派生属性公式（线性，[characterCombat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts)）

**角色攻击伤害**（2026-06-07 改）：
- 公式 = `rollWeaponDamage() × (1 + str/100) × critMult`，floor
- `rollWeaponDamage()` = 武器 `damageRange` 内随机（每件武器独立范围）
- str 5 时 = ×1.05，str 10 时 = ×1.10
- 无武器时使用拳头 `FIST_DAMAGE = 2`

**ATB 攻击速度累加值**（2026-06-07 改）：
- 公式 = `agi × 6 × speedModMult + weapon.attributes.agi × 0.5`
- 武器 `speedModifier`：`fast × 1.3` / `normal × 1.0` / `slow × 0.7`
- 基础 5 agi normal = 30，约 3.3 tick 触发一次

**护甲"总耐久"**（2026-06-07 改）：
- **不再用作减伤**，改为"6 个护甲 slot 当前耐久之和"（仅 UI 显示）
- 战斗时：被击中 → 随机选一个"还有耐久"的 slot → 扣耐久，超出归 HP

| 属性 | 公式 | 基础 5 时 | 装备加成 |
|------|------|---------|----------|
| `attackDamage` | `weapon.damage × (1 + str/100)` | 6 (撬棍 7×1.05) | 由武器决定 |
| `attackSpeed` | `agi × 6 × speedModMult` | 30 (normal) | 武器 agi × 0.5 |
| `armor` | `sum(6 slot 当前耐久)` | 取决于装备 | 取决于装备 |
| `stealth` | `agi × 2%` | 10% | 无 |
| `accuracy` | `50% + agi × 3%` | 65% | 无 |
| `evasion` | `agi × 2%` | 10% | 无 |
| `critRate` | `5% + agi × 1%` | 10% | 无 |

派生属性**不存 GameVar**——每次战斗实时计算。

`attackSpeed` 含义：ATB 累加器每 tick += attackSpeed，累加到 ≥ 100 触发攻击，重置 -= 100 保留余数。

#### B. 敌人系统（[enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts)）

3 种敌人，**固定属性不随角色/装备变**：

| 类型 | HP | 攻击 | 速度 (ATB) | 护甲 | 命中 | 闪避 | 暴击 | 暴击倍率 | 特点 |
|------|----|----|----|----|----|----|----|--------|------|
| 游荡者 (wanderer) | 30 | 8 | **20** | 2 | 0.6 | 0.1 | 0.05 | 1.5 | 普通丧尸，慢 |
| 追逐者 (chaser) | 50 | 14 | **30** | 4 | 0.7 | 0.15 | 0.10 | 1.8 | 速度/暴击高 |
| 防暴者 (rioter) | 80 | 18 | **15** | 10 | 0.65 | 0.05 | 0.08 | 1.6 | 护甲高，最慢 |

按 `dangerLevel`（0~5）分布（[enemies.ts:75-104](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts#L75-L104)）：

| danger | 0 | 1 | 2 | 3 | 4 | 5 |
|--------|---|---|---|---|---|---|
| 游荡者 | 0 | 1~2 | 2~3 | 2~4 | 1~2 | 0 |
| 追逐者 | 0 | 0 | 0~1 | 1~2 | 1~2 | 2~3 |
| 防暴者 | 0 | 0 | 0 | 0 | 1 | 1~2 |

可由 `location.enemyPool` 字段覆盖（fallback 到 ENEMY_POOL_BY_DANGER）。**潜行/警觉系统**（2026-06-08 加）请见 [04-stealth.md](./04-stealth.md)。

#### C. 派遣时间模型（"准备期 + 活跃期"，[missions.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts)）

玩家在 `startTime` 选派遣 → `returnTime = startTime + 1 + duration`（**+1 是准备期**）。

时间线：
- **第 1 次推进**（startTime → startTime+1）：**准备期**——m.encounters 插一个 `no_encounter` 占位（标记"准备完成"），不跑 encounterCheck
- **中间每次推进**：**活跃期**——跑 encounterCheck（判定 + 可能战斗）
- **returnTime 当期**：直接 completeMission，不跑 encounterCheck
- **战斗败**：立即标记 failed + 弹结果窗（不等 returnTime）

判断逻辑（[ScavengeTimeControl.tsx:108-117](../../packages/webgal/src/UI/Scavenge/ScavengeTimeControl/ScavengeTimeControl.tsx#L108-L117)）：
```typescript
const hasAnyEncounter = m.encounters.length > 0;
const isPreparing = !hasAnyEncounter;                              // 第一次 = 准备期
const isActivePeriod = totalCurrent < totalReturn;                  // 中间 = 活跃期
```

#### D. 遭遇判定（[missions.ts:encounterCheck](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts)）

每次活跃期推进时按概率分支：

| 概率 | 类型 | 后续 |
|------|------|------|
| 60% | **未遭遇** | 啥也不做 |
| 20% | **资源点** | 按 location.lootTypes 随机 1 类 × 1~3 个物品 → 入背包 |
| 20% | **丧尸** | 见下 |

丧尸遭遇时（2026-06-08 改）：
- 每个敌人**独立警觉判定**（[04-stealth.md](./04-stealth.md)）：
  - 单敌人察觉概率 = `enemy.detection × (1 - character.stealth)`
  - 全部敌人没发现 → 悄悄溜过（不战斗）
  - 至少一个发现 → 进战斗，发现的敌人 ATB 起始 50（首轮先手）
- 战斗走 `runCombat`（ATB 1vN 系统，详见 E）
- 战斗胜：随机给 1~2 物品（来源 location.lootTypes）
- 战斗败：扣 HP，mission 立即 failed

#### E. 战斗系统：ATB 1vN（[combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)）

2026-06-05 改：~~双方各攻击一次的速度轮换~~ → **ATB 累加器 1vN**。

**核心机制**：
- 战斗开始：所有参战者 `currentTick = 0`
- 每 tick：所有存活者 `currentTick += attackSpeed`
- 谁的 `currentTick >= 100` 谁触发（多人都触发时取 currentTick 最大者）
- 触发：扣减 `currentTick -= 100` 保留余数 → 选目标 → 攻击
- 战斗结束：角色 HP=0 或所有敌人 HP=0（防御性 MAX_TICKS=500 兜底）

**目标选择**：
- 角色触发：选当前 HP 最少的存活敌人
- 敌人触发：永远攻击角色

**攻击判定（每次触发 1 次）**：
1. 命中：`Math.random() < attacker.accuracy - defender.evasion`
2. 暴击（仅命中时）：`Math.random() < attacker.critRate`
3. 伤害：`max(1, floor(attackDamage * (暴击? critMultiplier: 1) - defender.armor))`
4. 扣 defender.currentHp

**示例时间线**（角色 agi=5 speed=30 vs 1 个游荡者 speed=20）：

| tick | 角色 tick | 敌人 tick | 触发 |
|------|----------|----------|------|
| 1 | 30 | 20 | - |
| 2 | 60 | 40 | - |
| 3 | 90 | 60 | - |
| 4 | 120→**20** | 80 | **角色**（120-100=20） |
| 5 | 50 | 100 | **敌人**（100-100=0） |
| 6 | 80 | 20 | - |
| 7 | 110→**10** | 40 | **角色** |
| 8 | 40 | 60 | - |
| 9 | 70 | 80 | - |
| 10 | 100 | 100 | **平手**：取第一个（角色先） |

角色速度更高 → 先手 + 多触发。如果敌人 speed 20 而角色 speed 40，**角色永远先手且更频繁**。

#### F. 派遣完成结算（[missions.ts:completeMission](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts)）

`outcome.itemsGained` = **encounter 期间累计的物品**（资源点 + 战斗胜），不再额外随机生成。
`outcome.expGained = 50 + dangerLevel * 10`
`outcome.hpLost = dangerLevel * 2`

#### G. 接口预留

- 多人组队：`Mission` 加 `partyMemberIds?: string[]` 字段（暂未启用）
- 随机事件：`Mission.events?: MissionEvent[]` 字段（暂未启用）
- 事件接口：`gainExpFromCombat` / `gainExpFromEvent` 已在 characterExperience.ts 写好，等战斗/事件模块接入
- 主动撤退：`cancelMissionInList(missions, missionId)` API 已实现，UI 召回按钮待接

#### H. 角色 strategy 字段

`ScavengeCharacter.strategy: 'stealth' | 'combat'`，默认 `'combat'`。
迁移：`normalizeCharacter` 兜底（任何不在两个值之一的都回退到 'combat'）。
UI：角色面板 `ScavengeCharacterAttributes` 底部有"隐蔽 / 战斗"切换按钮。

---

## 🔗 相关专题文档

| 专题 | 文档 |
|------|------|
| 武器系统 | [01-weapons.md](./01-weapons.md) |
| 护甲系统 | [02-armor.md](./02-armor.md) |
| 战斗日志 | [03-combat-log.md](./03-combat-log.md) |
| 潜行 / 警觉系统 | [04-stealth.md](./04-stealth.md) |
| 地区敌人配置 | [05-region-config.md](./05-region-config.md) |
| 数据验证 | [06-data-validation.md](./06-data-validation.md) |
| 物品 ID 注册 | [10-item-registry.md](./10-item-registry.md) |
| setVar 修复 | [11-setVar-strict.md](./11-setVar-strict.md) |
| 应用补丁指南 | [99-patch-guide.md](./99-patch-guide.md) |
