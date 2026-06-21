/**
 * 剧情进度系统 - React 集成
 *
 * 2026-06-19 改：迁**移**到 StorySystem（Core/Extensions/systems/StorySystem.ts）
 *   - **之**前**：4 **个** useEffect **监**听** GameVar **变**化
 *   - **现**在**：StorySystem **用** `GameVarEventBus.subscribe` **显**式**订阅
 *   - **本**组**件**作**为**空**实**现**保**留**（**为**了** ScavengeMain **引**用** **不**报**错**）
 *   - **所**有**剧情**监**听**逻辑**在** StorySystem **内**部**
 *
 * 设计：
 * - 不轮询（避免资源浪费）
 * - **不**再**监**听** GameVar（**由** StorySystem **管**）
 * - **本**组**件**只**作**为**占**位**（**可**于**未**来**删**除** ScavengeMain **的** StoryManager 引用**）
 */
export const StoryManager = () => {
  return null;
};
