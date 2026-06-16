/**
 * 剧情进度系统 - GameVar 读/写 hook
 *
 * 每条 storyline 用一个 GameVar 存 progress：
 * - GameVar:story_main = '{"currentNode":"intro","visited":[],"data":{}}'
 * - GameVar:story_lucy = '{"currentNode":"meet","visited":[],"data":{"lucy_affinity":2}}'
 */

import { useCallback } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { StorylineProgress } from './storyTypes';

const DEFAULT_PROGRESS: StorylineProgress = {
  currentNode: '',
  visited: [],
  data: {},
};

/** 解析 progress（容错）
 * 2026-06-09 改：导出给 StoryEngine 复用（避免重复实现）
 */
export const parseProgress = (raw: any): StorylineProgress | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      currentNode: parsed.currentNode ?? '',
      visited: Array.isArray(parsed.visited) ? parsed.visited : [],
      data: parsed.data && typeof parsed.data === 'object' ? parsed.data : {},
    };
  } catch {
    return null;
  }
};

/** 默认进度（给没有 progress 时初始化）*/
export const DEFAULT_STORYLINE_PROGRESS: StorylineProgress = DEFAULT_PROGRESS;

/** 读某条 storyline 的进度 */
export const useStoryProgress = (lineId: string) => {
  const stageState = useStageState();

  const getProgress = useCallback((): StorylineProgress | null => {
    const raw = stageState.GameVar[`story_${lineId}`];
    if (raw === undefined) return null;  // 还没初始化
    return parseProgress(raw);
  }, [stageState, lineId]);

  const setProgress = useCallback((progress: StorylineProgress) => {
    stageStateManager.setStageVarAndCommit({
      key: `story_${lineId}`,
      value: JSON.stringify(progress),
    });
  }, [lineId]);

  return { getProgress, setProgress };
};

/** 一次性拿所有 storyline 的 progress（给 UI 显示）*/
export const useAllStoryProgress = () => {
  const stageState = useStageState();

  const getAll = useCallback(() => {
    const result: Record<string, StorylineProgress | null> = {};
    Object.keys(stageState.GameVar).forEach(key => {
      if (key.startsWith('story_')) {
        const lineId = key.slice('story_'.length);
        result[lineId] = parseProgress(stageState.GameVar[key]);
      }
    });
    return result;
  }, [stageState]);

  return getAll;
};

/** 共享的 GameVar 键生成器 */
export const storyVarKey = (lineId: string) => `story_${lineId}`;