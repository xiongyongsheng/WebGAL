# WebGAL 源码补丁记录

本文档记录对 WebGAL 核心源码的本地修改。**升级前请先解除补丁，避免冲突。**

---

## 补丁索引

| 补丁 ID | 文件 | 问题 | 状态 |
|--------|------|------|------|
| `setVar-true-false-strict` | `packages/webgal/src/Core/gameScripts/setVar.ts` | setVar 解析 JSON 时将 `true/false` 子串误识别为布尔值 | ✅ 已修复 |
| `item-id-must-be-registered` | `packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts` | 项目约束：所有物品 ID 必须先在 items.ts 注册 | 📋 流程规则 |

## 项目约束（流程规则，**任何修改前必查**）

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
