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
import { ScavengeCharacter, getCharacterStatusText, getCharacterStatusDetail } from '../character';
import { CHARACTER_TEMPLATES } from '../characterRoster';
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
} from './ScavengeCharacterPanel.stage';
import {
  getMaxHp, getMaxStamina, getMaxHungerThirst, getMaxCarryWeight,
  migrateOnStartup,
} from './ScavengeCharacterPanel.stats';
import {
  handleUnequipItem, handleApplyPending,
  handleChangeStrategy, executeItemAction,
} from './ScavengeCharacterPanel.actions';
import {
  executeTransfer, handleTransferRequest, handleWarehouseItemClick,
  handleSubmenuTargetClick, getTransferTargetOptions, handleInventoryItemDragStart,
  handleWarehouseItemDragStart, handleItemDragEnd, handleCardDrop,
  handleCardDragOver, handleCardDragLeave, handleWarehouseDrop, handleWarehouseDragOver,
  confirmDragQuantity, cancelDragQuantity, calcWeight,
} from './ScavengeCharacterPanel.transfer';
import {
  TransferSubmenuState, DragQuantityDialogState,
  ItemMenuState, DraggedItemState,
} from './ScavengeCharacterPanel.types';
import { InventoryItem } from '../../ScavengeItems/inventory';
import styles from './ScavengeCharacterPanel.module.scss';

interface ScavengeCharacterPanelProps {
  onClose: () => void;
  /**
   * 限制视图（2026-06-09 重构：拆自 restMode）
   * - true：只显示 partyCharacterIds 里的角色，隐藏仓库
   * - false（默认）：显示所有 ally 角色 + 仓库
   *
   * 用途：休整 modal（玩家只能用队内物品 + 不能和仓库交换）
   */
  restrictView?: boolean;
  /**
   * 限制转移（2026-06-09 重构：拆自 restMode）
   * - true：转移 submenu 隐藏"非队内"和"仓库"选项
   * - false（默认）：可转移到任何角色 + 仓库
   *
   * 用途：
   * - 派遣中角色列表（保留全部视图，但转移受限）
   * - 休整 modal（视图受限 + 转移受限 = 完全限制）
   *
   * 注意：restrictView=true 时，**总是**隐含 restrictTransfer=true
   *   - 因为只看到队内，自然也转不到非队内 / 仓库
   *   - 但代码里不强制：需要 explicit `restrictTransfer: true`
   */
  restrictTransfer?: boolean;
  /** 派遣时显示的角色 ID 列表（最多 3 人） */
  partyCharacterIds?: string[];
  /**
   * 自定义仓库（2026-06-21 加：M1 阶段 - 战利品分配 modal 用）
   * - 不传：用 getWarehouse() / setWarehouse()（永久仓库）
   * - 传了：用 customWarehouseRef.items 显示，用 customWarehouseRef.commit 写回
   *   （永久仓库**完全**不参与）
   *
   * 用途：战利品分配 modal 把"队伍背包"（mission.tempLoot）作为仓库
   *   - 玩家从仓库拖到角色 = 把物品分配给角色
   *   - 玩家从角色拖到仓库 = 把物品退回队伍背包
   *
   * 注：
   * - label 用于 submenu 显示（默认 "仓库"，可设 "队伍背包"）
   * - 拖拽/菜单/转移 submenu 都自动支持
   * - 永久仓库的读写（getWarehouse/setWarehouse）**完全**不走
   */
  customWarehouseRef?: {
    items: InventoryItem[];
    commit: (newItems: InventoryItem[]) => void;
    label?: string;
    emptyMessage?: string;
  };
  /**
   * 仓库 section 操作按钮 slot（2026-06-21 加：M1 阶段 - 战利品分配 modal 用）
   * - 当 customWarehouseRef 存在时，渲染在仓库 section 标题旁
   * - 用于"重置 / 智能分配 / 跳过 / 确认"等按钮
   * - 永久仓库场景（customWarehouseRef=undefined）不显示
   *
   * 渲染位置：仓库 section 顶部（"队伍背包"标题右边）
   */
  customWarehouseActions?: React.ReactNode;
}

type ItemFilter = 'all' | 'consumable' | 'equipment' | 'material' | 'quest';

export const ScavengeCharacterPanel = ({
  onClose,
  restrictView = false,
  restrictTransfer = false,
  partyCharacterIds = [],
  customWarehouseRef,
  customWarehouseActions,
}: ScavengeCharacterPanelProps) => {
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
  // 2026-06-09 改：按阵营过滤
  //   - 角色列表只显示 ally（友方/队伍成员）
  //   - neutral（中立，如商人）有独立交易入口
  //   - enemy（敌对）不进角色列表
  // 2026-06-09 加：restrictView（休整模式）
  //   - true：只显示 partyCharacterIds 里的角色（不分阵营）
  //   - false：显示所有 ally 角色
  // 2026-06-09 加：restrictTransfer（派遣中）— **只限转移，不限视图**
  //   - restrictTransfer=true 仍显示所有 ally 角色
  //   - 但 transfer submenu 隐藏非队内 + 仓库
  //   - 让玩家能看其他角色（给非拾荒角色换装），但不能和它们交换
  const allyCharacters = restrictView
    ? characters.filter(c => partyCharacterIds.includes(c.id))
    : characters.filter((c) => {
        const template = CHARACTER_TEMPLATES[c.id];
        if (!template) return false;
        return (template.faction ?? 'ally') === 'ally';
      });
  const safeCharacters: ScavengeCharacter[] = allyCharacters.map(c => ({ ...c, inventory: c.inventory ?? [] }));
  // 2026-06-09 改：restrictView 时不加载仓库（不显示）
  //   restrictTransfer=true 仍显示仓库（玩家可看不能操作）
  // 2026-06-21 加：自定义仓库（战利品分配 modal）优先于永久仓库
  //   - customWarehouseRef 存在时，用它的 items + commit（永久仓库不参与）
  //   - 不存在时：restrictView=true 不显示，否则用 getWarehouse()
  const warehouseItems = customWarehouseRef
    ? customWarehouseRef.items
    : (restrictView ? [] : getWarehouse());
  // 自定义仓库 label（用于 submenu，默认 "仓库"，可设 "队伍背包"）
  const warehouseLabel = customWarehouseRef?.label ?? '仓库';

  // ============== 包装层（2026-06-09 改：直接用 handleXxx 闭包，避免 LSP 缓存冲突） ==============
  // 之前用 onXxx = () => handleXxx(args, refresh) 包装，但 IDE LSP 缓存误判"局部声明与导入冲突"
  // 改为：JSX 处直接 () => handleXxx(...) 闭包，无 wrapper 变量
  // 也让 panel 主文件减少 35 行
  // 注：以下函数被 JSX 直接调用，不在此处定义 wrapper

  // 2026-06-21 加：包装 executeTransfer，把 customWarehouseRef 注入
  //   - 用闭包捕获 customWarehouseRef（避免改 transfer.ts 的所有签名）
  //   - 内部把 ref 合并到 options，executeTransfer 内部读 options.customWarehouseRef
  //   - 没传 customWarehouseRef 时，wrapper 与原 executeTransfer 行为一致
  const wrappedExecuteTransfer: typeof executeTransfer = (source, target, item, quantity, r, err, opts) => {
    return executeTransfer(source, target, item, quantity, r, err, {
      ...opts,
      customWarehouseRef,
    });
  };

  // ============== Render ==============
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 顶部标题 */}
        <div className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>
            {/* 2026-06-21 改：customWarehouseRef 存在时 → "小队详情"（不再叫"战斗休整"）
                否则：restrictView=true 走"战斗休整"，否则"角色列表" */}
            {customWarehouseRef
              ? '小队详情'
              : (restrictView ? '战斗休整' : '角色列表')}
          </h2>
          {restrictView && !customWarehouseRef && (
            <span className={styles.restHint}>只显示小队角色 · 已隐藏仓库</span>
          )}
          {customWarehouseRef && (
            <span className={styles.restHint}>查看队伍背包并分配拾荒战利品</span>
          )}
          {restrictTransfer && !restrictView && (
            <span className={styles.restHint}>已限制转移（不能跨队/仓库）</span>
          )}
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
                  onDragOver={(e) => handleCardDragOver(charData.id, e, draggedItem, setDragOverTarget)}
                  onDragLeave={() => handleCardDragLeave(setDragOverTarget)}
                  onDrop={(e) => handleCardDrop(charData.id, e, draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog, wrappedExecuteTransfer, refresh, showTransferError, { restrictTransfer, partyCharacterIds, customWarehouseRef })}
                >
                  <ScavengeCharacterHeader
                    name={charData.name}
                    statusText={getCharacterStatusText(charData)}
                    statusDetail={getCharacterStatusDetail(
                      charData,
                      1,  // TODO: 从 stageState 读 current_day
                      0,  // TODO: 从 stageState 读 current_period_index
                    )}
                    isExploring={Boolean(charData.isExploring)}
                    character={charData}
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
                      onApplyPending={(pending) => handleApplyPending(charData.id, pending, refresh)}
                      onChangeStrategy={(s) => handleChangeStrategy(charData.id, s, refresh)}
                    />
                    <ScavengeCharacterEquip
                      charData={charData}
                      onUnequip={(slot) => handleUnequipItem(charData.id, slot, refresh)}
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
                      onExecuteAction={(action) => executeItemAction(action, selectedItem, actionQuantity, refresh, closeItemMenu)}
                      onCloseMenu={closeItemMenu}
                      onTransferRequest={(item) => handleTransferRequest(item, selectedItem, actionQuantity, menuPosition, setTransferSubmenu, { restrictTransfer, partyCharacterIds, showTransferError })}
                      onItemDragStart={(item, e) => handleInventoryItemDragStart(item, e, setDraggedItem)}
                      onItemDragEnd={() => handleItemDragEnd(setDraggedItem, setDragOverTarget)}
                      makeItemHoverProps={makeItemHoverProps}
                      charForReq={charData}
                    />
                    {/* 2026-06-09 删：特性已移到 ScavengeCharacterStatus 经验条下方
                        这里是老位置的"特性"组件，会重复显示 */}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* 底部仓库（2026-06-09 改：restrictView 时不渲染）
            restrictTransfer=true 仍渲染仓库（玩家可看不能操作）
            2026-06-21 改：customWarehouseRef 存在时**强制**渲染（哪怕 restrictView=true）
              - 战利品分配 modal：队伍背包必须显示 */}
        {(!restrictView || customWarehouseRef !== undefined) && (
          <div
            className={styles.warehouseSection}
          onDragOver={(e) => handleWarehouseDragOver(e, draggedItem, setDragOverTarget)}
          onDragLeave={() => handleCardDragLeave(setDragOverTarget)}
          onDrop={(e) => handleWarehouseDrop(e, draggedItem, setDraggedItem, setDragOverTarget, setDragQuantityDialog, wrappedExecuteTransfer, refresh, showTransferError, { restrictTransfer, partyCharacterIds, customWarehouseRef })}
        >
          <ScavengeWarehouse
            onClose={() => {}}
            embedded
            items={warehouseItems}
            // 2026-06-21 改：customWarehouseRef 存在时 → "队伍背包"标题（区别于永久仓库"仓库"）
            title={customWarehouseRef?.label ?? undefined}
            titleIcon={customWarehouseRef ? 'material-symbols:backpack' : undefined}
            // 2026-06-21 加：customWarehouseRef 存在时 → 渲染 customWarehouseActions slot
            //   （战利品分配 modal 把按钮放在"队伍背包"标题旁）
            headerActions={customWarehouseRef ? customWarehouseActions : undefined}
            // 2026-06-21 加：customWarehouseRef 存在时 → 透传 emptyMessage（如"分配完毕"）
            emptyMessage={customWarehouseRef?.emptyMessage}
            onItemClick={(item, e) => handleWarehouseItemClick(item, e, closeItemMenu, setTransferSubmenu, { restrictTransfer, showTransferError, hasCustomWarehouse: customWarehouseRef !== undefined })}
            onItemDragStart={(item, e) => handleWarehouseItemDragStart(item, e, setDraggedItem)}
            onItemDragEnd={() => handleItemDragEnd(setDraggedItem, setDragOverTarget)}
            isDragOver={dragOverTarget === 'warehouse'}
            makeItemHoverProps={makeItemHoverProps}
          />
        </div>
      )}

        {/* 转移子菜单 */}
        {transferSubmenu && (() => {
          // 2026-06-09 改：restrictTransfer 限制转移（视图不变）
          //   - restrictTransfer=true：只允许队内（隐藏非队内 + 仓库）
          //   - restrictTransfer=false：全部可转
          //   - 注意：restrictView=true 时自动 restrictTransfer=true（队内才能看见，自然也转不到外面）
          //     但代码不强制，调用方要自己传 restrictTransfer: true
          const allOptions = getTransferTargetOptions(transferSubmenu.source, transferSubmenu.item, transferSubmenu.quantity);
          const options = restrictTransfer
            ? allOptions.filter(opt => {
                if (opt.target.kind === 'character') {
                  const charId = (opt.target as any).characterId;
                  return partyCharacterIds.includes(charId);  // 只显示队内
                }
                // target.kind === 'warehouse'：customWarehouseRef 存在 → 显示（队伍背包），否则隐藏
                return customWarehouseRef !== undefined;
              })
            : allOptions;
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
                    : warehouseLabel;
                  const icon = isChar ? 'material-symbols:person' : 'material-symbols:warehouse-outline';
                  return (
                    <button
                      key={isChar ? (opt.target as any).characterId : 'warehouse'}
                      className={`${styles.submenuTargetBtn} ${!opt.available ? styles.submenuTargetDisabled : ''}`}
                      disabled={!opt.available}
                      onClick={() => opt.available && handleSubmenuTargetClick(opt.target, transferSubmenu, wrappedExecuteTransfer, setTransferSubmenu, refresh, showTransferError, { restrictTransfer, partyCharacterIds })}
                      title={opt.reason}
                    >
                      <Icon icon={icon} />
                      <span>{label}</span>
                      {!opt.available && <span className={styles.submenuUnavailable}>负重不足</span>}
                    </button>
                  );
                })}
              </div>
              <button className={styles.submenuCancelBtn} onClick={() => setTransferSubmenu(null)}>
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
                  <button className={styles.dragQtyCancelBtn} onClick={() => cancelDragQuantity(setDragQuantityDialog, setActionQuantity)}>
                    取消
                  </button>
                  <button className={styles.dragQtyConfirmBtn} onClick={() => confirmDragQuantity(dragQuantityDialog, setDragQuantityDialog, setActionQuantity, wrappedExecuteTransfer, refresh, showTransferError, { customWarehouseRef })}>
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
