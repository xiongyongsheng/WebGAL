import { useState, useMemo } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
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
import styles from './ScavengeMap.module.scss';
import CityMap from '@/assets/images/map/city-map.png';

interface ScavengeMapProps {
  onLocationSelect: (location: ScavengeLocationItem) => void;
}

export const ScavengeMap = ({ onLocationSelect }: ScavengeMapProps) => {
  const stageState = useStageState();
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);

  const isVisible = (stageState.GameVar['show_scavenge_map'] as boolean) ?? true;
  if (!isVisible) return null;

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
      remainingPeriods: number;
    }>>();
    for (const m of missions) {
      if (m.status !== 'active') continue;
      const char = characters.find(c => c.id === m.characterId);
      if (!char) continue;
      // 还需多少 period：returnDay*5 + returnPeriodIndex - (currentDay*5 + currentPeriodIndex)
      const totalTarget = m.returnDay * 5 + m.returnPeriodIndex;
      const totalCurrent = currentDay * 5 + currentPeriodIndex;
      const remaining = Math.max(0, totalTarget - totalCurrent);
      const arr = map.get(m.locationId) ?? [];
      arr.push({
        missionId: m.id,
        characterId: m.characterId,
        characterName: char.name,
        remainingPeriods: remaining,
      });
      map.set(m.locationId, arr);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageState, characters]);

  const handleLocationClick = (location: ScavengeLocationItem) => {
    if (!location.isUnlocked) return;
    onLocationSelect(location);
  };

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapTitle}>大都市地图</div>

      <div className={styles.mapWrapper}>
        <div className={styles.mapBackground}>
          <img src={CityMap} alt="城市地图" className={styles.mapImage} />
        </div>

        <div className={styles.locationsLayer}>
          {SCAVENGE_LOCATIONS.map((location) => {
            const isUnlocked = location.isUnlocked;
            const activeMissions = activeMissionsByLocation.get(location.id) ?? [];
            const isActive = activeMissions.length > 0;
            const isHovered = hoveredLocation === location.id;

            return (
              <div
                key={location.id}
                className={`${styles.locationMarker} ${!isUnlocked ? styles.locked : ''} ${isActive ? styles.active : ''}`}
                style={{
                  left: `${location.position.x}%`,
                  top: `${location.position.y}%`,
                  '--region-color': location.regionColor,
                } as React.CSSProperties}
                onClick={() => handleLocationClick(location)}
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

                {/* 派遣中：上方显示角色头像 + 还需回合 */}
                {isActive && (
                  <div className={styles.dispatchingBar}>
                    {activeMissions.map((m) => (
                      <div key={m.missionId} className={styles.dispatcherChip}>
                        <Icon icon={person} className={styles.dispatcherAvatar} />
                        <span className={styles.dispatcherName}>{m.characterName}</span>
                        <span className={styles.dispatcherRemaining}>
                          <Icon icon={schedule} className={styles.remainingIcon} />
                          {m.remainingPeriods}
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

      {/* 图例 */}
      <div className={styles.legend}>
        <div className={styles.legendTitle}>区域图例</div>
        <div className={styles.legendItems}>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#4CAF50' }}></span>
            安全区
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#03A9F4' }}></span>
            居民区
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#FF9800' }}></span>
            商业区
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#9C27B0' }}></span>
            公共设施
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#F44336' }}></span>
            政府区域
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: '#607D8B' }}></span>
            工业区
          </div>
        </div>
      </div>
    </div>
  );
};
