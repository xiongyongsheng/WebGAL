import { useState } from 'react';
import { Icon } from '@iconify/react';
import backpack from '@iconify-icons/material-symbols/backpack-outline';
import { ScavengeCharacter } from '../character';
import { InventoryItem } from '../../ScavengeItems/inventory';
import { getItemName, getItemIcon, getItemRarityColor, getItemById, isEquipment, isConsumable } from '../../ScavengeItems/items';
import styles from './ScavengeCharacterInventory.module.scss';

type ItemFilter = 'all' | 'consumable' | 'equipment' | 'material';

interface ScavengeCharacterInventoryProps {
  inventory: InventoryItem[];
  totalWeight: number;
  maxWeight: number;
  onItemClick: (invItem: InventoryItem, e: React.MouseEvent) => void;
  itemFilter: ItemFilter;
  onFilterChange: (filter: ItemFilter) => void;
  selectedItem: InventoryItem | null;
  showItemMenu: boolean;
  menuPosition: { x: number; y: number };
  actionQuantity: number;
  onQuantityChange: (qty: number) => void;
  onExecuteAction: (action: string) => void;
  onCloseMenu: () => void;
}

export const ScavengeCharacterInventory = ({
  inventory,
  totalWeight,
  maxWeight,
  onItemClick,
  itemFilter,
  onFilterChange,
  selectedItem,
  showItemMenu,
  menuPosition,
  actionQuantity,
  onQuantityChange,
  onExecuteAction,
  onCloseMenu,
}: ScavengeCharacterInventoryProps) => {
  // 过滤物品
  const filteredInventory = inventory.filter(invItem => {
    if (itemFilter === 'all') return true;
    if (itemFilter === 'consumable') return isConsumable(invItem.itemId);
    if (itemFilter === 'equipment') return isEquipment(invItem.itemId);
    if (itemFilter === 'material') return invItem.itemId.startsWith('material_');
    return true;
  });

  const weightPercent = (totalWeight / maxWeight) * 100;
  const remaining = maxWeight - totalWeight;

  return (
    <div className={styles.inventoryPanel}>
      <div className={styles.sectionTitle}>
        <Icon icon={backpack} className={styles.sectionIcon} />
        <span>背包</span>
      </div>

      {/* 筛选标签 */}
      <div className={styles.filterTabs}>
        {(['all', 'consumable', 'equipment', 'material'] as ItemFilter[]).map(filter => (
          <button
            key={filter}
            className={`${styles.filterTab} ${itemFilter === filter ? styles.active : ''}`}
            onClick={() => onFilterChange(filter)}
          >
            {filter === 'all' ? '全部' : filter === 'consumable' ? '消耗品' : filter === 'equipment' ? '装备' : '材料'}
          </button>
        ))}
      </div>

      {/* 负重信息 */}
      <div className={styles.weightInfo}>
        <div className={styles.weightBar}>
          <div
            className={styles.weightFill}
            style={{
              width: `${weightPercent}%`,
              backgroundColor: remaining > 10 ? '#4CAF50' : remaining > 5 ? '#FFC107' : '#F44336',
            }}
          />
        </div>
        <span className={styles.weightText}>
          {totalWeight.toFixed(1)}/{maxWeight}kg
        </span>
      </div>

      {/* 物品网格 */}
      {filteredInventory.length === 0 ? (
        <div className={styles.empty}>背包是空的</div>
      ) : (
        <div className={styles.inventoryGrid}>
          {filteredInventory.map((invItem, index) => {
            const rarityColor = getItemRarityColor(invItem.itemId);
            return (
              <div
                key={`${invItem.itemId}-${index}`}
                className={styles.gridItem}
                onClick={(e) => onItemClick(invItem, e)}
              >
                <div className={styles.itemIcon} style={{ color: rarityColor }}>
                  <Icon icon={getItemIcon(invItem.itemId)} />
                </div>
                <div className={styles.itemQuantity}>x{invItem.quantity}</div>
                {invItem.durability !== undefined && (
                  <div className={styles.itemDurability}>
                    <div
                      className={styles.itemDurabilityBar}
                      style={{
                        width: `${invItem.durability}%`,
                        backgroundColor: invItem.durability > 50 ? '#4CAF50' : '#F44336',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 物品操作菜单 */}
      {showItemMenu && selectedItem && (
        <div className={styles.itemMenuOverlay} onClick={onCloseMenu}>
          <div
            className={styles.itemMenu}
            style={{ left: menuPosition.x, top: menuPosition.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.itemMenuHeader}>
              <span className={styles.itemMenuName} style={{ color: getItemRarityColor(selectedItem.itemId) }}>
                {getItemName(selectedItem.itemId)}
              </span>
              <span className={styles.itemMenuQuantity}>x{selectedItem.quantity}</span>
            </div>

            {selectedItem.quantity > 1 && (
              <div className={styles.quantitySelector}>
                <span className={styles.quantityLabel}>数量:</span>
                <button className={styles.quantityBtn} onClick={() => onQuantityChange(Math.max(1, actionQuantity - 1))}>
                  -
                </button>
                <input
                  type="number"
                  className={styles.quantityInput}
                  value={actionQuantity}
                  min={1}
                  max={selectedItem.quantity}
                  onChange={(e) => onQuantityChange(Math.min(selectedItem.quantity, Math.max(1, parseInt(e.target.value) || 1)))}
                />
                <button className={styles.quantityBtn} onClick={() => onQuantityChange(Math.min(selectedItem.quantity, actionQuantity + 1))}>
                  +
                </button>
                <div className={styles.quantitySlider}>
                  <input
                    type="range"
                    min={1}
                    max={selectedItem.quantity}
                    value={actionQuantity}
                    onChange={(e) => onQuantityChange(parseInt(e.target.value))}
                  />
                </div>
              </div>
            )}

            <div className={styles.itemMenuActions}>
              {isConsumable(selectedItem.itemId) && (
                <button className={styles.menuActionBtn} onClick={() => onExecuteAction('use')}>
                  <Icon icon="material-symbols:check-circle-outline" />
                  使用
                </button>
              )}
              {isEquipment(selectedItem.itemId) && (
                <button className={styles.menuActionBtn} onClick={() => onExecuteAction('equip')}>
                  <Icon icon="material-symbols:build" />
                  装备
                </button>
              )}
              <button className={styles.menuActionBtn} onClick={() => onExecuteAction('discard')}>
                <Icon icon="material-symbols:delete-outline" />
                丢弃
              </button>
              <button className={styles.menuActionBtn} onClick={onCloseMenu}>
                <Icon icon="material-symbols:close" />
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};