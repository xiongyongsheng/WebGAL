# WebGAL 源码补丁记录

本文档记录对 WebGAL 核心源码的本地修改。**升级前请先解除补丁，避免冲突。**

---

## 补丁索引

| 补丁 ID | 文件 | 问题 | 状态 |
|--------|------|------|------|
| `setVar-true-false-strict` | `packages/webgal/src/Core/gameScripts/setVar.ts` | setVar 解析 JSON 时将 `true/false` 子串误识别为布尔值 | ✅ 已修复 |
| `item-id-must-be-registered` | `packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts` | 项目约束：所有物品 ID 必须先在 items.ts 注册 | 📋 流程规则 |
| `combat-system-design` | `packages/webgal/src/UI/Scavenge/Scavenge*` | 战斗系统设计（属性公式/敌人分布/遭遇机制/结算） | 📋 流程规则 |

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
|--------|---|---|---|---|---|---|---|
| 游荡者 | 0 | 1~2 | 2~3 | 2~4 | 1~2 | 0 |
| 追逐者 | 0 | 0 | 0~1 | 1~2 | 1~2 | 2~3 |
| 防暴者 | 0 | 0 | 0 | 0 | 1 | 1~2 |

可由 `location.enemyPool` 字段覆盖（fallback 到 ENEMY_POOL_BY_DANGER）。

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

丧尸遭遇时：
- `strategy='stealth'`：先 `rollStealth(agi*2%)`——成功则悄悄溜过，失败进战斗
- `strategy='combat'`：直接进战斗
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

#### I. 武器系统（2026-06-07 改，[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)）

**EquipmentItem 武器专属字段**（[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts)）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `damageRange` | `[min, max]` | 每件武器独立伤害范围，命中时随机 |
| `speedModifier` | `'fast' \| 'normal' \| 'slow'` | fast × 1.3 / normal × 1.0 / slow × 0.7 |
| `requirements` | `EquipmentAttribute` | 任意属性 < 门槛则无法使用（不设 = 无门槛） |

**当前武器**（5 件）：

| ID | 名字 | 稀有 | 伤害 | 速度 | 门槛 | 耐久 |
|----|------|------|------|------|------|------|
| `weapon_stick` | 木棍 | common | [5,6] | slow | str 3 | 80 |
| `weapon_crowbar` | 撬棍 | common | [6,7] | normal | str 4 | 100 |
| `weapon_knife` | 砍刀 | common | [7,8] | fast | str 4 agi 4 | 100 |
| `weapon_axe` | 消防斧 | rare | [10,12] | slow | str 6 | 120 |
| `weapon_dagger` | 战术匕首 | rare | [6,8] | fast | agi 5 | 150 |

**战斗流程**：
1. 角色 ATB 触发行动
2. `ensureUsableWeapon()`：检查当前武器 `durability > 0`
3. 不可用 → 触发 `weapon_break` 日志 → `findUsableWeaponInInventory(char, excludeInstanceId)` 找背包里下一个可用的
4. 找到 → 触发 `weapon_switch` 日志，切换
5. 找不到 → 触发 `fist_fallback` 日志，使用拳头（FIST_DAMAGE=2）
6. 命中判定 → 暴击判定 → 伤害 = `rollWeaponDamage × (1+str/100) × critMult`
7. 应用伤害给目标
8. **每次成功命中消耗 1 点武器耐久**

**武器扫描范围**：仅角色背包（不含仓库），要求满足 requirements + 耐久 > 0。

**耐久 UI**：装备区每件武器显示 `当前耐久/最大耐久` 进度条（绿/黄/红）。战斗日志不单独输出"耐久-1"，合并到 hit 日志的 `flavor`。

**修理机制（暂未实现）**：后续通过工作台消耗材料修复。

#### J. 护甲系统（2026-06-07 改，[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + [character.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts) + [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)）

**6 个护甲 slot**（替代旧的 1 个 `armorId`）：

| 字段 | 部位 | 部位 key |
|------|------|---------|
| `helmetId` | 头盔 | `'helmet'` |
| `chestId` | 躯干/盔甲 | `'chest'` |
| `armsId` | 护臂 | `'arms'` |
| `glovesId` | 手套 | `'gloves'` |
| `legsId` | 护腿 | `'legs'` |
| `bootsId` | 靴子 | `'boots'` |

**EquipmentItem 护甲专属字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `armorSlot` | `ArmorSlot` | 6 个部位之一 |
| `requirements` | `EquipmentAttribute` | 任意属性 < 门槛则无法使用 |

**当前护甲**（12 件，每部位 2 件：common 基础 + rare 进阶）：

| 部位 | common | rare |
|------|--------|------|
| helmet | `armor_helmet` (str 3, 180) | （稀有 = 自身） |
| chest | `armor_jacket` (无门槛, 100) / `armor_vest` (str 4, 150) / `armor_tactical` (str 5, 200) | - |
| arms | `armor_arms_guard` (无门槛, 80) | `armor_arms_tactical` (str 3, 130) |
| gloves | `armor_gloves_work` (无门槛, 70) | `armor_gloves_tactical` (agi 4, 110) |
| legs | `armor_legs_pants` (无门槛, 100) | `armor_legs_tactical` (str 4, 150) |
| boots | `armor_boots_combat` (无门槛, 90) | `armor_boots_tactical` (str 4, 140) |

**战斗流程**（被击中时）：
1. 收集所有"还有耐久"的 slot
2. 没护甲：全伤害走 HP
3. 有护甲：random 选 1 个 slot → 扣 `min(damage, slotDur)` → 超出走 HP
4. 触发 `armor_absorb` 日志（含 slot 名字 + 抵消量）

**耐久 UI**：`armor` 派生属性 = 6 slot 当前耐久**总和**（仅显示用，不参与减伤）。装备区每件护甲显示耐久进度条。

**数据迁移**：`normalizeCharacter` 把旧 `armorId` 装备按 `armorSlot` 字段自动归位（chest/arms/legs/boots/gloves/helmet）。旧 `weaponDurability` / `armorDurability` / `toolDurability` 字段已废弃，耐久全在 `InventoryItem.durability` 上。

#### K. 战斗日志新增类型（2026-06-07 改）

| kind | 触发时机 | 显示 |
|------|---------|------|
| `armor_absorb` | 角色被击中，护甲吸收伤害 | `护甲 [部位] 抵消 N 伤害` |
| `weapon_break` | 武器耐久归 0 | `武器名 已损坏` |
| `weapon_switch` | 武器坏后自动切换 | `自动切换到 新武器名` |
| `fist_fallback` | 找不到可用武器 | `无武器可用，使用拳头` |
| `weapon_durability_loss` | 每次成功命中 | （保留类型，当前未单独输出） |

UI 颜色：护甲吸收=蓝、武器损坏=橙、切换武器=绿、拳头=红。

---

### `item-id-must-be-registered`

**规则**：

任何在**代码、场景脚本（`*.txt` 的 `setVar`）、存档数据、UI** 中使用的物品 ID，都必须**先在** `packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts` 的以下数组之一里注册：

- `CONSUMABLE_ITEMS`（消耗品）
- `MATERIAL_ITEMS`（材料）
- `EQUIPMENT_ITEMS`（装备）
- `QUEST_ITEMS`（任务物品）

**违规后果**：

未注册的 ID 会被 `getItemById(id)` 返回 `undefined`，触发连锁问题：

| 触发点 | 后果 |
|--------|------|
| `canAddToInventory` / `canAddToWarehouse` | 返回"物品不存在"，玩家拖拽/转移被拒 |
| UI 渲染 | `getItemName` / `getItemIcon` 返回空字符串，显示空白卡片 |
| 重量计算 | `item.weight` 为 undefined → 0 → **绕过负重限制** |
| 装备识别 | `isEquipment` 返回 false → 无法装备 |
| 堆叠逻辑 | `item.stackable` / `item.maxStack` 为 undefined → 行为不确定 |

**实战检查清单**（每次写新场景脚本 / 加新物品前必走）：

1. ☐ 打开 `items.ts`，确认要用的 ID 已在 `*_ITEMS` 数组里
2. ☐ 若是新物品，**先在 `items.ts` 加条目**（含 id / name / type / stackable / maxStack / weight / icon），再在脚本里引用
3. ☐ 写完 init 脚本后用以下命令快速核对（无未注册 ID 出现 → 通过）：
   ```bash
   grep -oE '"itemId":"[a-z_0-9]+"' packages/webgal/public/game/scene/scavenge/*.txt \
     | sort -u \
     | sed 's/"itemId":"\(.*\)"/\1/' \
     | while read id; do
       if ! grep -q "id: '$id'" packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts; then
         echo "❌ 未注册: $id"
       fi
     done
   ```

**已注册 ID 速查**（2026-06-05 截至）：

| 类型 | ID |
|------|----|
| 消耗品 | `food_apple`, `drink_water`, `medicine_bandage` |
| 材料 | `material_parts`, `material_tools`, `material_cloth`, `material_metal`, `material_circuit` |
| 装备 | `weapon_crowbar`, `weapon_knife`, `weapon_hammer`, `armor_vest`, `tool_flashlight` |
| 任务 | `quest_key`, `quest_map` |

**反面教材**（2026-06-05 在 `scavenge_main.txt` 踩过）：

```ws
; ❌ 用未注册的 ID：material_scrap / quest_letter
setVar:scavenge_warehouse=[{"itemId":"material_scrap","quantity":20},{"itemId":"quest_letter","quantity":1}];

; ✅ 改成已注册 ID：material_parts / quest_key
setVar:scavenge_warehouse=[{"itemId":"material_parts","quantity":20},{"itemId":"quest_key","quantity":1}];
```

---

## 补丁详情

### `setVar-true-false-strict`

**问题描述**：

`setVar` 解析器使用 `valExp.match(/true|false/)` 正则匹配整个值字符串。如果 JSON 值中包含 `true` 或 `false` 子串（如 `"isExploring":false`），整个值会被替换为 JavaScript 布尔值，导致 JSON 字符串无法正常存储。

**原代码**（[packages/webgal/src/Core/gameScripts/setVar.ts:48-58](packages/webgal/src/Core/gameScripts/setVar.ts#L48-L58)）：

```javascript
} else if (valExp.match(/true|false/)) {
  if (valExp.match(/true/)) {
    setGameVar({ key, value: true });
  }
  if (valExp.match(/false/)) {
    setGameVar({ key, value: false });
  }
}
```

**修复后**：

```javascript
} else if (valExp === 'true' || valExp === 'false') {
  // [PATCH: setVar-true-false-strict] 严格相等匹配，避免 JSON 字符串中的 true/false 子串被误识别为布尔值
  // 详见 PATCHES.md
  if (valExp === 'true') {
    setGameVar({ key, value: true });
  } else {
    setGameVar({ key, value: false });
  }
}
```

**影响**：
- ✅ 修复 JSON 值中包含布尔字面量时无法正确存储的问题
- ✅ 不影响原有的 `setVar:xxx=true;` 和 `setVar:xxx=false;` 用法
- ⚠️ 升级 WebGAL 时需重新应用

**复现案例**：

修复前：
```ws
setVar:scavenge_characters=[{"id":"player_1","isExploring":false,"inventory":[]}];
; GameVar 中存的是 boolean false，整个 JSON 丢失
```

修复后：
```ws
setVar:scavenge_characters=[{"id":"player_1","isExploring":false,"inventory":[]}];
; GameVar 中存的是完整的 JSON 字符串
```

---

## 应用补丁指南

升级 WebGAL 后，按以下步骤检查并重新应用：

1. 打开 `packages/webgal/src/Core/gameScripts/setVar.ts`
2. 找到 `else if (valExp.match(/true|false/))` 行
3. 如果该代码块未包含 `// [PATCH: setVar-true-false-strict]` 标记，则需要重新应用补丁
