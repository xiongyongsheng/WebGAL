/**
 * 特性百科（2026-06-09 加）
 *
 * 展示所有已注册特性，按 category 分组
 * - 正面特性（combat / survival / social / special）
 * - 状态特性（condition，负面或临时）
 *
 * 字段：
 * - 名称
 * - 分类
 * - 描述
 * - 效果（实时计算示例数值）
 * - 自动管理提示（如果 autoManaged=true，说明触发条件）
 *
 * 打开方式：从 ScavengeMain 顶部按钮触发
 */
import { useMemo } from 'react';
import { Icon } from '@iconify/react';
import close from '@iconify-icons/material-symbols/close';
import { listAllTraits, groupTraitsByCategory, CATEGORY_LABELS, type Trait, type TraitCategory } from '../traits';
import styles from './ScavengeCharacterCodex.module.scss';

interface Props {
  /** 关闭 modal */
  onClose: () => void;
}

const CATEGORY_COLORS: Record<TraitCategory, string> = {
  combat: '#ff8a65',
  survival: '#81c784',
  social: '#64b5f6',
  special: '#ba68c8',
  condition: '#ef5350',
};

const CATEGORY_ICONS: Record<TraitCategory, string> = {
  combat: 'material-symbols:swords',
  survival: 'material-symbols:forest',
  social: 'material-symbols:diversity-3',
  special: 'material-symbols:auto-awesome',
  condition: 'material-symbols:warning',
};

const renderEffectSummary = (trait: Trait): string => {
  if (trait.effects.length === 0) {
    if (trait.id === 'poisoned') return '每 period 扣 5 HP（持续 3 天）';
    if (trait.id === 'bleeding') return '每 period 扣 3 HP（持续 2 天）';
    return '（无效果数据）';
  }
  const parts: string[] = [];
  for (const eff of trait.effects) {
    const items: string[] = [];
    if (eff.str) items.push(`力量 ${eff.str > 0 ? '+' : ''}${eff.str}`);
    if (eff.agi) items.push(`敏捷 ${eff.agi > 0 ? '+' : ''}${eff.agi}`);
    if (eff.end) items.push(`体力 ${eff.end > 0 ? '+' : ''}${eff.end}`);
    if (eff.int) items.push(`智力 ${eff.int > 0 ? '+' : ''}${eff.int}`);
    if (eff.accuracyBonus) items.push(`命中 ${(eff.accuracyBonus * 100).toFixed(0)}%`);
    if (eff.evasionBonus) items.push(`闪避 ${(eff.evasionBonus * 100).toFixed(0)}%`);
    if (eff.critRateBonus) items.push(`暴击 ${(eff.critRateBonus * 100).toFixed(0)}%`);
    if (eff.attackSpeedBonus) items.push(`攻速 ${eff.attackSpeedBonus > 0 ? '+' : ''}${eff.attackSpeedBonus}`);
    if (eff.attackDamageBonus) items.push(`伤害 ${(eff.attackDamageBonus * 100).toFixed(0)}%`);
    if (eff.maxHpBonus) items.push(`HP 上限 ${eff.maxHpBonus > 0 ? '+' : ''}${eff.maxHpBonus}`);
    if (eff.maxStaminaBonus) items.push(`体力上限 ${eff.maxStaminaBonus > 0 ? '+' : ''}${eff.maxStaminaBonus}`);
    if (eff.weightReduction) items.push(`负重 -${(eff.weightReduction * 100).toFixed(0)}%`);
    if (items.length > 0) {
      const condDesc = describeCondition(eff.condition);
      parts.push(`${condDesc ? condDesc + '：' : ''}${items.join('，')}`);
    }
  }
  return parts.length > 0 ? parts.join('；') : '（无效果）';
};

const describeCondition = (cond: any): string => {
  if (!cond || cond.type === 'always') return '';
  switch (cond.type) {
    case 'hunger_zero': return '饥饿=0';
    case 'thirst_zero': return '口渴=0';
    case 'hunger_or_thirst_zero': return '饥或渴=0';
    case 'hp_below_pct': return `HP<${(cond.threshold * 100).toFixed(0)}%`;
    case 'in_combat': return '战斗中';
    default: return '';
  }
};

export const ScavengeCharacterCodex = ({ onClose }: Props) => {
  const groups = useMemo(() => groupTraitsByCategory(listAllTraits()), []);
  const totalCount = listAllTraits().length;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 顶部 */}
        <div className={styles.header}>
          <div className={styles.title}>
            <Icon icon="material-symbols:menu-book" className={styles.titleIcon} />
            <span>特性百科</span>
            <span className={styles.count}>({totalCount} 个特性)</span>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon={close} />
          </button>
        </div>

        {/* 主体：分组列表 */}
        <div className={styles.body}>
          {(Object.keys(groups) as TraitCategory[]).map((category) => {
            const traits = groups[category];
            if (traits.length === 0) return null;
            return (
              <div key={category} className={styles.categorySection}>
                <div className={styles.categoryTitle} style={{ color: CATEGORY_COLORS[category] }}>
                  <Icon icon={CATEGORY_ICONS[category]} className={styles.categoryIcon} />
                  <span>{CATEGORY_LABELS[category]}</span>
                  <span className={styles.categoryCount}>{traits.length}</span>
                </div>
                <div className={styles.traitList}>
                  {traits.map((trait) => (
                    <div key={trait.id} className={styles.traitCard}>
                      <div className={styles.traitName}>
                        {trait.name}
                        {trait.autoManaged && (
                          <span className={styles.autoBadge}>自动</span>
                        )}
                        {trait.autoDurationDays && (
                          <span className={styles.durationBadge}>
                            持续 {trait.autoDurationDays} 天
                          </span>
                        )}
                      </div>
                      <div className={styles.traitDesc}>{trait.description}</div>
                      <div className={styles.traitEffect}>{renderEffectSummary(trait)}</div>
                      {trait.autoManaged && trait.autoRemoveCondition && (
                        <div className={styles.traitRecover}>
                          <Icon icon="material-symbols:healing" />
                          <span>恢复条件：{describeRemoveCondition(trait.autoRemoveCondition)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// 把"autoRemoveCondition" 函数转成可读描述
const describeRemoveCondition = (fn: (char: any) => boolean): string => {
  // 简单解析：检查函数 toString
  const code = fn.toString();
  if (code.includes('hunger >')) return `饥饿 > ${extractNumber(code, 'hunger >')} 时自动解除`;
  if (code.includes('thirst >')) return `口渴 > ${extractNumber(code, 'thirst >')} 时自动解除`;
  if (code.includes('hunger > 0 && thirst > 0')) return '饥和渴都 >0 时自动解除';
  if (code.includes('stamina >')) return `体力 > ${extractNumber(code, 'stamina >')} 时自动解除`;
  if (code.includes('sanity >')) return `精神 > ${extractNumber(code, 'sanity >')} 时自动解除`;
  if (code.includes('hp / ')) return 'HP 恢复到阈值时自动解除';
  return '条件变化时自动解除';
};

const extractNumber = (str: string, prefix: string): number => {
  const idx = str.indexOf(prefix);
  if (idx < 0) return 0;
  const after = str.substring(idx + prefix.length);
  const match = after.match(/\d+/);
  return match ? Number(match[0]) : 0;
};
