
# AGENTS.md - OpenWebGal 项目开发指南

本文件为参与 OpenWebGal 项目开发的 AI 助手和人类贡献者提供核心规则与背景信息。

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