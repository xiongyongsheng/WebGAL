# 03. 战斗日志

> **章节 K**（2026-06-07 改）
>
> 涉及文件：[combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts)

## 日志类型

| kind | 触发时机 | 显示 |
|------|---------|------|
| `armor_absorb` | 角色被击中，护甲吸收伤害 | `护甲 [部位] 抵消 N 伤害` |
| `weapon_break` | 武器耐久归 0 | `武器名 已损坏` |
| `weapon_switch` | 武器坏后自动切换 | `自动切换到 新武器名` |
| `fist_fallback` | 找不到可用武器 | `无武器可用，使用拳头` |
| `weapon_durability_loss` | 每次成功命中 | （保留类型，当前未单独输出） |

## UI 颜色

| 事件 | 颜色 |
|------|------|
| 护甲吸收 | 蓝 |
| 武器损坏 | 橙 |
| 切换武器 | 绿 |
| 拳头 | 红 |

---

## 相关文档

- 武器系统（weapon_break / weapon_switch / fist_fallback 触发源）：[01-weapons.md](./01-weapons.md)
- 护甲系统（armor_absorb 触发源）：[02-armor.md](./02-armor.md)
- 核心机制 E（战斗 ATB 1vN 整体流程）：[00-overview.md](./00-overview.md#e-战斗系统atb-1vncombatts)
