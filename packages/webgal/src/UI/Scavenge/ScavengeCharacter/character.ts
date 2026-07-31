/**
 * 拾荒系统 - 角色管理模块
 * 角色数据定义和操作
 *
 * ⚠️ 重要约定（2026-06-21 加）：
 * - 加新 `missionPhase` 状态时，必须**同时**更新：
 *   1. `ScavengeCharacter.missionPhase` 的类型联合
 *   2. `getCharacterStatusText()` 函数（漏了 = UI 显示"待命"bug）
 *   3. `getCharacterStatusDetail()` 函数（剩余回合等详情）
 *   4. `missionPhase.ts` 的 `advanceMissionPhaseOfChars` 推进逻辑
 * - 状态完整列表：null / preparing / scavenging / crafting / repairing
 *
 * 经验教训：2026-06-21 加 crafting/repairing 状态时漏改 getCharacterStatusText，
 *   导致角色建造工作台后面板仍显示"空闲"，用户多次反馈后才定位。
 */

import { InventoryItem, migrateInventory, compactInventorySlots, filterUnknownItems } from '../ScavengeItems/inventory';
import { getItemById, ArmorSlot } from '../ScavengeItems/items';
import { validateCharacter, formatWarnings } from './characterValidate';
import { logger } from '@/Core/util/logger';
import { WORKBENCH_BLUEPRINTS, CRAFT_BLUEPRINTS } from '../ScavengeCrafting/blueprints';

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
  /** 最大体力值（受 end 影响：100 + end*8，2026-06-09 改：去掉 -5 基准） */
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
  /**
   * 2026-06-19 加：Plan 17 - 派遣阶段
   * - 'preparing': 准备阶段（1 回合，**前**往**地**点**路**上**时**间**）—— **会**遇**敌** / **扣**属**性**
   * - 'scavenging': 拾**荒**中**阶**段**（N 回**合**）—— **会**遇**敌** / **扣**属**性**
   * - 'returning': 返**回**阶**段**（1 回**合**）—— **不**遇**敌** / **扣**属**性**
   * - null: 空**闲**（**不**在**派**遣**中**）**
   */
  missionPhase?: 'preparing' | 'scavenging' | 'returning' | 'crafting' | 'repairing' | null;
  /**
   * 2026-06-19 加：Plan 17 - 准**备**阶**段**结**束**时**间**（下一**个** advance 触**发** phase → 'scavenging'）**
   */
  preparingEndDay?: number;
  preparingEndPeriodIndex?: number;
  /**
   * 2026-06-19 加：Plan 17 - 拾**荒**阶**段**结**束**时**间**（下一**个** advance 触**发** phase → 'returning'）**
   */
  scavengingEndDay?: number;
  scavengingEndPeriodIndex?: number;
  /**
   * 2026-06-21 加：工作台制作结**束**时**间**（下一**个** advance 触**发** phase → null + 产出物品）**
   */
  craftingEndDay?: number;
  craftingEndPeriodIndex?: number;
  /** 2026-06-21 加：制作的工作台 ID（crafing 阶段用）*/
  craftingWorkbenchId?: string;
  /** 2026-06-21 加：正在制作的蓝图 ID */
  craftingBlueprintId?: string;
  /**
   * 2026-06-21 加：门窗修补结**束**时**间**（下一**个** advance 触**发** phase → null + HP 恢复）**
   */
  repairingEndDay?: number;
  repairingEndPeriodIndex?: number;
  /** 2026-06-21 加：修补的**目**标**（'door' | 'window'）*/
  repairingTarget?: 'door' | 'window';
  /**
   * 角色持有的特性 ID 列表（2026-06-09 加，引用 traits.ts 里定义）
   * 效果在 computeDerivedStats 实时累加到基础属性/战斗公式上
   * 支持正面/负面/条件触发（如饥=0 时减益）
   */
  traitIds?: string[];
  /**
   * 角色身上的特性实例（2026-06-09 加）
   * 区别于 traitIds：traitInstances 带 expiresAtDay（自动过期）
   * traitIds 是从 traitInstances 派生的简化列表（用于 sumActiveTraitEffects）
   * 注意：玩家不能手动改 traitInstances，只能由 applyAutoTraits/addTrait 系统管理
   */
  traitInstances?: { id: string; addedAtDay: number; expiresAtDay?: number }[];
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
  // ============== 好感度系统（2026-06-09 加）==============
  /** 当前好感度数值（-100 ~ 100）*/
  affinity: number;
  /** 已完成的升阶剧情索引列表
   *  例：[0, 1] 表示"陌生→熟悉"和"熟悉→亲密"的升阶剧情都已完成
   *  门控：affinity 达到下一阈值时，对应索引必须在该列表中才能升级
   */
  completedAffinityStoryLevels: number[];
  // ============== 商人好感度（2026-06-09 加，可选）==============
  /** 商人好感度（独立字段，仅商人有）。
   *  与 affinity 不共用，命名空间独立。
   *  范围 -100~100。
   *  默认 0（普通客户）。
   */
  merchantAffection?: number;
  // ============== 商人金币（2026-06-09 加，可选）==============
  /** 商人当前金币（仅商人有）。
   *  - 玩家买 → 玩家 -X, 商人 +X（但 ≤ maxGold）
   *  - 玩家卖 → 玩家 +X, 商人 -X（但 ≥ 0）
   *  - 玩家不能把商人买空（商人没钱会拒绝）
   */
  gold?: number;
  /** 商人最后刷新时间（day 编号）。
   *  0 表示从未刷新（首次进入时立即刷新一次）。
   *  之后每 refreshDays 天刷新一次（金币 → initialGold, inventory → template）。
   */
  lastRefreshDay?: number;
}

/**
 * 默认主角角色数据
 * 2026-06-09 改：初始属性 25 点（主角专属）—— str=9 最强, agi=6=end=6 次之
 * 总和 = str + agi + end + int = 9+6+6+4 = 25
 * 注意：实际初始化从 scavenge_main.txt 读取，DEFAULT_CHARACTER 是兜底
 */
export const DEFAULT_CHARACTER: ScavengeCharacter = {
  id: 'player_1',
  name: '主角',
  str: 9,
  agi: 6,
  end: 6,
  int: 4,
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
  missionPhase: null,        // 2026-06-19 加：Plan 17 阶段（null = 空闲）
  exp: 0,
  level: 1,
  expToNext: 100,
  statPoints: 0,
  mainStat: 'str',
  strategy: 'combat',
  inventory: [],
  // 好感度系统（2026-06-09 加）
  affinity: 0,
  completedAffinityStoryLevels: [],
  merchantAffection: 0,
  gold: 0,             // 默认 0（主角不卖东西，商人有自己初始值）
  lastRefreshDay: 0,   // 默认 0（首次进入时刷新）
};

/**
 * 角色状态显示辅助函数
 * 2026-06-21 改：加 crafting/repairing 显示
 */
export const getCharacterStatusText = (character: ScavengeCharacter): string => {
  // 2026-06-19 改：Plan 17 - 阶段显示
  if (character.missionPhase === 'preparing') {
    return '准备中';
  }
  if (character.missionPhase === 'scavenging') {
    return '拾荒中';
  }
  if (character.missionPhase === 'crafting') {
    return '建造/制作中';
  }
  if (character.missionPhase === 'repairing') {
    return '修补中';
  }
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
 * 检查角色是否可派遣（系统层硬约束，2026-06-21 加）
 *
 * 规则（**工**作**相**斥**）**：
 * - missionPhase 必须为 null（**没**在做别**的**事**）
 *   - preparing / scavenging / crafting / repairing 都**阻**止
 *   - 这是**系**统**层**面**硬**约**束**，**不**能**被** UI **绕**过**
 * - **不**在 exploring 状**态**（老**字**段**兼**容**）
 *
 * **这**是系**统**单**一**真**相**源**（single source of truth）
 * - UI **显**示**用**这**个**判**断**（**不**要**自**己**重**复**写**判**断**）
 * - **派**遣**创**建** mission **前**也**用**这**个**判**断**（**最**终**防**线**）
 */
export const isCharacterDispatchable = (
  character: ScavengeCharacter,
): { canDispatch: boolean; reason?: string } => {
  // 工作相斥：任何 missionPhase 都阻**止**派**遣**
  if (character.missionPhase !== null && character.missionPhase !== undefined) {
    const phaseText: Record<NonNullable<ScavengeCharacter['missionPhase']>, string> = {
      preparing: '准备中',
      scavenging: '拾荒中',
      crafting: '建造/制作中',
      repairing: '修补中',
      returning: '返回中',
    };
    return {
      canDispatch: false,
      reason: `角色正**在**${phaseText[character.missionPhase]}，**不**可**派**遣`,
    };
  }
  // 老**字**段**兼**容**
  if (character.isExploring) {
    return { canDispatch: false, reason: '角色正**在**派**遣**中' };
  }
  return { canDispatch: true };
};

/**
 * 获取角色状态详细信息（2026-06-21 加）
 * - 例如"建造中：近战武器工作台（剩 1 回合）"
 * - null = **没**有**详**细**信**息（用 statusText 即**可**）
 */
export const getCharacterStatusDetail = (
  character: ScavengeCharacter,
  currentDay: number,
  currentPeriod: number,
): string | null => {
  if (character.missionPhase === 'crafting' && character.craftingEndDay !== undefined && character.craftingEndPeriodIndex !== undefined) {
    // 计算剩余回合
    const totalRemaining = (character.craftingEndDay - currentDay) * 4 + (character.craftingEndPeriodIndex - currentPeriod);
    const remaining = Math.max(0, totalRemaining);
    // 2026-06-21 改：直**接** import（**避**免 require **在** ES module 中**未**定**义**）
    //   blueprints.ts **不**引**用** character.ts，**不**会**循**环**依**赖**
    const blueprintId = character.craftingBlueprintId;
    const blueprintName = WORKBENCH_BLUEPRINTS[blueprintId as keyof typeof WORKBENCH_BLUEPRINTS]?.name
      ?? CRAFT_BLUEPRINTS[blueprintId as keyof typeof CRAFT_BLUEPRINTS]?.name
      ?? blueprintId;
    return `建造中：${blueprintName}（剩 ${remaining} 回合）`;
  }
  if (character.missionPhase === 'repairing' && character.repairingEndDay !== undefined && character.repairingEndPeriodIndex !== undefined) {
    const totalRemaining = (character.repairingEndDay - currentDay) * 4 + (character.repairingEndPeriodIndex - currentPeriod);
    const remaining = Math.max(0, totalRemaining);
    const target = character.repairingTarget === 'door' ? '门' : '窗';
    return `修补中：${target}（剩 ${remaining} 回合）`;
  }
  return null;
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
  // 2026-06-09 改：maxStamina 不再用字段值，每次加载都按 end 公式重算
  // 公式：100 + end * 8（与 characterTimeEffects.ts 保持一致）
  // 原因：scavenge_main.txt 里字段写死 100，UI 读字段直接显示成 100，没体现 end 的加成
  const migratedMaxStamina = 100 + (char.end ?? 5) * 8;

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

  // 2026-06-08：跑数据验证器（耐久 clamp、未知 ID 警告等）
  // 位置：所有迁移完成后，作为最后一步
  // 收益：玩家存档有 over-max 耐久等数据问题时，不再需要手动清 localStorage
  const { char: validated, warnings } = validateCharacter({
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
    traitIds: Array.isArray(char.traitIds) ? char.traitIds : [],
    strategy: (char.strategy === 'stealth' || char.strategy === 'combat') ? char.strategy : 'combat',
    inventory: workingInventory,
    equipped: workingEquipped,
    helmetId: finalHelmetId,
    chestId: finalChestId,
    armsId: finalArmsId,
    glovesId: finalGlovesId,
    legsId: finalLegsId,
    bootsId: finalBootsId,
  });
  if (warnings.length > 0) {
    logger.warn(
      `[Scavenge] normalizeCharacter 自动修复 ${warnings.length} 项数据问题：\n` +
      formatWarnings(warnings),
    );
  }
  return validated;
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
