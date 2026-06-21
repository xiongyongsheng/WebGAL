/**
 * 拾荒系统 - 敌人系统
 *
 * 4 种丧尸敌人（固定属性，不随角色/装备变）：
 * - 游荡者（Wanderer）：普通丧尸，HP/攻击/防御均低
 * - 追逐者（Chaser）：强化型丧尸，速度快/暴击高
 * - 防暴者（Rioter）：身着护甲，HP 高 / 减伤多
 * - 哨兵（Sentinel）：2026-06-08 加，远距侦测型，高警觉低血
 *
 * 每个 location 配 enemyPool（按 danger level 分桶），派遣开始时按 pool 生成敌人实例。
 *
 * 设计（2026-06-05 与产品确认）：
 * - 敌人属性固定，不随角色属性/装备变化
 * - 每个区域有数量有限的物资 + 敌人，派遣期间会按 period 消耗
 * - 区域 enemyPool 由 location.enemyPool 字段配置
 *
 * 潜行/警觉系统（2026-06-08 加）：
 * - 每个敌人有 detection（0~1 概率），拾荒时敌人对角色做警觉判定
 * - 角色有 stealth（0~1 概率），装备的 stealth 字段总和 + agi + 黑夜加成
 * - 单个敌人察觉概率 = detection × (1 - stealth)
 * - 所有敌人都没察觉 → evade_success；至少一个发现 → combat，发现的敌人 ATB 起始 50
 */

import { generateInstanceId } from '../ScavengeItems/inventory';

// ============== 敌人类型 ==============

export type EnemyType = 'wanderer' | 'chaser' | 'rioter' | 'sentinel';

export interface EnemyTemplate {
  type: EnemyType;
  /** 中文名 */
  name: string;
  /** 描述（用于 UI） */
  description: string;
  /** 最大血量 */
  hp: number;
  /** 单次攻击伤害 */
  attackDamage: number;
  /**
   * ATB 累加值（2026-06-05 改）：
   * 战斗开始后每 tick 累加 currentTick += attackSpeed，
   * currentTick ≥ 100 时该参战者触发行动（攻击），重置 currentTick -= 100 保留余数。
   * 数值越大 → 触发越频繁。
   */
  attackSpeed: number;
  /** 护甲值（减伤） */
  armor: number;
  /** 命中率 */
  accuracy: number;
  /** 闪避率 */
  evasion: number;
  /** 暴击率 */
  critRate: number;
  /** 暴击伤害倍率 */
  critMultiplier: number;
  /**
   * 警觉值（2026-06-08 加，2026-06-08 改 integer）：
   * 拾荒遭遇时与角色 stealth 整数对比。
   * 公式：success = 1 - min(char.stealth, this) / max(char.stealth, this)
   * - 游荡者 25（漫无目的，警觉低）
   * - 追逐者 50
   * - 防暴者 75（训练有素）
   * - 哨兵   90（远距侦测，碰见基本必战）
   * - 0 = 永远不会发现
   */
  detection: number;
}

export const ENEMY_TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  wanderer: {
    type: 'wanderer',
    name: '游荡者',
    description: '普通的丧尸，行动迟缓但数量众多',
    hp: 55,
    attackDamage: 12,
    attackSpeed: 22,
    armor: 3,
    accuracy: 0.65,
    evasion: 0.15,
    critRate: 0.05,
    critMultiplier: 1.5,
    detection: 25,
  },
  chaser: {
    type: 'chaser',
    name: '追逐者',
    description: '强化型丧尸，速度快、暴击率高',
    hp: 85,
    attackDamage: 18,
    attackSpeed: 32,
    armor: 5,
    accuracy: 0.72,
    evasion: 0.22,
    critRate: 0.10,
    critMultiplier: 1.8,
    detection: 50,
  },
  rioter: {
    type: 'rioter',
    name: '防暴者',
    description: '身着护甲的强化型丧尸，HP 高、减伤多',
    hp: 140,
    attackDamage: 26,
    attackSpeed: 18,
    armor: 14,
    accuracy: 0.68,
    evasion: 0.10,
    critRate: 0.08,
    critMultiplier: 1.6,
    detection: 75,
  },
  sentinel: {
    type: 'sentinel',
    name: '哨兵',
    description: '远距侦测型，警觉极高，但血薄',
    hp: 65,
    attackDamage: 14,
    attackSpeed: 26,
    armor: 2,
    accuracy: 0.8,
    evasion: 0.25,
    critRate: 0.10,
    critMultiplier: 1.4,
    detection: 90,
  },
};

// ============== 区域敌人分布池 ==============

/** 一个区域的"敌人出现权重"配置：每个 type 配 [min, max] 数量范围 */
export interface EnemyPoolEntry {
  type: EnemyType;
  min: number;
  max: number;
}

/**
 * 按 dangerLevel 配置的区域敌人分布
 *
 * 规律：
 * - danger 0（slums 安全屋）：0 敌人
 * - danger 1（park）：少量游荡者
 * - danger 2-3（小区/别墅）：游荡者为主，偶有追逐者
 * - danger 4-5（商业/政府/工业）：追逐者 + 防暴者
 */
export const ENEMY_POOL_BY_DANGER: Record<number, EnemyPoolEntry[]> = {
  0: [],
  1: [{ type: 'wanderer', min: 1, max: 2 }],
  2: [
    { type: 'wanderer', min: 2, max: 3 },
    { type: 'chaser', min: 0, max: 1 },
  ],
  3: [
    { type: 'wanderer', min: 2, max: 4 },
    { type: 'chaser', min: 1, max: 2 },
  ],
  4: [
    { type: 'wanderer', min: 1, max: 2 },
    { type: 'chaser', min: 1, max: 2 },
    { type: 'rioter', min: 1, max: 1 },
  ],
  5: [
    { type: 'chaser', min: 2, max: 3 },
    { type: 'rioter', min: 1, max: 2 },
  ],
};

// ============== 敌人实例 ==============

/** 派遣期间一个具体敌人实例（带当前 HP / 战斗日志） */
export interface EnemyInstance {
  /** 实例 ID（用于在 UI 中标识） */
  instanceId: string;
  type: EnemyType;
  /** 初始最大 HP（用于显示） */
  maxHp: number;
  /** 当前 HP（战斗中扣减） */
  currentHp: number;
  // 战斗属性（从 template 拷贝，战斗中不变）
  attackDamage: number;
  attackSpeed: number;
  armor: number;
  accuracy: number;
  evasion: number;
  critRate: number;
  critMultiplier: number;
  // ============== 潜行/警觉系统（2026-06-08 加）==============
  /** 警觉值（从 template 拷贝） */
  detection: number;
  /**
   * 战斗初始 ATB 偏移（0~100，2026-06-08 加）：
   * - 普通敌人：0（正常累加）
   * - 被警觉系统发现的敌人：50（ATB 起始 50%，首轮先手）
   * 由 encounterCheck 在警觉判定后设置
   */
  startAtb: number;
}

/** 随机整数（min..max，含两端） */
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** 从模板创建实例（满血） */
const spawnFromTemplate = (type: EnemyType): EnemyInstance => {
  const t = ENEMY_TEMPLATES[type];
  return {
    instanceId: generateInstanceId(),
    type,
    maxHp: t.hp,
    currentHp: t.hp,
    attackDamage: t.attackDamage,
    attackSpeed: t.attackSpeed,
    armor: t.armor,
    accuracy: t.accuracy,
    evasion: t.evasion,
    critRate: t.critRate,
    critMultiplier: t.critMultiplier,
    detection: t.detection,
    startAtb: 0, // 默认无先手，由 encounterCheck 根据警觉判定设置
  };
};

/** 从 enemyPool 生成敌人列表（按 min/max 随机） */
export const spawnEnemiesFromPool = (pool: EnemyPoolEntry[]): EnemyInstance[] => {
  const enemies: EnemyInstance[] = [];
  for (const entry of pool) {
    const count = randInt(entry.min, entry.max);
    for (let i = 0; i < count; i++) {
      enemies.push(spawnFromTemplate(entry.type));
    }
  }
  return enemies;
};

/**
 * 2026-06-21 加：准备阶段抽象游荡者（不依赖 locationState）
 *
 * 设计：
 * - 准备阶段队伍正在前往目标地点，沿途遭遇的游荡者不是地点驻扎敌人
 * - 不消耗 locationState.enemyCount（独立计算）
 * - 数量 1~2（比 scavenging 阶段的 2~5 少，体现"路途骚扰"）
 *
 * 与 spawnFromTemplate 的区别：
 * - 相同：行为、HP、攻击完全相同
 * - 不同：实例不被持久化（不计入任何 locationState）
 */
export const createAbstractWanderers = (): EnemyInstance[] => {
  const count = randInt(1, 2);
  const result: EnemyInstance[] = [];
  for (let i = 0; i < count; i++) {
    result.push(spawnFromTemplate('wanderer'));
  }
  return result;
};

/** 遭遇时随机挑 N 个敌人（2026-06-09 改：2-5 个，更具挑战性）
 *
 * 旧：1-3 个 → 玩家 1v 1 都能轻松过
 * 新：2-5 个 → 配合 combat 100% 遭遇 + 敌人数值调高，1v 3-5 才是常态
 *
 * 期望节奏：
 * - 1 击 7 伤的玩家，对 3 个 wanderer（共 165 HP）→ ~8 回合
 * - 12 dmg/回合 × 1 命中的玩家，对 3 个 wanderer（共 165 HP，每回合 ~36 dmg）→ ~5 回合
 *   但敌人每回合打玩家 12 伤（cap 8 due to armor）→ 10-20 回合结束
 */
export const pickRandomEncounterEnemies = (all: EnemyInstance[]): EnemyInstance[] => {
  if (all.length === 0) return [];
  // 2026-06-09 改：2~min(5, all.length) 个
  const count = randInt(2, Math.min(5, all.length));
  // 随机抽
  const pool = [...all];
  const chosen: EnemyInstance[] = [];
  while (chosen.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
};
