/**
 * 剧情进度系统 - 故事线定义
 *
 * 设计原则：
 * - 硬编码节点图（不改数据，改代码）
 * - 每条故事线独立（main / lucy / 等等）
 * - 节点最小化（一个 scene 一个节点，避免大块）
 *
 * ⚠️ 重要约定（2026-06-21 加）：
 * - wait_trigger 的 `locationId` 必须与 `ScavengeMap/locations.ts` 里的 `id` **严格一致**
 * - 反例：`'slums'` ❌（老 ID，已废弃 → 玩家永远看不到红点）
 * - 正确：`'safehouse'` ✅
 * - 加新剧情节点前**先**查 locations.ts 确认 ID
 *
 * 经验教训：2026-06-21 因 locationId 写错导致露西剧情不触发（红点消失）。
 *   用户多次反馈后定位到此处，已修复为 'safehouse'。
 */

import { Storyline } from './storyTypes';

// ====================================================================
// 主线（demo）
// ====================================================================

export const MAIN_STORY: Storyline = {
  id: 'main',
  name: '主线',
  description: '主角在这个世界苏醒后的故事',
  startNode: 'intro',
  nodes: {
    // 1. 玩家到 safehouse（安全屋）→ 触发 intro 场景
    // 2026-06-21 改：locationId 从 'slums' 改**为** 'safehouse'（**配**合** ScavengeMap.locations 的 ID）
    'intro': {
      type: 'wait_trigger',
      trigger: { type: 'location', locationId: 'safehouse' },
      next: 'intro_scene',
    },
    'intro_scene': {
      type: 'scene',
      sceneUrl: './game/scene/story/main/intro.txt',
      next: 'wait_first_scavenge',
    },
    // 2. 玩家到 park → 触发 first_scavenge 场景
    'wait_first_scavenge': {
      type: 'wait_trigger',
      trigger: { type: 'location', locationId: 'park' },
      next: 'first_scavenge',
    },
    'first_scavenge': {
      type: 'scene',
      sceneUrl: './game/scene/story/main/first_scavenge.txt',
      next: 'meet_lucy_intro',
    },
    // 3. 露西出现在公园 → 触发相遇剧情
    'meet_lucy_intro': {
      type: 'wait_trigger',
      trigger: { type: 'character_at_location', characterId: 'lucy', locationId: 'park' },
      next: 'lucy_meet_scene',
    },
    'lucy_meet_scene': {
      type: 'scene',
      sceneUrl: './game/scene/story/main/lucy_meet.txt',
      next: 'end',
    },
    'end': { type: 'end' },
  },
};

// ====================================================================
// 露西个人线（占位 demo）
// ====================================================================

export const LUCY_STORY: Storyline = {
  id: 'lucy',
  name: '露西',
  description: '与露西建立信任的故事',
  startNode: 'meet',
  // entryTrigger: 必须在公园遇到露西后才进入
  entryTrigger: { type: 'character_at_location', characterId: 'lucy', locationId: 'park' },
  nodes: {
    'meet': {
      type: 'wait_trigger',
      trigger: { type: 'data', key: 'lucy_affinity', op: '>', value: 0 },
      next: 'first_talk',
    },
    'first_talk': {
      type: 'choice',
      prompt: '露西看起来很警惕...',
      options: [
        {
          text: '友善地打招呼',
          hint: '也许她需要朋友',
          next: 'after_friendly',
          effects: [
            { kind: 'add', key: 'lucy_affinity', value: 2 },
            { key: 'lucy_met_friendly', value: true },
          ],
        },
        {
          text: '保持距离观察',
          hint: '谨慎一点',
          next: 'after_cold',
          effects: [
            { kind: 'sub', key: 'lucy_affinity', value: 1 },
          ],
        },
      ],
    },
    'after_friendly': {
      type: 'scene',
      sceneUrl: './game/scene/story/lucy/friendly.txt',
      next: 'end',
    },
    'after_cold': {
      type: 'scene',
      sceneUrl: './game/scene/story/lucy/cold.txt',
      next: 'end',
    },
    'end': { type: 'end' },
  },
};

// ====================================================================
// 所有故事线（注册表）
// ====================================================================

export const STORYLINES: Storyline[] = [MAIN_STORY, LUCY_STORY];

export const getStorylineById = (id: string): Storyline | undefined =>
  STORYLINES.find(l => l.id === id);