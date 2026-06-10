/**
 * Scavenge 角色面板 - stage 数据读写（2026-06-09 拆分）
 *
 * 包含：getCharacters / setCharacters / updateCharacter / getWarehouse / setWarehouse
 * 全部基于 stageStateManager.getCalculationStageState().GameVar 读写
 */

import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeCharacter, normalizeCharacter } from '../character';
import {
  InventoryItem, migrateInventory, filterUnknownItems,
} from '../../ScavengeItems/inventory';
import { _warnedUnknownWarehouseIds } from './ScavengeCharacterPanel.types';
import { logger } from '@/Core/util/logger';

/** 读取所有角色，自动 normalize（含装备迁移、字段兜底） */
export const getCharacters = (): ScavengeCharacter[] => {
  const data = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map(c => normalizeCharacter(c as ScavengeCharacter));
      }
    } catch { /* ignore */ }
  }
  if (Array.isArray(data)) {
    return (data as unknown as ScavengeCharacter[]).map(c => normalizeCharacter(c));
  }
  return [];
};

/** 写回角色列表（JSON 序列化） */
export const setCharacters = (characters: ScavengeCharacter[]) => {
  stageStateManager.setStageVarAndCommit({
    key: 'scavenge_characters',
    value: JSON.stringify(characters),
  });
};

/** 通过 id 找并更新单个角色 */
export const updateCharacter = (updated: ScavengeCharacter) => {
  const characters = getCharacters();
  const index = characters.findIndex(c => c.id === updated.id);
  if (index >= 0) {
    characters[index] = updated;
    setCharacters(characters);
  }
};

/** 读取仓库（自动迁移 + 清理未注册物品） */
export const getWarehouse = (): InventoryItem[] => {
  const data = stageStateManager.getCalculationStageState().GameVar['scavenge_warehouse'];
  const normalize = (arr: unknown[]): InventoryItem[] => {
    // 仓库只存储物品（无 null 槽位），过滤掉可能存在的脏数据，并补 instanceId
    const valid = arr.filter(
      (i): i is InventoryItem => i !== null && typeof i === 'object' && 'itemId' in (i as object),
    );
    const migrated = migrateInventory(valid);
    // 2026-06-07：清理未注册物品（同背包逻辑），避免 UI 显示"未知物品"
    const { valid: knownItems, removed } = filterUnknownItems(migrated);
    if (removed.length > 0) {
      // 只 warn 第一次见到的新 ID（避免 React 重渲染刷屏）
      const newUnknown = removed.filter((id) => !_warnedUnknownWarehouseIds.has(id));
      newUnknown.forEach((id) => _warnedUnknownWarehouseIds.add(id));
      if (newUnknown.length > 0) {
        logger.warn(
          `[Scavenge] 仓库自动清理了 ${newUnknown.length} 件未注册物品：` +
          newUnknown.map((id) => `'${id}'`).join(', ') +
          `\n→ 如果这些物品应该保留，请在 items.ts 中补全对应 ID。`,
        );
      }
      // 立即写回 GameVar，避免每次启动都 warn
      setWarehouse(knownItems);
    }
    return knownItems;
  };
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return normalize(parsed);
    } catch { /* ignore */ }
  }
  if (Array.isArray(data)) {
    return normalize(data as unknown[]);
  }
  return [];
};

/** 写回仓库（防御性：过滤 null 槽位） */
export const setWarehouse = (items: InventoryItem[]) => {
  const clean = items.filter((i): i is InventoryItem => i !== null);
  stageStateManager.setStageVarAndCommit({
    key: 'scavenge_warehouse',
    value: JSON.stringify(clean),
  });
};
