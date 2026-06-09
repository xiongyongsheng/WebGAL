# WebGAL 源码补丁记录

本文档目录（2026-06-08 重构）记录对 WebGAL 核心源码的本地修改。**升级前请先解除补丁，避免冲突。**

> 老文件 [`../PATCHES.md`](../PATCHES.md) 已废弃，保留仅作为向后兼容跳转。请使用本目录。

---

## 📚 快速跳转

### 0. 总览与核心机制
- **[00-overview.md](./00-overview.md)** — 项目约束 + 战斗系统核心设计（A-H）

### 1. 子系统专题（按修改时间倒序）

| # | 专题 | 章节 | 文件 | 状态 |
|---|------|------|------|------|
| 01 | [武器系统](./01-weapons.md) | I | [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) + [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts) | ✅ 2026-06-07 |
| 02 | [护甲系统](./02-armor.md) | J | items.ts + [character.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts) + combat.ts | ✅ 2026-06-07 |
| 03 | [战斗日志](./03-combat-log.md) | K | combat.ts | ✅ 2026-06-07 |
| 04 | [潜行 / 警觉系统](./04-stealth.md) | L | [enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts) + [characterCombat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts) + [missions.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts) | ✅ 2026-06-08 |
| 05 | [地区敌人配置](./05-region-config.md) | M | [locations.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts) | ✅ 2026-06-08 |
| 06 | [数据验证系统](./06-data-validation.md) | N | [characterValidate.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts) | ✅ 2026-06-08 |

### 2. 流程规则 / 项目约束（**任何修改前必查**）

| # | 规则 | 文件 | 性质 |
|---|------|------|------|
| 10 | [item-id-must-be-registered](./10-item-registry.md) | [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) | 📋 流程规则 |
| 11 | [setVar-true-false-strict](./11-setVar-strict.md) | [setVar.ts](../../packages/webgal/src/Core/gameScripts/setVar.ts) | ✅ 已修复 |

### 3. 工具

- **[99-patch-guide.md](./99-patch-guide.md)** — 应用补丁指南（升级 WebGAL 后如何重新打补丁）

---

## 🔍 按修改日期查找

| 日期 | 改了什么 |
|------|---------|
| 2026-06-05 | 战斗系统设计立项，敌人/派遣/遭遇/结算（A-F） |
| 2026-06-07 | 武器伤害范围化、护甲分 6 部位 + 耐久、战斗日志、角色面板 |
| 2026-06-08 | 潜行/警觉系统、地区敌人配置、数据验证、护甲潜行衰减 |

---

## 📁 目录结构

```
docs/PATCHES/
├── README.md             ← 你在这里
├── 00-overview.md        ← 项目约束 + 核心机制 A-H
├── 01-weapons.md         ← I 武器系统
├── 02-armor.md           ← J 护甲系统
├── 03-combat-log.md      ← K 战斗日志
├── 04-stealth.md         ← L 潜行/警觉系统
├── 05-region-config.md   ← M 地区敌人配置
├── 06-data-validation.md ← N 数据验证
├── 10-item-registry.md   ← item-id-must-be-registered
├── 11-setVar-strict.md   ← setVar-true-false-strict
└── 99-patch-guide.md     ← 应用补丁指南
```

**编号规则**：
- `00-09`：核心机制 + 子系统专题
- `10-19`：流程规则 / 项目约束
- `99`：工具 / 元文档

---

## ⚠️ 旧文件 `docs/PATCHES.md`

文件已废弃，**内容已迁移到本目录的各文件**。保留旧文件作为向后兼容入口，但任何新修改请直接在子文件中更新。

如果你是 WebGAL 升级后重新应用补丁的，按 [`99-patch-guide.md`](./99-patch-guide.md) 操作。
