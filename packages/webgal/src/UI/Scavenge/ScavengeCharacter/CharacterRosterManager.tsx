/**
 * 角色花名册管理器
 *
 * 监听阵营相关的 GameVar 变化 → 从 templates 拉基础数据 → merge runtime 状态 → 写回 `scavenge_characters`
 *
 * 阵营设计（2026-06-09 加）：
 * - ally（友方/队伍成员）：scavenge_character_ids 管理
 *   → 剧情加入、玩家控制、卡片显示、转移操作
 * - neutral（中立）：scavenge_neutral_ids 管理
 *   → 商人、可雇佣 NPC。数据独立于队伍
 *   → 例如商人维克斯是中立，他永远在市场，但不进队伍花名册
 * - enemy（敌对）：scavenge_enemy_ids（可选）
 *   → 敌人。战斗时动态生成或用模板
 *
 * 工作流程：
 * 1. 启动时读 `scavenge_character_ids` + `scavenge_neutral_ids`
 * 2. 遍历 IDs，从 `CHARACTER_TEMPLATES` 取模板构造角色
 * 3. 合并现有 `scavenge_characters` 中的 runtime 状态（hp/exp/level/isExploring 等）
 * 4. 写回 `scavenge_characters`（其他 UI 读这里用）
 *
 * 触发时机：
 * - 任意 IDs GameVar 变化时
 * - 第一次 mount 时（处理 resetStage 之后 IDs 变化）
 *
 * 2026-06-09 加
 */

import { useEffect, useMemo } from 'react';
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

  // 2026-06-09 改：按阵营分两层管理
  // - ally 花名册（scavenge_character_ids）：玩家队伍
  // - neutral 花名册（scavenge_neutral_ids）：中立 NPC（商人等）
  // 合并写入 scavenge_characters
  useEffect(() => {
    try {
      // 1. 读 ally 阵营（队伍）
      const allyIdsRaw = stageState.GameVar['scavenge_character_ids'];
      let allyIds = parseCharacterIds(allyIdsRaw);

      // 兜底：队伍默认为 [player_1]
      if (allyIds.length === 0) {
        stageStateManager.setStageVarAndCommit({
          key: 'scavenge_character_ids',
          value: '[player_1]',
        });
        allyIds = ['player_1'];
      }

      // 2. 读 neutral 阵营（中立 NPC）
      const neutralIdsRaw = stageState.GameVar['scavenge_neutral_ids'];
      let neutralIds = parseCharacterIds(neutralIdsRaw);

      // 兜底：中立默认为 [merchant_vix]（商人一开始就在）
      if (neutralIdsRaw === undefined) {
        // 仅当 GameVar 完全不存在时（首次启动）才写默认值
        // 如果 user 清空后是空数组，不重新兜底
        stageStateManager.setStageVarAndCommit({
          key: 'scavenge_neutral_ids',
          value: '[merchant_vix]',
        });
        neutralIds = ['merchant_vix'];
      } else if (neutralIds.length === 0) {
        // 如果明确设为空数组，保持空
        neutralIds = [];
      }

      // 3. 合并：按 ally 优先，然后 neutral
      const allIds = [...allyIds, ...neutralIds];
      const idsKey = JSON.stringify([...allIds].sort());

      // 用 idsKey 跟当前已写入的 characters 内容比对，避免重复构建
      const lastWrittenCharIds = stageState.GameVar['_last_built_character_ids'];
      if (idsKey === lastWrittenCharIds && stageState.GameVar['scavenge_characters']) {
        return;
      }

      // 读现有 characters（保留 runtime 状态）
      const existing = parseExistingCharacters(stageState.GameVar['scavenge_characters']);
      const existingById = new Map(existing.map((c) => [c.id, c]));

      // 构建新数组：先 ally 再 neutral
      const newCharacters: ScavengeCharacter[] = [];

      for (const id of allIds) {
        const runtimeState = existingById.get(id);
        const character = buildCharacterFromTemplate(id, runtimeState);
        if (character) {
          newCharacters.push(character);
        }
      }

      // 警告：ID 列表中包含未知角色
      for (const id of allIds) {
        if (!(id in CHARACTER_TEMPLATES)) {
          // eslint-disable-next-line no-console
          console.warn(
            `[CharacterRosterManager] 包含未知角色: '${id}'（请在 characterRoster.ts 添加模板）`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState.GameVar['scavenge_character_ids'], stageState.GameVar['scavenge_neutral_ids']]);

  // ============== 升阶剧情完成监听（2026-06-09 加）==============
  // 监听 _<charId>_completed_affinity_story_<N> GameVar
  // 剧情文件 setVar 这个值后 → 这里写回 character.completedAffinityStoryLevels

  // 提取所有 _completed_affinity_story_* vars 作为 useEffect 依赖
  // （不能用单一字段做依赖，否则设一个 var 不会触发 useEffect）
  const completionFlags = useMemo(() => {
    const flags: Record<string, unknown> = {};
    Object.keys(stageState.GameVar).forEach((k) => {
      if (k.startsWith('_') && k.includes('_completed_affinity_story_')) {
        flags[k] = stageState.GameVar[k];
      }
    });
    return flags;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState.GameVar]);

  useEffect(() => {
    try {
      const charsRaw = stageState.GameVar['scavenge_characters'];
      if (typeof charsRaw !== 'string') return;
      const chars: ScavengeCharacter[] = JSON.parse(charsRaw);
      let changed = false;

      const newChars = chars.map((char) => {
        const completedLevels = char.completedAffinityStoryLevels ?? [];

        for (let level = 0; level < 10; level++) {
          const flagKey = `_${char.id}_completed_affinity_story_${level}`;
          const flag = stageState.GameVar[flagKey];
          const isFlagged = flag === true || flag === 'true';
          if (isFlagged && !completedLevels.includes(level)) {
            completedLevels.push(level);
            changed = true;
          }
        }

        return { ...char, completedAffinityStoryLevels: completedLevels };
      });

      if (changed) {
        stageStateManager.setStageVarAndCommit({
          key: 'scavenge_characters',
          value: JSON.stringify(newChars),
        });
      }
    } catch {
      // 静默
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionFlags, stageState.GameVar['scavenge_characters']]);

  return null;
};

/** 工具：列出所有已注册的角色 ID（剧情系统 / 调试用）*/
export const getAllRegisteredCharacterIds = (): string[] => listAllCharacterIds();
