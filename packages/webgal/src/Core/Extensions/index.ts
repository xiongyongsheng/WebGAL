/**
 * Extensions 全局入口（2026-06-19 加：Plan 16 重构）
 *
 * 创建**全**局**单**例**：
 * - TimeSystem
 * - GameVarEventBus
 * - SystemRegistry
 * - 默认注册 MissionSystem
 *
 * **业**务系统**自**己**注**册**：
 *   import { systemRegistry } from '@/Core/Extensions';
 *   systemRegistry.register(new MySystem());
 *
 * **时**间**推**进**调**用**：
 *   import { timeSystem } from '@/Core/Extensions';
 *   await timeSystem.advance();
 */
import { TimeSystem } from './time/TimeSystem';
import { GameVarEventBus } from './state/GameVarEventBus';
import { SystemRegistry } from './systems/SystemRegistry';
import { MissionSystem } from './systems/MissionSystem';
import { CharacterSystem } from './systems/CharacterSystem';
import { MerchantSystem } from './systems/MerchantSystem';
import { PersistenceSystem } from './systems/PersistenceSystem';
import { TimeStateSystem } from './systems/TimeStateSystem';
import { StorySystem } from './systems/StorySystem';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { logger } from '@/Core/util/logger';

/** 全**局**时**间系统**单**例 */
export const timeSystem = new TimeSystem();

/** 全**局 GameVar **事**件总线**单**例 */
export const gameVarBus = new GameVarEventBus();

/** 全**局系统**注**册**中**心**单**例 */
export const systemRegistry = new SystemRegistry(timeSystem, gameVarBus);

// =================== 默认注册（顺序**很**重**要**）====================

logger.info('[Extensions] 初始化默认系统...');

// 1. 角色系统（最早：**写**回** applyPeriodEffects 结果）
systemRegistry.register(new CharacterSystem());

// 2. 商人系统（过夜时刷新）
systemRegistry.register(new MerchantSystem());

// 3. 派遣系统（核**心**：处理 mission 循环 + 合并 characters）
systemRegistry.register(new MissionSystem());

// 4. 时**间** state 系统（**写**回** `current_day` / `current_period_index`）
systemRegistry.register(new TimeStateSystem());

// 5. 持久化系统（**过**夜**时** saveGame(0)）
systemRegistry.register(new PersistenceSystem());

// 6. 剧情系统（监听 GameVar 变化，检查 wait_trigger）
systemRegistry.register(new StorySystem());

logger.info(`[Extensions] 已注册 ${systemRegistry.debug().systems.length} 个系统`);

// =================== 调试 ===================

if (typeof window !== 'undefined') {
  (window as any).__webgalExtensions = {
    timeSystem,
    gameVarBus,
    systemRegistry,
    stageStateManager,  // 2026-06-19 加：调试用
  };
  logger.debug('[Extensions] 已挂载到 window.__webgalExtensions 用**于**调**试**');
}
