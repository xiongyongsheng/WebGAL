/**
 * 剧情提示工具（无状态）
 *
 * 从 stageState + storylines 推断当前是否有 pending story 触发某地点
 * → 用于 UI 显示红点（ScavengeMap）和决定跳转优先级（ScavengeMain）
 *
 * 2026-06-09 抽出来共享：之前 ScavengeMap 和 ScavengeMain 各有一份逻辑
 */

import { STORYLINES } from './storyLines';
import { LocationHint } from './storyTypes';

/**
 * 检查某地点是否有 pending 故事（红点提示）
 *
 * 规则：遍历所有 storyline，看当前节点是不是 wait_trigger + location + 此地点
 */
export function getLocationHintFromState(
  stageVar: Record<string, any>,
  locationId: string,
): LocationHint {
  for (const line of STORYLINES) {
    const raw = stageVar[`story_${line.id}`];
    if (raw === undefined) continue;
    let progress: any;
    try { progress = JSON.parse(raw as string); } catch { continue; }
    if (!progress || progress.visited?.includes(progress.currentNode)) continue;
    const node = line.nodes[progress.currentNode];
    if (node?.type === 'wait_trigger' &&
        node.trigger.type === 'location' &&
        node.trigger.locationId === locationId) {
      return 'story';
    }
  }
  return 'normal';
}
