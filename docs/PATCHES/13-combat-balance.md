# 13. 战斗系统平衡（2026-06-09）

> **核心 bug 修复 + 数值重平衡**
>
> 涉及文件：
> - [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) — armor 加 `defense` 字段
> - [characterCombat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts) — armorTotal 公式 + 玩家 attackSpeed 降速
> - [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts) — calcEnemyDamage 改百分比
> - [enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts) — 敌人数值 + 抽敌人数

## 目的

修 3 个核心问题（综合角色/物品/敌人/战斗 4 个系统调）：

1. **每次遭遇敌人数太少**（大型商超每次就 1 个丧尸）→ 抽 2-5 个
2. **敌人数值太低**（每次击中 1 滴血）→ 调高 HP / damage / armor / evasion
3. **玩家数值太高**（1 级露西攻击速度 60+）→ attackSpeed 降 33%

## 🐛 根因 #1：护甲"减伤"是 6 slot 耐久总和（610）

**核心 bug**：

```ts
// characterCombat.ts（旧）
let armorTotal = 0;
for (const piece of Object.values(armors)) {
  if (piece) armorTotal += getItemDurability(piece.instance);
}

// combat.ts（旧）
const calcEnemyDamage = (attackDamage, critMult, armor) => {
  return Math.max(1, Math.floor(attackDamage * critMult - armor));
};
```

玩家初始装备 6 件 armor 总耐久 ≈ 610（90+180+80+70+100+90）。`wanderer 8 攻击` → `8 - 610 = -602` → `max(1, -602) = 1` → **永远只打 1 滴血**。

## ✅ 修复

### 1. Armor 加 `defense` 字段（满耐久时的减伤值）

[items.ts:130-138](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts#L130-L138)：

```ts
/**
 * 减伤值（2026-06-09 加）：
 * - 满耐久时的"减伤点数"
 * - 战斗公式：damage_taken = enemy_dmg * (1 - armor/(armor+50))，cap 80%
 * - 实际生效 = defense * (currentDurability / maxDurability)（按耐久比例缩放）
 */
defense?: number;
```

| 装备 | 部位 | defense |
|---|---|---|
| armor_vest (rare) | chest | 6 |
| armor_helmet (rare) | helmet | 5 |
| armor_arms_guard (common) | arms | 3 |
| armor_arms_tactical (rare) | arms | 5 |
| armor_gloves_work (common) | gloves | 2 |
| armor_gloves_tactical (rare) | gloves | 3 |
| armor_legs_pants (common) | legs | 4 |
| armor_legs_tactical (rare) | legs | 6 |
| armor_boots_combat (common) | boots | 3 |
| armor_tactical (epic) | chest | 9 |

玩家初始套 6 件满耐久 → 总 defense = 6+5+3+2+4+3 = **23**

### 2. armorTotal 公式改

[characterCombat.ts:278-289](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts#L278-L289)：

```diff
- let armorTotal = 0;
- for (const piece of Object.values(armors)) {
-   if (piece) armorTotal += getItemDurability(piece.instance);
- }
+ let armorTotal = 0;
+ for (const piece of Object.values(armors)) {
+   if (!piece) continue;
+   const maxDur = getItemMaxDurability(piece.instance);
+   const curDur = getItemDurability(piece.instance);
+   if (maxDur <= 0) continue;
+   const def = piece.def.defense ?? 0;
+   armorTotal += def * (curDur / maxDur);
+ }
```

满耐久 → defense 不缩放。半耐久 → defense × 0.5。0 耐久 → 0。

### 3. calcEnemyDamage 改百分比

[combat.ts:100-125](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts#L100-L125)：

```diff
- // 旧：attackDamage * critMult - flatArmor → 永远 1 滴血
- return Math.max(1, Math.floor(attackDamage * critMult - armor));
+ // 新：armor 是"减伤点数"，百分比公式 cap 80%
+ const reduction = Math.min(0.8, armor / (armor + 50));
+ return Math.max(1, Math.floor(attackDamage * critMult * (1 - reduction)));
```

**预期效果**：

| 玩家 armor | reduction | wanderer 12 dmg | chaser 18 dmg | rioter 26 dmg |
|---|---|---|---|---|
| 0（裸体）| 0% | 12 | 18 | 26 |
| 11（4 件满耐久 common）| 18% | 10 | 15 | 21 |
| 23（6 件满耐久 mixed）| 32% | 8 | 12 | 18 |
| 35（6 件满耐久 rare）| 41% | 7 | 11 | 15 |
| 50（顶级套）| 50% | 6 | 9 | 13 |
| 100（满甲堆）| 67% | 4 | 6 | 9 |

## 🐛 根因 #2：护甲全吸后还推冗余 hit 日志

**症状**（用户报告 + 截图）：护甲吸收伤害后，下一条"命中"日志显示 `-8 100/100`，但实际 HP 没变 → 误导玩家以为受到伤害。

**根因**（[combat.ts:475-490 旧](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts#L475-L490)）：

```ts
// 旧：applyDamageToCharacter 不返回 excess，调用方无脑推 hit 日志
applyDamageToCharacter(target, damage, log, tick);  // 推 armor_absorb 日志

// 然后又推 hit 日志
log.push({
  kind: crit ? 'crit' : 'hit',
  damage,  // 原始 8，不是 absorbed 后剩余
  defenderHp: target.currentHp,  // 已吸完 100/100
});
```

玩家看到 `armor_absorb 抵消 8 伤害` + `hit -8 100/100`，以为打了 8 实际血又显示 100/100。

## ✅ 修复

[combat.ts:463-499](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts#L463-L499)：

1. `applyDamageToCharacter` 改返回 `{ excess, absorbed }`
2. 护甲**全吸**（`excess === 0`）→ **跳过 hit 日志**（armor_absorb 已说明）
3. 护甲**部分吸**（`excess > 0`）→ hit 日志的 `damage` 改为 `excess`（真实 HP 损失）

```diff
- const applyDamageToCharacter = (...): void => { ... };
+ const applyDamageToCharacter = (...): { excess: number; absorbed: number } => { ... };

  // 8. 应用伤害
- applyDamageToCharacter(target, damage, log, tick);
+ const { excess, absorbed } = applyDamageToCharacter(target, damage, log, tick);
+ if (excess === 0) {
+   // 完全吸收 → 跳过 hit 日志
+   if (charCombatant.currentHp <= 0) break;
+   if (aliveEnemies().length === 0) break;
+   continue;
+ }
+ // 9. 攻击日志（damage 改用 excess）
- damage,
+ damage: excess,
```

**修后行为**：
- 护甲全吸 8 → 只有 `armor_absorb 护甲[手套] 抵消 8 伤害`
- 护甲全吸 8 + 暴击 → `armor_absorb` + 没了
- 护甲吸 5 + 剩余 3 → `armor_absorb 抵消 5` + `hit -3 92/100`（damage 字段是真实 HP 损失）
- 玩家 HP 0 → 死亡日志照常推

## 📈 数值调整总览

### 敌人模板

| 敌人 | 字段 | 旧 | 新 | +/Δ |
|---|---|---|---|---|
| wanderer | hp | 30 | **55** | +83% |
| | attackDamage | 8 | **12** | +50% |
| | armor | 2 | **3** | +50% |
| | evasion | 0.10 | **0.15** | +50% |
| chaser | hp | 50 | **85** | +70% |
| | attackDamage | 14 | **18** | +29% |
| | armor | 4 | **5** | +25% |
| | evasion | 0.15 | **0.22** | +47% |
| rioter | hp | 80 | **140** | +75% |
| | attackDamage | 18 | **26** | +44% |
| | armor | 10 | **14** | +40% |
| | evasion | 0.05 | **0.10** | +100% |
| sentinel | hp | 30 | **65** | +117% |
| | attackDamage | 6 | **14** | +133% |
| | armor | 0 | **2** | +∞ |
| | evasion | 0.20 | **0.25** | +25% |

### 抽敌人数

[enemies.ts:251-257](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts#L251-L257)：

```diff
- const count = randInt(1, Math.min(3, all.length));  // 旧 1-3
+ const count = randInt(2, Math.min(5, all.length));  // 新 2-5
```

### 玩家 attackSpeed

[characterCombat.ts:316-320](file:///Users/xiongyongsheng/WORKSPACE/OpenWebGal/WebGAL/packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts#L316-L320)：

```diff
- attackSpeed: char.agi * 6 * speedMult + weaponAgiBonus,  // 旧
+ // 2026-06-09 改：agi*6 → agi*4（降 33%），让敌人有机会先手
+ attackSpeed: char.agi * 4 * speedMult + weaponAgiBonus,  // 新
```

## 🎯 期望战斗节奏

**大型商超（danger 3, 6-9 个 wanderer）**：

- 1 次遭遇抽 2-5 个 → 4 wanderer（平均）
- 4 × 55 HP = 220 总 HP
- 玩家 7 伤/击 × 0.65 命中 × 100 tick/5（agi 4*4=16 attackSpeed 慢于 wanderer 22）→ 4-5 回合打完
- 但 wanderer 每回合打玩家 12 dmg × 0.5（3 减伤/50+3 = 6% reduction for fresh armor）= 11 dmg × 2 (avg hits 2 of 4 enemies) = ~22 dmg/round
- 100 HP / 22 dmg ≈ 5 回合倒

**1v 5 极端情况**（countRange=5）：
- 5 × 55 = 275 HP
- 玩家用 7-8 回合打完
- 敌人 5 轮攻击 → 5 × 22 = 110 dmg（必死 1v 5）

**警局（danger 5, 10-15 混合，5 个 chaser + rioter）**：
- 5 个混合，平均 2 chaser + 2 rioter + 1 sentinel
- 总 HP ~510
- 玩家 12+ 回合打完
- 5 轮混合攻击 ~80-120 dmg → 高概率任务失败

## 🧪 验证

```js
localStorage.clear();
location.reload();
```

派遣 1 次主角（combat 策略，100% 遭遇）到任何 location：

| 期望 | 实测 |
|---|---|
| 抽 2-5 个敌人 | ✓ |
| 玩家每回合被打 5-15 dmg（不再 1 滴血）| 看 combat log |
| 战斗 5-10 回合结束 | 看 tick 数 |
| 1v 3+ wanderer 不轻松（不 4 击杀）| 验证 |

派遣露西（stealth 策略）：
- 60% 概率无遭遇
- 40% 概率遇敌，敌人 2-5 个
- 露西潜行公式不变

## 相关文档

- 物品系统：[10-item-registry.md](./10-item-registry.md)
- 敌人警觉系统：[04-stealth.md](./04-stealth.md)
- 派遣机制：[12-location-refresh.md](./12-location-refresh.md)
