# 01. 武器系统

> **章节 I**（2026-06-07 改）
>
> 涉及文件：[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)

## EquipmentItem 武器专属字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `damageRange` | `[min, max]` | 每件武器独立伤害范围，命中时随机 |
| `speedModifier` | `'fast' \| 'normal' \| 'slow'` | fast × 1.3 / normal × 1.0 / slow × 0.7 |
| `requirements` | `EquipmentAttribute` | 任意属性 < 门槛则无法使用（不设 = 无门槛） |

## 当前武器（5 件）

| ID | 名字 | 稀有 | 伤害 | 速度 | 门槛 | 耐久 |
|----|------|------|------|------|------|------|
| `weapon_stick` | 木棍 | common | [5,6] | slow | str 3 | 80 |
| `weapon_crowbar` | 撬棍 | common | [6,7] | normal | str 4 | 100 |
| `weapon_knife` | 砍刀 | common | [7,8] | fast | str 4 agi 4 | 100 |
| `weapon_axe` | 消防斧 | rare | [10,12] | slow | str 6 | 120 |
| `weapon_dagger` | 战术匕首 | rare | [6,8] | fast | agi 5 | 150 |

## 战斗流程

1. 角色 ATB 触发行动
2. `ensureUsableWeapon()`：检查当前武器 `durability > 0`
3. 不可用 → 触发 `weapon_break` 日志 → `findUsableWeaponInInventory(char, excludeInstanceId)` 找背包里下一个可用的
4. 找到 → 触发 `weapon_switch` 日志，切换
5. 找不到 → 触发 `fist_fallback` 日志，使用拳头（FIST_DAMAGE=2）
6. 命中判定 → 暴击判定 → 伤害 = `rollWeaponDamage × (1+str/100) × critMult`
7. 应用伤害给目标
8. **每次成功命中消耗 1 点武器耐久**

## 武器扫描范围

仅角色背包（不含仓库），要求满足 requirements + 耐久 > 0。

## 耐久 UI

装备区每件武器显示 `当前耐久/最大耐久` 进度条（绿/黄/红）。战斗日志不单独输出"耐久-1"，合并到 hit 日志的 `flavor`。

## 修理机制（暂未实现）

后续通过工作台消耗材料修复。

---

## 相关文档

- 核心机制 A（角色派生属性公式）：[00-overview.md](./00-overview.md#a-角色派生属性公式线性characterrcombattsts)
- 战斗日志类型（weapon_break / weapon_switch / fist_fallback）：[03-combat-log.md](./03-combat-log.md)
- 物品 ID 注册规则：[10-item-registry.md](./10-item-registry.md)
