/**
 * Scavenge 拾荒模块主组件
 * 统一管理所有拾荒相关的 UI 组件
 * 所有显示状态和数据都存储在 GameVar 中，跟随场景存档
 */

import { useState, useEffect, useMemo } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { ScavengeTimeControl } from './ScavengeTimeControl/ScavengeTimeControl';
import { ScavengeMap } from './ScavengeMap/ScavengeMap';
import { ScavengeMapDetail } from './ScavengeMap/ScavengeMapDetail';
import { ScavengeLocationItem } from './ScavengeMap/locations';
import { ScavengeCharacterPanel } from './ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel';
import { ScavengeMenuButton } from './ScavengeMenuButton/ScavengeMenuButton';
import { readMissions } from './ScavengeMissions/missions';
import { ScavengeMissionOutcomeModal } from './ScavengeMissionOutcomeModal/ScavengeMissionOutcomeModal';
import { ScavengeCombatLogModal } from './ScavengeCombatLogModal/ScavengeCombatLogModal';
import styles from './ScavengeMain.module.scss';

export const ScavengeMain = () => {
  const stageState = useStageState();

  // 检查是否应该显示（场景存档控制）
  const isMapVisible = (stageState.GameVar['show_scavenge_map'] as boolean) ?? false;
  const isTimeControlVisible = (stageState.GameVar['show_scavenge_time_control'] as boolean) ?? false;
  const isMenuVisible = (stageState.GameVar['scavenge_show_menu'] as boolean) ?? false;
  const isScavengeActive = isMapVisible || isTimeControlVisible || isMenuVisible;

  // 拾荒场景激活时禁用滚轮打开回想功能
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (isScavengeActive) {
        e.stopPropagation();
      }
    };

    if (isScavengeActive) {
      document.body.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
      document.body.removeEventListener('wheel', handleWheel);
    };
  }, [isScavengeActive]);

  // 地图相关状态
  const [selectedLocation, setSelectedLocation] = useState<ScavengeLocationItem | null>(null);

  // 角色面板显示状态
  const handleOpenCharacterList = () => {
    stageStateManager.setStageVarAndCommit({ key: 'scavenge_show_character_list', value: true });
  };

  const handleCloseCharacterList = () => {
    stageStateManager.setStageVarAndCommit({ key: 'scavenge_show_character_list', value: false });
  };

  // 地图操作
  const handleLocationSelect = (location: ScavengeLocationItem) => {
    setSelectedLocation(location);
  };

  const handleCloseLocationDetail = () => {
    setSelectedLocation(null);
  };

  // 角色列表显示状态
  const showCharacterList = (stageState.GameVar['scavenge_show_character_list'] as boolean) ?? false;

  // 监听 missions 列表：找 status='completed' && !outcomeShown 的最新一个，弹结果窗
  // 派遣结算结果弹窗（监听 missions 变化，弹出未展示的）
  // 2026-06-09 改：失败 mission 不弹 outcome modal（由 encounter modal 单独处理"战斗失败"）
  // 取消的 mission 也不弹（玩家主动撤回，应该不打扰）
  const pendingOutcomeMission = useMemo(() => {
    const missions = readMissions();
    return missions.find(m =>
      m.status === 'completed' &&
      m.outcome &&
      !m.outcomeShown,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState]);

  // 遭遇结果弹窗（监听 missions 变化，弹最新"未展示的真实遭遇"）
  // 排除 no_encounter（准备期占位 / 安静路过）和 失败 mission（失败结果由 outcome modal 处理）
  const pendingEncounter = useMemo(() => {
    const missions = readMissions();
    // 倒序遍历 missions，从最新 mission 开始找
    for (let i = missions.length - 1; i >= 0; i--) {
      const m = missions[i];
      const encounters = m.encounters ?? [];
      // 倒序遍历 encounters，找最新未展示的真实遭遇
      for (let j = encounters.length - 1; j >= 0; j--) {
        const e = encounters[j];
        if (e.kind === 'no_encounter') continue;
        if (e.shown) continue;
        return { missionId: m.id, encounter: e };
      }
    }
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState]);

  if (!isMapVisible && !isTimeControlVisible && !isMenuVisible) return null;

  return (
    <>
      {/* 地图组件 */}
      {isMapVisible && <ScavengeMap onLocationSelect={handleLocationSelect} />}

      {/* 右上角菜单 */}
      {isMenuVisible && (
        <div className={styles.menuGroup}>
          <ScavengeMenuButton
            icon="material-symbols:person"
            label="角色列表"
            onClick={handleOpenCharacterList}
          />
        </div>
      )}

      {/* 时间控制 */}
      {isTimeControlVisible && <ScavengeTimeControl />}

      {/* 地图详情弹框 */}
      {selectedLocation && (
        <ScavengeMapDetail location={selectedLocation} onClose={handleCloseLocationDetail} />
      )}

      {/* 角色列表全屏弹框（包含角色详情卡片 + 仓库） */}
      {showCharacterList && (
        <ScavengeCharacterPanel onClose={handleCloseCharacterList} />
      )}

      {/* 派遣结算结果弹窗（监听 missions 变化，弹出未展示的） */}
      {pendingOutcomeMission && (
        <ScavengeMissionOutcomeModal
          mission={pendingOutcomeMission}
          onClose={() => {
            // modal 内部已 markMissionOutcomeShown，强制刷新以重新计算 pending
            stageStateManager.setStageVarAndCommit({
              key: '_mission_outcome_dismissed_at',
              value: Date.now(),
            });
          }}
        />
      )}

      {/* 遭遇结果弹窗（每个派遣期遭遇的资源点/战斗都弹一次） */}
      {pendingEncounter && (
        <ScavengeCombatLogModal
          missionId={pendingEncounter.missionId}
          encounter={pendingEncounter.encounter}
          onClose={() => {
            // modal 内部已 markEncounterShown，强制刷新
            stageStateManager.setStageVarAndCommit({
              key: '_encounter_dismissed_at',
              value: Date.now(),
            });
          }}
        />
      )}
    </>
  );
};
