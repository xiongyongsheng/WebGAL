> ## ⚠️ 【最重要规则 - 必须严格遵守】
> **当我让你做某件事时，你必须先思考"为什么"，理解背后的目的和意图。如果有任何不明白、不清楚的地方，必须马上问我确认，而不是盲目地完成任务。完成任务不是目的，理解并正确执行才是。**

## 🎯 项目概述

OpenWebGal 是一个完全开源、基于 Web 技术的视觉小说引擎，目标是让创作者能够用 HTML/CSS/JS 的现代技术栈轻松制作跨平台的互动叙事游戏。

- 核心仓库：https://github.com/OpenWebGAL/WebGAL
- 编辑器仓库：https://github.com/OpenWebGAL/WebGAL_Terre
- 官方文档：https://docs.openwebgal.com

## 🧱 技术栈

| 模块 | 技术 |
|------|------|
| WebGAL 版本 | 4.6.0 |
| 引擎内核 | TypeScript + Pixi.js |
| 脚本解析 | `@webgal-go/parser` (自研解析器) |
| 舞台模型 | 状态机驱动，基于“步进(forward)+提交(commit)”模型 |
| 编辑器后端 | Node.js + Nest.js |
| 编辑器前端 | React |
| 构建工具 | Vite / Webpack |

## 📁 关键目录结构


## ⚠️ 关键概念与陷阱

### 1. GameVar vs globalGameVar（存档机制核心）

WebGAL 有两套独立的存档系统，**必须理解清楚才能正确存储数据**：

| 变量类型 | 存储位置 | 跟随场景存档？ | 用途 |
|----------|----------|---------------|------|
| **GameVar** | `stageStateManager.calculationStageState.GameVar` | ✅ 是 | 游戏进度数据（时间、角色属性、物品等） |
| **globalGameVar** | `userData.globalGameVar` | ❌ 否 | 用户设置、UI 状态等独立数据 |

**接口定义**（`userDataInterface.ts`）：
```typescript
interface IUserData {
  globalGameVar: IGameVar;  // 注释明确说明："不跟随存档的全局变量"
  scriptManagedGlobalVar: string[];
}
```

**脚本中的区别**：
```ws
setVar:current_day=1;        ; 存到 GameVar，跟随存档
setVar:show_ui=true -global; ; 存到 globalGameVar，不跟随存档
```

### 2. UI 显示状态应该用 GameVar

**原则**：UI 显控应该和场景绑定，切换场景时自动重置。

- ❌ **错误**：用 `globalGameVar` 存储 UI 显控 → 刷新页面仍然显示
- ✅ **正确**：用 `GameVar` 存储 UI 显控 → 切换场景自动消失

### 3. 读取 stageStateManager 的状态

**必须使用 `useStageState` hook**，否则组件不会响应状态变化：

```typescript
// ❌ 错误：直接调用 getViewStageState() 不会触发 React 重渲染
const stageState = stageStateManager.getViewStageState();

// ✅ 正确：使用 useStageState hook 订阅状态变化
import { useStageState } from '@/hooks/useStageState';
const stageState = useStageState();
```

### 4. 写入 GameVar 的方式

```typescript
// ❌ 错误：直接赋值
stageStateManager.getCalculationStageState().GameVar['key'] = value;

// ✅ 正确：使用 setStageVarAndCommit
stageStateManager.setStageVarAndCommit({ key: 'key', value });
```

### 5. 自动存档时机

- **过天/关键节点**：调用 `dumpToStorageFast()` 保存 `globalGameVar` 到 localStorage
- **场景存档**：由 WebGAL 的 saveGame/loadGame 系统处理，保存 GameVar

### 6. 初始化变量的默认值处理

组件中应使用 `??` 提供默认值：
```typescript
const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
```

这样可以确保：
- **新游戏**：GameVar 为空，使用默认值 1
- **读档**：从存档恢复正确的值

## 🤖 AI 助手行为准则


当你作为 AI 助手参与 OpenWebGal 项目时，请遵循以下规则：

### 1. 回答前先确认上下文
- 如果问题描述不清，先提出澄清性问题，不要直接猜测。
- 对于 Bug 报告，要求提供复现步骤、日志和 WebGAL 版本。

### 2. 代码生成规范
- 使用 TypeScript，避免滥用 `any`。
- 函数、类、接口必须有清晰的 JSDoc 注释。
- 新增指令或修改解析器时，必须同步更新 `@webgal-go/parser` 相关定义。
- 对于影响性能的变更，优先考虑 `requestAnimationFrame`、对象池、避免内存泄漏。

### 3. 调试与问题排查
- 推荐的调试方法：启用 `localStorage.debug = 'webgal:*'` 查看详细日志。
- 快进/跳转类问题，通常与**状态回滚**或**事件队列**有关；检查 `commit` 和 `forward` 逻辑。
- 实时预览卡顿，优先检查 React `useEffect` 依赖项和 Pixi.js 渲染循环。

### 4. 文档更新
- 任何对用户可见的语法或行为变更，必须提出更新 `docs.openwebgal.com` 的 PR。
- 技术文档（如状态机模型）更新需同步提交至 `docs/tech/` 目录。

### 5. Pull Request 审查要点
- 确认未引入循环依赖。
- 检查类型定义是否完整。
- 新功能是否附带单元测试（使用 Jest 或 Vitest）。
- 编辑器变更是是否在 Terre 中实际测试过。

## 🔗 常用资源

- [技术架构介绍](https://docs.openwebgal.com/tech/)
- [开发环境搭建指南](https://docs.openwebgal.com/guide/dev-setup/)
- [API 参考](https://docs.openwebgal.com/api/)
- [RFC 文档模板](https://github.com/OpenWebGAL/WebGAL/tree/main/rfcs)

## 📝 提交信息格式

使用 Conventional Commits：
- `feat(core): 添加 xxx 指令`
- `fix(parser): 修复嵌套注释解析错误`
- `docs(editor): 更新快捷键说明`
- `refactor(render): 优化纹理缓存`

## ❓ 需要额外信息？

如果 AI 助手无法根据现有信息给出可靠答案，应主动询问：
- 相关代码片段或文件路径
- 预期的行为 vs 实际行为
- 是否修改过引擎核心文件
- 使用的 WebGAL 版本号

---

本文件会随着项目演进持续更新。欢迎贡献者提出改进建议。
