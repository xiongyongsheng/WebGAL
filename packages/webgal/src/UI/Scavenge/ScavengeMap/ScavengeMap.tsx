import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import {
  SCAVENGE_LOCATIONS,
  ScavengeLocationItem,
  getRegionDisplayName,
  getDangerStars,
} from './locations';
import { Icon } from '@iconify/react';
import locationOn from '@iconify-icons/material-symbols/location-on';
import lock from '@iconify-icons/material-symbols/lock';
import styles from './ScavengeMap.module.scss';
import CityMap from '@/assets/images/map/city-map.png';

interface ScavengeMapProps {
  onLocationSelect: (location: ScavengeLocationItem) => void;
}

export const ScavengeMap = ({ onLocationSelect }: ScavengeMapProps) => {
  const stageState = useStageState();
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);

  // 检查地图是否应该显示
  const isVisible = (stageState.GameVar['show_scavenge_map'] as boolean) ?? true;
  if (!isVisible) return null;

  // 获取当前正在探索的角色和地点
  const exploringCharacterId = stageState.GameVar['scavenge_exploring_character_id'] as string | undefined;
  const exploringLocationId = stageState.GameVar['scavenge_exploring_location_id'] as string | undefined;

  // 获取角色名称
  const getCharacterName = (characterId: string): string => {
    const character = stageState.GameVar[`scavenge_character_${characterId}`];
    if (character && typeof character === 'object') {
      return (character as { name?: string }).name ?? characterId;
    }
    return characterId;
  };

  const handleLocationClick = (location: ScavengeLocationItem) => {
    if (!location.isUnlocked) return;
    onLocationSelect(location);
  };

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapTitle}>大都市地图</div>

      <div className={styles.mapWrapper}>
        {/* 地图背景 */}
        <div className={styles.mapBackground}>
          <img
            src={CityMap}
            alt="城市地图"
            className={styles.mapImage}
          />
        </div>

        {/* 地点标记层 */}
        <div className={styles.locationsLayer}>
          {SCAVENGE_LOCATIONS.map((location) => {
            const isExploring = exploringLocationId === location.id;
            const isHovered = hoveredLocation === location.id;

            return (
              <div
                key={location.id}
                className={`${styles.locationMarker} ${!location.isUnlocked ? styles.locked : ''} ${isExploring ? styles.exploring : ''}`}
                style={{
                  left: `${location.position.x}%`,
                  top: `${location.position.y}%`,
                  '--region-color': location.regionColor,
                } as React.CSSProperties}
                onClick={() => handleLocationClick(location)}
                onMouseEnter={() => setHoveredLocation(location.id)}
                onMouseLeave={() => setHoveredLocation(null)}
              >
                {location.isUnlocked ? (
                  <Icon icon={locationOn} className={styles.markerIcon} />
                ) : (
                  <Icon icon={lock} className={styles.markerIcon} />
                )}

                {/* 探索中的角色指示器 */}
                {isExploring && (
                  <div className={styles.exploringIndicator}>
                    {getCharacterName(exploringCharacterId ?? '')}
                  </div>
                )}

                {/* 悬停提示 */}
                {isHovered && location.isUnlocked && (
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
