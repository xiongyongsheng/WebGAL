/**
 * 看板快照 store（2026-06-21 加：综合看板改造）
 *
 * - `scavenge_board_snapshot` GameVar 存最后一次快照
 * - `scavenge_show_board` GameVar 控制看板显示（玩家可主动打开/关闭）
 *
 * 流程：
 * - 时间推进时（CharacterSystem / TimeStateSystem）调 recordBoardSnapshot 写快照
 * - ScavengeMain 监听 scavenge_show_board 显示/隐藏 modal
 */

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { BoardSnapshot } from './board.types';
import { recordBoardSnapshot } from './boardRecorder';

const SNAPSHOT_GAMEVAR = 'scavenge_board_snapshot';
const SHOW_GAMEVAR = 'scavenge_show_board';

/** 读最新快照（可能为 null，首次启动时无快照）*/
export const getBoardSnapshot = (): BoardSnapshot | null => {
  const raw = stageStateManager.getCalculationStageState().GameVar[SNAPSHOT_GAMEVAR];
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as BoardSnapshot;
  } catch {
    return null;
  }
};

/** 写快照（CharacterSystem / TimeStateSystem 推进时调）*/
export const setBoardSnapshot = (snapshot: BoardSnapshot): void => {
  stageStateManager.setStageVarAndCommit({
    key: SNAPSHOT_GAMEVAR,
    value: JSON.stringify(snapshot),
  });
};

/** 显示/隐藏看板（玩家主动控制）*/
export const setBoardVisible = (visible: boolean): void => {
  stageStateManager.setStageVarAndCommit({
    key: SHOW_GAMEVAR,
    value: visible,
  });
};

/** 读看板可见状态 */
export const isBoardVisible = (): boolean => {
  const raw = stageStateManager.getCalculationStageState().GameVar[SHOW_GAMEVAR];
  return raw === true || raw === 'true';
};

/**
 * 记录快照（统一入口）
 * 2026-06-21 加：从旧的「先读 → 改 → 写」模式抽出来
 *
 * 调用时机：
 * - 每次 advance 之后（CharacterSystem / TimeStateSystem）
 * - 不需要做 diff，直接覆盖（只保留最新一次）
 */
export const recordCurrentBoardSnapshot = (): void => {
  const snap = recordBoardSnapshot();
  setBoardSnapshot(snap);
};
