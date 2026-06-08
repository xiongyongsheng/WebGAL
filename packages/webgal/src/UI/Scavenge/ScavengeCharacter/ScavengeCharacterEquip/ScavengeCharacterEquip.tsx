/**
 * Scavenge 模块 - 角色装备区
 *
 * 2026-06-07 改：
 * - 护甲分 6 个部位（helmet/chest/arms/gloves/legs/boots）
 * - 每件装备显示耐久条
 * - 未达 requirements 的装备显示红字 + 禁用卸下
 */
import { Icon } from '@iconify/react';
import swords from '@iconify-icons/material-symbols/swords';
import shield from '@iconify-icons/material-symbols/shield';
import build from '@iconify-icons/material-symbols/build';
import { ScavengeCharacter, EquipSlotKey } from '../character';
import {
  getItemName, getItemById, meetsEquipmentRequirements,
  ArmorSlot, ARMOR_SLOT_NAMES,
} from '../../ScavengeItems/items';
import { getItemDurability, getItemMaxDurability, InventoryItem } from '../../ScavengeItems/inventory';
import styles from './ScavengeCharacterEquip.module.scss';

/** 装备 slot 类型（2026-06-07 改） */
type EquipSlot = 'weapon' | 'tool' | ArmorSlot;

interface ScavengeCharacterEquipProps {
  charData: ScavengeCharacter;
  onUnequip: (slot: EquipSlot) => void;
  /** hover 弹 tooltip 的事件集工厂（panel 共享 state） */
  makeItemHoverProps: (
    itemId: string,
    instance?: InventoryItem,
    charForReq?: Pick<ScavengeCharacter, 'str' | 'agi' | 'end' | 'int'>,
  ) => {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
}

/** 装备 slot 到 equipped 字段的映射 */
const equipKeyFor = (slot: EquipSlot): EquipSlotKey =>
  slot === 'weapon' ? 'weapon' : slot === 'tool' ? 'tool' : slot;

/** 耐久条颜色（红/黄/绿） */
const durabilityColor = (ratio: number): string => {
  if (ratio >= 0.6) return '#4CAF50';
  if (ratio >= 0.3) return '#FFC107';
  return '#F44336';
};

interface EquipRowProps {
  /** 显示用名字（"头盔" / "武器" 等） */
  displayName: string;
  /** 装备图标 */
  icon: typeof swords;
  /** 装备的 itemId（undefined = 未装备） */
  equipId?: string;
  /** 装备的耐久（数字，0~max） */
  durability?: number;
  /** 装备的最大耐久 */
  maxDurability?: number;
  /** 是否满足使用门槛（不满足时显示警告） */
  meetsRequirements: boolean;
  /** 卸下回调 */
  onUnequip: () => void;
  /** 鼠标事件集（用于弹 tooltip） */
  hoverProps?: {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
}

const EquipRow = ({
  displayName, icon, equipId, durability, maxDurability,
  meetsRequirements, onUnequip, hoverProps,
}: EquipRowProps) => {
  const durRatio = (durability !== undefined && maxDurability && maxDurability > 0)
    ? Math.max(0, Math.min(1, durability / maxDurability))
    : 0;
  const isBroken = durability !== undefined && durability <= 0;

  return (
    <div
      className={styles.equipItem}
      {...(hoverProps ?? {})}
    >
      <div className={styles.equipIcon}>
        <Icon icon={icon} className={styles.iconSvg} />
      </div>
      <div className={styles.equipInfo}>
        <div className={styles.equipHeader}>
          <span className={styles.equipType}>{displayName}</span>
          {equipId ? (
            <span className={styles.equipName}>{getItemName(equipId)}</span>
          ) : (
            <span className={styles.equipEmpty}>未装备</span>
          )}
        </div>
        {equipId && durability !== undefined && maxDurability !== undefined && (
          <div className={styles.durabilityRow}>
            <div className={styles.durabilityTrack}>
              <div
                className={styles.durabilityFill}
                style={{
                  width: `${durRatio * 100}%`,
                  backgroundColor: durabilityColor(durRatio),
                }}
              />
            </div>
            <span className={styles.durabilityText} style={{ color: durabilityColor(durRatio) }}>
              {durability}/{maxDurability}
            </span>
          </div>
        )}
        {equipId && !meetsRequirements && (
          <div className={styles.reqWarning}>属性不满足，无法使用</div>
        )}
        {equipId && isBroken && meetsRequirements && (
          <div className={styles.brokenWarning}>已损坏</div>
        )}
      </div>
      {equipId && (
        <button className={styles.unequipButton} onClick={onUnequip}>
          卸下
        </button>
      )}
    </div>
  );
};

export const ScavengeCharacterEquip = ({
  charData, onUnequip, makeItemHoverProps,
}: ScavengeCharacterEquipProps) => {
  // 6 护甲 slot 配置
  const armorSlots: Array<{ field: keyof ScavengeCharacter; kind: ArmorSlot; icon: typeof swords }> = [
    { field: 'helmetId', kind: 'helmet', icon: shield },
    { field: 'chestId', kind: 'chest', icon: shield },
    { field: 'armsId', kind: 'arms', icon: shield },
    { field: 'glovesId', kind: 'gloves', icon: shield },
    { field: 'legsId', kind: 'legs', icon: shield },
    { field: 'bootsId', kind: 'boots', icon: shield },
  ];

  // 武器栏
  const weaponInstance = charData.equipped?.weapon;
  const weaponDef = weaponInstance ? getItemById(weaponInstance.itemId) : undefined;
  const weaponMeetsReq = weaponDef
    ? meetsEquipmentRequirements(charData, weaponDef.type === 'equipment' ? weaponDef.requirements ?? null : null)
    : true;
  const weaponDur = weaponInstance ? getItemDurability(weaponInstance) : undefined;
  const weaponMaxDur = weaponInstance ? getItemMaxDurability(weaponInstance) : undefined;

  // 工具栏
  const toolInstance = charData.equipped?.tool;
  const toolDef = toolInstance ? getItemById(toolInstance.itemId) : undefined;
  const toolMeetsReq = toolDef
    ? meetsEquipmentRequirements(charData, toolDef.type === 'equipment' ? toolDef.requirements ?? null : null)
    : true;
  const toolDur = toolInstance ? getItemDurability(toolInstance) : undefined;
  const toolMaxDur = toolInstance ? getItemMaxDurability(toolInstance) : undefined;

  return (
    <div className={styles.equipPanel}>
      <div className={styles.sectionTitle}>装备</div>

      {/* 武器 */}
      <div className={styles.equipGroup}>
        <div className={styles.groupTitle}>武器</div>
        <EquipRow
          displayName="武器"
          icon={swords}
          equipId={charData.weaponId}
          durability={weaponDur}
          maxDurability={weaponMaxDur}
          meetsRequirements={weaponMeetsReq}
          onUnequip={() => onUnequip('weapon')}
          hoverProps={charData.weaponId ? makeItemHoverProps(charData.weaponId, weaponInstance, charData) : undefined}
        />
      </div>

      {/* 护甲 6 部位 */}
      <div className={styles.equipGroup}>
        <div className={styles.groupTitle}>护甲</div>
        <div className={styles.armorGrid}>
          {armorSlots.map(({ field, kind, icon }) => {
            const itemId = charData[field] as string | undefined;
            const instance = charData.equipped?.[kind];
            const def = instance ? getItemById(instance.itemId) : undefined;
            const meetsReq = def
              ? meetsEquipmentRequirements(charData, def.type === 'equipment' ? def.requirements ?? null : null)
              : true;
            const dur = instance ? getItemDurability(instance) : undefined;
            const maxDur = instance ? getItemMaxDurability(instance) : undefined;
            return (
              <EquipRow
                key={field}
                displayName={ARMOR_SLOT_NAMES[kind]}
                icon={icon}
                equipId={itemId}
                durability={dur}
                maxDurability={maxDur}
                meetsRequirements={meetsReq}
                onUnequip={() => onUnequip(kind)}
                hoverProps={itemId ? makeItemHoverProps(itemId, instance, charData) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* 工具 */}
      <div className={styles.equipGroup}>
        <div className={styles.groupTitle}>工具</div>
        <EquipRow
          displayName="工具"
          icon={build}
          equipId={charData.toolId}
          durability={toolDur}
          maxDurability={toolMaxDur}
          meetsRequirements={toolMeetsReq}
          onUnequip={() => onUnequip('tool')}
          hoverProps={charData.toolId ? makeItemHoverProps(charData.toolId, toolInstance, charData) : undefined}
        />
      </div>
    </div>
  );
};
