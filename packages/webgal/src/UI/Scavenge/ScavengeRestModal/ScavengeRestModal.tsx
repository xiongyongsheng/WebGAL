/**
 * 战斗休整 modal（2026-06-09 重构：复用 ScavengeCharacterPanel）
 *
 * 设计（按用户重定义）：
 * 1. **直接复用 ScavengeCharacterPanel**，传 restMode=true
 *    - 隐藏：非队内角色、仓库、跨队转移选项
 *    - 显示：状态条 + 装备 + 物品
 * 2. 玩家用背包里的物品补充状态（吃/喝/药）
 * 3. 玩家可以更换装备
 * 4. 关闭 modal → encounter.shown = true, restChoice = 'rest'
 *
 * 触发：encounterCheck 战斗胜利后，ScavengeTimeControl 写 GameVar
 *   `scavenge_rest_pending: { missionId, encounterId }`
 *   ScavengeMain 监听 → 弹本 modal
 *
 * 为什么不自己写"简化版角色列表"？
 *   - 重复代码（已在 ScavengeCharacterPanel 实现）
 *   - 行为不一致（休整 modal 跟角色列表操作不一样，玩家困惑）
 *   - 维护成本（2 套代码，2 个 bug）
 *
 * 之前错误：写了 ScavengeRestCharacterDetail（已删除）
 */
import { ScavengeCharacter } from '../ScavengeCharacter/character';
import { ScavengeCharacterPanel } from '../ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel';
import {
  readMissions, writeMissions,
} from '../ScavengeMissions/missions';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import styles from './ScavengeRestModal.module.scss';

interface ScavengeRestModalProps {
  /** 派往队伍（1-3 人） */
  party: ScavengeCharacter[];
  /**
   * 触发休整的 encounter id（用于标记 shown）
   * - string：战斗触发的休整（有 encounter 可标记）
   * - null：玩家主动休整（无 encounter，不标记）
   */
  encounterId: string | null;
  /** 关闭 modal（标记 restChoice='rest'） */
  onClose: () => void;
}

export const ScavengeRestModal = ({ party, encounterId, onClose }: ScavengeRestModalProps) => {
  if (party.length === 0) return null;

  const partyIds = party.map(c => c.id);

  /**
   * 关闭 modal
   * - 有 encounterId：标记 encounter.shown = true, restChoice = 'rest'
   * - 无 encounterId（null）：玩家主动休整，不改 encounter
   * - 清 scavenge_rest_pending GameVar
   */
  const handleClose = () => {
    if (encounterId !== null) {
      // 战斗触发：标记 encounter
      const missions = readMissions();
      const newMissions = missions.map(m => ({
        ...m,
        encounters: (m.encounters ?? []).map(e =>
          e.id === encounterId
            ? { ...e, shown: true, restChoice: 'rest' as const }
            : e
        ),
      }));
      writeMissions(newMissions);
    }
    // 主动触发：什么 encounter 都不改

    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_rest_pending',
      value: JSON.stringify(null),
    });

    onClose();
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.stopPropagation()}>
      {/* 复用 ScavengeCharacterPanel（restMode=true）
          - 内部关闭按钮（panel 标题栏的 ×）被点击时，会调 onClose
          - 玩家"完成休整"或"跳过"都是同一个行为：关闭 modal
            （区别只是玩家是否消耗了物品，但行为上都是 close） */}
      <div className={styles.panelWrapper}>
        <ScavengeCharacterPanel
          restrictView
          restrictTransfer
          partyCharacterIds={partyIds}
          onClose={handleClose}
        />
      </div>
    </div>
  );
};
