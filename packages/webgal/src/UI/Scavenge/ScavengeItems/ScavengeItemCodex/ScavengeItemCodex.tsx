/**
 * 物品图鉴（2026-06-09 新建）
 *
 * 显示所有已注册物品的完整信息
 * - 顶部 tab 过滤（按类型）
 * - 网格展示（每卡片：图标 + 名称 + 稀有度 + 描述 + 关键属性）
 * 用途：玩家查询物品数据、对比装备
 */
import { useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import inventory from '@iconify-icons/material-symbols/inventory-2';
import {
  ALL_ITEMS, Item, ItemType, ItemRarity,
  ConsumableItem, EquipmentItem, MaterialItem, QuestItem,
  RARITY_COLORS, RARITY_NAMES,
  getItemIcon, getItemName,
} from '../items';
import { InventoryItem } from '../inventory';
import styles from './ScavengeItemCodex.module.scss';

/** 类型标签 */
const TYPE_LABEL: Record<ItemType, string> = {
  consumable: '消耗品',
  material: '材料',
  equipment: '装备',
  quest: '任务',
};

/** 类型 tab 选项 */
const TABS: Array<{ key: 'all' | ItemType; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'equipment', label: '装备' },
  { key: 'consumable', label: '消耗品' },
  { key: 'material', label: '材料' },
  { key: 'quest', label: '任务' },
];

interface ScavengeItemCodexProps {
  onClose: () => void;
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/** 渲染属性行：key + value */
const Stat = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
  <div className={styles.statRow}>
    <span className={styles.statLabel}>{label}</span>
    <span className={styles.statValue} style={color ? { color } : undefined}>{value}</span>
  </div>
);

/** 渲染装备关键属性 */
const EquipmentDetails = ({ item }: { item: EquipmentItem }) => {
  const isWeapon = item.slot === 'weapon';
  const isArmor = item.slot === 'armor' && item.armorSlot;

  return (
    <div className={styles.detailsGrid}>
      {isWeapon && item.damageRange && (
        <Stat label="伤害" value={`${item.damageRange[0]}-${item.damageRange[1]}`} />
      )}
      {isWeapon && item.speedModifier && (
        <Stat label="速度" value={item.speedModifier === 'fast' ? '快' : item.speedModifier === 'slow' ? '慢' : '中'} />
      )}
      {isArmor && item.armorSlot && (
        <Stat label="部位" value={item.armorSlot} />
      )}
      {typeof item.maxDurability === 'number' && (
        <Stat label="耐久" value={item.maxDurability} />
      )}
      {typeof item.defense === 'number' && (
        <Stat label="防御" value={item.defense} />
      )}
      {typeof item.stealth === 'number' && (
        <Stat
          label="潜行"
          value={item.stealth > 0 ? `+${item.stealth}` : `${item.stealth}`}
          color={item.stealth > 0 ? '#4caf50' : item.stealth < 0 ? '#ff9800' : undefined}
        />
      )}
      {item.weaponType && (
        <Stat label="类型" value={item.weaponType === 'sharp' ? '锐利' : '钝器'} />
      )}
      {item.attributes && Object.keys(item.attributes).length > 0 && (
        <Stat
          label="属性"
          value={Object.entries(item.attributes)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k.toUpperCase()}+${v}`)
            .join(' / ')}
        />
      )}
      {item.requirements && Object.keys(item.requirements).length > 0 && (
        <Stat
          label="需求"
          value={Object.entries(item.requirements)
            .map(([k, v]) => `${k.toUpperCase()}≥${v}`)
            .join(' / ')}
          color="#ff9800"
        />
      )}
      <Stat label="重量" value={`${item.weight}kg`} />
    </div>
  );
};

/** 渲染消耗品效果 */
const ConsumableDetails = ({ item }: { item: ConsumableItem }) => (
  <div className={styles.detailsGrid}>
    {item.effects.map((effect, idx) => {
      const valuePrefix = effect.value > 0 ? '+' : '';
      return (
        <Stat
          key={idx}
          label={effect.type === 'hp' ? 'HP' : effect.type === 'hunger' ? '饱食' : effect.type === 'thirst' ? '饮水' : '精神'}
          value={`${valuePrefix}${effect.value}`}
          color={effect.value > 0 ? '#4caf50' : '#ff9800'}
        />
      );
    })}
    <Stat label="重量" value={`${item.weight}kg`} />
  </div>
);

export const ScavengeItemCodex = ({ onClose }: ScavengeItemCodexProps) => {
  const [tab, setTab] = useState<'all' | ItemType>('all');

  const filtered = useMemo(
    () => tab === 'all' ? ALL_ITEMS : ALL_ITEMS.filter(i => i.type === tab),
    [tab],
  );

  // 类型统计
  const counts: Record<'all' | ItemType, number> = useMemo(() => {
    const result = { all: ALL_ITEMS.length, consumable: 0, material: 0, equipment: 0, quest: 0 };
    for (const i of ALL_ITEMS) result[i.type] += 1;
    return result;
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.codex} onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题 */}
        <div className={styles.codexHeader}>
          <h2 className={styles.codexTitle}>
            <Icon icon={inventory} className={styles.titleIcon} />
            物品图鉴
          </h2>
          <span className={styles.codexHint}>共 {ALL_ITEMS.length} 种物品</span>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 类型 tab */}
        <div className={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.key}
              className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className={styles.tabCount}>({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {/* 物品卡片网格 */}
        <div className={styles.itemGrid}>
          {filtered.map((item: Item) => {
            const rarityColor = RARITY_COLORS[item.rarity];
            return (
              <div
                key={item.id}
                className={styles.itemCard}
                style={{ borderColor: rarityColor }}
              >
                {/* 卡片头 */}
                <div className={styles.cardHeader}>
                  <div className={styles.itemName}>
                    <Icon icon={getItemIcon(item.id)} className={styles.itemIcon} />
                    <span>{getItemName(item.id)}</span>
                  </div>
                  <div className={styles.tagsRow}>
                    <span className={styles.typeTag}>{TYPE_LABEL[item.type]}</span>
                    <span
                      className={styles.rarityTag}
                      style={{ background: rarityColor, color: '#000' }}
                    >
                      {RARITY_NAMES[item.rarity]}
                    </span>
                  </div>
                </div>

                {/* 描述 */}
                <div className={styles.itemDesc}>{item.description}</div>

                {/* 关键属性 */}
                {item.type === 'equipment' && <EquipmentDetails item={item as EquipmentItem} />}
                {item.type === 'consumable' && <ConsumableDetails item={item as ConsumableItem} />}
                {item.type === 'material' && (
                  <div className={styles.detailsGrid}>
                    <Stat label="重量" value={`${item.weight}kg`} />
                    <Stat label="堆叠" value={item.maxStack} />
                  </div>
                )}
                {item.type === 'quest' && (
                  <div className={styles.detailsGrid}>
                    <Stat label="重量" value={`${item.weight}kg`} />
                    <Stat label="堆叠" value={item.maxStack} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
