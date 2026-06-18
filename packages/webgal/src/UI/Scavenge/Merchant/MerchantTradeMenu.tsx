/**
 * 商人交易 modal（2026-06-09 加）
 *
 * 设计：参考 BG3 交易界面
 * - 左右两栏：左 = 商人卖 / 右 = 玩家卖
 * - 顶部：商人信息 + 好感度等级 + 折扣率
 * - 底部：购物车 + 总价 + 交易按钮
 *
 * 数据流：
 * - 点击商人卖（左栏）：加到 cart（mode='buy'）
 * - 点击玩家物品（右栏）：加到 cart（mode='sell'）
 * - 点"交易"：扣/加瓶盖 + 转移物品
 */

import { useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { CHARACTER_TEMPLATES } from '../ScavengeCharacter/characterRoster';
import { getItemById, Item } from '../ScavengeItems/items';
import { InventoryItem, createEquipmentInstance, generateInstanceId } from '../ScavengeItems/inventory';
import { executeTransfer } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.transfer';
import {
  computeMerchantLevel,
  getMerchantLevelName,
  getMerchantDiscount,
  calculateMerchantPrice,
  MerchantLevel,
} from './merchantUtils';
import styles from './MerchantTradeMenu.module.scss';

interface Props {
  merchant: ScavengeCharacter;
  player: ScavengeCharacter;
  onClose: () => void;
}

interface CartItem {
  /** 物品 ID */
  itemId: string;
  /** 数量 */
  quantity: number;
  /** 交易方向：'buy' = 玩家买，'sell' = 玩家卖给商人 */
  mode: 'buy' | 'sell';
  /** instanceId（仅 sell 模式，从玩家背包指定具体实例）*/
  instanceId?: string;
  /** 单价（瓶盖）*/
  unitPrice: number;
}

export const MerchantTradeMenu = ({ merchant, player, onClose }: Props) => {
  useStageState();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const template = CHARACTER_TEMPLATES[merchant.id];
  const levelNames = template?.merchantAffectionLevelNames ?? ['陌生', '熟客', '老主顾', '至交'];
  const merchantAffection = merchant.merchantAffection ?? template?.initialMerchantAffection ?? 0;
  const level = computeMerchantLevel(merchantAffection, template?.merchantAffectionThresholds ?? [30, 60, 90]) as MerchantLevel;
  const levelName = getMerchantLevelName(level, levelNames);
  const discount = getMerchantDiscount(merchant);

  // 当前瓶盖
  const bottlecaps = Number(stageStateManager.getCalculationStageState().GameVar['scavenge_bottlecaps'] ?? 0);

  // 商人商品列表
  const merchantItems = useMemo(() => {
    return (merchant.inventory ?? [])
      .filter((slot): slot is InventoryItem => slot !== null && slot.quantity > 0)
      .map((slot) => {
        const itemDef = getItemById(slot.itemId);
        const buyPrice = itemDef?.price !== undefined ? calculateMerchantPrice(itemDef.price, merchant, 'buy') : 0;
        return {
          slot,
          item: itemDef,
          buyPrice,
          hasPrice: itemDef?.price !== undefined,
        };
      })
      .filter((entry) => entry.hasPrice);  // 只显示有价格的物品
  }, [merchant]);

  // 玩家物品列表（过滤：玩家背包里有 + 没 lock）
  // 2026-06-09 改：装备按 durability 比例算 sellPrice
  //   - 满耐久 → 1.0
  //   - 0 耐久 → 0（卖不出钱）
  //   - 没 durability 字段 → 0（按破损价）
  const playerItems = useMemo(() => {
    return (player.inventory ?? [])
      .filter((slot): slot is InventoryItem => slot !== null && slot.quantity > 0)
      .map((slot) => {
        const itemDef = getItemById(slot.itemId);
        let durabilityRatio = 1;  // 消耗品默认 1
        if (itemDef?.type === 'equipment') {
          const max = itemDef.maxDurability ?? 0;
          const cur = (slot as InventoryItem).durability;
          if (typeof cur === 'number' && max > 0) {
            durabilityRatio = Math.max(0, Math.min(1, cur / max));
          } else {
            durabilityRatio = 0;  // 没 durability 字段 = 0（破损价）
          }
        }
        const sellPrice = itemDef?.price !== undefined
          ? calculateMerchantPrice(itemDef.price, merchant, 'sell', durabilityRatio)
          : 0;
        return {
          slot,
          item: itemDef,
          sellPrice,
          durabilityRatio,
          hasPrice: itemDef?.price !== undefined,
        };
      })
      .filter((entry) => entry.hasPrice);
  }, [player, merchant]);

  // 净额（玩家瓶盖净变化，2026-06-09 修：按 buy/sell 处理符号）
  // - buy：玩家花瓶盖 → 负
  // - sell：玩家得瓶盖 → 正
  // 例：
  //   全 buy 5 瓶盖 → -5（玩家花 5）
  //   全 sell 5 瓶盖 → +5（玩家得 5）
  //   买 5 卖 3 → -2（净花 2）
  const netChange = useMemo(() => {
    return cart.reduce((sum, item) => {
      const sign = item.mode === 'buy' ? -1 : 1;
      return sum + sign * item.unitPrice * item.quantity;
    }, 0);
  }, [cart]);
  // 兼容旧名（UI 仍用 totalCost 显示）
  const totalCost = netChange;

  // 加到购物车
  const addToCart = (entry: {
    item: Item | undefined;
    slot: InventoryItem;
    mode: 'buy' | 'sell';
    unitPrice: number;
  }, maxQty: number) => {
    if (!entry.item) return;
    const existingIdx = cart.findIndex(
      (c) => c.itemId === entry.item!.id && c.mode === entry.mode,
    );
    if (existingIdx >= 0) {
      const newCart = [...cart];
      newCart[existingIdx] = {
        ...newCart[existingIdx],
        quantity: Math.min(maxQty, newCart[existingIdx].quantity + 1),
      };
      setCart(newCart);
    } else {
      setCart([
        ...cart,
        {
          itemId: entry.item.id,
          quantity: 1,
          mode: entry.mode,
          unitPrice: entry.unitPrice,
        },
      ]);
    }
    setError(null);
  };

  // 从购物车移除
  const removeFromCart = (itemId: string, mode: 'buy' | 'sell') => {
    setCart(cart.filter((c) => !(c.itemId === itemId && c.mode === mode)));
    setError(null);
  };

  // 清空购物车
  const clearCart = () => {
    setCart([]);
    setError(null);
  };

  // 确认交易
  // 2026-06-09 改：复用 executeTransfer（角色 ↔ 角色 转移）
  //   商人卖东西给玩家 = 商人 character → 玩家 character（直接用 transfer 逻辑）
  //   玩家卖东西给商人 = 玩家 character → 商人 character（同上）
  //   跟队友之间转移物品本质上一样：都是"双方背包操作"
  //   - 装备 instance 转移时 durability 保留（卖→买=同 instance）
  //   - 好感度门槛、容量检查复用 transfer 的实现
  const handleConfirm = () => {
    // 0. 玩家瓶盖够不够？
    if (-netChange > bottlecaps) {
      setError(`瓶盖不够！需要 ${-netChange} 瓶盖，当前只有 ${bottlecaps}`);
      return;
    }

    // 0b. 商人金币上下限保护
    const merchantCurrentGold = merchant.gold ?? template?.initialGold ?? 0;
    const merchantMaxGold = template?.maxGold ?? Number.MAX_SAFE_INTEGER;
    const merchantNetChange = -netChange;  // 正=收，负=付
    const newMerchantGold = Math.max(0, Math.min(
      merchantMaxGold,
      merchantCurrentGold + merchantNetChange,
    ));
    if (merchantNetChange > 0 && newMerchantGold < merchantCurrentGold + merchantNetChange) {
      setError(`商人金币满了！最多收 ${merchantMaxGold}，现在 ${merchantCurrentGold}`);
      return;
    }
    if (merchantNetChange < 0 && newMerchantGold < Math.abs(merchantNetChange)) {
      setError(`商人金币不够！需要 ${Math.abs(merchantNetChange)} 瓶盖，商人只有 ${merchantCurrentGold}`);
      return;
    }

    // 1. 转移物品（用 executeTransfer）
    //   玩家买 = 商人 → 玩家
    //   玩家卖 = 玩家 → 商人
    //   每次转移一个 instance，循环 cartItem.quantity 次
    //   注意：executeTransfer 内部生成新 instanceId（避免和源冲突），durability 保留
    for (const cartItem of cart) {
      for (let i = 0; i < cartItem.quantity; i++) {
        const sourceId = cartItem.mode === 'buy' ? merchant.id : player.id;
        const targetId = cartItem.mode === 'buy' ? player.id : merchant.id;
        // 从源 inventory 找一个匹配 itemId 的 instance
        const charsRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
        const chars: ScavengeCharacter[] = typeof charsRaw === 'string' ? JSON.parse(charsRaw) : (charsRaw as any);
        const sourceChar = chars.find(c => c.id === sourceId);
        if (!sourceChar) {
          setError('找不到源角色');
          return;
        }
        const sourceInv = (sourceChar.inventory ?? []).filter((s): s is InventoryItem => s !== null);
        const foundItem = sourceInv.find(s => s.itemId === cartItem.itemId);
        if (!foundItem) {
          setError(`物品 ${cartItem.itemId} 不可用（可能已被买空）`);
          return;
        }
        // 转移 1 个（用 foundItem 的 instanceId 和 durability）
        const ok = executeTransfer(
          { kind: 'character', characterId: sourceId },
          { kind: 'character', characterId: targetId },
          foundItem,
          1,
          () => {},  // 不需要 refresh（executeTransfer 内部已写 stage）
          (msg) => setError(msg),
        );
        if (!ok) {
          return;  // executeTransfer 内部已 setError
        }
      }
    }

    // 2. 更新瓶盖
    const newBottlecaps = bottlecaps + netChange;
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_bottlecaps',
      value: String(newBottlecaps),
    });

    // 3. 写回商人金币
    const charsRaw2 = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const chars2: ScavengeCharacter[] = typeof charsRaw2 === 'string' ? JSON.parse(charsRaw2) : (charsRaw2 as any);
    const newChars2 = chars2.map((c) => {
      if (c.id === merchant.id) {
        return { ...c, gold: newMerchantGold };
      }
      return c;
    });
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(newChars2),
    });

    // 4. 商人好感度变化（买或卖都 +1，累计）
    const tradeAmount = cart.length;
    if (tradeAmount > 0) {
      const newMerchant = {
        ...merchant,
        merchantAffection: Math.min(100, merchantAffection + tradeAmount),
      };
      const charsRaw3 = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
      const chars3: ScavengeCharacter[] = typeof charsRaw3 === 'string' ? JSON.parse(charsRaw3) : (charsRaw3 as any);
      const finalChars = chars3.map(
        (c) => (c.id === merchant.id ? { ...c, merchantAffection: newMerchant.merchantAffection } : c),
      );
      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(finalChars),
      });
    }

    // 5. 清空购物车 + 关闭
    setCart([]);
    onClose();
  };

  // ============== 渲染 ==============
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 顶部 */}
        <div className={styles.header}>
          <div className={styles.merchantAvatar}>{merchant.name.charAt(0)}</div>
          <div className={styles.merchantInfo}>
            <div className={styles.merchantName}>{merchant.name} 的商店</div>
            <div className={styles.merchantMeta}>
              <span className={styles.affectionBadge}>
                <Icon icon="material-symbols:handshake" />
                {levelName}
              </span>
              <span className={styles.discountBadge}>
                {Math.round(discount * 100)}% 价格
              </span>
              <span style={{ color: '#fbbf24' }} title={`玩家瓶盖`}>
                <Icon icon="material-symbols:person" /> {bottlecaps}
              </span>
              <span style={{ color: '#a78bfa' }} title={`商人金币（上限 ${template?.maxGold ?? '-'})`}>
                <Icon icon="material-symbols:storefront" /> {merchant.gold ?? template?.initialGold ?? 0}
              </span>
              <span style={{ color: '#cbd5e0' }} title={`每 ${template?.refreshDays ?? 2} 天刷新`}>
                <Icon icon="material-symbols:event-repeat" /> {template?.refreshDays ?? 2}天
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>×</button>
        </div>

        {/* 错误提示 */}
        {error && <div className={styles.error}>{error}</div>}

        {/* 主体 */}
        <div className={styles.body}>
          {/* 左：商人商品 */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span>{merchant.name} 的商品</span>
              <span className={styles.columnCount}>{merchantItems.length} 类</span>
            </div>
            {merchantItems.map((entry) => (
              <div
                key={entry.slot.instanceId ?? entry.item!.id}
                className={`${styles.itemRow} ${
                  cart.find((c) => c.itemId === entry.item!.id && c.mode === 'buy') ? styles.itemRowSelected : ''
                }`}
                onClick={() => addToCart({
                  item: entry.item,
                  slot: entry.slot,
                  mode: 'buy',
                  unitPrice: entry.buyPrice,
                }, entry.slot.quantity)}
              >
                <div className={styles.itemIcon} style={{ color: '#fbbf24' }}>
                  <Icon icon={entry.item!.icon || 'material-symbols:inventory-2-outline'} />
                </div>
                <div className={styles.itemInfo}>
                  <div className={styles.itemName}>{entry.item!.name}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.itemQty}>库存: {entry.slot.quantity}</span>
                    {entry.item!.weight !== undefined && (
                      <span>· 重量: {entry.item!.weight}</span>
                    )}
                  </div>
                </div>
                <div className={styles.itemPrice}>
                  <Icon icon="material-symbols:attach-money" />
                  {entry.buyPrice}
                </div>
              </div>
            ))}
          </div>

          {/* 右：玩家物品 */}
          <div className={styles.column}>
            <div className={styles.columnTitle}>
              <span>你的物品</span>
              <span className={styles.columnCount}>{playerItems.length} 类</span>
            </div>
            {playerItems.length === 0 ? (
              <div className={styles.cartEmpty}>背包里没有可卖的物品</div>
            ) : (
              playerItems.map((entry) => (
                <div
                  key={entry.slot.instanceId ?? entry.item!.id}
                  className={`${styles.itemRow} ${
                    cart.find((c) => c.itemId === entry.item!.id && c.mode === 'sell') ? styles.itemRowSelected : ''
                  }`}
                  onClick={() => addToCart({
                    item: entry.item,
                    slot: entry.slot,
                    mode: 'sell',
                    unitPrice: entry.sellPrice,
                  }, entry.slot.quantity)}
                >
                  <div className={styles.itemIcon}>
                    <Icon icon={entry.item!.icon || 'material-symbols:inventory-2-outline'} />
                  </div>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemName}>{entry.item!.name}</div>
                    <div className={styles.itemMeta}>
                      <span className={styles.itemQty}>×{entry.slot.quantity}</span>
                      {/* 2026-06-09 加：装备显示当前耐久（满/半/低） */}
                      {entry.item!.type === 'equipment' && (entry.item! as any).maxDurability && (
                        <span style={{ color: entry.durabilityRatio > 0.5 ? '#4caf50' : entry.durabilityRatio > 0.2 ? '#fbbf24' : '#f44336' }}>
                          · 耐久 {Math.round(entry.durabilityRatio * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.itemPrice}>
                    <Icon icon="material-symbols:attach-money" />
                    {entry.sellPrice}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 底部购物车 */}
        <div className={styles.cart}>
          <div className={styles.cartTitle}>购物车</div>
          <div className={styles.cartItems}>
            {cart.length === 0 ? (
              <span className={styles.cartEmpty}>点商品加入购物车</span>
            ) : (
              cart.map((c) => {
                const item = getItemById(c.itemId);
                return (
                  <span key={`${c.itemId}-${c.mode}`} className={styles.cartChip}>
                    {c.mode === 'buy' ? '↓' : '↑'} {item?.name ?? c.itemId} × {c.quantity} · {c.unitPrice * c.quantity}
                    <span className={styles.cartChipRemove} onClick={() => removeFromCart(c.itemId, c.mode)}>×</span>
                  </span>
                );
              })
            )}
          </div>
          <div className={styles.cartActions}>
            <div className={styles.cartTotal}>
              净额：
              <span className={styles.cartTotalValue}>
                {totalCost >= 0 ? `+${totalCost}` : totalCost}
              </span>
              <span style={{ color: '#cbd5e0', fontSize: 14, fontWeight: 400 }}>
                (瓶盖变化)
              </span>
            </div>
            <div className={styles.cartButtons}>
              <button className={`${styles.btn} ${styles.btnCancel}`} onClick={clearCart}>
                清空
              </button>
              <button
                className={`${styles.btn} ${styles.btnConfirm}`}
                onClick={handleConfirm}
                // 2026-06-09 修：玩家买得起的判断
                //   交易后瓶盖 = bottlecaps + netChange
                //   买得起 = bottlecaps + netChange >= 0
                //   即 netChange >= -bottlecaps
                //   即 -netChange <= bottlecaps（-netChange 是玩家要花的钱）
                disabled={cart.length === 0 || -netChange > bottlecaps}
              >
                交易
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};