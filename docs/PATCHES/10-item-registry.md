# 10. 物品 ID 注册规则

> **流程规则**（`item-id-must-be-registered`）
>
> 涉及文件：[items.ts](../../packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts)

## 规则

任何在**代码、场景脚本（`*.txt` 的 `setVar`）、存档数据、UI** 中使用的物品 ID，都必须**先在** `packages/webgal/src/UI/Scavenge/ScavengeItems/items.ts` 的以下数组之一里注册：

- `CONSUMABLE_ITEMS`（消耗品）
- `MATERIAL_ITEMS`（材料）
- `EQUIPMENT_ITEMS`（装备）
- `QUEST_ITEMS`（任务物品）

## 违规后果

未注册的 ID 会被 `getItemById(id)` 返回 `undefined`，触发连锁问题：

| 触发点 | 后果 |
|--------|------|
| `canAddToInventory` / `canAddToWarehouse` | 返回"物品不存在"，玩家拖拽/转移被拒 |
| UI 渲染 | `getItemName` / `getItemIcon` 返回空字符串，显示空白卡片 |
| 重量计算 | `item.weight` 为 undefined → 0 → **绕过负重限制** |
| 装备识别 | `isEquipment` 返回 false → 无法装备 |
| 堆叠逻辑 | `item.stackable` / `item.maxStack` 为 undefined → 行为不确定 |

## 实战检查清单

每次写新场景脚本 / 加新物品前必走：

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

## 已注册 ID 速查（2026-06-08 截至）

| 类型 | ID |
|------|----|
| 消耗品 | `food_apple`, `drink_water`, `medicine_bandage` |
| 材料 | `material_parts`, `material_tools`, `material_cloth`, `material_metal`, `material_circuit` |
| 武器 | `weapon_stick`, `weapon_crowbar`, `weapon_knife`, `weapon_axe`, `weapon_dagger`, `weapon_hammer` |
| 护甲 | 见 [02-armor.md](./02-armor.md) 的 18 + 5 = 23 件列表 |
| 工具 | `tool_flashlight`, `tool_lockpick`, `tool_multitool`, `tool_nightvision` |
| 任务 | `quest_key`, `quest_map` |

**反面教材**（2026-06-05 在 `scavenge_main.txt` 踩过）：

```ws
; ❌ 用未注册的 ID：material_scrap / quest_letter
setVar:scavenge_warehouse=[{"itemId":"material_scrap","quantity":20},{"itemId":"quest_letter","quantity":1}];

; ✅ 改成已注册 ID：material_parts / quest_key
setVar:scavenge_warehouse=[{"itemId":"material_parts","quantity":20},{"itemId":"quest_key","quantity":1}];
```

## 修复数据验证（2026-06-08 加）

如果玩家已有未注册 ID 的存档，[06-data-validation.md](./06-data-validation.md) 的 `validateCharacter` 会：
- 自动 warn（保留 instance 不删）
- 不让游戏崩，但 UI 会显示空卡片
- 需要开发者尽快在 `items.ts` 里补 ID

---

## 相关文档

- 完整物品列表（含装备潜行值）：[02-armor.md](./02-armor.md) + [01-weapons.md](./01-weapons.md) + [04-stealth.md](./04-stealth.md)
- 数据验证（自动 warn 未注册 ID）：[06-data-validation.md](./06-data-validation.md)
- 整体项目约束：[00-overview.md](./00-overview.md)
