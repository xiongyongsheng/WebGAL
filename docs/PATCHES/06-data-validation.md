# 06. 数据验证系统

> **章节 N**（2026-06-08 加）
>
> 涉及文件：[characterValidate.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts) + [character.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts)

## 目的

读取存档时自动检测 + 修复常见数据问题，不再需要手动 `localStorage.clear()`。

## 核心设计（2026-06-08）

- 新建 [characterValidate.ts](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/characterValidate.ts) 独立文件
- 两个 pipeline 数组（**可扩展**）：`itemValidators[]` / `charValidators[]`
- 加新验证器只要 push 函数到数组即可，不需改其他代码

## 当前内置验证项

| 类别 | 触发条件 | 修复行为 |
|------|---------|---------|
| `unknown_item` | itemId 不在 items.ts | warn（保留 instance，不删） |
| `durability_clamp` | `dur > max` | clamp 到 max |
| `durability_clamp` | `dur < 0` | clamp 到 0 |
| `durability_missing` | 装备无 durability 字段 | 设为满耐久 max |
| `quantity_fix` | `quantity < 1` | 设为 1 |
| `quantity_clamp` | `quantity > maxStack` | clamp 到 maxStack |
| `invalid_type` | 根数据不是数组 | 重置为 `[]` + warn |

## 调用方式

[character.ts normalizeCharacter](../../packages/webgal/src/UI/Scavenge/ScavengeCharacter/character.ts) 末尾自动跑：

```ts
const { char: validated, warnings } = validateCharacter({...});
if (warnings.length > 0) {
  console.warn(`[Scavenge] normalizeCharacter 自动修复 ${warnings.length} 项数据问题：\n` + formatWarnings(warnings));
}
return validated;
```

## 控制台输出示例（玩家有 90/50 软质内甲的脏存档）

```
[Scavenge] normalizeCharacter 自动修复 4 项数据问题：
  - [durability_clamp] lucy.inventory[4]: 耐久 90 > max 50，已 clamp 到 50
  - [durability_clamp] lucy.inventory[5]: 耐久 60 > max 23，已 clamp 到 23
  - [durability_clamp] lucy.inventory[6]: 耐久 80 > max 30，已 clamp 到 30
  - [durability_clamp] lucy.equipped.chest: 耐久 90 > max 50，已 clamp 到 50
```

## 以后扩展

直接 push 新验证器到数组：

```ts
// 加一个 strategy 枚举验证
const validateStrategyEnum: CharacterValidator = (char) => {
  if (char.strategy !== 'stealth' && char.strategy !== 'combat') {
    return { char: { ...char, strategy: 'combat' }, warnings: [{ category: 'invalid_enum', ... }] };
  }
  return { char, warnings: [] };
};
charValidators.push(validateStrategyEnum);
```

---

## 相关文档

- 物品 ID 注册规则：[10-item-registry.md](./10-item-registry.md)
- 整体项目约束：[00-overview.md](./00-overview.md)
