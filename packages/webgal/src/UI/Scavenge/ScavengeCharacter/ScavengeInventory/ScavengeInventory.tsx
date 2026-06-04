import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { Icon } from '@iconify/react';
import { getItemName, getItemIcon, getItemRarityColor, isEquipment, getItemById } from '../../ScavengeItems/items';
import { InventoryItem } from '../../ScavengeItems/inventory';
import { CHARACTER_MAX_CARRY_WEIGHT } from './inventory';
import styles from './ScavengeInventory.module.scss';

interface ScavengeInventoryProps {
  characterId: string;
}

type TabType = 'all' | 'consumable' | 'material' | 'equipment';

export const ScavengeInventory = ({ characterId }: ScavengeInventoryProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const stageState = useStageState();

  // 获取背包数据
  const getInventory = (): InventoryItem[] => {
    const key = `scavenge_inventory_${characterId}`;
    const inventory = stageState.GameVar[key];
    if (Array.isArray(inventory)) {
      return inventory as unknown as InventoryItem[];
    }
    return [];
  };

  // 计算背包总重量
  const calculateWeight = (): number => {
    const inventory = getInventory();
    return inventory.reduce((total, invItem) => {
      const item = getItemById(invItem.itemId);
      if (item) {
        return total + item.weight * invItem.quantity;
      }
      return total;
    }, 0);
  };

  const inventory = getInventory();
  const totalWeight = calculateWeight();
  const remainingWeight = CHARACTER_MAX_CARRY_WEIGHT - totalWeight;

  // 标签页统计
  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: inventory.length },
    {
      key: 'consumable',
      label: '消耗品',
      count: inventory.filter((i) =>
        i.itemId.startsWith('food_') || i.itemId.startsWith('drink_') || i.itemId.startsWith('medicine_')
      ).length,
    },
    {
      key: 'material',
      label: '材料',
      count: inventory.filter((i) => i.itemId.startsWith('material_')).length,
    },
    {
      key: 'equipment',
      label: '装备',
      count: inventory.filter((i) => isEquipment(i.itemId)).length,
    },
  ];

  return (
    <div className={styles.container}>
      {/* 标题和负重信息 */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Icon icon="material-symbols:backpack-outline" className={styles.titleIcon} />
          <span className={styles.title}>背包</span>
        </div>
        <div className={styles.weightInfo}>
          <div className={styles.weightBar}>
            <div
              className={styles.weightFill}
              style={{
                width: `${(totalWeight / CHARACTER_MAX_CARRY_WEIGHT) * 100}%`,
                backgroundColor: remainingWeight > 10 ? '#4CAF50' : remainingWeight > 5 ? '#FFC107' : '#F44336',
              }}
            />
          </div>
          <span className={styles.weightText}>
            {totalWeight.toFixed(1)}/{CHARACTER_MAX_CARRY_WEIGHT}kg
          </span>
        </div>
      </div>

      {/* 标签页 */}
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className={styles.tabCount}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* 物品列表 */}
      <div className={styles.itemList}>
        {inventory.length === 0 ? (
          <div className={styles.empty}>背包是空的</div>
        ) : (
          inventory.map((invItem, index) => {
            const rarityColor = getItemRarityColor(invItem.itemId);
            return (
              <div key={`${invItem.itemId}-${index}`} className={styles.itemCard}>
                <div className={styles.itemIcon} style={{ color: rarityColor }}>
                  <Icon icon={getItemIcon(invItem.itemId)} />
                </div>
                <div className={styles.itemInfo}>
                  <span className={styles.itemName}>{getItemName(invItem.itemId)}</span>
                  <span className={styles.itemQuantity}>x{invItem.quantity}</span>
                </div>
                {invItem.durability !== undefined && (
                  <div className={styles.durability}>
                    <div
                      className={styles.durabilityBar}
                      style={{
                        width: `${invItem.durability}%`,
                        backgroundColor: invItem.durability > 50 ? '#4CAF50' : '#F44336',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
