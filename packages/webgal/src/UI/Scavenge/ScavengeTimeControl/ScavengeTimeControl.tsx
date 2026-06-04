import { useSelector } from 'react-redux';
import { Icon } from '@iconify/react';
import schedule from '@iconify-icons/material-symbols/schedule';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { stageStateManager } from '@/Core/Modules/stage/stageStateManager';
import { saveGame } from '@/Core/controller/storage/saveGame';
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

    stageStateManager.setStageVarAndCommit({ key: 'current_day', value: newDay });
    stageStateManager.setStageVarAndCommit({ key: 'current_period_index', value: newPeriodIndex });

    console.log(`时间推进: 第${newDay}天 ${nextState.period}`);

    if (nextState.day > 0) {
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
