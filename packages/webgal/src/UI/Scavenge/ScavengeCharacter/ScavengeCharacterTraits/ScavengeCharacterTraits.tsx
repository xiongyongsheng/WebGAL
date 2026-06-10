/**
 * 角色特性 UI（2026-06-09 新建）
 *
 * - 显示当前所有 traits
 * - 点 "+ 添加特性" 弹选择器（listAllTraits 排除已拥有的）
 * - 点徽章上的 x 移除特性
 * - 颜色编码：战斗/生存/社交/特殊
 */
import { useState } from 'react';
import { Icon } from '@iconify/react';
import add from '@iconify-icons/material-symbols/add';
import close from '@iconify-icons/material-symbols/close';
import { ScavengeCharacter } from '../character';
import { Trait, TraitCategory, TRAITS, listAllTraits, getTrait } from '../traits';
import styles from './ScavengeCharacterTraits.module.scss';

interface ScavengeCharacterTraitsProps {
  charData: ScavengeCharacter;
  onAdd: (traitId: string) => void;
  onRemove: (traitId: string) => void;
}

const CATEGORY_COLOR: Record<TraitCategory, string> = {
  combat: '#ff6b6b',     // 红
  survival: '#4caf50',   // 绿
  social: '#64b5f6',     // 蓝
  special: '#ffd54f',    // 黄
};

const CATEGORY_NAME: Record<TraitCategory, string> = {
  combat: '战斗',
  survival: '生存',
  social: '社交',
  special: '特殊',
};

export const ScavengeCharacterTraits = ({ charData, onAdd, onRemove }: ScavengeCharacterTraitsProps) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  // 当前已装备的 trait
  const ownedIds = charData.traitIds ?? [];
  const ownedTraits = ownedIds.map(id => getTrait(id)).filter((t): t is Trait => Boolean(t));

  // 可选 trait（排除已拥有的）
  const availableTraits = listAllTraits().filter(t => !ownedIds.includes(t.id));

  return (
    <div className={styles.traitsSection}>
      <div className={styles.traitsHeader}>
        <span className={styles.traitsTitle}>特性 ({ownedTraits.length})</span>
        <button
          className={styles.addButton}
          onClick={() => setPickerOpen(!pickerOpen)}
          title="添加特性"
        >
          <Icon icon={pickerOpen ? close : add} />
          {pickerOpen ? ' 关闭' : ' 添加'}
        </button>
      </div>

      {/* 已拥有特性徽章 */}
      {ownedTraits.length > 0 ? (
        <div className={styles.ownedList}>
          {ownedTraits.map(t => (
            <div
              key={t.id}
              className={styles.traitBadge}
              style={{ borderColor: CATEGORY_COLOR[t.category] }}
              title={t.description}
            >
              <span className={styles.traitName}>{t.name}</span>
              <button
                className={styles.removeBtn}
                onClick={() => onRemove(t.id)}
                title="移除"
              >
                <Icon icon={close} className={styles.removeIcon} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyHint}>暂无特性（点"+"添加）</div>
      )}

      {/* 特性选择器 */}
      {pickerOpen && (
        <div className={styles.picker}>
          <div className={styles.pickerTitle}>选择特性</div>
          {availableTraits.length === 0 ? (
            <div className={styles.emptyHint}>所有特性都已拥有</div>
          ) : (
            availableTraits.map(t => (
              <div
                key={t.id}
                className={styles.pickerItem}
                onClick={() => { onAdd(t.id); }}
                style={{ borderColor: CATEGORY_COLOR[t.category] }}
              >
                <span className={styles.pickerCategory} style={{ color: CATEGORY_COLOR[t.category] }}>
                  [{CATEGORY_NAME[t.category]}]
                </span>
                <span className={styles.pickerName}>{t.name}</span>
                <span className={styles.pickerDesc}>{t.description}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
