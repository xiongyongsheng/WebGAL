import { ScavengeCharacter } from '../character';
import { getItemName } from '../../ScavengeItems/items';
import styles from './ScavengeCharacterEquip.module.scss';

interface ScavengeCharacterEquipProps {
  charData: ScavengeCharacter;
  onUnequip: (slot: 'weapon' | 'armor' | 'tool') => void;
}

export const ScavengeCharacterEquip = ({ charData, onUnequip }: ScavengeCharacterEquipProps) => {
  const EquipSlot = ({ type, name, equipId }: { type: 'weapon' | 'armor' | 'tool'; name: string; equipId?: string }) => (
    <div className={styles.equipItem}>
      <span className={styles.equipType}>{name}</span>
      <span className={styles.equipName}>{equipId ? getItemName(equipId) : '未装备'}</span>
      {equipId && (
        <button className={styles.unequipButton} onClick={() => onUnequip(type)}>
          卸下
        </button>
      )}
    </div>
  );

  return (
    <div className={styles.equipPanel}>
      <div className={styles.sectionTitle}>装备</div>
      <div className={styles.equipList}>
        <EquipSlot type="weapon" name="武器" equipId={charData.weaponId} />
        <EquipSlot type="armor" name="护甲" equipId={charData.armorId} />
        <EquipSlot type="tool" name="工具" equipId={charData.toolId} />
      </div>
    </div>
  );
};