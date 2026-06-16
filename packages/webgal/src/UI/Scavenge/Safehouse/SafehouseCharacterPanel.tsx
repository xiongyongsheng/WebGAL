/**
 * 安全屋角色卡片面板（2026-06-09 加）
 *
 * 功能：
 * - 右下角显示当前房间（current_room GameVar）的所有角色
 * - 每个角色一张卡：头像 + 名字 + 好感等级（不显示数值）
 * - 房间标题：显示当前在哪个房间
 *
 * 触发条件：
 * - current_room GameVar 有值（即在 safehouse_main 场景中）
 * - 否则不渲染（回到地图时自动隐藏）
 *
 * 角色过滤逻辑：
 * - 遍历 scavenge_characters
 * - 找 characterRoster 里 homeRoom === current_room 的
 * - 排除主角自己（主角永远在所有房间）
 */

import { useMemo, useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import {
  computeDisplayLevel,
  getAffinityLevelName,
  getAffinityLevelColor,
  getAffinityLevelIcon,
  AffinityLevelIndex,
  canLevelUp,
} from '../ScavengeCharacter/affinityUtils';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CharacterInteractionMenu } from './CharacterInteractionMenu';
import styles from './SafehouseCharacterPanel.module.scss';

/** 房间 ID → 房间名（UI 显示）*/
const ROOM_NAMES: Record<string, string> = {
  living_room: '客厅',
  bedroom_main: '主卧',
  bedroom_second: '次卧',
  corridor: '走廊',
};

/** 解析当前房间的所有角色 */
function getCharactersInRoom(
  characters: ScavengeCharacter[],
  currentRoom: string,
): ScavengeCharacter[] {
  return characters.filter((c) => {
    // 主角永远不显示在卡片（玩家自己）
    if (c.id === 'player_1') return false;
    const template = CHARACTER_TEMPLATES[c.id];
    if (!template) return false;
    return template.homeRoom === currentRoom;
  });
}

/** 解析 characters 列表（容错）*/
function parseCharacters(raw: unknown): ScavengeCharacter[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as ScavengeCharacter[];
    }
  } catch { /* ignore */ }
  return [];
}

export const SafehouseCharacterPanel = () => {
  const stageState = useStageState();
  const currentRoom = stageState.GameVar['current_room'] as string | undefined;

  // 只在安全屋中显示（current_room 有值时）
  const characters = useMemo(() => {
    if (!currentRoom) return [];
    return parseCharacters(stageState.GameVar['scavenge_characters']);
  }, [currentRoom, stageState.GameVar['scavenge_characters']]);

  const charactersInRoom = useMemo(() => {
    if (!currentRoom) return [];
    return getCharactersInRoom(characters, currentRoom);
  }, [characters, currentRoom]);

  // 被点开的角色（弹出交互菜单）
  const [openedCharacter, setOpenedCharacter] = useState<ScavengeCharacter | null>(null);

  // 不在安全屋 → 不渲染
  if (!currentRoom) return null;

  const roomName = ROOM_NAMES[currentRoom] ?? currentRoom;

  return (
    <div className={styles.safehousePanel}>
      {/* 房间标题 */}
      <div className={styles.roomIndicator}>
        📍 {roomName}
        <span className={styles.roomBadge}>
          {charactersInRoom.length}人
        </span>
      </div>

      {/* 角色卡片列表 */}
      {charactersInRoom.length === 0 ? (
        <div className={styles.emptyRoom}>
          这个房间暂时没人
        </div>
      ) : (
        charactersInRoom.map((char) => {
          const template = CHARACTER_TEMPLATES[char.id];
          if (!template) return null;
          const level = computeDisplayLevel(char) as AffinityLevelIndex;
          const levelName = getAffinityLevelName(level);
          const levelColor = getAffinityLevelColor(level);
          const levelIcon = getAffinityLevelIcon(level);

          return (
            <div
              key={char.id}
              className={styles.characterCard}
              onClick={() => setOpenedCharacter(char)}
              title={`${char.name} · 好感等级：${levelName}`}
            >
              <div className={`${styles.avatar} ${styles.avatarPlaceholder}`}>
                {char.name.charAt(0)}
              </div>
              <div className={styles.name}>{char.name}</div>
              <div className={styles.affinityRow}>
                <span style={{ color: levelColor }}>{levelIcon}</span>
                <span className={styles.affinityLevel} style={{ background: `${levelColor}30`, color: levelColor }}>
                  {levelName}
                </span>
                {canLevelUp(char) && <span style={{ color: '#fbbf24' }} title="可升阶">⚠</span>}
              </div>
            </div>
          );
        })
      )}

      {/* 交互菜单（modal） */}
      {openedCharacter && (
        <CharacterInteractionMenu
          character={openedCharacter}
          onClose={() => setOpenedCharacter(null)}
        />
      )}
    </div>
  );
};