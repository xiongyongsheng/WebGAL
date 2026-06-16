import { useState, useMemo, useRef, useEffect } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { SCREEN_CONSTANTS } from '@/Core/util/constants';
import {
  SCAVENGE_LOCATIONS,
  ScavengeLocationItem,
  getDangerStars,
} from './locations';
import { Icon } from '@iconify/react';
import locationOn from '@iconify-icons/material-symbols/location-on';
import lock from '@iconify-icons/material-symbols/lock';
import person from '@iconify-icons/material-symbols/person';
import schedule from '@iconify-icons/material-symbols/schedule';
import { readMissions } from '../ScavengeMissions/missions';
import { ScavengeCharacter, normalizeCharacter } from '../ScavengeCharacter/character';
import { usePanZoom } from './ScavengeMap.panZoom';
import styles from './ScavengeMap.module.scss';
import CityMap from '@/assets/images/map/city-map-2k.png';

interface ScavengeMapProps {
  onLocationSelect: (location: ScavengeLocationItem) => void;
  /** 可选：自动中心化到此 locationId（2026-06-09 加：支持外部触发） */
  focusLocationId?: string;
}

// 2026-06-09 改：使用 SCREEN_CONSTANTS（2560×1440）作为世界坐标系
// 原因：用户明确要求，且与 game viewport 一致，pan/zoom 数学更直观
// 注：City-map-1.png 实际 viewBox 是 922×518，但会通过 object-fit: cover / contain 拉伸到 2560×1440
const SVG_WIDTH = SCREEN_CONSTANTS.width;   // 2560
const SVG_HEIGHT = SCREEN_CONSTANTS.height; // 1440

export const ScavengeMap = ({ onLocationSelect, focusLocationId }: ScavengeMapProps) => {
  const stageState = useStageState();
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 2026-06-09 改：移到所有 hooks 之后（hooks 必须按相同顺序调用）
  // 见文末 isVisible return null 注释
  const isVisible = (stageState.GameVar['show_scavenge_map'] as boolean) ?? true;

  const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
  const currentPeriodIndex = (stageState.GameVar['current_period_index'] as number) ?? 0;

  // 解析角色（每个 location 派遣中的角色需要名字 / 头像）
  const getCharacters = (): ScavengeCharacter[] => {
    const raw = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(c => normalizeCharacter(c as ScavengeCharacter));
      } catch { /* ignore */ }
    }
    if (Array.isArray(raw)) return (raw as unknown as ScavengeCharacter[]).map(c => normalizeCharacter(c));
    return [];
  };
  const characters = useMemo(getCharacters, [stageState]);

  // 计算派遣中 missions（按 location 分组）
  const activeMissionsByLocation = useMemo(() => {
    const missions = readMissions();
    const map = new Map<string, Array<{
      missionId: string;
      characterId: string;
      characterName: string;
      phase: 'preparing' | 'active';
      remainingPeriods: number;
    }>>();
    for (const m of missions) {
      if (m.status !== 'active') continue;
      const char = characters.find(c => c.id === m.characterId);
      if (!char) continue;
      const totalStart = m.startDay * 5 + m.startPeriodIndex;
      const totalReturn = m.returnDay * 5 + m.returnPeriodIndex;
      const totalCurrent = currentDay * 5 + currentPeriodIndex;
      const phase: 'preparing' | 'active' = totalCurrent <= totalStart ? 'preparing' : 'active';
      const remaining = Math.max(0, totalReturn - totalCurrent);
      const arr = map.get(m.locationId) ?? [];
      arr.push({
        missionId: m.id,
        characterId: m.characterId,
        characterName: char.name,
        phase,
        remainingPeriods: remaining,
      });
      map.set(m.locationId, arr);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState, characters]);

  // 2026-06-09 加：pan/zoom hook
  // 注：UI 控件（缩放按钮 / 拖拽提示）已删除，但 hook 接口保留
  //   - zoomIn / zoomOut / reset：暴露给将来的 UI（无 UI 时仅由滚轮触发）
  //   - zoomPercent：UI 显示用（移除 UI 后备用）
  //   - effectiveMinScale：动态最小缩放（用于 fit-to-screen 防黑底）
  // 外部组件可继续通过 usePanZoom() 解构使用
  const {
    state: transform,
    panHandlers,
    centerOn,
  } = usePanZoom({
    containerRef,
    worldWidth: SVG_WIDTH,
    worldHeight: SVG_HEIGHT,
    minScale: 0.3,
    maxScale: 4,
  });

  // 2026-06-09 加：focusLocationId 变化时自动 centerOn
  useEffect(() => {
    if (!focusLocationId) return;
    const loc = SCAVENGE_LOCATIONS.find(l => l.id === focusLocationId);
    if (!loc) return;
    // position 是 0-100 百分比 → SVG 像素坐标
    const worldX = (loc.position.x / 100) * SVG_WIDTH;
    const worldY = (loc.position.y / 100) * SVG_HEIGHT;
    // 等待一帧让容器有 clientWidth/Height
    const timer = setTimeout(() => centerOn(worldX, worldY, 1.6), 50);
    return () => clearTimeout(timer);
  }, [focusLocationId, centerOn]);

  const handleLocationClick = (location: ScavengeLocationItem) => {
    if (!location.isUnlocked) return;
    // 2026-06-09 改：jumpScene 由 ScavengeMain 处理（onLocationSelect 回调）
    // 不在 ScavengeMap 直接调 changeScene（避免 lockSceneWrite 阻塞）
    onLocationSelect(location);
  };

  return (
    <div
      className={styles.mapContainer}
      ref={containerRef}
      {...panHandlers}
    >
      {/* 内容层：transform 应用在这层 */}
      <div
        className={styles.mapWrapper}
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          width: `${SVG_WIDTH}px`,
          height: `${SVG_HEIGHT}px`,
        }}
      >
        <div className={styles.mapBackground}>
          <img
            src={CityMap}
            alt="城市地图"
            className={styles.mapImage}
            // 2026-06-09 加：防选中 / 防拖拽 / 防右键保存
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
        </div>
      </div>

      {/* 2026-06-09 改：地点标记层移到 wrapper 外面（sibling），用 JS 计算屏幕坐标
       * 这样标记 UI 不会随 SVG 缩放改变大小（dispatchingBar、tooltip 也是） */}
      <div className={styles.locationsLayer}>
        {SCAVENGE_LOCATIONS.map((location) => {
          const isUnlocked = location.isUnlocked;
          const activeMissions = activeMissionsByLocation.get(location.id) ?? [];
          const isActive = activeMissions.length > 0;
          const isHovered = hoveredLocation === location.id;

          // 世界坐标 (0-100% of SVG) → 屏幕坐标 (px in container)
          // screenX = worldX * scale + panX
          // screenY = worldY * scale + panY
          const screenX = (location.position.x / 100) * SVG_WIDTH * transform.scale + transform.x;
          const screenY = (location.position.y / 100) * SVG_HEIGHT * transform.scale + transform.y;

          return (
            <div
              key={location.id}
              className={`${styles.locationMarker} ${!isUnlocked ? styles.locked : ''} ${isActive ? styles.active : ''}`}
              style={{
                left: `${screenX}px`,
                top: `${screenY}px`,
                '--region-color': location.regionColor,
              } as React.CSSProperties}
              onClick={() => handleLocationClick(location)}
              // 2026-06-09 加：阻止 marker 上的 pointerdown 冒泡到 container（避免拖动冲突）
              onPointerDown={(e) => e.stopPropagation()}
              onMouseEnter={() => setHoveredLocation(location.id)}
              onMouseLeave={() => setHoveredLocation(null)}
            >
                {/* 标记主图标 */}
                <div className={styles.markerCircle}>
                  {isUnlocked ? (
                    <Icon icon={locationOn} className={styles.markerIcon} />
                  ) : (
                    <Icon icon={lock} className={styles.markerIcon} />
                  )}
                </div>

                {/* 派遣中：上方显示角色头像 + 还需回合（含"准备中"阶段） */}
                {isActive && (
                  <div className={styles.dispatchingBar}>
                    {activeMissions.map((m) => (
                      <div
                        key={m.missionId}
                        className={`${styles.dispatcherChip} ${m.phase === 'preparing' ? styles.dispatcherChipPreparing : ''}`}
                      >
                        <Icon icon={person} className={styles.dispatcherAvatar} />
                        <span className={styles.dispatcherName}>{m.characterName}</span>
                        <span className={styles.dispatcherRemaining}>
                          <Icon icon={schedule} className={styles.remainingIcon} />
                          {m.phase === 'preparing' ? '准备' : m.remainingPeriods}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 悬停提示 */}
                {isHovered && isUnlocked && (
                  <div className={styles.tooltip}>
                    <div className={styles.tooltipName}>{location.name}</div>
                    <div className={styles.tooltipInfo}>
                      {getDangerStars(location.dangerLevel)} {location.timeDisplay}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </div>
  );
};
