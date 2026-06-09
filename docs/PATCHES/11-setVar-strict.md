# 11. setVar 严格匹配（true/false 误识别修复）

> **已修复补丁**（`setVar-true-false-strict`）
>
> 涉及文件：[setVar.ts](../../packages/webgal/src/Core/gameScripts/setVar.ts)

## 问题描述

`setVar` 解析器使用 `valExp.match(/true|false/)` 正则匹配整个值字符串。如果 JSON 值中包含 `true` 或 `false` 子串（如 `"isExploring":false`），整个值会被替换为 JavaScript 布尔值，导致 JSON 字符串无法正常存储。

## 原代码

[`packages/webgal/src/Core/gameScripts/setVar.ts:48-58`](../../packages/webgal/src/Core/gameScripts/setVar.ts#L48-L58)：

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

## 修复后

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

## 影响

- ✅ 修复 JSON 值中包含布尔字面量时无法正确存储的问题
- ✅ 不影响原有的 `setVar:xxx=true;` 和 `setVar:xxx=false;` 用法
- ⚠️ 升级 WebGAL 时需重新应用

## 复现案例

**修复前**：

```ws
setVar:scavenge_characters=[{"id":"player_1","isExploring":false,"inventory":[]}];
; GameVar 中存的是 boolean false，整个 JSON 丢失
```

**修复后**：

```ws
setVar:scavenge_characters=[{"id":"player_1","isExploring":false,"inventory":[]}];
; GameVar 中存的是完整的 JSON 字符串
```

## 重新应用步骤

详见 [99-patch-guide.md](./99-patch-guide.md)。

---

## 相关文档

- 应用补丁指南：[99-patch-guide.md](./99-patch-guide.md)
- 整体项目约束：[00-overview.md](./00-overview.md)
