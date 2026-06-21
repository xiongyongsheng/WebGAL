/**
 * 角色交互菜单（2026-06-09 加）
 *
 * 显示模式：
 * - main: 主菜单（赠送/聊天/查看信息）
 * - gift: 赠送物品（背包物品列表，按 affinityValue 过滤）
 * - chat: 聊天（话题列表，按等级过滤）
 * - chat_response: 展示角色回复 + 好感度变化
 *
 * 数据流：
 * - 赠送：从主角 inventory 取 1 个 → 删除 → 加到 NPC inventory → 好感度+
 * - 聊天：从 chatTopics 选 1 个 → 展示回复 → 好感度+ → 可能触发剧情
 * - 信息：展示 NPC 的属性（攻击/防御等）
 */

import { useState, useMemo } from 'react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import {
  computeDisplayLevel,
  getAffinityLevelName,
  getAffinityLevelColor,
  AffinityLevelIndex,
  getNextLevelProgress,
  canGiftItem,
  canLevelUp,
} from '../ScavengeCharacter/affinityUtils';
import { getItemById, AffinityValue } from '../ScavengeItems/items';
import { ChatTopic, getAvailableTopics } from './chatTopics';
import { ListSection, ListItemContent } from '@/UI/Common/ListSection';
import styles from './CharacterInteractionMenu.module.scss';

interface Props {
  character: ScavengeCharacter;
  onClose: () => void;
}

type Mode = 'main' | 'gift' | 'chat' | 'chat_response' | 'info';

export const CharacterInteractionMenu = ({ character, onClose }: Props) => {
  useStageState();
  const [mode, setMode] = useState<Mode>('main');
  const [response, setResponse] = useState<{ text: string; affinityChange: number; newLevel: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const template = CHARACTER_TEMPLATES[character.id];
  const level = computeDisplayLevel(character) as AffinityLevelIndex;
  const levelName = getAffinityLevelName(level);
  const levelColor = getAffinityLevelColor(level);
  const nextProgress = getNextLevelProgress(character);

  // 主角背包（用于赠送）
  const playerCharacter = useMemo<ScavengeCharacter | null>(() => {
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof raw !== 'string') return null;
    try {
      const arr = JSON.parse(raw) as ScavengeCharacter[];
      return arr.find((c) => c.id === 'player_1') ?? null;
    } catch { return null; }
  }, []);

  // 可赠送物品（主角背包里有 + 当前等级能送的）
  const giftableItems = useMemo(() => {
    if (!playerCharacter) return [];
    return playerCharacter.inventory
      .filter((slot) => slot !== null)
      .map((slot) => {
        const itemDef = getItemById(slot!.itemId);
        const canGift = itemDef?.affinityValue && canGiftItem(character, itemDef.affinityValue);
        return { slot: slot!, item: itemDef, canGift: !!canGift, affinityValue: itemDef?.affinityValue };
      })
      .filter((entry) => entry.affinityValue !== undefined); // 只显示标记了 affinityValue 的物品
  }, [playerCharacter, character]);

  // 可聊天话题
  const availableTopics = useMemo(() => {
    const chatLevels = Object.entries(template?.chatAccessMap ?? {})
      .filter(([_, reqLevel]) => level >= reqLevel)
      .map(([levelName]) => levelName);
    return getAvailableTopics(character.id, chatLevels);
  }, [character.id, level, template]);

  // ============== 动作：赠送物品 ==============
  const handleGift = (itemId: string, affinityValue: AffinityValue) => {
    if (!playerCharacter) return;
    if (!canGiftItem(character, affinityValue)) {
      setErrorMsg('当前好感度不足，无法赠送此物品');
      return;
    }

    // 1. 从主角 inventory 删除 1 个
    const newPlayerInv = playerCharacter.inventory
      .map((slot) => {
        if (slot === null || slot.itemId !== itemId) return slot;
        const newQty = slot.quantity - 1;
        return newQty > 0 ? { ...slot, quantity: newQty } : null;
      })
      .filter((slot): slot is NonNullable<typeof slot> => slot !== null);

    // 2. 加到 NPC inventory
    const existingNpcInv = character.inventory ?? [];
    const existingIdx = existingNpcInv.findIndex(
      (s) => s !== null && s.itemId === itemId,
    );
    const newNpcInv = [...existingNpcInv];
    if (existingIdx >= 0) {
      const existing = newNpcInv[existingIdx]!;
      newNpcInv[existingIdx] = { ...existing, quantity: existing.quantity + 1 };
    } else {
      // 2026-06-09 注：实例 ID 在 normalizeCharacter 时自动补全
      // 这里简化不生成，依赖 normalize 处理
      (newNpcInv as any[]).push({ itemId, quantity: 1 });
    }

    // 3. 好感度+
    const affinityBonus: Record<AffinityValue, number> = { cheap: 2, normal: 5, precious: 12 };
    const newAffinity = Math.max(-100, Math.min(100, character.affinity + (affinityBonus[affinityValue] ?? 0)));
    const newCompletedLevels = character.completedAffinityStoryLevels;
    const newLevel = computeDisplayLevel({ ...character, affinity: newAffinity, completedAffinityStoryLevels: newCompletedLevels });

    // 4. 写回 stage state
    const allCharsRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const allChars: ScavengeCharacter[] = JSON.parse(allCharsRaw as string);
    const newChars = allChars.map((c) => {
      if (c.id === 'player_1') return { ...c, inventory: newPlayerInv };
      if (c.id === character.id) {
        return { ...c, affinity: newAffinity, inventory: newNpcInv };
      }
      return c;
    });
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(newChars),
    });

    setResponse({
      text: `${character.name} 收下了你的礼物，露出了一丝微笑。`,
      affinityChange: newAffinity - character.affinity,
      newLevel,
    });
    setMode('chat_response');
    setErrorMsg(null);
  };

  // ============== 动作：聊天 ==============
  const handleChat = (topic: ChatTopic) => {
    // 应用冷却
    const today = stageStateManager.getCalculationStageState().GameVar['current_day'] ?? 1;
    const cooldownKey = `chat_cooldown_${character.id}_${topic.id}`;
    const lastChat = stageStateManager.getCalculationStageState().GameVar[cooldownKey];
    if (lastChat !== undefined && Number(lastChat) >= Number(today)) {
      setErrorMsg('这个话题最近聊过了，过几天再来');
      return;
    }

    // 好感度+
    const newAffinity = Math.max(-100, Math.min(100, character.affinity + topic.affinityChange));
    const newLevel = computeDisplayLevel({ ...character, affinity: newAffinity, completedAffinityStoryLevels: character.completedAffinityStoryLevels });

    // 写回
    const allCharsRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const allChars: ScavengeCharacter[] = JSON.parse(allCharsRaw as string);
    const newChars = allChars.map((c) => {
      if (c.id === character.id) return { ...c, affinity: newAffinity };
      return c;
    });
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(newChars),
    });
    if (topic.cooldownDay) {
      stageStateManager.setStageVarAndCommit({
        key: cooldownKey,
        value: String(Number(today) + topic.cooldownDay),
      });
    }

    // 如果有剧情 → 触发场景
    if (topic.storyScene) {
      setMode('main');
      onClose();
      import('@/Core/controller/scene/changeScene').then(({ changeScene }) => {
        changeScene(topic.storyScene!, topic.storyScene!);
      });
      return;
    }

    setResponse({
      text: topic.response,
      affinityChange: topic.affinityChange,
      newLevel,
    });
    setMode('chat_response');
    setErrorMsg(null);
  };

  // ============== 渲染 ==============
  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* 头部（粘性定位）*/}
        <div className={styles.drawerHeader}>
          <div className={styles.characterAvatar}>{character.name.charAt(0)}</div>
          <div className={styles.characterInfo}>
            <div className={styles.characterName}>{character.name}</div>
            <div className={styles.characterAffinity}>
              <span style={{ color: levelColor }}>●</span>
              <span className={styles.affinityBadge} style={{ background: `${levelColor}30`, color: levelColor }}>
                {levelName}
              </span>
              {nextProgress.next !== null && nextProgress.locked && (
                <span style={{ color: '#fbbf24' }}>⚠ 好感已满，触发升阶剧情</span>
              )}
            </div>
            <div className={styles.affinityProgress}>
              <div
                className={styles.affinityFill}
                style={{
                  width: `${nextProgress.progress * 100}%`,
                  background: levelColor,
                }}
              />
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="关闭">×</button>
        </div>

        {/* 主体 */}
        <div className={styles.content}>
          {/* 错误提示 */}
          {errorMsg && (
            <div style={{ padding: 10, background: 'rgba(248,113,113,0.2)', borderRadius: 6, marginBottom: 12, color: '#fecaca' }}>
              {errorMsg}
            </div>
          )}
        {mode === 'main' && (
          <div className={styles.actions}>
            {/* 升阶剧情触发（好感度满但剧情未完成时显示） */}
            {canLevelUp(character) && (
              <button
                className={styles.actionButton}
                style={{ background: 'rgba(251, 191, 36, 0.15)', borderColor: 'rgba(251, 191, 36, 0.4)' }}
                onClick={() => {
                  // 触发剧情
                  onClose();
                  import('@/Core/controller/scene/changeScene').then(({ changeScene }) => {
                    changeScene(
                      `./game/scene/safehouse/event_${character.id}_intimate_up.txt`,
                      `升阶剧情`,
                    );
                  });
                }}
              >
                <span>⚠ 触发升阶剧情</span>
                <span className={styles.actionHint}>
                  好感度已满，等待剧情解锁
                </span>
              </button>
            )}
            <button
              className={styles.actionButton}
              onClick={() => setMode('gift')}
              disabled={giftableItems.length === 0}
            >
              <span>🎁 赠送物品</span>
              <span className={styles.actionHint}>
                {giftableItems.length} 件可送
              </span>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => setMode('chat')}
              disabled={availableTopics.length === 0}
            >
              <span>💬 聊天</span>
              <span className={styles.actionHint}>
                {availableTopics.length} 个话题
              </span>
            </button>
            <button
              className={styles.actionButton}
              onClick={() => setMode('info')}
            >
              <span>📋 查看信息</span>
              <span className={styles.actionHint}>
                {character.str}/{character.agi}/{character.end}/{character.int}
              </span>
            </button>
          </div>
        )}

        {mode === 'gift' && (
          <ListSection
            title="选择物品赠送"
            items={giftableItems}
            keyOf={(entry) => entry.slot.itemId}
            emptyText="背包里没有可赠送的物品"
            emptyIcon="🎁"
            actions={
              <button className={styles.backButton} onClick={() => setMode('main')}>← 返回</button>
            }
            renderItem={(entry) => (
              <ListItemContent
                title={entry.item?.name ?? entry.slot.itemId}
                subtitle={`数量: ${entry.slot.quantity} · 档次: ${entry.affinityValue}`}
                disabled={!entry.canGift}
                locked={!entry.canGift}
                onClick={() => handleGift(entry.slot.itemId, entry.affinityValue!)}
                action={!entry.canGift ? `需要${entry.affinityValue === 'normal' ? '熟悉' : '亲密'}` : undefined}
              />
            )}
          />
        )}

        {mode === 'chat' && (
          <ListSection
            title="聊点什么"
            items={availableTopics}
            keyOf={(topic) => topic.id}
            emptyText="暂时没有可以聊的话题"
            emptyIcon="💬"
            actions={
              <button className={styles.backButton} onClick={() => setMode('main')}>← 返回</button>
            }
            renderItem={(topic) => (
              <ListItemContent
                title={topic.text}
                subtitle={`${topic.level === 'casual' ? '日常' : topic.level === 'personal' ? '私人' : '秘密'}${topic.affinityChange > 0 ? ` · +${topic.affinityChange} 好感` : ''}`}
                onClick={() => handleChat(topic)}
              />
            )}
          />
        )}

        {mode === 'chat_response' && response && (
          <>
            <div className={styles.responseBubble}>
              <strong>{character.name}：</strong>
              <br />
              {response.text}
            </div>
            <div style={{ marginTop: 12, color: '#4ade80' }}>
              好感度 {response.affinityChange >= 0 ? '+' : ''}{response.affinityChange}
            </div>
            <button className={styles.backButton} onClick={() => { setMode('main'); setResponse(null); }}>← 返回</button>
          </>
        )}

        {mode === 'info' && (
          <ListSection
            title="角色属性"
            items={[
              { label: '力量 (str)', value: String(character.str) },
              { label: '敏捷 (agi)', value: String(character.agi) },
              { label: '耐力 (end)', value: String(character.end) },
              { label: '智力 (int)', value: String(character.int) },
              { label: 'HP / 最大', value: `${character.hp} / ${character.maxHp}` },
              { label: '饥饿', value: `${character.hunger} / ${character.maxHunger}` },
              { label: '口渴', value: `${character.thirst} / ${character.maxThirst}` },
              { label: '精神', value: `${character.sanity} / ${character.maxSanity}` },
              { label: '等级 / 经验', value: `Lv.${character.level} (${character.exp}/${character.expToNext})` },
              { label: '特性', value: character.traitIds?.join(', ') || '无' },
              { label: '背包物品', value: `${(character.inventory ?? []).filter((s) => s !== null).length} 件` },
            ]}
            keyOf={(row) => row.label}
            actions={
              <button className={styles.backButton} onClick={() => setMode('main')}>← 返回</button>
            }
            renderItem={(row) => (
              <ListItemContent
                title={row.label}
                action={row.value}
              />
            )}
          />
        )}
        </div>{/* 关闭 content */}
      </div>
    </div>
  );
};
