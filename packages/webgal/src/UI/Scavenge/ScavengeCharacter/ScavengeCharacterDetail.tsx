import { useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter, getCharacterStatusText, getStatusBarColor } from './character';
import { Icon, IconifyIcon } from '@iconify/react';
import favorite from '@iconify-icons/material-symbols/favorite';
import restaurant from '@iconify-icons/material-symbols/restaurant';
import waterDrop from '@iconify-icons/material-symbols/water-drop';
import psychology from '@iconify-icons/material-symbols/psychology';
import localFireDepartment from '@iconify-icons/material-symbols/local-fire-department';
import backpack from '@iconify-icons/material-symbols/backpack-outline';
import { getItemName, getItemIcon, getItemRarityColor, getItemById } from '../ScavengeItems/items';
import { InventoryItem, MAX_CARRY_WEIGHT } from '../ScavengeItems/inventory';
import styles from './ScavengeCharacterDetail.module.scss';

interface ScavengeCharacterDetailProps {
  character: ScavengeCharacter;
  onClose: () => void;
}

interface StatusBarProps {
  icon: IconifyIcon;
  label: string;
  value: number;
  maxValue: number;
  color: string;
}

const StatusBar = ({ icon, label, value, maxValue, color }: StatusBarProps) => {
  const percentage = (value / maxValue) * 100;

  return (
    <div className={styles.statusItem}>
      <div className={styles.statusHeader}>
        <Icon icon={icon} className={styles.statusIcon} style={{ color }} />
        <span className={styles.statusLabel}>{label}</span>
        <span className={styles.statusValue}>{value}</span>
      </div>
      <div className={styles.statusTrack}>
        <div
          className={styles.statusFill}
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
};

export const ScavengeCharacterDetail = ({ character, onClose }: ScavengeCharacterDetailProps) => {
  const [showInventory, setShowInventory] = useState(false);
  const stageState = useStageState();
  const statusText = getCharacterStatusText(character);

  // 从 GameVar 获取背包数据
  const getInventory = (): InventoryItem[] => {
    const key = `scavenge_inventory_${character.id}`;
    const inventory = stageState.GameVar[key];
    if (Array.isArray(inventory)) {
      return inventory as unknown as InventoryItem[];
    }
    return [];
  };

  // 计算背包总重量
  const calculateWeight = (): number => {
    const inventory = getInventory();
    return inventory.reduce((total, invItem) => {
      const item = getItemById(invItem.itemId);
      if (item) {
        return total + item.weight * invItem.quantity;
      }
      return total;
    }, 0);
  };

  const inventory = getInventory();
  const totalWeight = calculateWeight();
  const remainingWeight = MAX_CARRY_WEIGHT - totalWeight;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <div className={styles.avatar}>
              <Icon icon="material-symbols:person" />
            </div>
            <div className={styles.titleInfo}>
              <h2 className={styles.title}>{character.name}</h2>
              <span className={`${styles.status} ${character.isExploring ? styles.statusExploring : ''}`}>
                {statusText}
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 状态面板 */}
        <div className={styles.statusPanel}>
          <StatusBar
            icon={favorite}
            label="生命值"
            value={character.hp}
            maxValue={character.maxHp}
            color={getStatusBarColor(character.hp, character.maxHp)}
          />
          <StatusBar
            icon={restaurant}
            label="饥饿值"
            value={character.hunger}
            maxValue={character.maxHunger}
            color={getStatusBarColor(character.hunger, character.maxHunger)}
          />
          <StatusBar
            icon={waterDrop}
            label="口渴值"
            value={character.thirst}
            maxValue={character.maxThirst}
            color={getStatusBarColor(character.thirst, character.maxThirst)}
          />
          <StatusBar
            icon={psychology}
            label="精神值"
            value={character.sanity}
            maxValue={character.maxSanity}
            color={getStatusBarColor(character.sanity, character.maxSanity)}
          />
          <StatusBar
            icon={localFireDepartment}
            label="疲劳值"
            value={character.fatigue}
            maxValue={character.maxFatigue}
            color={getStatusBarColor(character.maxFatigue - character.fatigue, character.maxFatigue)}
          />
        </div>

        {/* 属性面板 */}
        <div className={styles.attrPanel}>
          <div className={styles.sectionTitle}>角色属性</div>
          <div className={styles.attrGrid}>
            <div className={styles.attrItem}>
              <span className={styles.attrName}>力量 STR</span>
              <span className={styles.attrValue}>{character.str}</span>
            </div>
            <div className={styles.attrItem}>
              <span className={styles.attrName}>敏捷 AGI</span>
              <span className={styles.attrValue}>{character.agi}</span>
            </div>
            <div className={styles.attrItem}>
              <span className={styles.attrName}>耐力 END</span>
              <span className={styles.attrValue}>{character.end}</span>
            </div>
            <div className={styles.attrItem}>
              <span className={styles.attrName}>智力 INT</span>
              <span className={styles.attrValue}>{character.int}</span>
            </div>
          </div>
        </div>

        {/* 装备面板 */}
        <div className={styles.equipPanel}>
          <div className={styles.sectionTitle}>装备</div>
          <div className={styles.equipList}>
            <div className={styles.equipItem}>
              <span className={styles.equipType}>武器</span>
              <span className={styles.equipName}>{character.weaponId ?? '未装备'}</span>
            </div>
            <div className={styles.equipItem}>
              <span className={styles.equipType}>护甲</span>
              <span className={styles.equipName}>{character.armorId ?? '未装备'}</span>
            </div>
            <div className={styles.equipItem}>
              <span className={styles.equipType}>工具</span>
              <span className={styles.equipName}>{character.toolId ?? '未装备'}</span>
            </div>
          </div>
        </div>

        {/* 背包面板 */}
        <div className={styles.inventoryPanel}>
          <div className={styles.sectionTitle}>
            <Icon icon={backpack} className={styles.sectionIcon} />
            <span>背包</span>
            <button className={styles.toggleButton} onClick={() => setShowInventory(!showInventory)}>
              <Icon icon={showInventory ? 'material-symbols:expand-less' : 'material-symbols:expand-more'} />
            </button>
          </div>

          {/* 负重信息 */}
          <div className={styles.weightInfo}>
            <div className={styles.weightBar}>
              <div
                className={styles.weightFill}
                style={{
                  width: `${(totalWeight / MAX_CARRY_WEIGHT) * 100}%`,
                  backgroundColor: remainingWeight > 10 ? '#4CAF50' : remainingWeight > 5 ? '#FFC107' : '#F44336',
                }}
              />
            </div>
            <span className={styles.weightText}>
              {totalWeight.toFixed(1)}/{MAX_CARRY_WEIGHT}kg
            </span>
          </div>

          {/* 物品列表 */}
          {showInventory && (
            <div className={styles.inventoryList}>
              {inventory.length === 0 ? (
                <div className={styles.empty}>背包是空的</div>
              ) : (
                inventory.map((invItem, index) => {
                  const rarityColor = getItemRarityColor(invItem.itemId);
                  return (
                    <div key={`${invItem.itemId}-${index}`} className={styles.inventoryItem}>
                      <div className={styles.itemIcon} style={{ color: rarityColor }}>
                        <Icon icon={getItemIcon(invItem.itemId)} />
                      </div>
                      <div className={styles.itemInfo}>
                        <span className={styles.itemName}>{getItemName(invItem.itemId)}</span>
                        <span className={styles.itemQuantity}>x{invItem.quantity}</span>
                      </div>
                      {invItem.durability !== undefined && (
                        <div className={styles.durability}>
                          <div
                            className={styles.durabilityBar}
                            style={{
                              width: `${invItem.durability}%`,
                              backgroundColor: invItem.durability > 50 ? '#4CAF50' : '#F44336',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
