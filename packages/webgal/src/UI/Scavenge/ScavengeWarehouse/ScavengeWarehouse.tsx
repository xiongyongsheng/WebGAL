import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { Icon } from '@iconify/react';
import { getItemName, getItemIcon, getItemRarityColor } from '../ScavengeItems/items';
import { InventoryItem } from '../ScavengeItems/inventory';
import styles from './ScavengeWarehouse.module.scss';

interface ScavengeWarehouseProps {
  onClose: () => void;
  /** 嵌入模式：用于角色面板内嵌，不显示外层 overlay 和关闭按钮 */
  embedded?: boolean;
}

type TabType = 'all' | 'consumable' | 'material' | 'equipment' | 'quest';

export const ScavengeWarehouse = ({ onClose, embedded = false }: ScavengeWarehouseProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const stageState = useStageState();

  // 从 GameVar 获取仓库数据
  const getWarehouseItems = (): InventoryItem[] => {
    const warehouse = stageState.GameVar['scavenge_warehouse'];
    if (Array.isArray(warehouse)) {
      return warehouse as unknown as InventoryItem[];
    }
    return [];
  };

  const items = getWarehouseItems();

  // 按类型筛选
  const filterItems = (tab: TabType) => {
    if (tab === 'all') return items;
    const typeMap: Record<TabType, string> = {
      all: '',
      consumable: 'consumable',
      material: 'material',
      equipment: 'equipment',
      quest: 'quest',
    };
    return items; // 实际筛选逻辑需要物品类型信息
  };

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: items.length },
    {
      key: 'consumable',
      label: '消耗品',
      count: items.filter((i) => i.itemId.startsWith('food_') || i.itemId.startsWith('drink_') || i.itemId.startsWith('medicine_')).length,
    },
    {
      key: 'material',
      label: '材料',
      count: items.filter((i) => i.itemId.startsWith('material_')).length,
    },
    {
      key: 'equipment',
      label: '装备',
      count: items.filter((i) => i.itemId.startsWith('weapon_') || i.itemId.startsWith('armor_') || i.itemId.startsWith('tool_')).length,
    },
    {
      key: 'quest',
      label: '任务',
      count: items.filter((i) => i.itemId.startsWith('quest_')).length,
    },
  ];

  const content = (
    <>
      {/* 标题栏（嵌入模式不显示关闭按钮） */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Icon icon="material-symbols:warehouse-outline" className={styles.titleIcon} />
          <h2 className={styles.title}>仓库</h2>
        </div>
        {!embedded && (
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon="material-symbols:close" />
          </button>
        )}
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
        {items.length === 0 ? (
          <div className={styles.empty}>仓库是空的</div>
        ) : (
          items.map((invItem, index) => {
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
                        width: `${(invItem.durability / 100) * 100}%`,
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
    </>
  );

  if (embedded) {
    return <div className={styles.embeddedRoot}>{content}</div>;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
};