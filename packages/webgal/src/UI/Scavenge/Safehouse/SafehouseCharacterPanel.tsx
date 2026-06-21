/**
 * 安全屋场景卡片菜单（2026-06-09 重构：场景为基础）
 *
 * 新设计（2026-06-09）：
 * - 右下角显示当前场景的所有"可点击目标"
 * - 目标分两类：
 *   1. character（角色）：CHARACTER_TEMPLATES 里有的，显示角色卡片 + 好感度等级
 *   2. room（房间入口）：场景文件显式定义的"去 XX" 卡片，点击切换场景
 * - 场景文件顶部 setVar:scavenge_room_targets=JSON([...]) 定义 targets
 *
 * 向后兼容：
 * - 如果新场景没设 _room_targets，组件仍按 homeRoom 过滤显示
 * - entrance 场景不显示（它是"大厅"）
 *
 * 不再依赖 current_room GameVar
 */

import { useMemo, useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { WebGAL } from '@/Core/WebGAL';
import {
  computeDisplayLevel,
  getAffinityLevelName,
  getAffinityLevelColor,
  getAffinityLevelIcon,
  AffinityLevelIndex,
  canLevelUp,
} from '../ScavengeCharacter/affinityUtils';
import { IconCard } from '@/UI/Common/IconCard';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { CharacterInteractionMenu } from './CharacterInteractionMenu';
import { MerchantTradeMenu } from '../Merchant/MerchantTradeMenu';
import {
  SceneTarget,
  RoomTarget,
  parseSceneTargets,
  getCurrentSceneTargets,
  isCharacterInTargets,
  getTargetCharacterIds,
  getTargetRooms,
  getFallbackTargetsByHomeRoom,
} from './roomTargets';
import { getRoomFromSceneUrl } from './roomFromScene';
import styles from './SafehouseCharacterPanel.module.scss';

// 2026-06-19 删：SCENE_NAMES 改为内部 SCENE_LABELS（移到 ScavengeMain 共用）

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
  // 订阅 stageState 触发重渲染（场景内 setVar 等会触发 notify）
  const stageState = useStageState();

  // 每次渲染时直接读 sceneManager（不缓存，确保拿到最新 sceneUrl）
  const sceneUrl = WebGAL.sceneManager?.sceneData?.currentScene?.sceneUrl;
  const currentRoom = getRoomFromSceneUrl(sceneUrl);

  // 读角色数据
  const characters = useMemo(() => {
    return parseCharacters(stageState.GameVar['scavenge_characters']);
  }, [stageState.GameVar['scavenge_characters']]);

  // 重新计算：targets 优先，fallback 到 homeRoom
  const sceneTargets = useMemo<SceneTarget[]>(() => {
    // 读显式 targets
    const explicit = parseSceneTargets(stageState.GameVar['scavenge_room_targets']);
    if (explicit.length > 0) return explicit;
    // fallback：按 homeRoom 过滤
    if (!currentRoom) return [];
    return getFallbackTargetsByHomeRoom(characters, currentRoom);
  }, [stageState.GameVar['scavenge_room_targets'], characters, currentRoom]);

  const characterIds = useMemo(() => getTargetCharacterIds(sceneTargets), [sceneTargets]);
  const roomTargets = useMemo(() => getTargetRooms(sceneTargets), [sceneTargets]);
  const charactersInScene = useMemo(
    () => characters.filter((c) => characterIds.includes(c.id)),
    [characters, characterIds],
  );

  // 被点开的角色
  const [openedCharacter, setOpenedCharacter] = useState<ScavengeCharacter | null>(null);
  const [merchantOpened, setMerchantOpened] = useState<ScavengeCharacter | null>(null);

  // 找主角
  const playerCharacter = useMemo(() => {
    return characters.find((c) => c.id === 'player_1') ?? null;
  }, [characters]);

  // 2026-06-19 改：渲染条件 = 当前场景是 known room（safehouse/* 或 market/*）
  //   之前用 `scavenge_room_targets.length > 0` 但**不**清**零**，**所**以**从** market **切**到** scavenge_main **时** UI **还**在**（**因**为** GameVar **还**是** market **设**置**的**值**）
  //   现在根**据** sceneUrl **判**断**是**否** render**（**更**准**确**）
  const currentRoomId = getRoomFromSceneUrl(sceneUrl);
  if (currentRoomId === null) return null;

  const totalCount = characterIds.length + roomTargets.length;

  return (
    <div className={styles.safehousePanel}>
      {/* 2026-06-19 改：去掉上方场景名称框，直接横排卡片 */}

      {/* 角色卡片（friend / npc） */}
      {charactersInScene.map((char) => {
        const template = CHARACTER_TEMPLATES[char.id];
        if (!template) return null;
        const level = computeDisplayLevel(char) as AffinityLevelIndex;
        const levelName = getAffinityLevelName(level);
        const levelColor = getAffinityLevelColor(level);
        const levelIcon = getAffinityLevelIcon(level);

        // 2026-06-19 重构：用 IconCard 统一角色卡片样式
        return (
          <IconCard
            key={char.id}
            char={char.name.charAt(0)}
            title={char.name}
            subtitle={
              template.isMerchant ? (
                <span style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px' }}>
                  商人
                </span>
              ) : (
                <>
                  <span style={{ color: levelColor }}>{levelIcon}</span>
                  <span style={{ background: `${levelColor}30`, color: levelColor, padding: '2px 8px', borderRadius: '10px' }}>
                    {levelName}
                  </span>
                  {canLevelUp(char) && <span style={{ color: '#fbbf24' }} title="可升阶">⚠</span>}
                </>
              )
            }
            onClick={() => {
              if (template.isMerchant) {
                setMerchantOpened(char);
              } else {
                setOpenedCharacter(char);
              }
            }}
            hint={template.isMerchant
              ? `${char.name} · 商人（点此交易）`
              : `${char.name} · 好感等级：${levelName}`}
          />
        );
      })}

      {/* 房间入口卡片（去 XX / 离开） */}
      {roomTargets.map((room, idx) => (
        <IconCard
          key={`${room.kind}-${room.id ?? idx}`}
          variant={room.kind === 'exit' ? 'exit' : 'default'}
          icon={room.icon ?? (room.kind === 'exit' ? 'material-symbols:logout' : 'material-symbols:door-back')}
          title={room.label}
          onClick={() => {
            const sceneUrl = room.scene.startsWith('./game/scene/') ? room.scene : `./game/scene/${room.scene}`;
            const changeSceneMod = (window as any).__changeScene__;
            if (changeSceneMod) {
              changeSceneMod(sceneUrl, room.id ?? 'unknown');
            } else {
              import('@/Core/controller/scene/changeScene').then((m) => {
                m.changeScene(sceneUrl, room.id ?? 'unknown');
              });
            }
          }}
        />
      ))}

      {/* 空状态 */}
      {totalCount === 0 && (
        <div className={styles.emptyRoom}>
          这里没有可点击的内容
        </div>
      )}

      {/* 交互菜单 */}
      {openedCharacter && (
        <CharacterInteractionMenu
          character={openedCharacter}
          onClose={() => setOpenedCharacter(null)}
        />
      )}

      {/* 商人交易 modal */}
      {merchantOpened && playerCharacter && (
        <MerchantTradeMenu
          merchant={merchantOpened}
          player={playerCharacter}
          onClose={() => setMerchantOpened(null)}
        />
      )}
    </div>
  );
};