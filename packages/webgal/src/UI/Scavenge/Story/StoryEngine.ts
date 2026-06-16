/**
 * 剧情进度系统 - 状态机执行器
 *
 * 设计原则（2026-06-09）：
 * - 事件驱动（无轮询）
 * - 每个 onXxx 方法处理一个 GameVar 变化
 * - 内部用 checkTriggers 通用方法
 *
 * 调用流程：
 *   玩家操作 → GameVar 变化 → StoryManager useEffect 监听
 *   → engine.onLocationEnter / onTimeAdvance / onItemChange / selectChoice
 *   → 检查匹配 wait_trigger
 *   → 推进 currentNode + 返回 StoryAction
 *   → StoryManager applyAction（调 changeScene / 弹 React 模态框 / setVar）
 */

import {
  Storyline,
  StorylineProgress,
  GameState,
  StoryAction,
  StoryNode,
  TriggerCondition,
  StateUpdate,
  LocationHint,
} from './storyTypes';
import { STORYLINES, getStorylineById } from './storyLines';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { storyVarKey, parseProgress, DEFAULT_STORYLINE_PROGRESS } from './useStoryProgress';

/**
 * 直接从 stageStateManager 读 progress（避免 React 闭包陷阱）
 *
 * 为什么不用 React hooks 注入：
 * - useStageState + useCallback 的引用每次 render 都可能变
 * - engine 通过 useRef 持久化，只能拿到首次 render 的引用
 * - 直接读全局 store，每次调用都拿到最新值
 */
function readProgressFromStore(lineId: string): StorylineProgress | null {
  const raw = stageStateManager.getCalculationStageState().GameVar[storyVarKey(lineId)];
  return parseProgress(raw);
}

/** 直接写入 progress 到 stageStateManager */
function writeProgressToStore(lineId: string, progress: StorylineProgress): void {
  stageStateManager.setStageVarAndCommit({
    key: storyVarKey(lineId),
    value: JSON.stringify(progress),
  });
}

export interface StoryEngineConfig {
  /** 当前游戏状态（每次调用实时取，不缓存）*/
  getGameState: () => GameState;
}

export class StoryEngine {
  private lines: Storyline[];
  private getGameState: StoryEngineConfig['getGameState'];

  constructor(config: StoryEngineConfig, lines: Storyline[] = STORYLINES) {
    this.lines = lines;
    this.getGameState = config.getGameState;
  }

  /** 读 progress（每次调用读最新值，避免闭包陷阱）*/
  private getProgress(lineId: string): StorylineProgress | null {
    return readProgressFromStore(lineId);
  }

  /** 写 progress */
  private setProgress(lineId: string, progress: StorylineProgress): void {
    writeProgressToStore(lineId, progress);
  }

  // ============== 公共 API：事件驱动 ==============

  /** 玩家进入某地点（StoryManager 在 location 变化时调）*/
  onLocationEnter(locationId: string): StoryAction[] {
    return this.checkTriggers(
      (trigger) => trigger.type === 'location' && trigger.locationId === locationId,
    );
  }

  /** 时间推进（StoryManager 在 day/period 变化时调）*/
  onTimeAdvance(day: number, period: number): StoryAction[] {
    return this.checkTriggers(
      (trigger) => {
        if (trigger.type !== 'time') return false;
        const dayOk = day >= trigger.minDay;
        const periodOk = trigger.minPeriod === undefined || period >= trigger.minPeriod;
        return dayOk && periodOk;
      },
    );
  }

  /** 物品变化（StoryManager 在 warehouse 变化时调）*/
  onItemChange(items: Array<{ itemId: string; quantity: number }>): StoryAction[] {
    return this.checkTriggers(
      (trigger) => {
        if (trigger.type !== 'item') return false;
        const item = items.find(i => i.itemId === trigger.itemId);
        return (item?.quantity ?? 0) >= trigger.minCount;
      },
    );
  }

  /** 玩家做选择（场景内 choose label 或 React 弹窗调）*/
  selectChoice(lineId: string, optionIndex: number): StoryAction | null {
    const line = getStorylineById(lineId);
    if (!line) return null;
    const progress = this.getProgress(lineId);
    if (!progress) return null;
    const node = line.nodes[progress.currentNode];
    if (node?.type !== 'choice') return null;
    const option = node.options[optionIndex];
    if (!option) return null;

    // 1. 应用 effects（改 GameVar）
    option.effects?.forEach(eff => this.applyStateUpdate(eff));

    // 2. 推进 currentNode
    progress.currentNode = option.next;
    progress.visited.push(option.next);
    this.setProgress(lineId, progress);

    // 3. 执行下一个节点
    return this.executeNode(line, line.nodes[option.next]);
  }

  // ============== 公共 API：UI 用 ==============

  /** 获取所有 storyline 的当前进度（给 UI 显示）*/
  getAllProgress(): Array<{ line: Storyline; progress: StorylineProgress | null }> {
    return this.lines.map(line => ({
      line,
      progress: this.getProgress(line.id),
    }));
  }

  /** 检查某地点是否有 pending 故事（红点提示）*/
  getLocationHint(locationId: string): LocationHint {
    for (const line of this.lines) {
      const progress = this.getProgress(line.id);
      if (!progress) continue;
      if (progress.visited.includes(progress.currentNode)) continue;  // 已完成
      const node = line.nodes[progress.currentNode];
      if (node?.type === 'wait_trigger') {
        const trigger = node.trigger;
        if (trigger.type === 'location' && trigger.locationId === locationId) {
          // 检查触发器是否满足（玩家已在此地）
          const state = this.getGameState();
          if (state.currentLocation === locationId) {
            return 'story';  // 红点
          }
        }
      }
    }
    return 'normal';
  }

  /** 初始化 storyline（如果还没有 progress）*/
  initializeLine(lineId: string): void {
    if (this.getProgress(lineId)) return;  // 已初始化
    const line = getStorylineById(lineId);
    if (!line) return;
    this.setProgress(lineId, {
      ...DEFAULT_STORYLINE_PROGRESS,
      currentNode: line.startNode,
    });
  }

  /** 初始化所有 storyline */
  initializeAll(): void {
    this.lines.forEach(line => this.initializeLine(line.id));
  }

  // ============== 私有方法 ==============

  /** 通用触发器检查 */
  private checkTriggers(
    matcher: (trigger: TriggerCondition) => boolean,
  ): StoryAction[] {
    const actions: StoryAction[] = [];
    for (const line of this.lines) {
      const progress = this.getProgress(line.id);
      if (!progress) continue;
      if (progress.visited.includes(progress.currentNode)) continue;  // 已完成

      const node = line.nodes[progress.currentNode];
      if (node?.type !== 'wait_trigger') continue;

      if (matcher(node.trigger)) {
        // 推进到 next 节点
        progress.currentNode = node.next;
        progress.visited.push(node.next);
        this.setProgress(line.id, progress);

        // 执行 next 节点
        const action = this.executeNode(line, line.nodes[node.next]);
        if (action) actions.push(action);
      }
    }
    return actions;
  }

  /** 执行节点，返回 StoryAction */
  private executeNode(line: Storyline, node: StoryNode | undefined): StoryAction | null {
    if (!node || node.type === 'end') return null;

    switch (node.type) {
      case 'scene':
        return { type: 'play_scene', sceneUrl: node.sceneUrl, lineId: line.id };

      case 'choice':
        return {
          type: 'show_choice',
          lineId: line.id,
          nodeId: 'choice',  // choice 没有 next，需要 selectChoice 后再推进
          prompt: node.prompt,
          options: node.options,
        };

      case 'wait_trigger':
        // 不会到这里（已在外层处理）
        return null;

      case 'set_state':
        // 应用 updates，再推进
        node.updates.forEach(u => this.applyStateUpdate(u));
        const newProgress = this.getProgress(line.id);
        if (newProgress) {
          newProgress.currentNode = node.next;
          newProgress.visited.push(node.next);
          this.setProgress(line.id, newProgress);
        }
        return this.executeNode(line, line.nodes[node.next]);
    }
  }

  /** 应用 StateUpdate 到 GameVar（计算最终值，再用 .then 写入）*/
  private applyStateUpdate(update: StateUpdate): void {
    const state = this.getGameState();
    // 在 .then 外计算 finalValue（保留 discriminated union narrowing）
    let finalValue: unknown;
    if (update.kind === 'add' || update.kind === 'sub') {
      // 类型缩窄：这里 update 一定有 value: number
      const current = (state.vars[update.key] as number | undefined) ?? 0;
      const delta = update.value;
      finalValue = update.kind === 'add' ? current + delta : current - delta;
    } else if (update.kind === 'toggle') {
      const current = state.vars[update.key] ?? false;
      finalValue = !current;
    } else {
      // 覆盖（kind 缺失或 'set'）
      finalValue = update.value;
    }
    import('@/Core/Modules/stage/stageStateManager').then(({ stageStateManager }) => {
      // setStageVarAndCommit 要求 string | number | boolean；我们的 finalValue 实际是这三种之一
      stageStateManager.setStageVarAndCommit({
        key: update.key,
        value: finalValue as string | number | boolean,
      });
    });
  }
}