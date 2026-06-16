/**
 * 剧情进度系统 - React 集成
 *
 * 监听 GameVar 变化 → 调用 engine.onXxx → 应用返回的 StoryAction
 *
 * 设计：
 * - 不轮询（避免资源浪费）
 * - 每个 useEffect 监听一个特定的 GameVar（location / day / period / warehouse）
 * - 用 ref 记录前一个值，避免重复触发
 * - 2026-06-09 改：engine 不再依赖 React hooks（避免闭包陷阱）
 *   → StoryEngine 直接读 stageStateManager
 *   → 此处只负责"传 GameState 快照"
 */

import { useEffect, useRef } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { StoryEngine } from './StoryEngine';
import { StoryAction, GameState } from './storyTypes';

/** 工具：直接从 stageStateManager 读取最新 GameVar 构建 GameState
 *  2026-06-09 改：不接受参数，每次调用实时读最新值
 *  → 避免 React 闭包陷阱（engine 用 useRef 持久化，闭包是首次 render 的）
 */
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

/** 应用 StoryAction */
const applyAction = (action: StoryAction) => {
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

export const StoryManager = () => {
  const stageState = useStageState();

  // 创建 engine（用 useRef 持久化，避免每次 render 重建）
  // 2026-06-09 改：不再注入 getProgress/setProgress，engine 直接读 stageStateManager
  // getGameState 也是无参数版本（每次调用直接读 stageStateManager），避免闭包陷阱
  const engineRef = useRef<StoryEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new StoryEngine({
      getGameState: buildGameState,
    });
  }

  // 初始化所有 storyline（懒加载）
  // 2026-06-09 改：监听 stageState 变化（resetStage 会清空 GameVar）
  //   → 每次 stageState 变化时检查所有 storyline 是否已初始化
  //   → 已初始化的跳过（initializeLine 内部有幂等检查）
  //   → 第一次有效初始化时机：场景脚本首次设置任意 GameVar 后
  //   → 也可以是首次进入游戏时（resetStage 之后）
  useEffect(() => {
    engineRef.current?.initializeAll();
  }, [stageState]);

  // ============== 事件监听 ==============
  // 2026-06-09 改：去掉 prevXxx refs 的"防重复"逻辑
  // 原因：resetStage 会重置 GameVar，但 useRef 是 React 组件级 ref，不会重置
  //   → 跨 resetStage 后 prevXxx 还保留旧值，导致相同 GameVar 变化不再触发
  // 解决：每次都调 engine.onXxx（engine 内部有幂等检查：已 visited 的节点会跳过）
  //   → 重复触发不会推进状态机，所以是安全的

  // 1. location 变化
  useEffect(() => {
    const cur = stageState.GameVar['current_location_id'] as string | undefined;
    if (cur) {
      const actions = engineRef.current?.onLocationEnter(cur) ?? [];
      actions.forEach(applyAction);
    }
  }, [stageState.GameVar['current_location_id']]);

  // 2. day/period 变化
  useEffect(() => {
    const day = stageState.GameVar['current_day'] as number | undefined;
    const period = stageState.GameVar['current_period_index'] as number | undefined;
    if (day !== undefined) {
      const actions = engineRef.current?.onTimeAdvance(day, period ?? 0) ?? [];
      actions.forEach(applyAction);
    }
  }, [stageState.GameVar['current_day'], stageState.GameVar['current_period_index']]);

  // 3. warehouse 物品变化
  useEffect(() => {
    const state = buildGameState();
    const actions = engineRef.current?.onItemChange(state.items) ?? [];
    actions.forEach(applyAction);
  }, [stageState.GameVar['scavenge_warehouse']]);

  // 4. 选择回调（场景内 choose label 触发 pending_story_choice）
  useEffect(() => {
    const pending = stageState.GameVar['pending_story_choice'] as string | undefined;
    if (!pending) return;

    try {
      const parsed = JSON.parse(pending);
      const lineId = parsed.lineId as string;
      const optionIndex = parsed.optionIndex as number;
      if (typeof optionIndex !== 'number') return;

      const action = engineRef.current?.selectChoice(lineId, optionIndex) ?? null;
      // 清掉标志（防止下次重复触发）
      import('@/Core/Modules/stage/stageStateManager').then(({ stageStateManager }) => {
        stageStateManager.setStageVarAndCommit({ key: 'pending_story_choice', value: '' });
      });
      if (action) applyAction(action);
    } catch {
      // ignore
    }
  }, [stageState.GameVar['pending_story_choice']]);

  return null;
};
