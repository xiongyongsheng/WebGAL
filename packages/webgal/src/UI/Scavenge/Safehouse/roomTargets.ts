/**
 * 安全屋场景 targets 解析（2026-06-09 加）
 *
 * 设计：
 * 每个安全屋场景文件顶部 setVar:scavenge_room_targets=JSON([...])
 * 描述当前场景的"可点击目标"（右下角卡片菜单）
 *
 * 数据结构（每个 target）：
 * - kind: 'character'  → 渲染角色卡片（CHARACTER_TEMPLATES[id]）
 *   - id: 角色 ID
 *   - 渲染：角色头像 + 名字 + 好感度等级
 *   - 点击：弹出 CharacterInteractionMenu 或 MerchantTradeMenu
 *
 * - kind: 'room'  → 渲染"房间入口"卡片（不可交互 NPC）
 *   - id: 房间 ID（用于动画/状态追踪）
 *   - label: 显示文字，如"去厨房"
 *   - scene: 目标场景路径（changeScene 用）
 *   - icon: 可选，iconify 图标名
 *
 * - kind: 'exit'  → 渲染"离开"卡片
 *   - label: 如"离开安全屋"
 *   - scene: 目标场景路径
 *
 * 使用场景（场景文件示例）：
 * ```
 * ; living_room.txt 顶部
 * setVar:scavenge_room_targets=[
 *   {kind:'character', id:'lucy'},
 *   {kind:'room', id:'kitchen', label:'去厨房', scene:'safehouse/kitchen.txt', icon:'...'},
 *   {kind:'room', id:'upstairs', label:'上楼', scene:'safehouse/corridor.txt', icon:'...'},
 *   {kind:'exit', label:'离开安全屋', scene:'scavenge/scavenge_main.txt'}
 * ];
 * ```
 */

import type { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { getRoomFromSceneUrl } from './roomFromScene';

/** room target（房间入口）*/
export interface RoomTarget {
  kind: 'room' | 'exit';
  id?: string;
  label: string;
  scene: string;
  icon?: string;
}

/** character target（角色）*/
export interface CharacterTarget {
  kind: 'character';
  id: string;
}

/** 联合类型 */
export type SceneTarget = RoomTarget | CharacterTarget;

/** 从 GameVar 解析 targets（容错）
 *
 * 输入可能是：
 * - 字符串（setVar 原始值，没 JSON.parse）
 * - 数组（WebGAL 内部已经 JSON.parse 过的 viewState）
 * - undefined / null
 */
export function parseSceneTargets(raw: unknown): SceneTarget[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) {
    return raw.filter((t): t is SceneTarget =>
      t && typeof t === 'object' && typeof (t as any).kind === 'string',
    );
  }
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. 尝试标准 JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is SceneTarget =>
        t && typeof t === 'object' && typeof t.kind === 'string',
      );
    }
  } catch { /* not JSON, try other formats */ }

  return [];
}

/** 读当前场景的 targets（从 GameVar 读）*/
export function getCurrentSceneTargets(): SceneTarget[] {
  const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_room_targets'];
  return parseSceneTargets(raw);
}

/** 检查某角色在当前场景的 targets 中（用于渲染"角色卡片"）*/
export function isCharacterInTargets(charId: string, targets: SceneTarget[]): boolean {
  return targets.some((t) => t.kind === 'character' && t.id === charId);
}

/** 找 target 中的角色 ID 列表（去重）*/
export function getTargetCharacterIds(targets: SceneTarget[]): string[] {
  const ids: string[] = [];
  for (const t of targets) {
    if (t.kind === 'character' && CHARACTER_TEMPLATES[t.id] && !ids.includes(t.id)) {
      ids.push(t.id);
    }
  }
  return ids;
}

/** 找 target 中的房间/出口列表（去重）*/
export function getTargetRooms(targets: SceneTarget[]): RoomTarget[] {
  const list: RoomTarget[] = [];
  for (const t of targets) {
    if (t.kind === 'room' || t.kind === 'exit') {
      list.push(t);
    }
  }
  return list;
}

/**
 * 兼容：自动从 homeRoom 推导（向后兼容）
 *
 * 旧行为：右下角显示 homeRoom 匹配当前房间的角色
 * 如果新场景没设 _room_targets，回退到 homeRoom 逻辑
 */
export function getFallbackTargetsByHomeRoom(
  characters: ScavengeCharacter[],
  currentRoom: string,
): CharacterTarget[] {
  return characters
    .filter((c) => {
      if (c.id === 'player_1') return false;
      const template = CHARACTER_TEMPLATES[c.id];
      if (!template) return false;
      return template.homeRoom === currentRoom;
    })
    .map((c) => ({ kind: 'character' as const, id: c.id }));
}