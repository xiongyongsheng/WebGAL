/**
 * Scavenge 模块 - 角色面板（2026-06-09 拆分后瘦身后）
 *
 * 拆分后只保留：
 * - useState（UI state：菜单/拖拽/错误）
 * - 串联 stage/stats/actions/transfer 模块
 * - render（JSX）
 *
 * 数据层：ScavengeCharacterPanel.stage.ts
 * 计算层：ScavengeCharacterPanel.stats.ts
 * 行为层：ScavengeCharacterPanel.actions.ts
 * 转移层：ScavengeCharacterPanel.transfer.ts
 * 类型：ScavengeCharacterPanel.types.ts
 */
import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter, getCharacterStatusText } from '../character';
import { ScavengeCharacterTraits } from '../ScavengeCharacterTraits/ScavengeCharacterTraits';
import { getItemName, getItemById } from '../../ScavengeItems/items';
import { ItemTooltip, ItemTooltipData } from '../../ScavengeItems/ItemTooltip';
import { ScavengeCharacterHeader } from '../ScavengeCharacterHeader/ScavengeCharacterHeader';
import { ScavengeCharacterStatus } from '../ScavengeCharacterStatus/ScavengeCharacterStatus';
import { ScavengeCharacterAttributes } from '../ScavengeCharacterAttributes/ScavengeCharacterAttributes';
import { ScavengeCharacterEquip } from '../ScavengeCharacterEquip/ScavengeCharacterEquip';
import { ScavengeCharacterInventory } from '../ScavengeCharacterInventory/ScavengeCharacterInventory';
import { ScavengeWarehouse } from '../../ScavengeWarehouse/ScavengeWarehouse';

// 拆分模块导入
import {
  getCharacters, getWarehouse,
  updateCharacter,
} from './ScavengeCharacterPanel.stage';
import {
  calculateEquipBonus, getMaxHp, getMaxStamina, getMaxHungerThirst, getMaxCarryWeight,
  migrateOnStartup,
} from './ScavengeCharacterPanel.stats';
import {
  handleUseItem, handleUnequipItem, handleEquipItem, handleApplyPending,
  handleChangeStrategy, handleAddTrait, handleRemoveTrait, executeItemAction,
} from './ScavengeCharacterPanel.actions';
import {
  executeTransfer, handleTransferRequest, handleWarehouseItemClick,
  handleSubmenuTargetClick, getTransferTargetOptions, handleInventoryItemDragStart,
  handleWarehouseItemDragStart, handleItemDragEnd, handleDrop, handleCardDrop,
  handleCardDragOver, handleCardDragLeave, handleWarehouseDrop, handleWarehouseDragOver,
  confirmDragQuantity, cancelDragQuantity, calcWeight,
} from './ScavengeCharacterPanel.transfer';
import {
  TransferSource, TransferTarget, TransferSubmenuState, DragQuantityDialogState,
  ItemMenuState, DraggedItemState,
} from './ScavengeCharacterPanel.types';
import { InventoryItem } from '../../ScavengeItems/inventory';
import styles from './ScavengeCharacterPanel.module.scss';

interface ScavengeCharacterPanelProps {
  onClose: () => void;
}

type ItemFilter = 'all' | 'consumable' | 'equipment' | 'material' | 'quest';
type Strategy = 'stealth' | 'combat';

export const ScavengeCharacterPanel = ({ onClose }: ScavengeCharacterPanelProps) => {
  // ============== UI state ==============
  useStageState();  // 订阅 stage state 变化自动重渲染
  const [, forceUpdate] = useState({});
  const refresh = () => forceUpdate({});

  // 物品菜单
  const [menuCharId, setMenuCharId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemMenuState | null>(null);
  const [showItemMenu, setShowItemMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [actionQuantity, setActionQuantity] = useState(1);

  // 转移子菜单
  const [transferSubmenu, setTransferSubmenu] = useState<TransferSubmenuState | null>(null);
  // 拖拽数量选择器
  const [dragQuantityDialog, setDragQuantityDialog] = useState<DragQuantityDialogState | null>(null);
  // 错误提示
  const [transferError, setTransferError] = useState<string | null>(null);

  // 拖拽状态
  const [draggedItem, setDraggedItem] = useState<DraggedItemState | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  // 2026-06-07：hover tooltip 共享 state
  const [hoveredItem, setHoveredItem] = useState<ItemTooltipData | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 每个角色的 filter tab（默认 'all'）
  const [filtersByChar, setFiltersByChar] = useState<Record<string, ItemFilter>>({});

  // ============== 启动时数据迁移 ==============
  useEffect(() => {
    migrateOnStartup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============== 错误提示 helper ==============
  const showTransferError = (msg: string) => {
    setTransferError(msg);
    setTimeout(() => setTransferError(null), 3000);
  };

  // ============== 物品菜单 helpers ==============
  const closeItemMenu = () => {
    setShowItemMenu(false);
    setSelectedItem(null);
    setMenuCharId(null);
  };

  const handleFilterChange = (charId: string, filter: ItemFilter) => {
    setFiltersByChar((prev) => ({ ...prev, [charId]: filter }));
  };

  const handleItemClick = (charId: string, invItem: InventoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuCharId(charId);
    setSelectedItem({ charId, item: invItem });
    setActionQuantity(1);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowItemMenu(true);
  };

  // ============== Hover tooltip ==============
  const makeItemHoverProps = (itemId: string, instance?: InventoryItem, charForReq?: Pick<ScavengeCharacter, 'str' | 'agi' | 'end' | 'int'>) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      if (!isMountedRef.current) return;
      setHoveredItem({ itemId, instance, x: e.clientX, y: e.clientY, charForReq });
    },
    onMouseMove: (e: React.MouseEvent) => {
      if (!isMountedRef.current) return;
      setHoveredItem((prev) =>
        prev && prev.itemId === itemId ? { ...prev, x: e.clientX, y: e.clientY } : prev,
      );
    },
    onMouseLeave: () => {
      if (!isMountedRef.current) return;
      setHoveredItem((prev) => (prev && prev.itemId === itemId ? null : prev));
    },
  });

  // ============== 拉取数据（每次渲染时） ==============
  const characters = getCharacters();
  const safeCharacters: ScavengeCharacter[] = characters.map(c => ({ ...c, inventory: c.inventory ?? [] }));
  const warehouseItems = getWarehouse();

  // ============== 简化包装（给子组件用的 handler） ==============
  const onUseItem = (charId: string, invItem: InventoryItem) => handleUseItem(charId, invItem, refresh);
  const onUnequipItem = (charId: string, slot: 'weapon' | 'tool' | any) => handleUnequipItem(charId, slot, refresh);
  const onEquipItem = (charId: string, invItem: InventoryItem) => handleEquipItem(charId, invItem, refresh);
  const onApplyPending = (charId: string, pending: { str: number; agi: number; end: number; int: number }) =>
    handleApplyPending(charId, pending, refresh);
  const onChangeStrategy = (charId: string, s: Strategy) => handleChangeStrategy(charId, s, refresh);
  const onAddTrait = (charId: string, traitId: string) => handleAddTrait(charId, traitId, refresh);
  const onRemoveTrait = (charId: string, traitId: string) => handleRemoveTrait(charId, traitId, refresh);
  const onExecuteAction = (action: string) => executeItemAction(action, selectedItem, actionQuantity, refresh, closeItemMenu);
  const onTransferRequest = (item: InventoryItem) =>
    handleTransferRequest(item, selectedItem, actionQuantity, menuPosition, setTransferSubmenu);
  const onWarehouseItemClick = (item: InventoryItem, e: React.MouseEvent) =>
    handleWarehouseItemClick(item, e, closeItemMenu, setTransferSubmenu);
  const onInventoryItemDragStart = (item: InventoryItem, e: React.DragEvent) =>
    handleInventoryItemDragStart(item, e, setDraggedItem);
  const onWarehouseItemDragStart = (item: InventoryItem, e: React.DragEvent) =>
    handleWarehouseItemDragStart(item, e, setDraggedItem);
  const onItemDragEnd = () => handleItemDragEnd(setDraggedItem, setDragOverTarget);
  const onSubmenuTargetClick = (target: TransferTarget) =>
    handleSubmenuTargetClick(target, transferSubmenu, executeTransfer, setTransferSubmenu, refresh, showTransferError);
  const onCardDrop = (targetCharId: string) => (e: React.DragEvent) =>
    handleCardDrop(targetCharId, e, draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog, executeTransfer, refresh, showTransferError);
  const onCardDragOver = (targetCharId: string) => (e: React.DragEvent) =>
    handleCardDragOver(targetCharId, e, draggedItem, setDragOverTarget);
  const onCardDragLeave = () => handleCardDragLeave(setDragOverTarget);
  const onWarehouseDrop = (e: React.DragEvent) =>
    handleWarehouseDrop(e, draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog, executeTransfer, refresh, showTransferError);
  const onWarehouseDragOver = (e: React.DragEvent) =>
    handleWarehouseDragOver(e, draggedItem, setDragOverTarget);
  const onConfirmDragQuantity = () =>
    confirmDragQuantity(dragQuantityDialog, setDragQuantityDialog, setActionQuantity, executeTransfer, refresh, showTransferError);
  const onCancelDragQuantity = () => cancelDragQuantity(setDragQuantityDialog, setActionQuantity);
  const closeTransferSubmenuFn = () => setTransferSubmenu(null);

  // ============== Render ==============
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题 */}
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>角色列表</h2>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 角色详情卡片（横向滚动） */}
        <div className={styles.charactersRow}>
          {safeCharacters.length === 0 ? (
            <div className={styles.empty}>暂无角色</div>
          ) : (
            safeCharacters.map((charData) => {
              const isOver = dragOverTarget === charData.id;
              return (
                <div
                  key={charData.id}
                  className={`${styles.characterCard} ${isOver ? styles.cardDragOver : ''}`}
                  onDragOver={onCardDragOver(charData.id)}
                  onDragLeave={onCardDragLeave}
                  onDrop={onCardDrop(charData.id)}
                >
                  <ScavengeCharacterHeader
                    name={charData.name}
                    statusText={getCharacterStatusText(charData)}
                    isExploring={Boolean(charData.isExploring)}
                    onClose={() => {}}
                  />
                  <div className={styles.cardContent}>
                    <ScavengeCharacterStatus
                      charData={charData}
                      maxHp={getMaxHp(charData)}
                      maxHunger={getMaxHungerThirst(charData)}
                      maxThirst={getMaxHungerThirst(charData)}
                      maxStamina={getMaxStamina(charData)}
                    />
                    <ScavengeCharacterAttributes
                      charData={charData}
                      strBonus={calculateEquipBonus(charData, 'str')}
                      agiBonus={calculateEquipBonus(charData, 'agi')}
                      endBonus={calculateEquipBonus(charData, 'end')}
                      intBonus={calculateEquipBonus(charData, 'int')}
                      onApplyPending={(pending) => onApplyPending(charData.id, pending)}
                      onChangeStrategy={(s) => onChangeStrategy(charData.id, s)}
                    />
                    <ScavengeCharacterEquip
                      charData={charData}
                      onUnequip={(slot) => onUnequipItem(charData.id, slot)}
                      makeItemHoverProps={makeItemHoverProps}
                    />
                    <ScavengeCharacterInventory
                      characterId={charData.id}
                      inventory={charData.inventory}
                      totalWeight={calcWeight(charData)}
                      maxWeight={getMaxCarryWeight(charData)}
                      onItemClick={(item, e) => handleItemClick(charData.id, item, e)}
                      itemFilter={filtersByChar[charData.id] ?? 'all'}
                      onFilterChange={(f) => handleFilterChange(charData.id, f)}
                      selectedItem={menuCharId === charData.id ? selectedItem?.item ?? null : null}
                      showItemMenu={showItemMenu && menuCharId === charData.id}
                      menuPosition={menuPosition}
                      actionQuantity={actionQuantity}
                      onQuantityChange={setActionQuantity}
                      onExecuteAction={onExecuteAction}
                      onCloseMenu={closeItemMenu}
                      onTransferRequest={onTransferRequest}
                      onItemDragStart={onInventoryItemDragStart}
                      onItemDragEnd={onItemDragEnd}
                      makeItemHoverProps={makeItemHoverProps}
                      charForReq={charData}
                    />
                    <ScavengeCharacterTraits
                      charData={charData}
                      onAdd={(traitId) => onAddTrait(charData.id, traitId)}
                      onRemove={(traitId) => onRemoveTrait(charData.id, traitId)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部仓库 */}
        <div
          className={styles.warehouseSection}
          onDragOver={onWarehouseDragOver}
          onDragLeave={onCardDragLeave}
          onDrop={onWarehouseDrop}
        >
          <ScavengeWarehouse
            onClose={() => {}}
            embedded
            items={warehouseItems}
            onItemClick={onWarehouseItemClick}
            onItemDragStart={onWarehouseItemDragStart}
            onItemDragEnd={onItemDragEnd}
            isDragOver={dragOverTarget === 'warehouse'}
            makeItemHoverProps={makeItemHoverProps}
          />
        </div>

        {/* 转移子菜单 */}
        {transferSubmenu && (() => {
          const options = getTransferTargetOptions(transferSubmenu.source, transferSubmenu.item, transferSubmenu.quantity);
          const MENU_WIDTH_ESTIMATE = 220;
          const left = transferSubmenu.position.x + MENU_WIDTH_ESTIMATE + 8;
          const finalLeft = left + 220 > window.innerWidth
            ? Math.max(8, transferSubmenu.position.x - 220 - 8)
            : left;
          return (
            <div
              className={styles.transferSubmenu}
              style={{ left: finalLeft, top: transferSubmenu.position.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.submenuHeader}>
                <Icon icon="material-symbols:swap-horiz" />
                <span> 转移「{getItemName(transferSubmenu.item.itemId)}」</span>
                {transferSubmenu.quantity > 1 && (
                  <span className={styles.submenuQtyBadge}>x{transferSubmenu.quantity}</span>
                )}
              </div>
              <div className={styles.submenuTargets}>
                {options.map((opt) => {
                  const isChar = opt.target.kind === 'character';
                  const label = isChar
                    ? safeCharacters.find(c => c.id === (opt.target as any).characterId)?.name ?? '?'
                    : '仓库';
                  const icon = isChar ? 'material-symbols:person' : 'material-symbols:warehouse-outline';
                  return (
                    <button
                      key={isChar ? (opt.target as any).characterId : 'warehouse'}
                      className={`${styles.submenuTargetBtn} ${!opt.available ? styles.submenuTargetDisabled : ''}`}
                      disabled={!opt.available}
                      onClick={() => opt.available && onSubmenuTargetClick(opt.target)}
                      title={opt.reason}
                    >
                      <Icon icon={icon} />
                      <span>{label}</span>
                      {!opt.available && <span className={styles.submenuUnavailable}>负重不足</span>}
                    </button>
                  );
                })}
              </div>
              <button className={styles.submenuCancelBtn} onClick={closeTransferSubmenuFn}>
                取消
              </button>
            </div>
          );
        })()}

        {/* 拖拽数量选择器（qty>1） */}
        {dragQuantityDialog && (() => {
          const itemDef = getItemById(dragQuantityDialog.item.itemId);
          const w = itemDef?.weight ?? 0;
          return (
            <div
              className={styles.dragQuantityOverlay}
              style={{ left: dragQuantityDialog.position.x, top: dragQuantityDialog.position.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.dragQuantityDialog}>
                <div className={styles.dragQuantityItem}>
                  <Icon
                    icon={itemDef ? `material-symbols:${itemDef.icon?.split(':')[1] ?? 'checkroom'}` : 'material-symbols:checkroom'}
                    className={styles.dragQuantityIcon}
                  />
                  <span>{getItemName(dragQuantityDialog.item.itemId)}</span>
                  <span className={styles.dragQuantityTotal}>x{dragQuantityDialog.item.quantity}</span>
                </div>
                <div className={styles.dragQuantityControls}>
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: Math.max(1, dragQuantityDialog.quantity - 1),
                    })}
                  >-</button>
                  <input
                    type="number"
                    className={styles.quantityInput}
                    value={dragQuantityDialog.quantity}
                    min={1}
                    max={dragQuantityDialog.item.quantity}
                    onChange={(e) => {
                      const v = parseInt(e.target.value) || 1;
                      setDragQuantityDialog({
                        ...dragQuantityDialog,
                        quantity: Math.min(dragQuantityDialog.item.quantity, Math.max(1, v)),
                      });
                    }}
                  />
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: Math.min(dragQuantityDialog.item.quantity, dragQuantityDialog.quantity + 1),
                    })}
                  >+</button>
                  <button
                    className={styles.quantityMaxBtn}
                    onClick={() => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: dragQuantityDialog.item.quantity,
                    })}
                    disabled={dragQuantityDialog.quantity >= dragQuantityDialog.item.quantity}
                    title="设为最大"
                  >
                    MAX
                  </button>
                </div>
                <div className={styles.dragQuantitySlider}>
                  <input
                    type="range"
                    min={1}
                    max={dragQuantityDialog.item.quantity}
                    value={dragQuantityDialog.quantity}
                    onChange={(e) => setDragQuantityDialog({
                      ...dragQuantityDialog,
                      quantity: parseInt(e.target.value),
                    })}
                  />
                </div>
                <div className={styles.dragQuantityWeight}>
                  重量：{(w * dragQuantityDialog.quantity).toFixed(1)}kg
                </div>
                <div className={styles.dragQuantityActions}>
                  <button className={styles.dragQtyCancelBtn} onClick={onCancelDragQuantity}>
                    取消
                  </button>
                  <button className={styles.dragQtyConfirmBtn} onClick={onConfirmDragQuantity}>
                    确认转移
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 错误提示 toast */}
        {transferError && (
          <div className={styles.errorToast}>
            <Icon icon="material-symbols:error" />
            {transferError}
          </div>
        )}
      </div>

      {/* 物品详情 tooltip（hover 触发，portal 渲染到 body） */}
      {hoveredItem && <ItemTooltip data={hoveredItem} />}
    </div>
  );
};
