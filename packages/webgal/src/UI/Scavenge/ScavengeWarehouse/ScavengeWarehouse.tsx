import { useState } from 'react';
import { Icon } from '@iconify/react';
import { getItemName, getItemIcon, getItemRarityColor } from '../ScavengeItems/items';
import { InventoryItem, getItemDurability, getItemMaxDurability } from '../ScavengeItems/inventory';
import styles from './ScavengeWarehouse.module.scss';

interface ScavengeWarehouseProps {
  onClose: () => void;
  /** 嵌入模式：用于角色面板内嵌，不显示外层 overlay 和关闭按钮 */
  embedded?: boolean;
  /** 物品列表（由父组件传入） */
  items: InventoryItem[];
  /** 点击物品回调（由父组件处理，弹转移菜单） */
  onItemClick?: (item: InventoryItem, e: React.MouseEvent) => void;
  /** 拖拽开始回调 */
  onItemDragStart?: (item: InventoryItem, e: React.DragEvent) => void;
  /** 拖拽结束回调 */
  onItemDragEnd?: () => void;
  /** 区域作为 drop target 的回调：item 从外部拖入（item 为传入的 item）或内部移动 */
  onDrop?: (e: React.DragEvent) => void;
  /** 当前是否有 drag 元素悬停（用于高亮） */
  isDragOver?: boolean;
  /** hover 弹 tooltip 的事件集工厂（panel 共享 state） */
  makeItemHoverProps?: (
    itemId: string,
    instance?: InventoryItem,
  ) => {
    onMouseEnter: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  /**
   * 自定义标题（2026-06-21 加：M1 阶段 - 战利品分配 modal）
   * - 不传：默认"仓库"（永久仓库）
   * - 传了：用这个标题（战利品分配时用"队伍背包"）
   */
  title?: string;
  /**
   * 自定义标题图标（2026-06-21 加）
   * - 不传：默认仓库图标
   * - 传了：用这个图标
   */
  titleIcon?: string;
  /**
   * 标题旁的操作按钮 slot（2026-06-21 加：M1 阶段 - 战利品分配 modal）
   * - 渲染在标题文字右边
   * - 例如"重置 / 智能分配 / 跳过 / 确认"等按钮
   */
  headerActions?: React.ReactNode;
  /**
   * 自定义空提示文字（2026-06-21 加：M1 阶段 - 战利品分配 modal）
   * - 不传：默认"仓库是空的"（永久仓库场景）
   * - 传了：用这个文字（战利品分配场景用"分配完毕"）
   */
  emptyMessage?: string;
}

type TabType = 'all' | 'consumable' | 'material' | 'equipment' | 'quest';

export const ScavengeWarehouse = ({
  onClose,
  embedded = false,
  items,
  onItemClick,
  onItemDragStart,
  onItemDragEnd,
  onDrop,
  isDragOver,
  makeItemHoverProps,
  title,
  titleIcon,
  headerActions,
  emptyMessage,
}: ScavengeWarehouseProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  // 2026-06-21 加：自定义标题（默认"仓库"）
  const headerTitle = title ?? '仓库';
  const headerIcon = titleIcon ?? 'material-symbols:warehouse-outline';

  // 防御性过滤：仓库永远不存 null 槽位，但脏数据可能存在
  const safeItems = items.filter((i): i is InventoryItem => i !== null);

  // 物品类型判定（与 tab 计数 / 过滤复用同一份规则，避免计数和列表对不上）
  const isConsumableItem = (id: string) =>
    id.startsWith('food_') || id.startsWith('drink_') || id.startsWith('medicine_');
  const isMaterialItem = (id: string) => id.startsWith('material_');
  const isEquipmentItem = (id: string) =>
    id.startsWith('weapon_') || id.startsWith('armor_') || id.startsWith('tool_');
  const isQuestItemId = (id: string) => id.startsWith('quest_');

  // 按当前 tab 过滤要渲染的物品
  const filteredItems: InventoryItem[] = (() => {
    switch (activeTab) {
      case 'consumable': return safeItems.filter((i) => isConsumableItem(i.itemId));
      case 'material': return safeItems.filter((i) => isMaterialItem(i.itemId));
      case 'equipment': return safeItems.filter((i) => isEquipmentItem(i.itemId));
      case 'quest': return safeItems.filter((i) => isQuestItemId(i.itemId));
      case 'all':
      default: return safeItems;
    }
  })();

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: safeItems.length },
    { key: 'consumable', label: '消耗品', count: safeItems.filter((i) => isConsumableItem(i.itemId)).length },
    { key: 'material', label: '材料', count: safeItems.filter((i) => isMaterialItem(i.itemId)).length },
    { key: 'equipment', label: '装备', count: safeItems.filter((i) => isEquipmentItem(i.itemId)).length },
    { key: 'quest', label: '任务', count: safeItems.filter((i) => isQuestItemId(i.itemId)).length },
  ];

  const content = (
    <>
      {/* 标题栏（嵌入模式不显示关闭按钮） */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Icon icon={headerIcon} className={styles.titleIcon} />
          <h2 className={styles.title}>{headerTitle}</h2>
        </div>
        {headerActions && (
          <div className={styles.headerActions}>{headerActions}</div>
        )}
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

      {/* 物品列表（作为 drop target） */}
      <div
        className={`${styles.itemList} ${isDragOver ? styles.dropTargetOver : ''}`}
        onDragOver={(e) => {
          if (onDrop) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => {
          if (onDrop) {
            e.preventDefault();
            onDrop(e);
          }
        }}
      >
        {filteredItems.length === 0 ? (
          <div className={styles.empty}>
            {isDragOver
              ? '松开放入仓库'
              : activeTab === 'all'
                ? (emptyMessage ?? '仓库是空的')
                : '该分类下没有物品'}
          </div>
        ) : (
          filteredItems.map((invItem, index) => {
            const rarityColor = getItemRarityColor(invItem.itemId);
            return (
              <div
                key={invItem.instanceId}
                className={styles.itemCard}
                title={`${getItemName(invItem.itemId)} x${invItem.quantity}`}
                draggable={!!onItemDragStart}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/scavenge-instance-id', invItem.instanceId);
                  e.dataTransfer.setData('text/scavenge-item-id', invItem.itemId);
                  e.dataTransfer.setData('text/scavenge-item-index', String(index));
                  e.dataTransfer.setData('text/scavenge-source', 'warehouse');
                  e.dataTransfer.effectAllowed = 'move';
                  onItemDragStart?.(invItem, e);
                }}
                onDragEnd={() => onItemDragEnd?.()}
                onClick={(e) => onItemClick?.(invItem, e)}
                {...(makeItemHoverProps ? makeItemHoverProps(invItem.itemId, invItem) : {})}
              >
                <div className={styles.itemIcon} style={{ color: rarityColor }}>
                  <Icon icon={getItemIcon(invItem.itemId)} />
                </div>
                <div className={styles.itemQuantity}>x{invItem.quantity}</div>
                {invItem.durability !== undefined && (() => {
                  const cur = getItemDurability(invItem);
                  const max = getItemMaxDurability(invItem);
                  const ratio = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
                  const color = ratio >= 0.6 ? '#4CAF50' : ratio >= 0.3 ? '#FFC107' : '#F44336';
                  return (
                    <div className={styles.durability}>
                      <div
                        className={styles.durabilityBar}
                        style={{
                          width: `${ratio * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  );
                })()}
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
