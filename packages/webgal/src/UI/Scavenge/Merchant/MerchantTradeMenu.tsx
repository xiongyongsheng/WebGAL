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
import { InventoryItem } from '../ScavengeItems/inventory';
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
  const playerItems = useMemo(() => {
    return (player.inventory ?? [])
      .filter((slot): slot is InventoryItem => slot !== null && slot.quantity > 0)
      .map((slot) => {
        const itemDef = getItemById(slot.itemId);
        const sellPrice = itemDef?.price !== undefined ? calculateMerchantPrice(itemDef.price, merchant, 'sell') : 0;
        return {
          slot,
          item: itemDef,
          sellPrice,
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
  const handleConfirm = () => {
    // 2026-06-09 改：复用 totalCost（净额）
    //   totalCost 负 → 玩家花钱
    //   totalCost 正 → 玩家得钱
    //   玩家要花的钱 = -totalCost（如果 totalCost 负）
    if (-netChange > bottlecaps) {
      setError(`瓶盖不够！需要 ${-netChange} 瓶盖，当前只有 ${bottlecaps}`);
      return;
    }

    // 1. 更新瓶盖
    //   交易后瓶盖 = bottlecaps + netChange
    //   - netChange = -5 → 减 5
    //   - netChange = +5 → 加 5
    const newBottlecaps = bottlecaps + netChange;
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_bottlecaps',
      value: String(newBottlecaps),
    });

    // 2. 转移物品 + 更新商人/玩家 inventory
    const newPlayerInv = [...(player.inventory ?? [])];
    const newMerchantInv = [...(merchant.inventory ?? [])];

    for (const cartItem of cart) {
      const itemDef = getItemById(cartItem.itemId);
      if (!itemDef) continue;

      if (cartItem.mode === 'buy') {
        // 玩家买：从商人库存扣除，加到玩家背包
        for (let i = 0; i < cartItem.quantity; i++) {
          // 从商人扣
          const mIdx = newMerchantInv.findIndex((s) => s !== null && s.itemId === cartItem.itemId);
          if (mIdx >= 0) {
            const ms = newMerchantInv[mIdx]!;
            const newQty = ms.quantity - 1;
            if (newQty > 0) {
              newMerchantInv[mIdx] = { ...ms, quantity: newQty };
            } else {
              newMerchantInv[mIdx] = null;
            }
          }
          // 给玩家加
          const pIdx = newPlayerInv.findIndex((s) => s !== null && s.itemId === cartItem.itemId);
          if (pIdx >= 0) {
            const ps = newPlayerInv[pIdx]!;
            newPlayerInv[pIdx] = { ...ps, quantity: ps.quantity + 1 };
          } else {
            newPlayerInv.push({ instanceId: `inst_${Date.now()}_${Math.random()}`, itemId: cartItem.itemId, quantity: 1 });
          }
        }
      } else {
        // 玩家卖：从玩家背包扣除，加到商人库存
        for (let i = 0; i < cartItem.quantity; i++) {
          // 从玩家扣
          const pIdx = newPlayerInv.findIndex((s) => s !== null && s.itemId === cartItem.itemId);
          if (pIdx >= 0) {
            const ps = newPlayerInv[pIdx]!;
            const newQty = ps.quantity - 1;
            if (newQty > 0) {
              newPlayerInv[pIdx] = { ...ps, quantity: newQty };
            } else {
              newPlayerInv[pIdx] = null;
            }
          }
          // 给商人加
          const mIdx = newMerchantInv.findIndex((s) => s !== null && s.itemId === cartItem.itemId);
          if (mIdx >= 0) {
            const ms = newMerchantInv[mIdx]!;
            newMerchantInv[mIdx] = { ...ms, quantity: ms.quantity + 1 };
          } else {
            newMerchantInv.push({ instanceId: `inst_${Date.now()}_${Math.random()}`, itemId: cartItem.itemId, quantity: 1 });
          }
        }
      }
    }

    // 3. 写回 stage state
    const charsRaw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const chars: ScavengeCharacter[] = JSON.parse(charsRaw as string);
    const newChars = chars.map((c) => {
      if (c.id === player.id) return { ...c, inventory: newPlayerInv.filter((s) => s !== null) };
      if (c.id === merchant.id) return { ...c, inventory: newMerchantInv.filter((s) => s !== null) };
      return c;
    });
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_characters',
      value: JSON.stringify(newChars),
    });

    // 4. 商人好感度变化（买或卖都 +1，累计）
    const tradeAmount = cart.length;
    if (tradeAmount > 0) {
      const newMerchant = {
        ...merchant,
        merchantAffection: Math.min(100, merchantAffection + tradeAmount),
      };
      const finalChars = (JSON.parse(stageStateManager.getCalculationStageState().GameVar['scavenge_characters'] as string) as ScavengeCharacter[]).map(
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
              <span style={{ color: '#fbbf24' }}>
                <Icon icon="material-symbols:attach-money" /> {bottlecaps}
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