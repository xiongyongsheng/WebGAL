import { ScavengeCharacter, getItemName } from '../character';
import { getItemById, isEquipment, EquipmentItem } from '../../ScavengeItems/items';
import styles from './ScavengeCharacterAttributes.module.scss';

interface ScavengeCharacterAttributesProps {
  charData: ScavengeCharacter;
  strBonus: number;
  agiBonus: number;
  endBonus: number;
  intBonus: number;
}

export const ScavengeCharacterAttributes = ({
  charData,
  strBonus,
  agiBonus,
  endBonus,
  intBonus,
}: ScavengeCharacterAttributesProps) => {
  const formatAttr = (base: number, bonus: number) => {
    return bonus > 0 ? `${base + bonus} (+${bonus})` : base;
  };

  return (
    <div className={styles.attrPanel}>
      <div className={styles.sectionTitle}>角色属性</div>
      <div className={styles.attrGrid}>
        <div className={styles.attrItem}>
          <span className={styles.attrName}>力量 STR</span>
          <span className={styles.attrValue}>{formatAttr(charData.str, strBonus)}</span>
        </div>
        <div className={styles.attrItem}>
          <span className={styles.attrName}>敏捷 AGI</span>
          <span className={styles.attrValue}>{formatAttr(charData.agi, agiBonus)}</span>
        </div>
        <div className={styles.attrItem}>
          <span className={styles.attrName}>耐力 END</span>
          <span className={styles.attrValue}>{formatAttr(charData.end, endBonus)}</span>
        </div>
        <div className={styles.attrItem}>
          <span className={styles.attrName}>智力 INT</span>
          <span className={styles.attrValue}>{formatAttr(charData.int, intBonus)}</span>
        </div>
      </div>
    </div>
  );
};