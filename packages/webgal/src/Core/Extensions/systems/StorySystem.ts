/**
 * 剧情系统（2026-06-19 加：Plan 16 重构）
 *
 * 目的：接管 StoryManager 的 4 个 useEffect GameVar 监听
 *
 * 之前（StoryManager.tsx）：
 *   - useEffect 监听 `current_location_id` → engine.onLocationEnter
 *   - useEffect 监听 `current_day` / `current_period_index` → engine.onTimeAdvance
 *   - useEffect 监听 `scavenge_warehouse` → engine.onItemChange
 *   - useEffect 监听 `pending_story_choice` → engine.selectChoice
 *
 * 现在（StorySystem）：
 *   - 用 `GameVarEventBus.subscribe` 显**式**订阅 4 个 key
 *   - 不用 useEffect、不依赖 React 重**渲**染**
 *   - **独**立**文**件**、**独**立**测**试**
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';
import { ISystem } from './ISystem';
import { GameVarEventBus } from '../state/GameVarEventBus';
import { TimeSystem } from '../time/TimeSystem';
import { StoryEngine } from '../../../UI/Scavenge/Story/StoryEngine';
import { GameState, StoryAction } from '../../../UI/Scavenge/Story/storyTypes';

/** 直接从 stageStateManager 读取最新 GameVar 构建 GameState */
const buildGameState = (): GameState => {
  const vars = stageStateManager.getCalculationStageState().GameVar as Record<string, any>;
  let items: Array<{ itemId: string; quantity: number }> = [];
  try {
    const raw = vars['scavenge_warehouse'];
    if (typeof raw === 'string') items = JSON.parse(raw);
    else if (Array.isArray(raw)) items = raw;
  } catch { /* ignore */ }

  return {
    currentLocation: vars['current_location_id'] as string | undefined,
    day: (vars['current_day'] as number) ?? 1,
    period: (vars['current_period_index'] as number) ?? 0,
    items,
    characters: vars,
    vars,
  };
};

/** 应用 StoryAction（异步动**作**）*/
const applyAction = (action: StoryAction): void => {
  if (action.type === 'play_scene') {
    import('@/Core/controller/scene/changeScene').then(({ changeScene }) => {
      changeScene(action.sceneUrl, '剧情');
    });
  } else if (action.type === 'show_choice') {
    import('@/Core/Modules/stage/stageStateManager').then(({ stageStateManager }) => {
      stageStateManager.setStageVarAndCommit({
        key: 'pending_story_choice',
        value: JSON.stringify({ lineId: action.lineId, options: action.options, prompt: action.prompt }),
      });
    });
  }
  // noop: no-op
};

export class StorySystem implements ISystem {
  readonly id = 'story';

  /** StoryEngine 实例（**与** StoryManager 的 engineRef **一**致**）*/
  private engine: StoryEngine | null = null;

  // =================== ISystem 接口 ===================

  init(): void {
    this.engine = new StoryEngine({
      getGameState: buildGameState,
    });
    this.engine.initializeAll();
    logger.info('[StorySystem] init - engine created, initializeAll done');
  }

  registerTimeHooks(time: TimeSystem): void {
    // StorySystem **不**用**时**间**钩**子**（**只**用** GameVar 订阅**）**
  }

  subscribeGameVars(bus: GameVarEventBus): void {
    logger.info('[StorySystem] subscribeGameVars start');

    // 0. 通**配**符**订**阅**（用**于** resetStage **后**重**新**初**始**化**）
    //   resetStage **会**清**空**所**有** GameVar（**包**括** `story_xxx`）**。
    //   initializeAll **有**幂**等**检查**（**只**在**没**有** progress **时**才**创**建**）**，
    //   **所**以** resetStage **之**外**的**调**用**是** no-op（**快**）**。
    bus.subscribe('*', (_newValue, _oldValue, _key) => {
      this.engine?.initializeAll();
    });

    // 1. location 变化 → onLocationEnter
    bus.subscribe('current_location_id', (newValue) => {
      logger.debug(`[StorySystem] bus fire: current_location_id = ${newValue}`);
      if (typeof newValue === 'string' && newValue) {
        const actions = this.engine?.onLocationEnter(newValue) ?? [];
        logger.debug(`[StorySystem] onLocationEnter(${newValue}) → ${actions.length} actions`);
        actions.forEach(applyAction);
      }
    });

    // 2. day/period 变化 → onTimeAdvance
    bus.subscribe('current_period_index', () => {
      const state = buildGameState();
      if (state.day !== undefined) {
        const actions = this.engine?.onTimeAdvance(state.day, state.period ?? 0) ?? [];
        actions.forEach(applyAction);
      }
    });

    // 3. warehouse 物品变化 → onItemChange
    bus.subscribe('scavenge_warehouse', (newValue) => {
      let items: Array<{ itemId: string; quantity: number }> = [];
      try {
        if (typeof newValue === 'string') items = JSON.parse(newValue);
        else if (Array.isArray(newValue)) items = newValue as any;
      } catch { /* ignore */ }
      const actions = this.engine?.onItemChange(items) ?? [];
      actions.forEach(applyAction);
    });

    // 4. pending_story_choice（玩家**选**择**）→ selectChoice + 清**掉**标志
    bus.subscribe('pending_story_choice', (newValue) => {
      if (typeof newValue !== 'string' || !newValue) return;  // 空字**符**串**跳**过**（**避**免**循**环**）

      try {
        const parsed = JSON.parse(newValue);
        const lineId = parsed.lineId as string;
        const optionIndex = parsed.optionIndex as number;
        if (typeof optionIndex !== 'number') return;

        const action = this.engine?.selectChoice(lineId, optionIndex) ?? null;
        // **清**掉**标志（**防**止**重**复**触**发**）
        stageStateManager.setStageVarAndCommit({ key: 'pending_story_choice', value: '' });
        if (action) applyAction(action);
      } catch {
        // ignore
      }
    });

    logger.info('[StorySystem] subscribeGameVars done - 4 keys subscribed');
  }
}
