/**
 * 建造系统 - GameVar 读写（2026-06-21 加）
 *
 * 2 个 GameVar（2026-06-21 改：蓝图**不**再**独**立 GameVar）：
 * - scavenge_workbenches: Workbench[] - 玩家拥有的工作台
 * - scavenge_safehouse: SafehouseStructure - 安全屋门窗状态
 *
 * 蓝图**存**仓库**普**通物**品**里（itemId 是 `bp_xxx` / `craft_xxx`）
 *
 * 注：所有读都用 getter + 兜底（首次返回默认值）
 *     所有写都用 setStageVarAndCommit
 */

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import {
  WORKBENCHES_GAMEVAR,
  SAFEHOUSE_GAMEVAR,
  Workbench,
  SafehouseStructure,
} from './crafting.types';
import { getWarehouse } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel.stage';
import {
  DOOR_INITIAL_HP,
  WINDOW_INITIAL_HP,
  DEFAULT_WINDOW_COUNT,
} from './blueprints';

// ============== 通用 helper ==============

/** 从 GameVar 读 JSON（兜底空） */
const readJson = <T,>(key: string, fallback: T): T => {
  const data = stageStateManager.getCalculationStageState().GameVar[key];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return parsed as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

/** 写 JSON 到 GameVar（trigger UI 重渲染） */
const writeJson = (key: string, value: unknown) => {
  stageStateManager.setStageVarAndCommit({
    key,
    value: JSON.stringify(value),
  });
};

// ============== 工作台 ==============

/** 读所有工作台（首次返回空数组） */
export const getWorkbenches = (): Workbench[] => {
  return readJson<Workbench[]>(WORKBENCHES_GAMEVAR, []);
};

/** 写工作台 */
export const setWorkbenches = (workbenches: Workbench[]) => {
  writeJson(WORKBENCHES_GAMEVAR, workbenches);
};

/** 找单个工作台 */
export const findWorkbench = (id: string): Workbench | undefined => {
  return getWorkbenches().find(w => w.id === id);
};

/** 按位置找工作台 */
export const getWorkbenchesAt = (location: 'safehouse' | 'kitchen'): Workbench[] => {
  return getWorkbenches().filter(w => w.location === location);
};

/** 按类型找工作台（全局，第一个匹配的）*/
export const getWorkbenchOfType = (type: Workbench['type']): Workbench | undefined => {
  return getWorkbenches().find(w => w.type === type);
};

/** 加一个工作台 */
export const addWorkbench = (workbench: Workbench) => {
  const list = getWorkbenches();
  setWorkbenches([...list, workbench]);
};

/** 更新工作台 */
export const updateWorkbench = (id: string, patch: Partial<Workbench>) => {
  const list = getWorkbenches();
  const newList = list.map(w => w.id === id ? { ...w, ...patch } : w);
  setWorkbenches(newList);
};

/** 删除工作台（暂时不支持，保留接口）*/
export const removeWorkbench = (id: string) => {
  setWorkbenches(getWorkbenches().filter(w => w.id !== id));
};

// ============== 蓝图 ==============
// 2026-06-21 改：蓝图**不**再走 ownedBlueprints GameVar
//   - 改**为**当**普**通物**品**入仓库（itemId 是 `bp_xxx` / `craft_xxx`）
//   - 玩家**可**以买卖/拾**到**/丢**弃**，**不**消耗
//   - 建造时**从**仓库"**借**"一**张**图，**不**扣数量
//   - 旧 scavenge_blueprints GameVar **不**再**使用**（**不**迁移，**无**老存**档**）

/** 检查仓库里是否有该蓝图（**数**量 >= 1） */
export const checkWarehouseHasBlueprint = (itemId: string): boolean => {
  const warehouse = getWarehouse();
  return warehouse.some(i => i.itemId === itemId && i.quantity > 0);
};

/** 仓库里某蓝图的数量 */
export const countBlueprintInWarehouse = (itemId: string): number => {
  const warehouse = getWarehouse();
  return warehouse
    .filter(i => i.itemId === itemId)
    .reduce((sum, i) => sum + i.quantity, 0);
};

// ============== 安全屋结构 ==============

/** 默认安全屋结构 */
const DEFAULT_SAFEHOUSE: SafehouseStructure = {
  door: { hp: DOOR_INITIAL_HP, maxHp: DOOR_INITIAL_HP },
  windows: {
    eachHp: WINDOW_INITIAL_HP,
    eachMaxHp: WINDOW_INITIAL_HP,
    count: DEFAULT_WINDOW_COUNT,
  },
  doorRepairJob: null,
  windowRepairJob: null,
};

/** 读安全屋结构 */
export const getSafehouseStructure = (): SafehouseStructure => {
  return readJson<SafehouseStructure>(SAFEHOUSE_GAMEVAR, DEFAULT_SAFEHOUSE);
};

/** 写安全屋结构 */
export const setSafehouseStructure = (structure: SafehouseStructure) => {
  writeJson(SAFEHOUSE_GAMEVAR, structure);
};

/** 修补门（patch） */
export const patchDoor = (patch: Partial<SafehouseStructure['door']>) => {
  const s = getSafehouseStructure();
  setSafehouseStructure({ ...s, door: { ...s.door, ...patch } });
};

/** 修补窗（patch） */
export const patchWindows = (patch: Partial<SafehouseStructure['windows']>) => {
  const s = getSafehouseStructure();
  setSafehouseStructure({ ...s, windows: { ...s.windows, ...patch } });
};

/** 重置安全屋（调试用） */
export const resetSafehouseStructure = () => {
  setSafehouseStructure(DEFAULT_SAFEHOUSE);
};
