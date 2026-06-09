# 02. 护甲系统

> **章节 J**（2026-06-07 改）
>
> 涉及文件：[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + [character.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts) + [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)
>
> 2026-06-08 加：护甲潜行值（stealth）系统详见 [04-stealth.md](./04-stealth.md)

## 6 个护甲 slot（替代旧的 1 个 `armorId`）

| 字段 | 部位 | 部位 key |
|------|------|---------|
| `helmetId` | 头盔 | `'helmet'` |
| `chestId` | 躯干/盔甲 | `'chest'` |
| `armsId` | 护臂 | `'arms'` |
| `glovesId` | 手套 | `'gloves'` |
| `legsId` | 护腿 | `'legs'` |
| `bootsId` | 靴子 | `'boots'` |

## EquipmentItem 护甲专属字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `armorSlot` | `ArmorSlot` | 6 个部位之一 |
| `requirements` | `EquipmentAttribute` | 任意属性 < 门槛则无法使用 |
| `stealth?` | `number` | 2026-06-08 加，潜行加成（详见 [04-stealth.md](./04-stealth.md)），普通护甲为负，潜行套装为正 |

## 当前护甲（18 件：12 普通 + 6 epic 进阶）

### 普通护甲（12 件）

| 部位 | ID | 门槛 | 耐久 | 潜行值 |
|------|----|------|------|--------|
| helmet | `armor_helmet` | str 3 | 180 | -2 |
| chest | `armor_jacket` | 无 | 100 | -3 |
| chest | `armor_vest` | str 4 | 150 | -5 |
| chest | `armor_tactical` | str 5 | 200 | -8 |
| arms | `armor_arms_guard` | 无 | 80 | -2 |
| arms | `armor_arms_tactical` | str 3 | 130 | -4 |
| gloves | `armor_gloves_work` | 无 | 70 | -1 |
| gloves | `armor_gloves_tactical` | agi 4 | 110 | -2 |
| legs | `armor_legs_pants` | 无 | 100 | -3 |
| legs | `armor_legs_tactical` | str 4 | 150 | -5 |
| boots | `armor_boots_combat` | 无 | 90 | -2 |
| boots | `armor_boots_tactical` | str 4 | 140 | -3 |

### Epic 进阶护甲（6 件，2026-06-07 加）

| 部位 | ID | 门槛 | 耐久 | 潜行值 |
|------|----|------|------|--------|
| helmet | `armor_helmet_riot` 防暴头盔 | str 5 | 220 | -4 |
| chest | `armor_chest_heavy` 重型护甲 | str 6 | 260 | **-10** |
| arms | `armor_arms_heavy` 重型护臂 | str 5 | 180 | -6 |
| gloves | `armor_gloves_pro` 专业战术手套 | agi 6 | 160 | -3 |
| legs | `armor_legs_heavy` 重型护腿 | str 6 | 200 | -7 |
| boots | `armor_boots_heavy` 重型战术靴 | str 5 | 200 | -4 |

### 潜行护甲（5 件，2026-06-08 加）

详见 [04-stealth.md](./04-stealth.md)。特点是：maxDurability ≈ 同部位普通 1/3，且**当前耐久线性缩放 stealth**。

## 战斗流程（被击中时）

1. 收集所有"还有耐久"的 slot
2. 没护甲：全伤害走 HP
3. 有护甲：random 选 1 个 slot → 扣 `min(damage, slotDur)` → 超出走 HP
4. 触发 `armor_absorb` 日志（含 slot 名字 + 抵消量）

## 耐久 UI

`armor` 派生属性 = 6 slot 当前耐久**总和**（仅显示用，不参与减伤）。装备区每件护甲显示耐久进度条。

## 数据迁移

`normalizeCharacter` 把旧 `armorId` 装备按 `armorSlot` 字段自动归位（chest/arms/legs/boots/gloves/helmet）。旧 `weaponDurability` / `armorDurability` / `toolDurability` 字段已废弃，耐久全在 `InventoryItem.durability` 上。

---

## 相关文档

- 核心机制 A（角色派生属性公式）：[00-overview.md](./00-overview.md#a-角色派生属性公式线性characterrcombattsts)
- 战斗日志类型（armor_absorb）：[03-combat-log.md](./03-combat-log.md)
- 潜行系统 + 潜行护甲耐久衰减：[04-stealth.md](./04-stealth.md)
- 物品 ID 注册规则：[10-item-registry.md](./10-item-registry.md)
