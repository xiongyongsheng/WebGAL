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
import { ScavengeCharacter } from './ScavengeCharacter/character';
import { ScavengeMenuButton } from './ScavengeMenuButton/ScavengeMenuButton';
import { ScavengeMissionHistoryModal } from './ScavengeMissionHistoryModal/ScavengeMissionHistoryModal';
import { ScavengeEnemyCodex } from './ScavengeEnemies/ScavengeEnemyCodex/ScavengeEnemyCodex';
import { ScavengeItemCodex } from './ScavengeItems/ScavengeItemCodex/ScavengeItemCodex';
import { ScavengeCharacterCodex } from './ScavengeCharacter/ScavengeCharacterCodex/ScavengeCharacterCodex';
import { readMissions } from './ScavengeMissions/missions';
import { ScavengeMissionOutcomeModal } from './ScavengeMissionOutcomeModal/ScavengeMissionOutcomeModal';
import { ScavengeRestModal } from './ScavengeRestModal/ScavengeRestModal';
import { ScavengeCombatLogModal } from './ScavengeCombatLogModal/ScavengeCombatLogModal';
import { ScavengeEncounterBoardModal } from './ScavengeEncounterBoardModal/ScavengeEncounterBoardModal';
import { ScavengeLootDistributionModal } from './ScavengeLootDistributionModal/ScavengeLootDistributionModal';
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
  // 2026-06-09 加：Plan 10 派遣记录
  const [showMissionHistory, setShowMissionHistory] = useState(false);

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
  // 2026-06-09 加：Plan 10 派遣记录 toggle
  const handleOpenMissionHistory = () => setShowMissionHistory(true);
  const handleCloseMissionHistory = () => setShowMissionHistory(false);

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
  // 2026-06-09 加：提前返回（cancelled + reason='early_return'）也弹 outcome modal
  //   - cancelled + reason='cancelled'：不弹（系统取消，不打扰）
  //   - cancelled + reason='early_return'：弹（玩家主动，要看结算）
  const pendingOutcomeMission = useMemo(() => {
    const missions = readMissions();
    return missions.find(m =>
      m.outcome && !m.outcomeShown && (
        m.status === 'completed' ||
        (m.status === 'cancelled' && m.outcome.reason === 'early_return')
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState]);

  // 2026-06-21 加：M1 阶段 - 战利品分配 modal 触发
  //   - 条件：mission 状态为 completed/failed/cancelled + 有 tempLoot + !tempLootDistributed
  //   - 顺序：在 outcome modal **之后**（玩家先看结算结果，再分配物品）
  //   - 注：战斗失败也走这个流程（用户要求"只要队伍背包里面有物资就要走分配流程"）
  const pendingLootMission = useMemo(() => {
    const missions = readMissions();
    return missions.find(m =>
      (m.status === 'completed' || m.status === 'failed' || m.status === 'cancelled') &&
      m.tempLoot && m.tempLoot.length > 0 &&
      !m.tempLootDistributed
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState, pendingOutcomeMission]);

  // 当前分配 modal 对应的队伍（2026-06-21 加）
  const pendingLootParty = useMemo(() => {
    if (!pendingLootMission) return [];
    const partyIds = pendingLootMission.partyCharacterIds && pendingLootMission.partyCharacterIds.length > 0
      ? pendingLootMission.partyCharacterIds
      : [pendingLootMission.characterId];
    const raw = stageState.GameVar['scavenge_characters'];
    if (typeof raw !== 'string') return [];
    try {
      const allChars = JSON.parse(raw) as ScavengeCharacter[];
      return partyIds
        .map(id => allChars.find(c => c.id === id))
        .filter((c): c is ScavengeCharacter => Boolean(c));
    } catch {
      return [];
    }
  }, [pendingLootMission, stageState]);

  // 2026-06-09 加：Plan 3 战斗休整
  //   监听 GameVar `scavenge_rest_pending` → 弹 ScavengeRestModal
  //   格式：{ missionId: string, encounterId: string } | null
  const restPending = useMemo(() => {
    const raw = stageState.GameVar['scavenge_rest_pending'];
    if (typeof raw !== 'string' || raw === 'null') return null;
    try {
      return JSON.parse(raw) as { missionId: string; encounterId: string };
    } catch {
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState]);

  // 当前休整 modal 对应的队伍（2026-06-09 加）
  const restParty = useMemo(() => {
    if (!restPending) return [];
    const missions = readMissions();
    const m = missions.find(x => x.id === restPending.missionId);
    if (!m) return [];
    const partyIds = m.partyCharacterIds && m.partyCharacterIds.length > 0
      ? m.partyCharacterIds
      : [m.characterId];
    const raw = stageState.GameVar['scavenge_characters'];
    if (typeof raw !== 'string') return [];
    try {
      const allChars = JSON.parse(raw) as ScavengeCharacter[];
      return partyIds
        .map(id => allChars.find(c => c.id === id))
        .filter((c): c is ScavengeCharacter => Boolean(c));
    } catch {
      return [];
    }
  }, [restPending, stageState]);

  const closeRestModal = () => {
    // 清 rest_pending（保险）
    stageStateManager.setStageVarAndCommit({
      key: 'scavenge_rest_pending',
      value: JSON.stringify(null),
    });
  };

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

  // 遭遇结果弹窗（2026-06-09 改：所有 mission 一起弹，不一个个弹）
  // 排除 no_encounter（准备期占位 / 安静路过）
  // 包含：
  //   - 所有 active mission 中**最新**未展示的真实 encounter
  //   - 刚完成 mission 中**未展示**的 outcome（status='completed' && !outcomeShown）
  //   - 刚失败 mission 中**未展示**的 outcome（status='failed' && !outcomeShown）
  //   - 提前返回（cancelled + early_return）也包含
  //
  // 2026-06-09 改：**不**用 useMemo（之前用 useMemo 依赖 [stageState]）
  //   原因：useMemo 缓存可能导致**不**及时刷新
  //   改：直接计算（**每次** render 重算）—— 简单可靠
  const pendingBoardMissions = (() => {
    const missions = readMissions();
    // 2026-06-09 加：调试
    if (missions.length > 0) {
      console.log(
        `[看板] 共 ${missions.length} 个 mission:`,
        missions.map(m => ({
          id: m.id.slice(0, 6),
          status: m.status,
          loc: m.locationId,
          party: m.partyCharacterIds?.length ?? 1,
          encCount: m.encounters?.length ?? 0,
          encKinds: (m.encounters ?? []).map(e => `${e.kind}${e.shown === true ? '(已)' : '(未)'}`).join(','),
          hasOutcome: !!m.outcome,
          outcomeShown: m.outcomeShown ?? false,
        }))
      );
    }
    const result = missions.filter(m => {
      // 2026-06-09 改：active mission 中有未展示 encounter
      if (m.status === 'active') {
        const encounters = m.encounters ?? [];
        return encounters.some(e => e.kind !== 'no_encounter' && e.shown !== true);
      }
      // 2026-06-09 加：完成 mission 的 outcome 未展示
      if (m.status === 'completed' && m.outcome && m.outcomeShown !== true) return true;
      // 2026-06-09 加：失败 mission 的 outcome 未展示（**修**战斗失败不显示）
      if (m.status === 'failed' && m.outcome && m.outcomeShown !== true) return true;
      // 2026-06-09 加：提前返回的 outcome 未展示
      if (m.status === 'cancelled' && m.outcome && m.outcomeShown !== true && m.outcome.reason === 'early_return') return true;
      return false;
    });
    if (missions.length > 0) {
      console.log(
        `[看板/筛选] 入选 ${result.length}/${missions.length}:`,
        result.map(m => m.id.slice(0, 6) + '@' + m.locationId)
      );
    }
    return result;
  })();

  // 2026-06-09 加：所有角色（传给 board modal 拿 HP delta）
  const characters = useMemo(() => {
    const raw = stageState.GameVar['scavenge_characters'];
    if (typeof raw !== 'string') return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ScavengeCharacter[];
    } catch { /* ignore */ }
    return [];
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
        {/* 2026-06-09 加：Plan 10 派遣记录按钮（在敌人图鉴下方） */}
        <ScavengeMenuButton
          icon="material-symbols:history"
          label="派遣记录"
          onClick={handleOpenMissionHistory}
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

      {/* 角色列表全屏弹框（包含角色详情卡片 + 仓库）
          2026-06-09 重构：派遣中"视图不变，限制转移"
            - restrictTransfer=true：转移 submenu 隐藏非队内 + 仓库
            - 不 restrictView：仍然显示所有 ally 角色（玩家能给非拾荒角色换装）
          原因：流程图规定"不能和其他非小队角色交换物品，不能和仓库交换物品"
            但**只限转移**，**不限显示**（玩家能看其他角色的状态 + 换装） */}
      {showCharacterList && (() => {
        const activeMission = readMissions().find(m => m.status === 'active');
        const isExploring = activeMission !== undefined;
        const partyIds = isExploring && activeMission
          ? (activeMission.partyCharacterIds && activeMission.partyCharacterIds.length > 0
              ? activeMission.partyCharacterIds
              : [activeMission.characterId])
          : [];
        return (
          <ScavengeCharacterPanel
            onClose={handleCloseCharacterList}
            restrictTransfer={isExploring}
            partyCharacterIds={partyIds}
          />
        );
      })()}

      {/* 2026-06-09 加：Plan 10 派遣记录 modal */}
      {showMissionHistory && (
        <ScavengeMissionHistoryModal onClose={handleCloseMissionHistory} />
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

      {/* 2026-06-21 加：M1 阶段 - 战利品分配 modal（在 outcome modal 之后弹） */}
      {!pendingOutcomeMission && pendingLootMission && pendingLootParty.length > 0 && (
        <ScavengeLootDistributionModal
          mission={pendingLootMission}
          party={pendingLootParty}
          onClose={() => {
            // 强制刷新（modal 内部已写回 mission.tempLootDistributed）
            stageStateManager.setStageVarAndCommit({
              key: '_loot_dismissed_at',
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

      {/* 2026-06-09 加：Plan 3 战斗休整 modal */}
      {restPending && restParty.length > 0 && (
        <ScavengeRestModal
          party={restParty}
          encounterId={restPending.encounterId}
          onClose={closeRestModal}
        />
      )}

      {/* 2026-06-09 改：多队伍回合看板（替代之前一个个弹的 encounter modal）
          - 一次性显示**所有**有未展示 encounter / outcome 的 mission
          - 2026-06-09 改：玩家关闭 modal = **所有** mission 都 mark shown
          - 玩家**主动**关闭 = 玩家**主动**确认
          - 关闭后 modal 自动消失（pendingBoardMissions 为空） */}
      {pendingBoardMissions.length > 0 && (
        <ScavengeEncounterBoardModal
          missions={pendingBoardMissions}
          characters={characters}
          onClose={() => {
            // 内部已经 mark 完所有未读，强制刷新
            stageStateManager.setStageVarAndCommit({
              key: '_board_dismissed_at',
              value: Date.now(),
            });
          }}
        />
      )}
    </>
  );
};
