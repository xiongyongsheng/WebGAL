/**
 * 队伍物资分配工具（M1 阶段，2026-06-21 加）
 *
 * 核心设计：
 * - 拾荒期间物品优先入 party[0] 背包，依次尝试 party[1]、party[2]
 * - 都不行 → 入队伍共享临时仓库 (Mission.tempLoot)
 * - 队伍仓库也满 → 丢弃（返回 dropped 列表，调用方弹提示）
 *
 * 容量计算：
 * - 个人背包容量 = maxCarry (end 影响) - calculateTotalWeight(inventory)
 * - 队伍共享仓库容量 = sum(个人背包剩余容量)
 * - 队伍仓库本身**不**有容量上限（maxStack 等约束由 addToInventory 处理）
 *   但概念上它的容量 = 队伍剩余负重的总和
 *
 * 不依赖外部 state，所有函数都是纯函数。
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { InventoryItem, calculateTotalWeight, canAddToInventory, addToInventory, MAX_CARRY_WEIGHT, isBlueprintItem } from '../ScavengeItems/inventory';
import { getItemById } from '../ScavengeItems/items';
import { generateInstanceId } from '../ScavengeItems/inventory';

// ============== 物品分类（M2 偏好/需求用，2026-06-21 加）==============

/**
 * 物品语义分类（M2 阶段用于角色偏好/需求匹配）
 * - 命中前缀：food_ / drink_ / medicine_ / weapon_ / armor_ / tool_ / material_ / quest_
 * - sanity 类：从物品 effects 里识别（type === 'sanity'）
 */
export type ItemCategory =
  | 'food'
  | 'drink'
  | 'medicine'
  | 'sanity'        // 提神 / 精神恢复
  | 'weapon'
  | 'armor'
  | 'tool'
  | 'material'
  | 'quest'
  | 'other';

/**
 * 推断物品分类（基于 itemId 前缀 + effect 类型）
 *
 * 注：sanity 类**优先**看 effect.type（因为"咖啡"或"书"可能 id 前缀不是 sanity_）
 */
export const getItemCategory = (itemId: string): ItemCategory => {
  // 优先按 effect 判断 sanity 类（精神物品）
  const def = getItemById(itemId);
  if (def && def.type === 'consumable') {
    const effects = (def as any).effects as Array<{ type: string; value: number }> | undefined;
    if (effects && effects.length > 0) {
      const hasSanity = effects.some((e) => e.type === 'sanity' && e.value > 0);
      const onlySanity = effects.every((e) => e.type === 'sanity' || e.type === 'hp' || e.type === 'hunger' || e.type === 'thirst');
      // 如果主效果是 sanity 且没有食物/水/医疗的特征前缀，归为 sanity
      if (hasSanity && (effects[0].type === 'sanity' || onlySanity)) {
        // 还要排除 food_/drink_/medicine_ 前缀（它们有自己的 effect 但不是 sanity 主类）
        if (!itemId.startsWith('food_') && !itemId.startsWith('drink_') && !itemId.startsWith('medicine_')) {
          return 'sanity';
        }
      }
    }
  }

  if (itemId.startsWith('food_')) return 'food';
  if (itemId.startsWith('drink_')) return 'drink';
  if (itemId.startsWith('medicine_')) return 'medicine';
  if (itemId.startsWith('weapon_')) return 'weapon';
  if (itemId.startsWith('armor_')) return 'armor';
  if (itemId.startsWith('tool_')) return 'tool';
  if (itemId.startsWith('material_')) return 'material';
  if (itemId.startsWith('quest_')) return 'quest';
  return 'other';
};

/** 分类的中文显示名 */
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  food: '食物',
  drink: '饮水',
  medicine: '医疗',
  sanity: '精神',
  weapon: '武器',
  armor: '护甲',
  tool: '工具',
  material: '材料',
  quest: '任务',
  other: '其他',
};

// ============== 容量计算 ==============

/**
 * 计算单个角色的背包剩余负重
 * - maxCarry = MAX_CARRY_WEIGHT + (end - 5) * 5
 * - 剩余 = maxCarry - currentWeight
 */
const characterRemainingCapacity = (char: ScavengeCharacter): number => {
  const maxCarry = MAX_CARRY_WEIGHT + (char.end - 5) * 5;
  const currentWeight = calculateTotalWeight(char.inventory ?? []);
  return Math.max(0, maxCarry - currentWeight);
};

/**
 * 计算队伍剩余负重总和（也就是队伍共享仓库的"容量"）
 *
 * 注：返回的是**总和**，调用方可以理解为：
 * "队伍所有角色加起来还能装多少重量的物品"
 *
 * 如果总和也是 0（所有人都满）→ 物品进临时仓库会被丢弃（除非临时仓库也有容量）
 *
 * 实际"临时仓库"用 `Mission.tempLoot` 数组存储，**不**做重量限制
 * （因为它代表"队伍整体还能装的空间"），但语义上容量 = 这个值
 */
export const calculatePartyBackpackCapacity = (party: ScavengeCharacter[]): number => {
  return party.reduce((sum, c) => sum + characterRemainingCapacity(c), 0);
};

/**
 * 队伍当前总负重（用于 UI 显示"已用 / 总"）
 */
export const calculatePartyCurrentWeight = (party: ScavengeCharacter[]): number => {
  return party.reduce((sum, c) => sum + calculateTotalWeight(c.inventory ?? []), 0);
};

// ============== 智能分配 ==============

export type LootTarget =
  | { type: 'party'; index: number }   // 装进了 party[index] 背包
  | { type: 'backpack' }               // 装进了队伍共享仓库
  | { type: 'dropped' };                // 都装不下，丢弃

export interface DistributeResult {
  /** 分配结果：装哪里 / 丢哪里 */
  target: LootTarget;
  /** 更新后的队伍（inventory 已写入）*/
  updatedParty: ScavengeCharacter[];
  /** 更新后的队伍共享仓库（如果 target=backpack，新物品已加在这里）*/
  updatedBackpack: InventoryItem[];
  /** 装不下的部分（target=dropped 时这里有数据）*/
  dropped: InventoryItem[];
  /** 装了多少（target=dropped 时可能 < item.quantity）*/
  accepted: number;
}

/**
 * 智能把物品分给队伍
 *
 * 优先级：
 * 1. party[0] 背包（主队员）
 * 2. party[1]、party[2] 背包
 * 3. 队伍共享仓库 (partyBackpack)
 * 4. 都不行 → 丢弃（返回 dropped 列表，调用方决定怎么提示）
 *
 * 重要：
 * - 不修改入参，所有更新通过返回值传递
 * - 使用 canAddToInventory 预检重量/堆叠
 * - 队伍共享仓库**不**做重量限制（语义上 = 队伍剩余负重总和）
 *   所以 addToInventory 到仓库时不会被 canAddToInventory 拒绝
 */
export const tryAddToParty = (
  party: ScavengeCharacter[],
  partyBackpack: InventoryItem[],
  item: InventoryItem,
): DistributeResult => {
  // 2026-06-21 改：蓝图当**普**通物**品**（**不**再**单**独 addBlueprint）
  //   - 蓝图**也**走普**通**物**品**分配（先角色背包，**再**仓库）
  //   - 实际上 tryAddToParty 返**回**了 DistributeResult，**调**用**方需要**把蓝图放进仓库
  //   - **简**化：蓝图**也**走**普**通**路**径（addToInventory），**不****特**殊**处**理
  //   - **不**消耗，可买卖

  // 1. 依次尝试每个角色背包
  let updatedParty = party;
  for (let i = 0; i < party.length; i++) {
    const char = updatedParty[i];
    if (!char) continue;
    // 跳过死亡角色（HP = 0），死人的背包不能装东西
    if (char.hp <= 0) continue;
    // 2026-06-21 改：过滤 null 槽位（canAddToInventory 需要 InventoryItem[]）
    const invWithoutNull = (char.inventory ?? []).filter((i): i is InventoryItem => i !== null);
    const checkResult = canAddToInventory(invWithoutNull, item, false);
    if (checkResult.canAdd) {
      const newInv = addToInventory(invWithoutNull, {
        ...item,
        quantity: checkResult.accepted,
      });
      updatedParty = updatedParty.map((c, idx) =>
        idx === i ? { ...c, inventory: newInv } : c,
      );
      return {
        target: { type: 'party', index: i },
        updatedParty,
        updatedBackpack: partyBackpack,
        dropped: checkResult.accepted < item.quantity
          ? [{ ...item, quantity: item.quantity - checkResult.accepted }]
          : [],
        accepted: checkResult.accepted,
      };
    }
  }

  // 2. 队伍共享仓库（不限制重量，但 addToInventory 会做堆叠/装备唯一性检查）
  //    仓库语义 = 队伍剩余负重总和，理论上一定能装下
  //    但 addToInventory 不做重量检查（canAddToInventory 才做）
  //    这里手动跳过重量检查：tryAddToWarehouse = addToInventory 但不走 canAddToInventory
  //    因为队伍共享仓库的"容量"已经由 calculatePartyBackpackCapacity 表示
  //    实际入参：所有物品都可以入仓库（重量检查由调用方自己保证）
  //    但 addToInventory 默认不做重量检查，所以直接 push 即可
  const newBackpack = addToInventory(partyBackpack, item);
  return {
    target: { type: 'backpack' },
    updatedParty,
    // 2026-06-21 改：过滤 null 槽位（addToInventory 可能返回 null 槽位，但仓库语义上是 InventoryItem[]）
    updatedBackpack: newBackpack.filter((i): i is InventoryItem => i !== null),
    dropped: [],
    accepted: item.quantity,
  };
};

/**
 * 批量分配多个物品（拾荒期间用）
 * - 按顺序 tryAddToParty
 * - 物品之间不共享状态（每个物品独立分配）
 */
export const tryAddItemsToParty = (
  party: ScavengeCharacter[],
  partyBackpack: InventoryItem[],
  items: InventoryItem[],
): {
  updatedParty: ScavengeCharacter[];
  updatedBackpack: InventoryItem[];
  dropped: InventoryItem[];
  distribution: Array<{ item: InventoryItem; target: LootTarget }>;
} => {
  let currentParty = party;
  let currentBackpack = partyBackpack;
  const dropped: InventoryItem[] = [];
  const distribution: Array<{ item: InventoryItem; target: LootTarget }> = [];

  for (const item of items) {
    const result = tryAddToParty(currentParty, currentBackpack, item);
    currentParty = result.updatedParty;
    currentBackpack = result.updatedBackpack;
    dropped.push(...result.dropped);
    distribution.push({ item, target: result.target });
  }

  return { updatedParty: currentParty, updatedBackpack: currentBackpack, dropped, distribution };
};

// ============== UI 辅助 ==============

/**
 * 生成用于 UI 显示的目标描述
 */
export const formatLootTarget = (target: LootTarget, party: ScavengeCharacter[]): string => {
  if (target.type === 'party') {
    const char = party[target.index];
    return char ? `${char.name ?? char.id} 的背包` : `队员 #${target.index}`;
  }
  if (target.type === 'backpack') return '队伍仓库';
  return '丢弃';
};

/** 给丢弃的物品生成 instanceId（防止和入参冲突）*/
export const ensureInstanceId = (item: InventoryItem): InventoryItem => {
  if (item.instanceId) return item;
  return { ...item, instanceId: generateInstanceId() };
};

// ============== 容量检查（拾荒阶段"超出负重直接丢弃"）==============

/**
 * 检查 tempLoot 新增物品后是否超队伍总负重
 *
 * 设计：
 *   - 队伍总负重 = sum(party[].maxCarry) = 队伍总容量
 *   - 队伍已用 = sum(party[].inventory weight) + currentBackpack 重量
 *   - 新物品入 tempLoot：剩余容量 = 总容量 - 已用 - 物品重量
 *   - 剩余 >= 0 → 可以装入
 *   - 剩余 < 0 → 装不下（丢弃）
 *
 * 2026-06-21 加：用户要求"超出负重直接丢弃"
 *   - 之前：物品总能入 tempLoot（无容量限制）
 *   - 现在：基于队伍总负重做容量检查
 *
 * @param party 队伍（**不**包括 tempLoot 里的物品）
 * @param currentBackpack tempLoot 当前物品
 * @param newItem 新要加的物品
 * @returns true = 装得下，false = 装不下（应丢弃）
 */
export const canAddToPartyBackpack = (
  party: ScavengeCharacter[],
  currentBackpack: InventoryItem[],
  newItem: InventoryItem,
): boolean => {
  // 队伍总容量
  const totalCapacity = party.reduce((sum, c) => sum + MAX_CARRY_WEIGHT + (c.end - 5) * 5, 0);
  // 队伍已用负重（角色背包）
  const partyUsed = party.reduce((sum, c) => sum + calculateTotalWeight(c.inventory ?? []), 0);
  // tempLoot 已用负重
  const backpackUsed = calculateTotalWeight(currentBackpack);
  // 新物品重量
  const newItemWeight = calculateTotalWeight([newItem]);
  // 剩余容量
  return totalCapacity - partyUsed - backpackUsed - newItemWeight >= 0;
};

/**
 * 拾荒阶段：把物品尝试入 tempLoot，超重丢弃
 *
 * 返回：
 *   - updatedBackpack: 更新后的 tempLoot（丢弃的物品不在这里）
 *   - dropped: 被丢弃的物品（不计入 tempLoot）
 */
export const tryAddToTempLoot = (
  party: ScavengeCharacter[],
  currentBackpack: InventoryItem[],
  newItem: InventoryItem,
): { updatedBackpack: InventoryItem[]; dropped: InventoryItem[] } => {
  if (canAddToPartyBackpack(party, currentBackpack, newItem)) {
    return {
      updatedBackpack: addToInventory(currentBackpack, newItem).filter((i): i is InventoryItem => i !== null),
      dropped: [],
    };
  }
  return {
    updatedBackpack: currentBackpack,
    dropped: [newItem],
  };
};
