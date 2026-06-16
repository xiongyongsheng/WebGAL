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
import closeIcon from '@iconify-icons/material-symbols/close';
import { ScavengeCharacter, EquipSlotKey } from '../character';
import {
  getItemName, getItemById, meetsEquipmentRequirements, isEquipment,
  ArmorSlot, ARMOR_SLOT_NAMES,
} from '../../ScavengeItems/items';
import { getItemDurability, getItemMaxDurability, getItemCurrentStealth, InventoryItem } from '../../ScavengeItems/inventory';
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

interface EquipCellProps {
  /** 装备图标 */
  icon: typeof swords;
  /** 装备的 itemId（undefined = 未装备） */
  equipId?: string;
  /** 装备的耐久（数字，0~max） */
  durability?: number;
  /** 装备的最大耐久 */
  maxDurability?: number;
  /** 是否满足使用门槛（不满足时边框黄色） */
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

// 2026-06-09 改：水平条 EquipRow → 方形 EquipCell
// 和背包格子保持一致：aspect-ratio 1 + 1fr，hover 时右下角圆形 X 卸下按钮
// 状态（损坏/不满足需求/低耐久）用耐久条颜色 + 角标表示，不污染边框
const EquipCell = ({
  icon, equipId, durability, maxDurability,
  meetsRequirements, onUnequip, hoverProps,
}: EquipCellProps) => {
  const isEquipped = !!equipId;
  const durRatio = isEquipped && maxDurability !== undefined && maxDurability > 0
    ? Math.max(0, Math.min(1, (durability ?? 0) / maxDurability))
    : 0;
  const isBroken = isEquipped && (durability ?? 0) <= 0;
  // 角标：损坏 或 需求不满足 时显示感叹号
  const showWarn = isEquipped && (isBroken || !meetsRequirements);

  return (
    <div
      className={styles.equipCell}
      title={isEquipped ? getItemName(equipId!) : '空槽'}
      {...(hoverProps ?? {})}
    >
      {isEquipped ? (
        <Icon icon={icon} className={styles.cellIcon} />
      ) : (
        <div className={styles.cellEmpty}>空</div>
      )}
      {isEquipped && maxDurability !== undefined && maxDurability > 0 && (
        <div className={styles.cellDurabilityTrack}>
          <div
            className={styles.cellDurabilityFill}
            style={{
              width: `${durRatio * 100}%`,
              backgroundColor: durabilityColor(durRatio),
            }}
          />
        </div>
      )}
      {showWarn && <div className={styles.cellWarnBadge}>!</div>}
      {isEquipped && (
        <button
          className={styles.cellUnequipBtn}
          onClick={onUnequip}
          title="卸下"
        >
          <Icon icon={closeIcon} className={styles.cellUnequipIcon} />
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
  // 2026-06-09 修：stealth 只在 equipment 上定义，需类型收窄
  const weaponStealth = weaponDef && isEquipment(weaponInstance?.itemId ?? '') && weaponDef.type === 'equipment' ? weaponDef.stealth : undefined;
  const weaponMeetsReq = weaponDef
    ? meetsEquipmentRequirements(charData, weaponDef.type === 'equipment' ? weaponDef.requirements ?? null : null)
    : true;
  const weaponDur = weaponInstance ? getItemDurability(weaponInstance) : undefined;
  const weaponMaxDur = weaponInstance ? getItemMaxDurability(weaponInstance) : undefined;
  // 2026-06-08 加：当前潜行值（按耐久缩放）
  const weaponCurrentStealth = weaponInstance ? getItemCurrentStealth(weaponInstance) : undefined;

  // 工具栏
  const toolInstance = charData.equipped?.tool;
  const toolDef = toolInstance ? getItemById(toolInstance.itemId) : undefined;
  const toolMeetsReq = toolDef
    ? meetsEquipmentRequirements(charData, toolDef.type === 'equipment' ? toolDef.requirements ?? null : null)
    : true;
  const toolDur = toolInstance ? getItemDurability(toolInstance) : undefined;
  const toolMaxDur = toolInstance ? getItemMaxDurability(toolInstance) : undefined;
  // 2026-06-09 修：stealth 收窄到 equipment
  const toolStealth = toolDef && isEquipment(toolInstance?.itemId ?? '') && toolDef.type === 'equipment' ? toolDef.stealth : undefined;
  const toolCurrentStealth = toolInstance ? getItemCurrentStealth(toolInstance) : undefined;

  return (
    <div className={styles.equipPanel}>
      <div className={styles.sectionTitle}>装备</div>

      {/* 2026-06-09 改：左右两组（左边 2*3 护甲 + 右边 1*2 武器/工具），中间留空 */}
      <div className={styles.equipLayout}>
        {/* 左边：6 护甲 2*3 网格 */}
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
                <EquipCell
                  key={field}
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

        {/* 右边：武器 + 工具 1*2 网格，中间留空 */}
        <div className={styles.equipGroup}>
          <div className={styles.groupTitle}>武器 / 工具</div>
          <div className={styles.weaponToolGrid}>
            <EquipCell
              icon={swords}
              equipId={charData.weaponId}
              durability={weaponDur}
              maxDurability={weaponMaxDur}
              meetsRequirements={weaponMeetsReq}
              onUnequip={() => onUnequip('weapon')}
              hoverProps={charData.weaponId ? makeItemHoverProps(charData.weaponId, weaponInstance, charData) : undefined}
            />
            <EquipCell
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
      </div>
    </div>
  );
};
