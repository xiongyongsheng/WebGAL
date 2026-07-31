/**
 * 建造系统 - Action 层（2026-06-21 加）
 *
 * 提供 3 类 action：
 * 1. startWorkbenchBuild(charId, blueprintId) - 角色开始建造工作台
 * 2. startCrafting(charId, workbenchId, blueprintId) - 角色开始制作物品
 * 3. startRepair(charId, target) - 角色开始修补门窗
 *
 * + 4 个 helper：
 * - applyCraftingResult(char) - 工作台任务完成 → 产出物品 + 角色回 idle
 * - applyRepairResult(char) - 修补任务完成 → HP 恢复 + 角色回 idle
 * - applyDailyStructureDamage() - 每日结算门窗损耗 -1 HP
 * - checkCraftingConflicts() - 检查角色是否在派其他活
 *
 * 注：所有 action 只**写状态**，不直接改 stage。
 *     时间推进由 CharacterSystem 在 advance 时调用 advanceMissionPhaseOfChars。
 *     任务完成时 CharacterSystem 调 applyCraftingResult / applyRepairResult 产出。
 */

import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { getCharacters, setCharacters, getWarehouse, setWarehouse } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import { removeFromInventory, addToInventory, generateInstanceId, InventoryItem } from '../ScavengeItems/inventory';
import { getItemById } from '../ScavengeItems/items';
import { findBlueprint, CRAFT_BLUEPRINTS, WORKBENCH_BLUEPRINTS, REPAIR_COSTS, REPAIR_AMOUNTS, DAILY_STRUCTURE_DAMAGE } from './blueprints';
import { checkWarehouseHasBlueprint } from './craftingStore';
import {
  Workbench,
  WorkbenchBlueprint,
  CraftBlueprint,
  WorkbenchType,
  CraftJob,
} from './crafting.types';
import {
  getWorkbenches,
  setWorkbenches,
  findWorkbench,
  updateWorkbench,
  addWorkbench,
  getSafehouseStructure,
  setSafehouseStructure,
  patchDoor,
  patchWindows,
} from './craftingStore';

// ============== 工具 ==============

/**
 * 2026-06-21 改：时**间**单**位 = **回**合**数**（period）
 *   - 玩家**推**进 1 时**段** = 1 回合
 *   - 1 天 = 4 回合
 *   - 玩**家**不**关**注"小时"
 */
const PERIODS_PER_DAY = 4;

/**
 * 计算 N 回合后的时间
 * @param startDay 开始的 day
 * @param startPeriod 开始的时段
 * @param periods 消耗回合数
 * @returns { day, period }
 */
const addPeriods = (startDay: number, startPeriod: number, periods: number): { day: number; period: number } => {
  // 一天 4 个时段（morning/noon/afternoon/evening）
  const totalPeriods = startPeriod + periods;
  const dayOffset = Math.floor(totalPeriods / PERIODS_PER_DAY);
  const period = totalPeriods % PERIODS_PER_DAY;
  return { day: startDay + dayOffset, period };
};

/** 角色是否在做别的事（不能开始新活） */
export const checkCraftingConflicts = (char: ScavengeCharacter): boolean => {
  return char.missionPhase !== null && char.missionPhase !== undefined;
};

/** 找角色 */
const findChar = (charId: string): ScavengeCharacter | undefined => {
  return getCharacters().find(c => c.id === charId);
};

/** 写角色（替换某 char） */
const writeChar = (char: ScavengeCharacter) => {
  const all = getCharacters();
  setCharacters(all.map(c => c.id === char.id ? char : c));
};

// ============== 1. 建造工作台 ==============

/**
 * 角色开始建造工作台
 * 2026-06-21 改：从**仓库**扣材料（**不**再**从**角色背包）
 *   - 仓库**是**所有物**品**的**源**头
 *   - 玩家把材料**放**到仓库**后**才**能**工作台建
 * @param charId 角色 ID
 * @param blueprintId 工作台蓝图 ID（bp_*）
 * @param startDay 当前 day
 * @param startPeriod 当前时段
 * @returns 成功/失败（材料不足 / 角色忙 / 蓝图不存在 / 缺图纸）
 */
export const startWorkbenchBuild = (
  charId: string,
  blueprintId: string,
  startDay: number,
  startPeriod: number,
): { success: boolean; reason?: string } => {
  const bp = WORKBENCH_BLUEPRINTS[blueprintId as keyof typeof WORKBENCH_BLUEPRINTS];
  if (!bp) return { success: false, reason: '蓝图不存在' };

  const char = findChar(charId);
  if (!char) return { success: false, reason: '角色不存在' };
  if (checkCraftingConflicts(char)) {
    return { success: false, reason: `${char.name} 正在忙别的事` };
  }

  // 1. 检查仓库里是否有该图纸（**不**消耗，**只**是判**断**）
  if (!checkWarehouseHasBlueprint(blueprintId)) {
    return { success: false, reason: '仓库里没有该图纸' };
  }

  // 2. 从仓库扣材料（**检**查**所**有**数**量**是**否足**够**）
  const warehouse = getWarehouse();
  for (const mat of bp.materials) {
    const found = warehouse.find(i => i.itemId === mat.itemId);
    if (!found || found.quantity < mat.quantity) {
      return {
        success: false,
        reason: `${getItemById(mat.itemId)?.name ?? mat.itemId} 不足（需要 ${mat.quantity}）`,
      };
    }
  }
  // 3. 扣材料（**不**动图纸）
  let newWarehouse: (InventoryItem | null)[] = warehouse.slice();
  for (const mat of bp.materials) {
    newWarehouse = removeFromInventory(newWarehouse, mat.itemId, mat.quantity);
  }
  setWarehouse(newWarehouse.filter((i): i is InventoryItem => i !== null));

  // 4. 角色进 crafting 状态
  const end = addPeriods(startDay, startPeriod, bp.buildTime);
  // 角色进 crafting 状态（**不**动 char.inventory，材料**从**仓库扣）
  const newChar: ScavengeCharacter = {
    ...char,
    missionPhase: 'crafting',
    craftingEndDay: end.day,
    craftingEndPeriodIndex: end.period,
    craftingBlueprintId: bp.id,
  };
  writeChar(newChar);
  return { success: true };
};

/**
 * 完成工作台建造 → 创建工作台 + 返回清理后的新 char
 * 2026-06-21 改：返回新 char（**不**直接写，由 CharacterSystem 合并）
 */
export const completeWorkbenchBuild = (char: ScavengeCharacter): { newChar: ScavengeCharacter; workbench: Workbench } | null => {
  if (char.missionPhase !== null) return null;
  if (char.craftingEndDay === undefined) return null;
  if (!char.craftingBlueprintId) return null;
  // 区分：造工作台没有 craftingWorkbenchId
  if (char.craftingWorkbenchId) return null;

  const bp = WORKBENCH_BLUEPRINTS[char.craftingBlueprintId as keyof typeof WORKBENCH_BLUEPRINTS];
  if (!bp) return null;

  // 生成工作台
  const workbench: Workbench = {
    id: `wb_${bp.id}_${Date.now()}`,
    type: bp.workbenchType,
    name: bp.name,
    location: bp.workbenchType === 'cooking' ? 'kitchen' : 'safehouse',
    hp: 100,
    maxHp: 100,
    buildDay: char.craftingEndDay,
    currentJob: null,
  };
  addWorkbench(workbench);

  // 返回清理后的新 char
  const newChar: ScavengeCharacter = {
    ...char,
    craftingEndDay: undefined,
    craftingEndPeriodIndex: undefined,
    craftingBlueprintId: undefined,
  };
  return { newChar, workbench };
};

// ============== 2. 制作物品 ==============

/**
 * 角色在工作台开始制作物品
 * 2026-06-21 改：从**仓库**扣材料 + 检**查**图纸
 */
export const startCrafting = (
  charId: string,
  workbenchId: string,
  blueprintId: string,
  startDay: number,
  startPeriod: number,
): { success: boolean; reason?: string } => {
  const bp = CRAFT_BLUEPRINTS[blueprintId as keyof typeof CRAFT_BLUEPRINTS];
  if (!bp) return { success: false, reason: '蓝图不存在' };

  const wb = findWorkbench(workbenchId);
  if (!wb) return { success: false, reason: '工作台不存在' };
  if (wb.type !== bp.workbenchType) {
    return { success: false, reason: '工作台类型不匹配' };
  }
  if (wb.currentJob) {
    return { success: false, reason: '工作台正在被使用' };
  }

  const char = findChar(charId);
  if (!char) return { success: false, reason: '角色不存在' };
  if (checkCraftingConflicts(char)) {
    return { success: false, reason: `${char.name} 正在忙别的事` };
  }

  // 1. 检查仓库里是否有该图纸（**不**消耗）
  if (!checkWarehouseHasBlueprint(blueprintId)) {
    return { success: false, reason: '仓库里没有该图纸' };
  }

  // 2. 从仓库扣材料（先检查）
  const warehouse = getWarehouse();
  for (const mat of bp.materials) {
    const found = warehouse.find(i => i.itemId === mat.itemId);
    if (!found || found.quantity < mat.quantity) {
      return {
        success: false,
        reason: `${getItemById(mat.itemId)?.name ?? mat.itemId} 不足（需要 ${mat.quantity}）`,
      };
    }
  }
  // 3. 扣材料
  let newWarehouse: (InventoryItem | null)[] = warehouse.slice();
  for (const mat of bp.materials) {
    newWarehouse = removeFromInventory(newWarehouse, mat.itemId, mat.quantity);
  }
  setWarehouse(newWarehouse.filter((i): i is InventoryItem => i !== null));

  // 4. 角色进 crafting + 工作台占位（**不**动 char.inventory）
  const end = addPeriods(startDay, startPeriod, bp.craftTime);
  const newChar: ScavengeCharacter = {
    ...char,
    missionPhase: 'crafting',
    craftingEndDay: end.day,
    craftingEndPeriodIndex: end.period,
    craftingWorkbenchId: workbenchId,
    craftingBlueprintId: bp.id,
  };
  const job: CraftJob = {
    blueprintId: bp.id,
    crafterCharId: charId,
    startDay,
    startPeriod,
    endDay: end.day,
    endPeriod: end.period,
    blueprintKind: 'item',
  };
  writeChar(newChar);
  updateWorkbench(workbenchId, { currentJob: job });
  return { success: true };
};

/**
 * 完成制作 → 产出物**品**入仓库 + 释放工作台
 * 2026-06-21 改：产出**到**仓库（**不**是角色背包）
 */
export const completeCrafting = (char: ScavengeCharacter): { newChar: ScavengeCharacter; itemId: string; quantity: number } | null => {
  if (char.missionPhase !== null) return null;
  if (char.craftingEndDay === undefined) return null;
  if (!char.craftingBlueprintId) return null;
  if (!char.craftingWorkbenchId) return null;

  const bp = CRAFT_BLUEPRINTS[char.craftingBlueprintId as keyof typeof CRAFT_BLUEPRINTS];
  if (!bp) return null;

  // 加物品到仓库（**不**到角色背包，仓库**是**所有物**品**的**源**头）
  const warehouse = getWarehouse();
  const newWarehouse = addToInventory(warehouse, {
    itemId: bp.resultItemId,
    quantity: 1,
    instanceId: generateInstanceId(),
  });
  setWarehouse(newWarehouse.filter((i): i is InventoryItem => i !== null));

  // 释放工作台
  const wb = findWorkbench(char.craftingWorkbenchId);
  if (wb && wb.currentJob) {
    updateWorkbench(wb.id, { currentJob: null });
  }

  // 返回新 char（**不**直接写，由 CharacterSystem 合并）
  const newChar: ScavengeCharacter = {
    ...char,
    craftingEndDay: undefined,
    craftingEndPeriodIndex: undefined,
    craftingWorkbenchId: undefined,
    craftingBlueprintId: undefined,
  };

  return { newChar, itemId: bp.resultItemId, quantity: 1 };
};

// ============== 3. 修补门窗 ==============

/**
 * 角色开始修补门窗
 * 2026-06-21 改：从**仓库**扣木材
 */
export const startRepair = (
  charId: string,
  target: 'door' | 'window',
  startDay: number,
  startPeriod: number,
): { success: boolean; reason?: string } => {
  const char = findChar(charId);
  if (!char) return { success: false, reason: '角色不存在' };
  if (checkCraftingConflicts(char)) {
    return { success: false, reason: `${char.name} 正在忙别的事` };
  }

  const cost = target === 'door' ? REPAIR_COSTS.door : REPAIR_COSTS.window;

  // 检查目标队列
  const s = getSafehouseStructure();
  if (target === 'door' && s.doorRepairJob) {
    return { success: false, reason: '门已经在修补中' };
  }
  if (target === 'window' && s.windowRepairJob) {
    return { success: false, reason: '窗已经在修补中' };
  }

  // 检查仓库木材
  const warehouse = getWarehouse();
  const woodItem = warehouse.find(i => i.itemId === 'material_wood');
  if (!woodItem || woodItem.quantity < cost.materialWood) {
    return { success: false, reason: `仓库里需要 ${cost.materialWood} 块木材` };
  }
  // 扣木材
  const newWarehouse = removeFromInventory(warehouse, 'material_wood', cost.materialWood);
  setWarehouse(newWarehouse.filter((i): i is InventoryItem => i !== null));

  // 角色进 repairing 状态
  const end = addPeriods(startDay, startPeriod, cost.hours);
  const newChar: ScavengeCharacter = {
    ...char,
    missionPhase: 'repairing',
    repairingEndDay: end.day,
    repairingEndPeriodIndex: end.period,
    repairingTarget: target,
  };

  // 更新安全屋状态（修补中的 job）
  if (target === 'door') {
    setSafehouseStructure({
      ...s,
      doorRepairJob: {
        charId,
        target: 'door',
        startDay,
        startPeriod,
        endDay: end.day,
        endPeriod: end.period,
      },
    });
  } else {
    setSafehouseStructure({
      ...s,
      windowRepairJob: {
        charId,
        target: 'window',
        startDay,
        startPeriod,
        endDay: end.day,
        endPeriod: end.period,
      },
    });
  }
  writeChar(newChar);
  return { success: true };
};

/**
 * 完成修补 → HP 恢复 + 清角色状态 + 清 job
 */
export const completeRepair = (char: ScavengeCharacter): { newChar: ScavengeCharacter; target: 'door' | 'window'; recovered: number } | null => {
  if (char.missionPhase !== null) return null;
  if (char.repairingEndDay === undefined) return null;
  if (!char.repairingTarget) return null;

  const target = char.repairingTarget;
  const amount = target === 'door' ? REPAIR_AMOUNTS.door : REPAIR_AMOUNTS.window;

  const s = getSafehouseStructure();
  if (target === 'door') {
    const newHp = Math.min(s.door.maxHp, s.door.hp + amount);
    setSafehouseStructure({ ...s, door: { ...s.door, hp: newHp }, doorRepairJob: null });
  } else {
    const newEachHp = Math.min(s.windows.eachMaxHp, s.windows.eachHp + amount);
    setSafehouseStructure({
      ...s,
      windows: { ...s.windows, eachHp: newEachHp },
      windowRepairJob: null,
    });
  }

  // 返回清理后的新 char（不直接写，由 CharacterSystem 合并）
  const newChar: ScavengeCharacter = {
    ...char,
    repairingEndDay: undefined,
    repairingEndPeriodIndex: undefined,
    repairingTarget: undefined,
  };
  return { newChar, target, recovered: amount };
};

// ============== 4. 每日结算：门窗损耗 ==============

/**
 * 每日结算 - 门窗损耗
 * 由 CharacterSystem 在 day 变化时调
 */
export const applyDailyStructureDamage = (damage: number = DAILY_STRUCTURE_DAMAGE) => {
  const s = getSafehouseStructure();
  const newDoorHp = Math.max(0, s.door.hp - damage);
  const newWindowHp = Math.max(0, s.windows.eachHp - damage);
  setSafehouseStructure({
    ...s,
    door: { ...s.door, hp: newDoorHp },
    windows: { ...s.windows, eachHp: newWindowHp },
  });
};

// ============== 5. 推进时调用的统一结算 ==============

/**
 * 在 CharacterSystem 推进时间时调
 * 处理所有 crafting/repairing 完成 → 产出物品 / 恢复 HP
 *
 * 必须在 advanceMissionPhaseOfChars 之后调（因为需要 phase 已变 null）
 *
 * @param chars advance 后的角色列表
 * @param currentDay 当前 day
 * @param currentPeriod 当前 period
 * @returns { newChars, results }
 *   - newChars: 替换后的角色列表（产出物品 / 清 crafting 状态）
 *   - results: 产出消息（用于 UI 通知）
 */
export const applyCraftingResults = (chars: ScavengeCharacter[], currentDay: number, currentPeriod: number): {
  newChars: ScavengeCharacter[];
  results: Array<{
    charId: string;
    charName: string;
    result: 'workbench_built' | 'item_crafted' | 'door_repaired' | 'window_repaired';
    message: string;
  }>;
} => {
  const results: Array<{
    charId: string;
    charName: string;
    result: 'workbench_built' | 'item_crafted' | 'door_repaired' | 'window_repaired';
    message: string;
  }> = [];
  const newChars: ScavengeCharacter[] = [];

  for (const c of chars) {
    let newChar = c;
    let hasChange = false;

    // crafting 完成
    if (
      c.missionPhase === null &&
      c.craftingEndDay !== undefined &&
      c.craftingEndPeriodIndex !== undefined
    ) {
      const reached = (currentDay > c.craftingEndDay) ||
        (currentDay === c.craftingEndDay && currentPeriod >= c.craftingEndPeriodIndex);
      if (reached) {
        // 区分：造工作台 vs 造物品
        if (c.craftingWorkbenchId) {
          // 造物品
          const r = completeCrafting(c);
          if (r) {
            newChar = r.newChar;
            hasChange = true;
            results.push({
              charId: c.id,
              charName: c.name,
              result: 'item_crafted',
              message: `${c.name} 完成了制作：${r.itemId}`,
            });
          }
        } else {
          // 造工作台
          const r = completeWorkbenchBuild(c);
          if (r) {
            newChar = r.newChar;
            hasChange = true;
            results.push({
              charId: c.id,
              charName: c.name,
              result: 'workbench_built',
              message: `${c.name} 建造完成：${r.workbench.name}`,
            });
          }
        }
      }
    }

    // repairing 完成
    if (
      c.missionPhase === null &&
      c.repairingEndDay !== undefined &&
      c.repairingEndPeriodIndex !== undefined
    ) {
      const reached = (currentDay > c.repairingEndDay) ||
        (currentDay === c.repairingEndDay && currentPeriod >= c.repairingEndPeriodIndex);
      if (reached) {
        const r = completeRepair(c);
        if (r) {
          newChar = r.newChar;
          hasChange = true;
          results.push({
            charId: c.id,
            charName: c.name,
            result: r.target === 'door' ? 'door_repaired' : 'window_repaired',
            message: `${c.name} 修补完成：${r.target === 'door' ? '门' : '窗'} +${r.recovered} HP`,
          });
        }
      }
    }

    newChars.push(hasChange ? newChar : c);
  }

  return { newChars, results };
};
