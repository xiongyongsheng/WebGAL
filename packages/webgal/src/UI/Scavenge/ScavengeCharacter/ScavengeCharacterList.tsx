import { useStageState } from '@/hooks/useStageState';
import { ScavengeCharacter, getCharacterStatusText, getStatusBarColor } from './character';
import { Icon } from '@iconify/react';
import person from '@iconify-icons/material-symbols/person';
import styles from './ScavengeCharacterList.module.scss';

interface ScavengeCharacterListProps {
  onCharacterSelect: (character: ScavengeCharacter) => void;
  onClose: () => void;
}

export const ScavengeCharacterList = ({ onCharacterSelect, onClose }: ScavengeCharacterListProps) => {
  const stageState = useStageState();

  // 从 GameVar 获取角色列表
  const getCharacters = (): ScavengeCharacter[] => {
    const charactersData = stageState.GameVar['scavenge_characters'];
    if (Array.isArray(charactersData)) {
      return charactersData as ScavengeCharacter[];
    }

    // 如果没有角色数据，返回默认角色
    const defaultChar: ScavengeCharacter = {
      id: 'player_1',
      name: '主角',
      str: 5,
      agi: 5,
      end: 5,
      int: 5,
      hp: 100,
      maxHp: 100,
      hunger: 100,
      maxHunger: 100,
      thirst: 100,
      maxThirst: 100,
      sanity: 100,
      maxSanity: 100,
      fatigue: 0,
      maxFatigue: 100,
      isExploring: false,
    };
    return [defaultChar];
  };

  const characters = getCharacters();

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <Icon icon={person} className={styles.titleIcon} />
            <h2 className={styles.title}>角色列表</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <Icon icon="material-symbols:close" />
          </button>
        </div>

        {/* 角色列表 */}
        <div className={styles.characterList}>
          {characters.map((character) => {
            const statusText = getCharacterStatusText(character);
            const hpColor = getStatusBarColor(character.hp, character.maxHp);
            const hpPercentage = (character.hp / character.maxHp) * 100;

            return (
              <div
                key={character.id}
                className={`${styles.characterCard} ${character.isExploring ? styles.exploring : ''}`}
                onClick={() => onCharacterSelect(character)}
              >
                {/* 角色头像 */}
                <div className={styles.avatar}>
                  <Icon icon="material-symbols:person" />
                </div>

                {/* 角色信息 */}
                <div className={styles.info}>
                  <div className={styles.nameRow}>
                    <span className={styles.name}>{character.name}</span>
                    <span className={`${styles.status} ${character.isExploring ? styles.statusExploring : ''}`}>
                      {statusText}
                    </span>
                  </div>

                  {/* HP 条 */}
                  <div className={styles.hpBar}>
                    <div className={styles.hpLabel}>HP</div>
                    <div className={styles.hpTrack}>
                      <div
                        className={styles.hpFill}
                        style={{
                          width: `${hpPercentage}%`,
                          backgroundColor: hpColor,
                        }}
                      />
                    </div>
                    <div className={styles.hpText}>
                      {character.hp}/{character.maxHp}
                    </div>
                  </div>

                  {/* 属性预览 */}
                  <div className={styles.attrPreview}>
                    <span>STR: {character.str}</span>
                    <span>AGI: {character.agi}</span>
                    <span>END: {character.end}</span>
                    <span>INT: {character.int}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};