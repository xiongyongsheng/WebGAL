# 99. 应用补丁指南

> 升级 WebGAL 后，按本指南检查并重新应用。

## 升级前先解除补丁

1. 用 git 检查所有打过补丁的文件：
   ```bash
   git status
   git diff --stat
   ```
2. **记录**打过补丁的文件路径
3. `git checkout` 那些文件（解除补丁）
4. 升级 WebGAL
5. 重新应用补丁（按本指南操作）

## 重新应用检查清单

升级完成后，对每个打过补丁的文件搜索特定标记：

| 补丁 | 文件 | 标记 |
|------|------|------|
| `setVar-true-false-strict` | [setVar.ts](../../packages/webgal/src/Core/gameScripts/setVar.ts) | 搜 `// [PATCH: setVar-true-false-strict]` |
| `data-validation-system` | [character.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts) | 搜 `[Scavenge] normalizeCharacter 自动修复` |
| 武器系统 I | [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) | 搜 `damageRange` |
| 护甲系统 J | [items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts) | 搜 `armorSlot` |
| 战斗日志 K | [combat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts) | 搜 `armor_absorb` |
| 潜行 / 警觉系统 L | [enemies.ts](../../packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts) | 搜 `detection` |
| 潜行系统 L | [characterCombat.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts) | 搜 `Σ(equipped.stealth) * (1 + char.agi / 10)` |
| 潜行系统 L | [missions.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts) | 搜 `Luce choice 非对称公式` |
| 地区敌人配置 M | [locations.ts](../../packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts) | 搜 `enemyPool`（hospital/police/government 三个地点） |
| 数据验证 N | [characterValidate.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts) | 搜 `validateCharacters` |
| 露西初始数据 | [scavenge_main.txt](../../packages/webgal/public/game/scene/scavenge/scavenge_main.txt) | 搜 `"id":"lucy"` |

## 重新应用 setVar-true-false-strict 补丁

1. 打开 [packages/webgal/src/Core/gameScripts/setVar.ts](../../packages/webgal/src/Core/gameScripts/setVar.ts)
2. 找到 `else if (valExp.match(/true|false/))` 行（应被升级重置为原版）
3. 替换为（详见 [11-setVar-strict.md](./11-setVar-strict.md)）：
   ```javascript
   } else if (valExp === 'true' || valExp === 'false') {
     // [PATCH: setVar-true-false-strict] 严格相等匹配，避免 JSON 字符串中的 true/false 子串被误识别为布尔值
     if (valExp === 'true') {
       setGameVar({ key, value: true });
     } else {
       setGameVar({ key, value: false });
     }
   }
   ```

## 验证补丁应用

- 启动游戏，尝试 setVar 一个含 `false` 的 JSON
- 刷新场景应该能正常显示（修复前会显示空内容）
- 详见 [11-setVar-strict.md](./11-setVar-strict.md) 的"复现案例"

## 完整文件清单（待备份/恢复）

| 文件 | 说明 |
|------|------|
| `packages/webgal/src/Core/gameScripts/setVar.ts` | setVar 严格匹配 |
| `packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts` | 武器 + 护甲 + 潜行装备 |
| `packages/webgal/src/UI/Scavenge/ScavengeEnemies/enemies.ts` | 敌人模板（含 sentinel） |
| `packages/webgal/src/UI/Scavenge/ScavengeMap/locations.ts` | 地区配置（医院/警察局/政府有 sentinel） |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts` | 派生属性公式（含 stealth） |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterCombat.ts` | 战斗派生属性 |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts` | 数据验证（新文件） |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.tsx` | 角色面板（仓库清理 warn） |
| `packages/webgal/src/UI/Scavenge/ScavengeCombat/combat.ts` | 战斗系统 |
| `packages/webgal/src/UI/Scavenge/ScavengeMissions/missions.ts` | 派遣/遭遇/警觉判定 |
| `packages/webgal/src/UI/Scavenge/ScavengeItems/inventory.ts` | 物品 helper（含 getItemCurrentStealth） |
| `packages/webgal/public/game/scene/scavenge/scavenge_main.txt` | 初始存档（含露西） |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/ScavengeCharacterStatus/ScavengeCharacterStatus.tsx` | 角色面板（总潜行值显示） |
| `packages/webgal/src/UI/Scavenge/ScavengeCharacter/ScavengeCharacterEquip/ScavengeCharacterEquip.tsx` | 装备区（潜行标签） |
| `packages/webgal/src/UI/Scavenge/ScavengeItems/ItemTooltip.tsx` | tooltip（潜行显示） |

## 项目约定：日志（2026-06-08 记）

**统一使用** [packages/webgal/src/Core/util/logger.ts](../../packages/webgal/src/Core/util/logger.ts)：

```ts
import Cloudlog from 'cloudlogjs';

export const logger = new Cloudlog();
if (process.env.NODE_ENV === 'production') {
  logger.setLevel('INFO');
}
```

**API**：`logger.warn(...)` / `logger.info(...)` / `logger.error(...)` / `logger.debug(...)`

**约定**（2026-06-08 确认）：
- ❌ **不**用 `console.warn` / `console.log`
- ❌ **不**写 `// eslint-disable-next-line no-console`
- ✅ **必须** `import { logger } from '@/Core/util/logger'`

**原因**：
- 全局可控制日志级别（生产环境 INFO，开发环境全开）
- 统一格式（带时间戳、来源、tag）
- 集中收集（远程日志/未来可扩展）

**已迁移的代码**（2026-06-08）：
- `character.ts` 验证器 warn
- `ScavengeCharacterPanel.tsx` 仓库清理 warn

**未迁移的代码**（不是我们新加的，留给原作者决定）：
- `inventory.ts` 内部 `filterUnknownItems` warn
- `ScavengeTimeControl.tsx` 时间推进 log
- `character.ts` 内原有的未知 ID 清理 warn

---

## 相关文档

- 整体项目约束：[00-overview.md](./00-overview.md)
- 各子系统专题：[01-weapons.md](./01-weapons.md) ... [06-data-validation.md](./06-data-validation.md)
