/**
 * 拾荒系统 - 角色管理模块
 * 角色数据定义和操作
 */

import { InventoryItem, migrateInventory, compactInventorySlots, filterUnknownItems } from '../ScavengeItems/inventory';
import { getItemById, ArmorSlot } from '../ScavengeItems/items';

/** 主属性（升级时自动 +2 的属性） */
export type MainStat = 'str' | 'agi' | 'end' | 'int';

/** 装备 slot key（2026-06-07 改）：装备实例存在 `equipped[key]` 里，不在 inventory */
export type EquipSlotKey = 'weapon' | 'helmet' | 'chest' | 'arms' | 'gloves' | 'legs' | 'boots' | 'tool';

// 2026-06-07：未知物品警告去重（同一 ID 只 warn 一次，避免 React 重渲染时刷屏）
const _warnedUnknownIds = new Set<string>();

export interface ScavengeCharacter {
  /** 角色ID */
  id: string;
  /** 角色名称 */
  name: string;
  /** 角色图标/头像 */
  avatar?: string;
  /** 力量属性 */
  str: number;
  /** 敏捷属性 */
  agi: number;
  /** 耐力属性 */
  end: number;
  /** 智力属性 */
  int: number;
  /** 当前HP */
  hp: number;
  /** 最大HP */
  maxHp: number;
  /** 饥饿值 */
  hunger: number;
  /** 最大饥饿值 */
  maxHunger: number;
  /** 口渴值 */
  thirst: number;
  /** 最大口渴值 */
  maxThirst: number;
  /** 精神值 */
  sanity: number;
  /** 最大精神值 */
  maxSanity: number;
  /** 体力值（剩余体力，0 = 精疲力竭） */
  stamina: number;
  /** 最大体力值（受 end 影响：100 + (end-5)*5） */
  maxStamina: number;
  /** 装备的武器ID（itemId，inventory 中对应实例提供 durability） */
  weaponId?: string;
  /** 装备的头盔 ID（itemId） */
  helmetId?: string;
  /** 装备的躯干/盔甲 ID（itemId） */
  chestId?: string;
  /** 装备的护臂 ID（itemId） */
  armsId?: string;
  /** 装备的手套 ID（itemId） */
  glovesId?: string;
  /** 装备的护腿 ID（itemId） */
  legsId?: string;
  /** 装备的靴子 ID（itemId） */
  bootsId?: string;
  /** 装备的工具ID（itemId） */
  toolId?: string;
  /**
   * 装备实例（2026-06-07 改）：key = slot 名字，value = InventoryItem
   *
   * 装备后的 instance 从 inventory **移到这里**（不是复制），所以：
   * - inventory 只显示"真正在背包里"的物品
   * - 战斗/UI 直接读 equipped 拿耐久
   * - 卸下时再把 instance 移回 inventory
   */
  equipped?: Partial<Record<EquipSlotKey, InventoryItem>>;
  /** 是否在探索中（包含派遣：派遣期间 isExploring=true，角色被锁） */
  isExploring: boolean;
  /** 探索地点ID */
  exploringLocationId?: string;
  /** 派遣/探索结束时间：第几天（与 isExploring + exploringLocationId 配合使用） */
  returnDay?: number;
  /** 派遣/探索结束时间：哪个 period（0=清晨, 1=上午, 2=下午, 3=半晚, 4=黑夜） */
  returnPeriodIndex?: number;
  // ============== 经验/升级系统 ==============
  /** 当前经验值 */
  exp: number;
  /** 当前等级（1 起） */
  level: number;
  /** 升到下一级所需经验 */
  expToNext: number;
  /** 未分配的属性点（升级 +1） */
  statPoints: number;
  /** 主属性：升级时自动 +2 */
  mainStat: MainStat;
  // ============== 战斗系统 ==============
  /** 拾荒策略：'stealth' 优先隐蔽回避 / 'combat' 优先战斗。默认 combat。 */
  strategy: 'stealth' | 'combat';
  /** 背包物品列表（属于角色数据的一部分，null 表示空槽位） */
  inventory: (InventoryItem | null)[];
}

/**
 * 默认主角角色数据
 */
export const DEFAULT_CHARACTER: ScavengeCharacter = {
  id: 'player_1',
  name: '主角',
  str: 5,
  agi: 5,
  end: 5,
  int: 5,
  hp: 100,
  maxHp: 100,
  hunger: 100,
  maxHunger: 100,
  thirst: 100,
  maxThirst: 100,
  sanity: 100,
  maxSanity: 100,
  stamina: 100,
  maxStamina: 100,
  isExploring: false,
  exp: 0,
  level: 1,
  expToNext: 100,
  statPoints: 0,
  mainStat: 'str',
  strategy: 'combat',
  inventory: [],
};

/**
 * 角色状态显示辅助函数
 */
export const getCharacterStatusText = (character: ScavengeCharacter): string => {
  if (character.isExploring) {
    return '派遣中';
  }
  if (character.hp <= 0) {
    return '无法行动';
  }
  // 体力 < 20 算"精疲力竭"
  if (character.stamina < 20) {
    return '精疲力竭';
  }
  if (character.hunger <= 30 || character.thirst <= 30) {
    return '需要物资';
  }
  return '待命';
};

/**
 * 获取状态条颜色
 */
export const getStatusBarColor = (value: number, maxValue: number = 100): string => {
  const percentage = (value / maxValue) * 100;
  if (percentage >= 70) return '#4CAF50';
  if (percentage >= 40) return '#FFC107';
  return '#F44336';
};

/**
 * 规范化角色数据（处理 0/1 转 boolean 等类型问题 + 迁移旧 inventory 数据 + 旧字段兼容）
 *
 * 迁移内容：
 * 1. inventory 槽位可能没有 `instanceId`，统一补一个
 * 2. 旧数据使用 `fatigue` / `maxFatigue` → 改名为 `stamina` / `maxStamina`
 * 3. 旧数据可能没有 exp/level/statPoints/mainStat 字段，初始化默认值
 * 4. 旧数据的 `stamina`（如果之前是 fatigue 字段）可能从 0 开始累积，迁移时把 (maxFatigue - fatigue) 作为新 stamina 初值
 */
export const normalizeCharacter = (char: ScavengeCharacter): ScavengeCharacter => {
  const rawInventory = char.inventory ?? [];
  // 给非 null 的 entry 补 instanceId，null 槽位保留
  const migrated: (InventoryItem | null)[] = rawInventory.map((slot) => {
    if (slot === null) return null;
    return slot;
  });
  const nonNullEntries = migrated.filter((s): s is InventoryItem => s !== null);
  const migratedNonNull = migrateInventory(nonNullEntries);
  let cursor = 0;
  const finalInventory: (InventoryItem | null)[] = migrated.map((slot) => {
    if (slot === null) return null;
    return migratedNonNull[cursor++];
  });

  // 旧字段兼容：fatigue → stamina
  // 旧 stamina = maxFatigue - fatigue（剩余体力 = 上限 - 累积疲劳）
  const legacyFatigue = (char as unknown as { fatigue?: number; maxFatigue?: number }).fatigue;
  const legacyMaxFatigue = (char as unknown as { maxFatigue?: number }).maxFatigue ?? 100;
  const migratedStamina = char.stamina ?? Math.max(0, legacyMaxFatigue - (legacyFatigue ?? 0));
  const migratedMaxStamina = char.maxStamina ?? 100;

  // 派遣字段兜底：旧数据 isExploring=true 但缺 returnDay/PeriodIndex 时
  // 视为"立即返回"（返回时间=当前 0/0），下次推进会被 checkMissionsProgress 结算/清空
  const isExploring = Boolean(char.isExploring);
  const returnDay = isExploring ? (char.returnDay ?? 0) : char.returnDay;
  const returnPeriodIndex = isExploring ? (char.returnPeriodIndex ?? 0) : char.returnPeriodIndex;

  // 旧 armorId 迁移到 6 个 slot（2026-06-07 重构）：
  // 旧 armorId 装备只有 1 个 slot，新系统按物品的 armorSlot 字段自动归位
  const legacyArmorId = (char as unknown as { armorId?: string }).armorId;
  const migratedHelmetId = char.helmetId;
  const migratedChestId = char.chestId;
  const migratedArmsId = char.armsId;
  const migratedGlovesId = char.glovesId;
  const migratedLegsId = char.legsId;
  const migratedBootsId = char.bootsId;
  let finalHelmetId = migratedHelmetId;
  let finalChestId = migratedChestId;
  let finalArmsId = migratedArmsId;
  let finalGlovesId = migratedGlovesId;
  let finalLegsId = migratedLegsId;
  let finalBootsId = migratedBootsId;
  if (legacyArmorId && !migratedHelmetId && !migratedChestId && !migratedArmsId && !migratedGlovesId && !migratedLegsId && !migratedBootsId) {
    const def = getItemById(legacyArmorId);
    const slot: ArmorSlot = (def && def.type === 'equipment' && def.armorSlot) ? def.armorSlot : 'chest';
    if (slot === 'helmet') finalHelmetId = legacyArmorId;
    else if (slot === 'chest') finalChestId = legacyArmorId;
    else if (slot === 'arms') finalArmsId = legacyArmorId;
    else if (slot === 'gloves') finalGlovesId = legacyArmorId;
    else if (slot === 'legs') finalLegsId = legacyArmorId;
    else if (slot === 'boots') finalBootsId = legacyArmorId;
  }
  // 旧 weaponDurability / armorDurability 已废弃（耐久迁到 InventoryItem.durability），这里只兜底

  // 2026-06-07 装备实例迁移：把 inventory 里的装备移到 equipped
  // 老数据：itemId 字段指向的 instance 还在 inventory 里
  // 新数据：itemId 字段只用于识别，instance 必须在 equipped 里
  const slotMappings: Array<{ idField: keyof ScavengeCharacter; equippedKey: EquipSlotKey }> = [
    { idField: 'weaponId', equippedKey: 'weapon' },
    { idField: 'helmetId', equippedKey: 'helmet' },
    { idField: 'chestId', equippedKey: 'chest' },
    { idField: 'armsId', equippedKey: 'arms' },
    { idField: 'glovesId', equippedKey: 'gloves' },
    { idField: 'legsId', equippedKey: 'legs' },
    { idField: 'bootsId', equippedKey: 'boots' },
    { idField: 'toolId', equippedKey: 'tool' },
  ];
  let workingInventory: (InventoryItem | null)[] = [...finalInventory];
  const workingEquipped: Partial<Record<EquipSlotKey, InventoryItem>> = { ...(char.equipped ?? {}) };
  for (const { idField, equippedKey } of slotMappings) {
    const itemId = char[idField] as string | undefined;
    if (!itemId) continue;
    if (workingEquipped[equippedKey]) continue; // 已有 equipped 记录，跳过
    // 在 inventory 里找第一个 itemId 匹配的 instance
    const idx = workingInventory.findIndex((s) => s !== null && s.itemId === itemId);
    if (idx < 0) continue;
    const instance = workingInventory[idx] as InventoryItem;
    workingEquipped[equippedKey] = instance;
    workingInventory[idx] = null;
  }
  // 清理掉 null 槽位
  workingInventory = compactInventorySlots(workingInventory);

  // 2026-06-07 清理未注册的物品（老存档/脏数据导致 UI 显示"未知物品"）
  // 注意：先做 equipped 迁移再做这一步，否则迁移时找不到已装装备的 instance
  {
    const { valid, removed } = filterUnknownItems(workingInventory);
    if (removed.length > 0) {
      // 只 warn 第一次见到的新 ID
      const newUnknown = removed.filter((id) => !_warnedUnknownIds.has(id));
      newUnknown.forEach((id) => _warnedUnknownIds.add(id));
      if (newUnknown.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Scavenge] 自动清理了 ${newUnknown.length} 件未注册物品：` +
          newUnknown.map((id) => `'${id}'`).join(', ') +
          `（角色 ${char.id}，原因为 items.ts 中没有对应注册）` +
          `\n→ 如果这些物品应该保留，请在 items.ts 中补全对应 ID。`,
        );
      }
    }
    workingInventory = valid;
  }
  // 同样清理 equipped 中的未知 ID
  for (const key of Object.keys(workingEquipped) as EquipSlotKey[]) {
    const inst = workingEquipped[key];
    if (inst && !getItemById(inst.itemId)) {
      const warnKey = `equipped.${key}:${inst.itemId}`;
      if (!_warnedUnknownIds.has(warnKey)) {
        _warnedUnknownIds.add(warnKey);
        // eslint-disable-next-line no-console
        console.warn(
          `[Scavenge] 自动清理 equipped.${key} 上的未注册物品 '${inst.itemId}'（角色 ${char.id}）`,
        );
      }
      delete workingEquipped[key];
      // 清掉对应的 slotId 字段
      const idField = `${key}Id` as keyof ScavengeCharacter;
      (char as any)[idField] = undefined;
    }
  }

  return {
    ...char,
    isExploring,
    returnDay,
    returnPeriodIndex,
    stamina: migratedStamina,
    maxStamina: migratedMaxStamina,
    exp: char.exp ?? 0,
    level: char.level ?? 1,
    expToNext: char.expToNext ?? 100,
    statPoints: char.statPoints ?? 0,
    mainStat: char.mainStat ?? 'str',
    strategy: (char.strategy === 'stealth' || char.strategy === 'combat') ? char.strategy : 'combat',
    inventory: workingInventory,
    equipped: workingEquipped,
    helmetId: finalHelmetId,
    chestId: finalChestId,
    armsId: finalArmsId,
    glovesId: finalGlovesId,
    legsId: finalLegsId,
    bootsId: finalBootsId,
  };
};

/**
 * 主属性名（中英映射，给 UI 显示用）
 */
export const MAIN_STAT_NAMES: Record<MainStat, string> = {
  str: '力量',
  agi: '敏捷',
  end: '耐力',
  int: '智力',
};
