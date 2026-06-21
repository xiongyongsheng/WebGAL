import { useSelector } from 'react-redux';
import { Icon } from '@iconify/react';
import schedule from '@iconify-icons/material-symbols/schedule';
import { RootState } from '@/store/store';
import { useStageState } from '@/hooks/useStageState';
import { timeSystem } from '@/Core/Extensions';
import styles from './ScavengeTimeControl.module.scss';

const TIME_PERIODS = ['清晨', '上午', '下午', '半晚', '黑夜'];

export const ScavengeTimeControl = () => {
  const GUIState = useSelector((state: RootState) => state.GUI);
  const stageState = useStageState();

  const currentDay = (stageState.GameVar['current_day'] as number) ?? 1;
  const currentPeriodIndex = (stageState.GameVar['current_period_index'] as number) ?? 0;
  const currentPeriod = TIME_PERIODS[currentPeriodIndex] ?? '上午';

  // 2026-06-09 加：瓶盖（货币显示）
  const currentBottlecaps = (stageState.GameVar['scavenge_bottlecaps'] as number) ?? 0;

  const isVisible = (stageState.GameVar['show_scavenge_time_control'] as boolean) ?? false;
  const isEnterGame = GUIState.isEnterGame;

  if (!isVisible || !isEnterGame) return null;

  const handleTimeAdvance = async () => {
    // 2026-06-19 终极简化：Plan 16 重构完成
    //   之前：100+ 行手动调用所有业务
    //   现在：**只**调 `timeSystem.advance()`，**所**有**业务**通过 ISystem 钩**子****自**动**触**发**：
    //     - CharacterSystem: 应用时间效果 + 写回 characters
    //     - MerchantSystem: 商人刷新 + 写回 characters
    //     - MissionSystem: 处理 mission 循环 + 写回 missions + 合并 characters
    //     - TimeStateSystem: 写回 current_day / current_period_index
    //     - PersistenceSystem: 过夜时 saveGame(0)
    await timeSystem.advance();
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
        {/* 2026-06-09 加：瓶盖显示 */}
        <div className={styles.bottlecaps} title="瓶盖（货币）">
          <Icon icon="material-symbols:attach-money" className={styles.bottlecapsIcon} />
          <span className={styles.bottlecapsValue}>{currentBottlecaps}</span>
        </div>
      </div>
      <button
        className={styles.advanceButton}
        onClick={() => {
          handleTimeAdvance().catch((err) => console.error('[ScavengeTimeControl] handleTimeAdvance 失败:', err));
        }}
        title="时间流逝"
      >
        <Icon icon={schedule} className={styles.buttonIcon} />
      </button>
    </div>
  );
};
