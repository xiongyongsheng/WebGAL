/**
 * Scavenge 拾荒模块主组件
 * 统一管理所有拾荒相关的 UI 组件
 * 所有显示状态和数据都存储在 GameVar 中，跟随场景存档
 */

import { useState, useEffect, useMemo } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { changeScene } from '@/Core/controller/scene/changeScene';
import { ScavengeTimeControl } from './ScavengeTimeControl/ScavengeTimeControl';
import { ScavengeMap } from './ScavengeMap/ScavengeMap';
import { ScavengeMapDetail } from './ScavengeMap/ScavengeMapDetail';
import { ScavengeLocationItem } from './ScavengeMap/locations';
import { ScavengeCharacterPanel } from './ScavengeCharacter/ScavengeCharacterPanel/ScavengeCharacterPanel';
import { ScavengeMenuButton } from './ScavengeMenuButton/ScavengeMenuButton';
import { ScavengeEnemyCodex } from './ScavengeEnemies/ScavengeEnemyCodex/ScavengeEnemyCodex';
import { ScavengeItemCodex } from './ScavengeItems/ScavengeItemCodex/ScavengeItemCodex';
import { ScavengeCharacterCodex } from './ScavengeCharacter/ScavengeCharacterCodex/ScavengeCharacterCodex';
import { readMissions } from './ScavengeMissions/missions';
import { ScavengeMissionOutcomeModal } from './ScavengeMissionOutcomeModal/ScavengeMissionOutcomeModal';
import { ScavengeCombatLogModal } from './ScavengeCombatLogModal/ScavengeCombatLogModal';
import { StoryManager } from './Story/StoryManager';
import { getLocationHintFromState } from './Story/storyHint';
import { CharacterRosterManager } from './ScavengeCharacter/CharacterRosterManager';
import styles from './ScavengeMain.module.scss';

export const ScavengeMain = () => {
  // 2026-06-09 加：剧情进度管理（事件驱动，不渲染 UI）
  // 监听 location / time / items 变化 → 检查 wait_trigger → 推进状态机 → 跳场景
  // 2026-06-09 加：角色花名册管理
  // 监听 scavenge_character_ids 变化 → 从 templates 构建完整角色 → 写回 scavenge_characters
  return (
    <>
      <StoryManager />
      <CharacterRosterManager />
      <ScavengeContent />
    </>
  );
};

// 内容组件（拆出来是为了让 StoryManager 不被 conditional 返回阻塞）
const ScavengeContent = () => {
  const stageState = useStageState();

  // 2026-06-09 加：当前场景 URL（用于判断是否在拾荒场景）
  // 注：组件**不卸载**，仅用 CSS 控制显示隐藏（保留 state：缩放级别、滚轮位置等）
  // 切到安全屋/其他场景时，主 UI 用 .hidden class 隐藏，但仍在 DOM 中
  const currentSceneUrl = (stageState.GameVar['current_scene_url'] as string) ?? '';
  const isInScavengeScene = currentSceneUrl.includes('scavenge') || currentSceneUrl === '';

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

  // 2026-06-09 加：敌人图鉴（独立于角色面板）
  const [showCodex, setShowCodex] = useState(false);
  // 2026-06-09 加：物品图鉴
  const [showItemCodex, setShowItemCodex] = useState(false);
  // 2026-06-09 加：特性百科
  const [showTraitCodex, setShowTraitCodex] = useState(false);

  // 角色面板显示状态
  const handleOpenCharacterList = () => {
    stageStateManager.setStageVarAndCommit({ key: 'scavenge_show_character_list', value: true });
  };

  const handleCloseCharacterList = () => {
    stageStateManager.setStageVarAndCommit({ key: 'scavenge_show_character_list', value: false });
  };

  // 2026-06-09 加：敌人图鉴 toggle
  const handleOpenCodex = () => setShowCodex(true);
  const handleCloseCodex = () => setShowCodex(false);
  // 2026-06-09 加：物品图鉴 toggle
  const handleOpenItemCodex = () => setShowItemCodex(true);
  const handleCloseItemCodex = () => setShowItemCodex(false);
  // 2026-06-09 加：特性百科 toggle
  const handleOpenTraitCodex = () => setShowTraitCodex(true);
  const handleCloseTraitCodex = () => setShowTraitCodex(false);

  // 地图操作
  // 2026-06-09 改：jumpScene 优先（不走详情面板，直接切换场景）
  // 用 stage var + 轮询：changeScene 在 lockSceneWrite=true 时会被吞，
  // 通过 stage var 触发可让 changeScene 在 lock 释放后被处理
  // 2026-06-09 加：剧情优先（如果有红点，先触发剧情，让剧情系统接管跳转）
  const handleLocationSelect = (location: ScavengeLocationItem) => {
    if (location.jumpScene) {
      // 检查此地点是否有 pending story（红点）
      // 有红点 → 不发 jumpScene，让 StoryManager 通过 current_location_id 触发剧情场景
      // 没有红点 → 发 jumpScene 跳到目标场景
      const hint = getLocationHintFromState(stageState.GameVar, location.id);
      if (hint === 'story') {
        // 红点状态：剧情优先，不发 jumpScene
        // ScavengeMap 已经 setStageVar current_location_id，StoryManager 会接住
        return;
      }
      stageStateManager.setStageVarAndCommit({
        key: 'pending_scene_jump',
        value: location.jumpScene,
      });
      return;
    }
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

  // 2026-06-09 重写：合并 pending_scene_jump 监听 + current_scene_url 同步
  // 原因：之前只在自己触发 changeScene 时写 current_scene_url
  //  → 但 choose / changeScene: 命令 / 其他来源 跳转时，current_scene_url 不更新
  //  → 切回 scavenge 场景时，ScavengeMap 还显示 .hidden（因为 current_scene_url 还在 safehouse 的）
  // 修复：主动从 WebGAL 同步 current_scene_url（不依赖点击源头）
  useEffect(() => {
    const interval = setInterval(() => {
      import('@/Core/WebGAL').then(({ WebGAL }) => {
        // 1. 主动同步当前场景 URL（任何来源：choose / changeScene: 命令 / pending_scene_jump）
        const currentUrl = WebGAL.sceneManager.sceneData?.currentScene?.sceneUrl ?? '';
        if (currentUrl && currentUrl !== stageState.GameVar['current_scene_url']) {
          stageStateManager.setStageVarAndCommit({ key: 'current_scene_url', value: currentUrl });
        }

        // 2. 处理 pending_scene_jump（marker 点击 → 跳场景）
        const pending = stageState.GameVar['pending_scene_jump'] as string | undefined;
        if (pending && !WebGAL.sceneManager.lockSceneWrite) {
          stageStateManager.setStageVarAndCommit({ key: 'pending_scene_jump', value: '' });
          // 不在这里写 current_scene_url（上面的同步会自动处理）
          changeScene(pending, pending);
        }
      });
    }, 200);
    return () => clearInterval(interval);
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

  // 2026-06-09 改：每个 UI 单独控制显示/隐藏（CSS class）
  // 设计：永远渲染（不卸载），保留组件内部 state
  // - 地图：仅在拾荒场景显示（进了安全屋要藏起来）
  // - 시간条 / 菜单：一直显示（通用 UI）
  // 弹窗（detail/character/codex）由用户主动关闭，仍用条件渲染
  const showMap = isInScavengeScene && isMapVisible;
  const showTime = isTimeControlVisible;
  const showMenu = isMenuVisible;

  return (
    <>
      {/* 地图组件（仅拾荒场景显示，进了安全屋用 .hidden 藏） */}
      <div
        className={showMap ? undefined : styles.hidden}
        style={{ pointerEvents: showMap ? 'auto' : 'none' }}
      >
        <ScavengeMap onLocationSelect={handleLocationSelect} />
      </div>

      {/* 右上角菜单（一直显示：角色列表/敌人图鉴/物品图鉴 是通用功能） */}
      <div
        className={`${styles.menuGroup} ${showMenu ? '' : styles.hidden}`}
        style={{ pointerEvents: showMenu ? 'auto' : 'none' }}
      >
        <ScavengeMenuButton
          icon="material-symbols:person"
          label="角色列表"
          onClick={handleOpenCharacterList}
        />
        {/* 2026-06-09 加：敌人图鉴按钮（在角色列表下方） */}
        <ScavengeMenuButton
          icon="material-symbols:swords"
          label="敌人图鉴"
          onClick={handleOpenCodex}
        />
        {/* 2026-06-09 加：物品图鉴按钮（在敌人图鉴下方） */}
        <ScavengeMenuButton
          icon="material-symbols:inventory-2"
          label="物品图鉴"
          onClick={handleOpenItemCodex}
        />
        {/* 2026-06-09 加：特性百科按钮（在物品图鉴下方） */}
        <ScavengeMenuButton
          icon="material-symbols:menu-book"
          label="特性百科"
          onClick={handleOpenTraitCodex}
        />
      </div>

      {/* 시간控制（一直显示：通用时间条） */}
      <div
        className={showTime ? undefined : styles.hidden}
        style={{ pointerEvents: showTime ? 'auto' : 'none' }}
      >
        <ScavengeTimeControl />
      </div>

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

      {/* 敌人图鉴（2026-06-09 加，浮层覆盖整个屏幕） */}
      {showCodex && <ScavengeEnemyCodex onClose={handleCloseCodex} />}

      {/* 物品图鉴（2026-06-09 加，浮层覆盖整个屏幕） */}
      {showItemCodex && <ScavengeItemCodex onClose={handleCloseItemCodex} />}

      {/* 特性百科（2026-06-09 加） */}
      {showTraitCodex && <ScavengeCharacterCodex onClose={handleCloseTraitCodex} />}

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
