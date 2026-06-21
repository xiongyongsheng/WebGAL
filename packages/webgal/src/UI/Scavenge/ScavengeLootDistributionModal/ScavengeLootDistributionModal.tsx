/**
 * 战利品分配 modal（M1 + M2 阶段，2026-06-21 加）
 *
 * 触发：mission 状态变化（active → completed/failed/cancelled）+ tempLoot.length > 0 + !tempLootDistributed
 * 功能：玩家把 Mission.tempLoot 里的物品手动分配给队伍成员
 * 流程：
 * 1. 显示队伍成员（每个角色显示偏好/需求）
 * 2. 显示临时仓库物品列表（每个物品显示"推荐给 X" 徽章 + 字符分配按钮）
 * 3. 玩家点 "全部推荐" → 自动按推荐分配
 * 4. 玩家手动点击角色头像 → 分配单个物品
 * 5. 玩家点 "确认分配" → 写入背包 + 标记 tempLootDistributed + 清空 tempLoot
 * 6. 玩家点 "跳过" → 全部转入永久仓库 + 标记 tempLootDistributed + 清空 tempLoot
 *
 * 推荐算法（来自 characterNeeds.ts）：
 * - preferences[category] * 1.0 + needs[category] * 1.5
 * - 最高分 = recommended，次高分 = backup
 *
 * 死亡/HP=0 的角色：禁用分配按钮（死人不能接物品）
 */

import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import inventory from '@iconify-icons/material-symbols/inventory-2';
import star from '@iconify-icons/material-symbols/star';
import starOutline from '@iconify-icons/material-symbols/star-outline';
import close from '@iconify-icons/material-symbols/close';
import heart from '@iconify-icons/material-symbols/favorite';
import shield from '@iconify-icons/material-symbols/shield';
import waterDrop from '@iconify-icons/material-symbols/water-drop';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import psychology from '@iconify-icons/material-symbols/psychology';
import build from '@iconify-icons/material-symbols/build';
import flag from '@iconify-icons/material-symbols/flag';
import checkCircle from '@iconify-icons/material-symbols/check-circle';
import warning from '@iconify-icons/material-symbols/warning';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import {
  getItemName, getItemIcon, getItemRarityColor,
} from '../ScavengeItems/items';
import {
  InventoryItem, addToInventory, addToWarehouse,
} from '../ScavengeItems/inventory';
import {
  readMissions, writeMissions, Mission,
} from '../ScavengeMissions/missions';
import { getWarehouse, setWarehouse } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { getCharacters, setCharacters } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import {
  scoreItemForParty, ItemScore, computeCharacterNeeds,
} from '../ScavengeMissions/characterNeeds';
import { getItemCategory, ITEM_CATEGORY_LABELS, ItemCategory } from '../ScavengeMissions/partyLoot';
import styles from './ScavengeLootDistributionModal.module.scss';

interface ScavengeLootDistributionModalProps {
  /** 触发本次分配的 mission（含 tempLoot 字段）*/
  mission: Mission;
  /** 队伍成员（按 characterId 顺序）*/
  party: ScavengeCharacter[];
  /** 关闭 modal */
  onClose: () => void;
}

// 分类 → 图标
const CATEGORY_ICONS: Record<ItemCategory, any> = {
  food: restaurant,
  drink: waterDrop,
  medicine: heart,
  sanity: psychology,
  weapon: 'material-symbols:swords',
  armor: shield,
  tool: build,
  material: inventory,
  quest: flag,
  other: starOutline,
};

/**
 * Modal 主组件
 */
export const ScavengeLootDistributionModal = ({
  mission, party, onClose,
}: ScavengeLootDistributionModalProps) => {
  // 待分配物品列表（key = instanceId 或 index）
  // value = 选中的角色 id（null = 未分配）
  const [assignments, setAssignments] = useState<Record<string, string | null>>(() => {
    // 默认：自动按"推荐"分配
    const init: Record<string, string | null> = {};
    mission.tempLoot?.forEach((item, idx) => {
      const scores = scoreItemForParty(party, item);
      const recommended = scores[0];
      init[itemKey(item, idx)] = recommended && recommended.total > 0 ? recommended.char.id : party[0]?.id ?? null;
    });
    return init;
  });

  // "全部推荐" 重置
  const autoAssignAll = () => {
    const init: Record<string, string | null> = {};
    mission.tempLoot?.forEach((item, idx) => {
      const scores = scoreItemForParty(party, item);
      const recommended = scores[0];
      init[itemKey(item, idx)] = recommended && recommended.total > 0 ? recommended.char.id : party[0]?.id ?? null;
    });
    setAssignments(init);
  };

  // 清空所有选择（玩家手动一个个点）
  const clearAll = () => {
    const init: Record<string, string | null> = {};
    mission.tempLoot?.forEach((item, idx) => {
      init[itemKey(item, idx)] = null;
    });
    setAssignments(init);
  };

  // 分配一个物品给某个角色
  const assignItem = (itemKey: string, charId: string) => {
    setAssignments(prev => ({ ...prev, [itemKey]: charId }));
  };

  // 全部已分配？
  const allAssigned = useMemo(() => {
    return Object.values(assignments).every(v => v !== null);
  }, [assignments]);

  // 确认分配
  const handleConfirm = () => {
    distributeItems(assignments, mission, party);
    onClose();
  };

  // 跳过（全部入永久仓库）
  const handleSkip = () => {
    skipToWarehouse(mission);
    onClose();
  };

  const tempLoot = mission.tempLoot ?? [];

  return (
    <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon icon={inventory} className={styles.titleIcon} />
            <h2 className={styles.title}>战利品分配</h2>
            <span className={styles.subtitle}>{tempLoot.length} 件物品待分配</span>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="关闭（未分配的物品将保留在临时仓库）">
            <Icon icon={close} />
          </button>
        </div>

        {/* 主体：左中右三栏 */}
        <div className={styles.body}>
          {/* 左：队伍成员 */}
          <div className={styles.partyPanel}>
            <div className={styles.panelTitle}>队伍</div>
            {party.map(char => (
              <PartyMemberCard
                key={char.id}
                char={char}
                // 统计这个角色被分配了几件
                assignedCount={Object.values(assignments).filter(id => id === char.id).length}
              />
            ))}
          </div>

          {/* 中：物品列表 */}
          <div className={styles.itemsPanel}>
            <div className={styles.panelTitle}>临时仓库</div>
            <div className={styles.itemList}>
              {tempLoot.length === 0 ? (
                <div className={styles.emptyHint}>没有待分配的物品</div>
              ) : (
                tempLoot.map((item, idx) => {
                  const key = itemKey(item, idx);
                  const assignedTo = assignments[key];
                  const scores = scoreItemForParty(party, item);
                  return (
                    <ItemRow
                      key={key}
                      item={item}
                      party={party}
                      scores={scores}
                      assignedTo={assignedTo}
                      onAssign={(charId) => assignItem(key, charId)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <button className={styles.actionButton} onClick={autoAssignAll} title="按推荐自动分配所有物品">
              <Icon icon="material-symbols:auto-awesome" />
              全部推荐
            </button>
            <button className={styles.actionButton} onClick={clearAll} title="清空所有选择">
              <Icon icon="material-symbols:close" />
              清空
            </button>
          </div>
          <div className={styles.footerRight}>
            <button className={styles.skipButton} onClick={handleSkip} title="全部转入永久仓库（跳过手动分配）">
              <Icon icon="material-symbols:warehouse" />
              跳过（入库）
            </button>
            <button
              className={styles.confirmButton}
              onClick={handleConfirm}
              disabled={!allAssigned}
              title={allAssigned ? '确认分配' : '还有物品未分配'}
            >
              <Icon icon={allAssigned ? checkCircle : warning} />
              确认分配
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============== 子组件 ==============

/** 物品 key：优先用 instanceId，否则用 `${itemId}-${idx}` */
const itemKey = (item: InventoryItem, idx: number): string => {
  return item.instanceId || `${item.itemId}-${idx}`;
};

const PartyMemberCard = ({
  char, assignedCount,
}: {
  char: ScavengeCharacter;
  assignedCount: number;
}) => {
  const isDead = char.hp <= 0;
  const needs = computeCharacterNeeds(char);

  return (
    <div className={`${styles.partyCard} ${isDead ? styles.dead : ''}`}>
      <div className={styles.partyHeader}>
        <div className={styles.partyName}>{char.name}</div>
        {isDead && <div className={styles.deadBadge}>阵亡</div>}
        {assignedCount > 0 && (
          <div className={styles.assignedBadge}>
            <Icon icon={inventory} />
            {assignedCount}
          </div>
        )}
      </div>
      {/* 状态条 */}
      <div className={styles.statusBar}>
        <div className={styles.statusItem} title={`HP ${char.hp}/${char.maxHp}`}>
          <Icon icon={heart} style={{ color: char.hp / char.maxHp < 0.3 ? '#f44336' : '#aaa' }} />
          <span>{char.hp}/{char.maxHp}</span>
        </div>
        <div className={styles.statusItem} title={`饱食 ${char.hunger}/${char.maxHunger}`}>
          <Icon icon={restaurant} style={{ color: char.hunger / char.maxHunger < 0.3 ? '#ffa726' : '#aaa' }} />
          <span>{char.hunger}</span>
        </div>
        <div className={styles.statusItem} title={`饮水 ${char.thirst}/${char.maxThirst}`}>
          <Icon icon={waterDrop} style={{ color: char.thirst / char.maxThirst < 0.3 ? '#ffa726' : '#aaa' }} />
          <span>{char.thirst}</span>
        </div>
        <div className={styles.statusItem} title={`精神 ${char.sanity}/${char.maxSanity}`}>
          <Icon icon={psychology} style={{ color: char.sanity / char.maxSanity < 0.3 ? '#9c27b0' : '#aaa' }} />
          <span>{char.sanity}</span>
        </div>
      </div>
      {/* 需求标签 */}
      {Object.keys(needs).length > 0 && !isDead && (
        <div className={styles.needsList}>
          {Object.entries(needs).map(([cat, score]) => (
            <div key={cat} className={styles.needTag} title={`${ITEM_CATEGORY_LABELS[cat as ItemCategory]} 需求 ${score}/10`}>
              <Icon icon={CATEGORY_ICONS[cat as ItemCategory]} />
              <span>{ITEM_CATEGORY_LABELS[cat as ItemCategory]}</span>
              <span className={styles.needScore}>{score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ItemRow = ({
  item, party, scores, assignedTo, onAssign,
}: {
  item: InventoryItem;
  party: ScavengeCharacter[];
  scores: ItemScore[];
  assignedTo: string | null;
  onAssign: (charId: string) => void;
}) => {
  const category = getItemCategory(item.itemId);
  const recommendedScore = scores[0];
  const backupScore = scores[1];

  return (
    <div className={styles.itemRow}>
      {/* 物品图标 + 名 */}
      <div className={styles.itemInfo}>
        <div className={styles.itemIcon} style={{ color: getItemRarityColor(item.itemId) }}>
          <Icon icon={getItemIcon(item.itemId)} />
        </div>
        <div className={styles.itemNameCol}>
          <div className={styles.itemName}>{getItemName(item.itemId)}</div>
          <div className={styles.itemMeta}>
            <Icon icon={CATEGORY_ICONS[category]} className={styles.categoryIcon} />
            {ITEM_CATEGORY_LABELS[category]} ×{item.quantity}
            {item.durability !== undefined && item.durability < 100 && (
              <span className={styles.durability}> · 耐久 {item.durability}</span>
            )}
          </div>
        </div>
      </div>

      {/* 分配按钮组（每个角色一个） */}
      <div className={styles.assignButtons}>
        {party.map(char => {
          const isDead = char.hp <= 0;
          const score = scores.find(s => s.char.id === char.id);
          const isRecommended = score?.level === 'recommended';
          const isBackup = score?.level === 'backup';
          const isAssigned = assignedTo === char.id;
          return (
            <button
              key={char.id}
              className={`
                ${styles.assignButton}
                ${isAssigned ? styles.assigned : ''}
                ${isRecommended ? styles.recommended : ''}
                ${isBackup ? styles.backup : ''}
                ${isDead ? styles.disabled : ''}
              `}
              onClick={() => !isDead && onAssign(char.id)}
              disabled={isDead}
              title={
                isDead
                  ? '该角色已阵亡'
                  : isAssigned
                    ? `已分配给 ${char.name}（点击切换）`
                    : `分配给 ${char.name}（${category} 评分 ${score?.total.toFixed(1) ?? 0}）`
              }
            >
              <span className={styles.charInitial}>{char.name?.[0] ?? '?'}</span>
              {isRecommended && <span className={styles.recBadge}><Icon icon={star} /></span>}
              {isBackup && !isRecommended && <span className={styles.backupBadge}><Icon icon={starOutline} /></span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ============== 持久化逻辑 ==============

/**
 * 把分配的物品写入角色背包
 * - 调用 setCharacters 写回 GameVar
 * - 调用 writeMissions 标记 mission.tempLootDistributed = true + 清空 tempLoot
 */
const distributeItems = (
  assignments: Record<string, string | null>,
  mission: Mission,
  party: ScavengeCharacter[],
) => {
  const allChars = getCharacters();
  const charMap = new Map(allChars.map(c => [c.id, c]));

  // 1. 分配物品到对应角色背包
  (mission.tempLoot ?? []).forEach((item, idx) => {
    const key = itemKey(item, idx);
    const charId = assignments[key];
    if (!charId) return;
    const char = charMap.get(charId);
    if (!char) return;
    const newInv = addToInventory(char.inventory ?? [], item);
    charMap.set(charId, { ...char, inventory: newInv });
  });

  // 2. 写回 characters
  setCharacters(Array.from(charMap.values()));

  // 3. 更新 mission：标记 distributed + 清空 tempLoot
  const missions = readMissions();
  const newMissions = missions.map(m => {
    if (m.id !== mission.id) return m;
    return { ...m, tempLootDistributed: true, tempLoot: undefined };
  });
  writeMissions(newMissions);
};

/**
 * 跳过分配：全部物品转入永久仓库
 */
const skipToWarehouse = (mission: Mission) => {
  const items = mission.tempLoot ?? [];
  if (items.length === 0) return;

  // 1. 物品入仓库
  const currentWh = getWarehouse();
  let newWh = currentWh;
  for (const item of items) {
    newWh = addToWarehouse(newWh, item);
  }
  setWarehouse(newWh);

  // 2. 更新 mission
  const missions = readMissions();
  const newMissions = missions.map(m => {
    if (m.id !== mission.id) return m;
    return { ...m, tempLootDistributed: true, tempLoot: undefined };
  });
  writeMissions(newMissions);
};
