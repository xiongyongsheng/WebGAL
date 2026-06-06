import { useSelector } from 'react-redux';
import { Icon } from '@iconify/react';
import schedule from '@iconify-icons/material-symbols/schedule';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { saveGame } from '@/Core/controller/storage/saveGame';
import { ScavengeCharacter, normalizeCharacter } from '../ScavengeCharacter/character';
import { applyPeriodEffectsToCharacters } from './characterTimeEffects';
import styles from './ScavengeTimeControl.module.scss';

type TimePeriod = '清晨' | '上午' | '下午' | '半晚' | '黑夜';

interface TimeState {
  day: number;
  period: TimePeriod;
  periodIndex: number;
}

const TIME_PERIODS: TimePeriod[] = ['清晨', '上午', '下午', '半晚', '黑夜'];

function getNextPeriod(currentIndex: number): TimeState {
  let nextIndex = currentIndex + 1;
  let nextDay = 0;

  if (nextIndex >= TIME_PERIODS.length) {
    nextIndex = 0;
    nextDay = 1;
  }

  return {
    day: nextDay,
    period: TIME_PERIODS[nextIndex],
    periodIndex: nextIndex,
  };
}

export const ScavengeTimeControl = () => {
  const GUIState = useSelector((state: RootState) => state.GUI);
  const stageState = useStageState();

  const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
  const currentPeriodIndex = (stageState.GameVar['current_period_index'] as number) ?? 0;
  const currentPeriod = TIME_PERIODS[currentPeriodIndex] ?? '上午';

  const isVisible = (stageState.GameVar['show_scavenge_time_control'] as boolean) ?? false;
  const isEnterGame = GUIState.isEnterGame;

  if (!isVisible || !isEnterGame) return null;

  const handleTimeAdvance = () => {
    const nextState = getNextPeriod(currentPeriodIndex);
    const newDay = currentDay + nextState.day;
    const newPeriodIndex = nextState.periodIndex;
    const isOvernight = nextState.day > 0;

    stageStateManager.setStageVarAndCommit({ key: 'current_day', value: newDay });
    stageStateManager.setStageVarAndCommit({ key: 'current_period_index', value: newPeriodIndex });

    // 应用时间效果到所有角色（消耗/恢复/触底扣血）
    const rawChars = stageStateManager.getCalculationStageState().GameVar['scavenge_characters'];
    const chars: ScavengeCharacter[] = (() => {
      if (typeof rawChars === 'string') {
        try {
          const parsed = JSON.parse(rawChars);
          if (Array.isArray(parsed)) return parsed.map((c) => normalizeCharacter(c as ScavengeCharacter));
        } catch { /* ignore */ }
      }
      if (Array.isArray(rawChars)) {
        return (rawChars as unknown as ScavengeCharacter[]).map((c) => normalizeCharacter(c));
      }
      return [];
    })();
    if (chars.length > 0) {
      const updated = applyPeriodEffectsToCharacters(chars, isOvernight);
      stageStateManager.setStageVarAndCommit({
        key: 'scavenge_characters',
        value: JSON.stringify(updated),
      });
      // 调试输出
      const exhausted = updated.filter(c => c.hunger === 0 || c.thirst === 0).length;
      const dead = updated.filter(c => c.hp === 0).length;
      console.log(
        `时间推进: 第${newDay}天 ${nextState.period}` +
        (isOvernight ? ' (过夜恢复)' : '') +
        (exhausted > 0 ? ` [${exhausted} 人饥/渴=0]` : '') +
        (dead > 0 ? ` [${dead} 人濒死]` : ''),
      );
    } else {
      console.log(`时间推进: 第${newDay}天 ${nextState.period}`);
    }

    if (isOvernight) {
      console.log('新的一天开始，自动存档到槽位 0！');
      saveGame(0);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.timeDisplay}>
        <div className={styles.day}>
          <span className={styles.label}>第</span>
          <span className={styles.value}>{currentDay}</span>
          <span className={styles.label}>天</span>
        </div>
        <div className={styles.period}>
          <span className={styles.periodValue}>{currentPeriod}</span>
        </div>
      </div>
      <button className={styles.advanceButton} onClick={handleTimeAdvance} title="时间流逝">
        <Icon icon={schedule} className={styles.buttonIcon} />
      </button>
    </div>
  );
};
