/**
 * Scavenge 模块 - 物品详情弹框（hover tooltip）
 *
 * 2026-06-07 新增：所有物品（装备/消耗品/材料/任务）hover 时显示完整属性。
 * 通过 portal 渲染到 document.body 避免被父级 overflow 裁切。
 */
import { createPortal } from 'react-dom';
import { Icon } from '@iconify/react';
import {
  getItemName, getItemIcon, getItemRarityColor, getItemRarityName,
  getItemById,
  isEquipment, isConsumable, isMaterial, isQuestItem, isWeapon, isArmor,
  getWeaponSpeedModifier, getArmorSlot,
  meetsEquipmentRequirements, getEquipmentRequirements,
  SPEED_MODIFIER_MULTIPLIER, ARMOR_SLOT_NAMES,
  WeaponSpeedModifier, ItemType, ArmorSlot,
} from './items';
import type { EquipmentItem, ConsumableItem, Item } from './items';
import { InventoryItem, getItemDurability, getItemMaxDurability } from './inventory';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import styles from './ItemTooltip.module.scss';

export interface ItemTooltipData {
  itemId: string;
  instance?: InventoryItem;
  x: number;
  y: number;
  /** 可选：传入角色用于显示"是否满足 requirements"（装备专用） */
  charForReq?: Pick<ScavengeCharacter, 'str' | 'agi' | 'end' | 'int'>;
}

interface ItemTooltipProps {
  data: ItemTooltipData;
}

const TYPE_LABELS: Record<ItemType, string> = {
  weapon: '武器',
  armor: '护甲',
  tool: '工具',
  consumable: '消耗品',
  material: '材料',
  quest: '任务物品',
};

const SPEED_MOD_LABELS: Record<WeaponSpeedModifier, string> = {
  fast: '快速',
  normal: '普通',
  slow: '缓慢',
};

const durColor = (ratio: number): string => {
  if (ratio >= 0.6) return '#4CAF50';
  if (ratio >= 0.3) return '#FFC107';
  return '#F44336';
};

const fmtStat = (attr: { str?: number; agi?: number; end?: number; int?: number } | undefined): { str: number; agi: number; end: number; int: number } => ({
  str: attr?.str ?? 0,
  agi: attr?.agi ?? 0,
  end: attr?.end ?? 0,
  int: attr?.int ?? 0,
});

/** 位置避让：防止 tooltip 越出视口右边/下边 */
const clampPosition = (x: number, y: number): { left: number; top: number } => {
  const offset = 14;
  const tooltipW = 280; // 预估
  const tooltipH = 240; // 预估
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + offset;
  let top = y + offset;
  if (left + tooltipW > vw) left = Math.max(8, x - tooltipW - offset);
  if (top + tooltipH > vh) top = Math.max(8, y - tooltipH - offset);
  return { left, top };
};

// ============== 各类型详情渲染 ==============

interface RenderContext {
  def: Item;
  instance?: InventoryItem;
  charForReq?: Pick<ScavengeCharacter, 'str' | 'agi' | 'end' | 'int'>;
}

const renderWeaponDetails = ({ def, instance, charForReq }: RenderContext) => {
  const equip = def as EquipmentItem;
  const reqs = getEquipmentRequirements(equip.id);
  const speedMod = getWeaponSpeedModifier(equip.id);
  const meetsReq = charForReq
    ? meetsEquipmentRequirements(charForReq, reqs)
    : true;
  return (
    <>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>伤害范围</span>
        <span className={styles.detailValue}>
          {equip.damageRange ? `${equip.damageRange[0]} ~ ${equip.damageRange[1]}` : '?'}
        </span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>速度标签</span>
        <span className={styles.detailValue}>
          {SPEED_MOD_LABELS[speedMod]}
          <span className={styles.detailHint}>
            ×{SPEED_MODIFIER_MULTIPLIER[speedMod].toFixed(1)}
          </span>
        </span>
      </div>
      {reqs && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>使用门槛</span>
          <span
            className={styles.detailValue}
            style={{ color: meetsReq ? '#4CAF50' : '#F44336' }}
          >
            {Object.entries(reqs)
              .filter(([_, v]) => v !== undefined && v !== null)
              .map(([k, v]) => `${k.toUpperCase()} ≥ ${v}`)
              .join(' / ')}
            {!meetsReq && <span className={styles.detailHint}>（不满足）</span>}
          </span>
        </div>
      )}
      {renderDurability(instance, equip)}
    </>
  );
};

const renderArmorDetails = ({ def, instance, charForReq }: RenderContext) => {
  const equip = def as EquipmentItem;
  const slot: ArmorSlot | null = getArmorSlot(equip.id);
  const reqs = getEquipmentRequirements(equip.id);
  const meetsReq = charForReq
    ? meetsEquipmentRequirements(charForReq, reqs)
    : true;
  return (
    <>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>部位</span>
        <span className={styles.detailValue}>
          {slot ? ARMOR_SLOT_NAMES[slot] : '?'}
        </span>
      </div>
      {reqs && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>使用门槛</span>
          <span
            className={styles.detailValue}
            style={{ color: meetsReq ? '#4CAF50' : '#F44336' }}
          >
            {Object.entries(reqs)
              .filter(([_, v]) => v !== undefined && v !== null)
              .map(([k, v]) => `${k.toUpperCase()} ≥ ${v}`)
              .join(' / ')}
            {!meetsReq && <span className={styles.detailHint}>（不满足）</span>}
          </span>
        </div>
      )}
      {renderDurability(instance, equip)}
    </>
  );
};

const renderToolDetails = ({ def, instance }: RenderContext) => {
  const equip = def as EquipmentItem;
  return (
    <>
      {renderAttributes(equip.attributes)}
      {renderDurability(instance, equip)}
    </>
  );
};

const renderDurability = (instance: InventoryItem | undefined, equip: EquipmentItem) => {
  if (!instance) {
    return (
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>耐久</span>
        <span className={styles.detailValue}>
          {equip.maxDurability}/{equip.maxDurability}
          <span className={styles.detailHint}>（满耐久）</span>
        </span>
      </div>
    );
  }
  const cur = getItemDurability(instance);
  const max = getItemMaxDurability(instance);
  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>耐久</span>
      <span className={styles.detailValue} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          className={styles.durabilityBar}
          style={{
            width: 60,
            height: 6,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              display: 'block',
              width: `${ratio * 100}%`,
              height: '100%',
              background: durColor(ratio),
            }}
          />
        </span>
        <span style={{ color: durColor(ratio), fontWeight: 600 }}>{cur}/{max}</span>
      </span>
    </div>
  );
};

const renderAttributes = (attributes: { str?: number; agi?: number; end?: number; int?: number } | undefined) => {
  const a = fmtStat(attributes);
  const parts: string[] = [];
  if (a.str) parts.push(`力量 +${a.str}`);
  if (a.agi) parts.push(`敏捷 +${a.agi}`);
  if (a.end) parts.push(`耐力 +${a.end}`);
  if (a.int) parts.push(`智力 +${a.int}`);
  if (parts.length === 0) return null;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>属性加成</span>
      <span className={styles.detailValue}>{parts.join('，')}</span>
    </div>
  );
};

const renderConsumableDetails = ({ def, instance }: RenderContext) => {
  const cons = def as ConsumableItem;
  const effectText = (eff: { type: string; value: number }): string => {
    const label = { hp: '生命值', hunger: '饥饿值', thirst: '口渴值', sanity: '精神值' } as Record<string, string>;
    return `${label[eff.type] ?? eff.type} ${eff.value > 0 ? '+' : ''}${eff.value}`;
  };
  return (
    <>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>效果</span>
        <span className={styles.detailValue}>
          {cons.effects.map(effectText).join(' / ')}
        </span>
      </div>
      {instance && instance.quantity > 1 && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>数量</span>
          <span className={styles.detailValue}>×{instance.quantity}</span>
        </div>
      )}
    </>
  );
};

const renderMaterialDetails = ({ def, instance }: RenderContext) => {
  if (!instance || instance.quantity <= 1) return null;
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>数量</span>
      <span className={styles.detailValue}>×{instance.quantity}</span>
    </div>
  );
};

const renderQuestDetails = () => {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>类型</span>
      <span className={styles.detailValue}>任务物品</span>
    </div>
  );
};

// ============== 主组件 ==============

export const ItemTooltip = ({ data }: ItemTooltipProps) => {
  const { itemId, instance, x, y, charForReq } = data;
  const def = getItemById(itemId);
  if (!def) {
    return null;
  }
  const rarityColor = getItemRarityColor(itemId);
  const rarityName = getItemRarityName(itemId);
  const typeLabel = TYPE_LABELS[def.type];
  const ctx: RenderContext = { def, instance, charForReq };

  // 选对应 renderer
  let details: React.ReactNode = null;
  if (isWeapon(itemId)) {
    details = renderWeaponDetails(ctx);
  } else if (isArmor(itemId)) {
    details = renderArmorDetails(ctx);
  } else if (isEquipment(itemId)) {
    details = renderToolDetails(ctx);
  } else if (isConsumable(itemId)) {
    details = renderConsumableDetails(ctx);
  } else if (isMaterial(itemId)) {
    details = renderMaterialDetails(ctx);
  } else if (isQuestItem(itemId)) {
    details = renderQuestDetails();
  }

  // 通用信息（重量、堆叠）
  const stackInfo = def.stackable
    ? `可堆叠 ×${def.maxStack}`
    : '不可堆叠';
  const weightInfo = `重量 ${def.weight}kg`;

  const pos = clampPosition(x, y);

  return createPortal(
    <div
      className={styles.tooltip}
      style={{ left: pos.left, top: pos.top, borderColor: rarityColor }}
    >
      {/* Header */}
      <div className={styles.header} style={{ borderBottomColor: rarityColor }}>
        <div className={styles.icon} style={{ color: rarityColor }}>
          <Icon icon={getItemIcon(itemId)} />
        </div>
        <div className={styles.headerText}>
          <div className={styles.name} style={{ color: rarityColor }}>
            {getItemName(itemId)}
          </div>
          <div className={styles.subline}>
            <span className={styles.typeLabel}>{typeLabel}</span>
            <span className={styles.rarityLabel} style={{ color: rarityColor }}>
              {rarityName}
            </span>
            {isEquipment(itemId) && def.type === 'equipment' && def.slot && (
              <span className={styles.slotLabel}>
                · {def.slot === 'weapon' ? '武器' : def.slot === 'armor' ? '护甲' : '工具'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <div className={styles.description}>{def.description}</div>

      {/* 装备/物品专属属性 */}
      {(isEquipment(itemId) || isConsumable(itemId)) && (
        <div className={styles.detailsBlock}>
          {details}
        </div>
      )}

      {/* 材料/任务：只显示数量 */}
      {(isMaterial(itemId) || isQuestItem(itemId)) && (
        <div className={styles.detailsBlock}>
          {details}
        </div>
      )}

      {/* 通用信息 */}
      <div className={styles.footer}>
        <span className={styles.footerItem}>{weightInfo}</span>
        <span className={styles.footerDivider}>·</span>
        <span className={styles.footerItem}>{stackInfo}</span>
        {def.type === 'equipment' && def.maxDurability > 0 && (
          <>
            <span className={styles.footerDivider}>·</span>
            <span className={styles.footerItem}>最大耐久 {def.maxDurability}</span>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
