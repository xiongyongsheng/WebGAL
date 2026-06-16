/**
 * 角色花名册管理器
 *
 * 监听 `scavenge_character_ids` 变化 → 从 templates 拉基础数据 → merge runtime 状态 → 写回 `scavenge_characters`
 *
 * 工作流程：
 * 1. 启动时读 `scavenge_character_ids`（已获得的角色 ID 列表）
 * 2. 遍历 IDs，从 `CHARACTER_TEMPLATES` 取模板构造角色
 * 3. 合并现有 `scavenge_characters` 中的 runtime 状态（hp/exp/level/isExploring 等）
 * 4. 写回 `scavenge_characters`（其他 UI 读这里用）
 *
 * 触发时机：
 * - `scavenge_character_ids` GameVar 变化时（剧情触发获得新角色）
 * - 第一次 mount 时（处理 resetStage 之后 IDs 变化）
 *
 * 2026-06-09 加
 */

import { useEffect } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { CHARACTER_TEMPLATES, buildCharacterFromTemplate, listAllCharacterIds } from './characterRoster';
import { ScavengeCharacter } from './character';

/** 解析 IDs 列表（容错）
 * 2026-06-09 改：支持非标准 JSON 格式
 *
 * WebGAL 的 setVar 不会自动 JSON.parse（如果 = 后面是 `[player_1]` 这种）
 * 只会把它存为字符串 "[player_1]"，需要手动解析
 *
 * 支持的格式：
 * - 合法 JSON：`["player_1","lucy"]`
 * - 简易 JSON：`[player_1,lucy]`（没有引号，常见于 setVar 脚本）
 * - 裸字符串：`player_1`（单 ID 兜底）
 */
function parseCharacterIds(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 1. 尝试标准 JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string');
    }
    if (typeof parsed === 'string') return [parsed];
  } catch { /* not JSON, try other formats */ }

  // 2. 简易数组格式：[a, b, c]（无引号）
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    return inner
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // 3. 裸字符串（单 ID）
  if (/^[a-zA-Z_$][\w$]*$/.test(trimmed)) {
    return [trimmed];
  }

  return [];
}

/** 解析现有 characters 列表（容错）*/
function parseExistingCharacters(raw: unknown): ScavengeCharacter[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as ScavengeCharacter[];
    }
  } catch { /* not JSON, may be empty or different format */ }
  return [];
}

/**
 * CharacterRosterManager
 * 纯副作用组件（不渲染 UI）
 */
export const CharacterRosterManager = () => {
  const stageState = useStageState();

  // 2026-06-09 改：用 stageState._last_built_character_ids 跟踪上次处理
  // 不用 useRef（resetStage 不清 useRef，会导致 stale 状态）
  useEffect(() => {
    try {
      const idsRaw = stageState.GameVar['scavenge_character_ids'];
      let ids = parseCharacterIds(idsRaw);

      // 2026-06-09 兜底：如果 IDs 是空（首次 mount，玩家还没获得任何角色）
      //   → 同步写入 [player_1] 默认值（玩家一开始就有主角）
      // 然后**继续用默认值构建**（不等下次 useEffect，因为 React re-render 是异步的）
      if (ids.length === 0) {
        stageStateManager.setStageVarAndCommit({
          key: 'scavenge_character_ids',
          value: '[player_1]',
        });
        ids = ['player_1'];
      }

      const idsKey = JSON.stringify([...ids].sort());

      // 用 idsKey 跟当前已写入的 characters 内容比对，避免重复构建
      const lastWrittenCharIds = stageState.GameVar['_last_built_character_ids'];
      if (idsKey === lastWrittenCharIds && stageState.GameVar['scavenge_characters']) {
        return;
      }

      // 读现有 characters（保留 runtime 状态：hp/exp/level/isExploring 等）
      const existing = parseExistingCharacters(stageState.GameVar['scavenge_characters']);
      const existingById = new Map(existing.map((c) => [c.id, c]));

      // 构建新数组：按 IDs 顺序遍历
      const newCharacters: ScavengeCharacter[] = [];

      for (const id of ids) {
        const runtimeState = existingById.get(id);
        const character = buildCharacterFromTemplate(id, runtimeState);
        if (character) {
          newCharacters.push(character);
        }
      }

      // 警告：ID 列表中包含未知角色
      for (const id of ids) {
        if (!(id in CHARACTER_TEMPLATES)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[CharacterRosterManager] scavenge_character_ids 包含未知角色: '${id}'（请在 characterRoster.ts 添加模板）`,
          );
        }
      }

      // 写回 scavenge_characters
      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(newCharacters),
      });
      // 标记"已用此 IDs 构建过"（绕开 useRef 在 resetStage 后 stale 的问题）
      stageStateManager.setStageVarAndCommit({
        key: '_last_built_character_ids',
        value: idsKey,
      });
    } catch {
      // 静默失败（不影响游戏）
    }
  }, [stageState.GameVar['scavenge_character_ids']]);

  return null;
};

/** 工具：列出所有已注册的角色 ID（剧情系统 / 调试用）*/
export const getAllRegisteredCharacterIds = (): string[] => listAllCharacterIds();
