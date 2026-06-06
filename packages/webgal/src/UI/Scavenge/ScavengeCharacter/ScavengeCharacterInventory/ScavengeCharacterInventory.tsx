import { Icon } from '@iconify/react';
import backpack from '@iconify-icons/material-symbols/backpack-outline';
import { InventoryItem } from '../../ScavengeItems/inventory';
import { getItemName, getItemIcon, getItemRarityColor, isEquipment, isConsumable, isQuestItem } from '../../ScavengeItems/items';
import styles from './ScavengeCharacterInventory.module.scss';

type ItemFilter = 'all' | 'consumable' | 'equipment' | 'material' | 'quest';

interface ScavengeCharacterInventoryProps {
  /** 所属角色 ID（用于拖拽时标识 source） */
  characterId?: string;
  inventory: (InventoryItem | null)[];
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
  /** 转移请求回调（点击菜单"转移"时调用） */
  onTransferRequest?: (item: InventoryItem) => void;
  /** 物品拖拽开始（用于全局面板统一管理拖拽状态） */
  onItemDragStart?: (item: InventoryItem, e: React.DragEvent) => void;
  /** 物品拖拽结束 */
  onItemDragEnd?: () => void;
  /** 卡片作为 drop target 的回调（其他卡片拖到这张卡片时） */
  onCardDrop?: (e: React.DragEvent) => void;
  /** 是否有 drag 元素悬停在本卡上（用于高亮） */
  isCardDragOver?: boolean;
}

export const ScavengeCharacterInventory = ({
  characterId,
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
  onTransferRequest,
  onItemDragStart,
  onItemDragEnd,
  onCardDrop,
  isCardDragOver,
}: ScavengeCharacterInventoryProps) => {
  const filteredInventory: (InventoryItem | null)[] = (() => {
    if (itemFilter === 'all') {
      return inventory;
    }
    return inventory.filter((invItem): invItem is InventoryItem => {
      if (!invItem) return false;
      if (itemFilter === 'consumable') return isConsumable(invItem.itemId);
      if (itemFilter === 'equipment') return isEquipment(invItem.itemId);
      if (itemFilter === 'material') return invItem.itemId.startsWith('material_');
      if (itemFilter === 'quest') return isQuestItem(invItem.itemId);
      return true;
    });
  })();

  const weightPercent = (totalWeight / maxWeight) * 100;
  const remaining = maxWeight - totalWeight;

  return (
    <div
      className={`${styles.inventoryPanel} ${isCardDragOver ? styles.dropTargetOver : ''}`}
      onDragOver={(e) => {
        if (onCardDrop) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(e) => {
        if (onCardDrop) {
          e.preventDefault();
          onCardDrop(e);
        }
      }}
    >
      <div className={styles.sectionTitle}>
        <Icon icon={backpack} className={styles.sectionIcon} />
        <span>背包</span>
      </div>

      <div className={styles.filterTabs}>
        {(['all', 'consumable', 'equipment', 'material', 'quest'] as ItemFilter[]).map(filter => (
          <button
            key={filter}
            className={`${styles.filterTab} ${itemFilter === filter ? styles.active : ''}`}
            onClick={() => onFilterChange(filter)}
          >
            {filter === 'all' ? '全部' :
             filter === 'consumable' ? '消耗品' :
             filter === 'equipment' ? '装备' :
             filter === 'material' ? '材料' : '任务'}
          </button>
        ))}
      </div>

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

      {filteredInventory.every((slot) => slot === null) ? (
        <div className={styles.empty}>背包是空的</div>
      ) : (
        <div className={styles.inventoryGrid}>
          {filteredInventory.map((invItem, index) => {
            if (!invItem) {
              return <div key={`empty-${index}`} className={styles.gridItemEmpty} />;
            }
            const rarityColor = getItemRarityColor(invItem.itemId);
            return (
              <div
                key={invItem.instanceId}
                className={styles.gridItem}
                draggable={!!onItemDragStart}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/scavenge-instance-id', invItem.instanceId);
                  e.dataTransfer.setData('text/scavenge-item-id', invItem.itemId);
                  e.dataTransfer.setData('text/scavenge-source-char', characterId ?? '');
                  e.dataTransfer.effectAllowed = 'move';
                  onItemDragStart?.(invItem, e);
                }}
                onDragEnd={() => onItemDragEnd?.()}
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
                <div className={styles.quantityRow}>
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
                  <button
                    className={styles.quantityMaxBtn}
                    onClick={() => onQuantityChange(selectedItem.quantity)}
                    disabled={actionQuantity >= selectedItem.quantity}
                    title="设为最大"
                  >
                    MAX
                  </button>
                </div>
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
              {onTransferRequest && (
                <button className={styles.menuActionBtn} onClick={() => onTransferRequest(selectedItem)}>
                  <Icon icon="material-symbols:swap-horiz" />
                  转移
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
