import { useStageState } from '@/hooks/useStageState';
import {
  ScavengeLocationItem,
  getRegionDisplayName,
  getDangerStars,
} from './locations';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import locationOn from '@iconify-icons/material-symbols/location-on';
import inventory from '@iconify-icons/material-symbols/inventory';
import styles from './ScavengeMapDetail.module.scss';

interface ScavengeMapDetailProps {
  location: ScavengeLocationItem;
  onClose: () => void;
}

export const ScavengeMapDetail = ({ location, onClose }: ScavengeMapDetailProps) => {
  const stageState = useStageState();

  // 获取正在该地点探索的角色
  const exploringCharacterId = stageState.GameVar['scavenge_exploring_character_id'] as string | undefined;
  const exploringLocationId = stageState.GameVar['scavenge_exploring_location_id'] as string | undefined;
  const isCurrentlyExploring = exploringLocationId === location.id;

  // 获取角色详情
  const getCharacterInfo = () => {
    if (!exploringCharacterId) return null;
    const characterData = stageState.GameVar[`scavenge_character_${exploringCharacterId}`];
    if (characterData && typeof characterData === 'object') {
      return characterData as { name?: string; hp?: number; maxHp?: number };
    }
    return null;
  };

  const characterInfo = getCharacterInfo();

  // 物资类型显示映射
  const lootTypeNames: Record<string, string> = {
    food: '食物',
    drink: '饮用水',
    beverage: '饮料',
    medicine: '药品',
    bandage: '绷带',
    parts: '零件',
    tools: '工具',
    cloth: '布料',
    metal: '金属',
    daily: '日用品',
    weapon: '武器',
    armor: '护甲',
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon
              icon={locationOn}
              style={{ color: location.regionColor }}
              className={styles.titleIcon}
            />
            <h2 className={styles.title}>{location.name}</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 探索状态 */}
        {isCurrentlyExploring && characterInfo && (
          <div className={styles.exploringStatus}>
            <div className={styles.exploringLabel}>
              <span className={styles.pulse}></span>
              当前正在探索
            </div>
            <div className={styles.exploringCharacter}>
              <span className={styles.characterName}>{characterInfo.name}</span>
              <span className={styles.characterHp}>
                HP: {characterInfo.hp}/{characterInfo.maxHp}
              </span>
            </div>
          </div>
        )}

        {/* 基本信息 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>基本信息</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>区域</span>
              <span className={styles.infoValue}>{getRegionDisplayName(location.region)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>危险等级</span>
              <span className={`${styles.infoValue} ${styles.dangerValue}`}>
                {getDangerStars(location.dangerLevel)}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>距离</span>
              <span className={styles.infoValue}>{location.distance}小时</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>探索耗时</span>
              <span className={styles.infoValue}>{location.timeDisplay}</span>
            </div>
          </div>
        </div>

        {/* 描述 */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>地点描述</div>
          <p className={styles.description}>{location.description}</p>
        </div>

        {/* 产出物资 */}
        {location.lootTypes.length > 0 && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <Icon icon={inventory} className={styles.sectionIcon} />
              预期产出
            </div>
            <div className={styles.lootTypes}>
              {location.lootTypes.map((loot) => (
                <span key={loot} className={styles.lootTag}>
                  {lootTypeNames[loot] ?? loot}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className={styles.actions}>
          {!isCurrentlyExploring ? (
            <>
              <button className={styles.primaryButton}>派遣探索</button>
              <button className={styles.secondaryButton}>查看路线</button>
            </>
          ) : (
            <button className={styles.secondaryButton}>召回角色</button>
          )}
        </div>
      </div>
    </div>
  );
};