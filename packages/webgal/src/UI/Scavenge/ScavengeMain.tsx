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
  // 用 stageState 订阅触发重渲染（missions 变化会通过 setStageState 通知）
  const pendingOutcomeMission = useMemo(() => {
    const missions = readMissions();
    return missions.find(m =>
      (m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled') &&
      m.outcome &&
      !m.outcomeShown,
    );
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
    </>
  );
};
