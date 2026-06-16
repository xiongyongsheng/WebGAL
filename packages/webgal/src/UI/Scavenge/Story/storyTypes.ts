/**
 * 剧情进度系统 - 类型定义
 *
 * 设计思路（2026-06-09）：
 * - 事件驱动：location 变化 / 时间推进 / 物品变化 / 选择 都触发剧情推进
 * - 状态机：每条故事线是一个节点图（nodes + edges）
 * - 存储：每条故事线单独存 progress（currentNode + visited + data）
 * - 触发器：location / time / item / character_at_location / data / manual
 *
 * 流程：
 * - 玩家操作 → GameVar 变化 → StoryManager useEffect 监听
 *   → engine.onLocationEnter / onTimeAdvance / onItemChange / selectChoice
 *   → 检查 wait_trigger 节点
 *   → 推进 currentNode + 返回 action（play_scene / show_choice / noop）
 */

import { ScavengeLocationItem } from '../ScavengeMap/locations';

// ============== 触发器 ==============

/** 触发器条件：什么时候推进状态机 */
export type TriggerCondition =
  | { type: 'location'; locationId: string }                              // 玩家到某地点
  | { type: 'time'; minDay: number; minPeriod?: number }                  // 时间到了
  | { type: 'item'; itemId: string; minCount: number }                     // 玩家有某物品
  | { type: 'character_at_location'; characterId: string; locationId: string }  // 某角色在某地点
  | { type: 'data'; key: string; op: DataOp; value: any }                 // data 字段达某值
  | { type: 'manual' };                                                     // 仅手动

export type DataOp = '>=' | '==' | '>' | '<' | '<=' | '!=';

// ============== GameVar 副作用 ==============

/** 节点执行时的 GameVar 更新（effects 和 set_state 用）
 *  2026-06-09 改：用 `kind` 做 discriminator（避免 any 干扰 narrowing）
 */
export type StateUpdate =
  | { kind?: 'set'; key: string; value: unknown }                  // 覆盖（默认）
  | { kind: 'add' | 'sub'; key: string; value: number }             // 数值加减
  | { kind: 'toggle'; key: string };                                 // bool 切换

// ============== 节点 ==============

export type ChoiceOption = {
  /** 选项文字（场景内显示）*/
  text: string;
  /** UI 提示（避免剧透）*/
  hint?: string;
  /** 选中后跳到哪个节点 */
  next: string;
  /** 选中时应用的副作用（改 GameVar）*/
  effects?: StateUpdate[];
};

export type StoryNode =
  | { type: 'scene'; sceneUrl: string; next: string }                       // 播放场景
  | { type: 'choice'; prompt: string; options: ChoiceOption[] }             // 等用户选
  | { type: 'wait_trigger'; trigger: TriggerCondition; next: string }         // 等条件
  | { type: 'set_state'; updates: StateUpdate[]; next: string }              // 改 GameVar 再推进
  | { type: 'end' };                                                          // 故事线结束

// ============== 故事线 ==============

/** 单条故事线（主线 / 露西线 / ...）*/
export type Storyline = {
  id: string;
  name: string;
  startNode: string;
  nodes: Record<string, StoryNode>;
  /** 可选：进入条件（无 entryTrigger 表示随时可进）*/
  entryTrigger?: TriggerCondition;
  /** 描述（给 UI 显示，不剧透）*/
  description?: string;
};

// ============== 进度 ==============

/** 单条故事线的进度（存 GameVar）*/
export type StorylineProgress = {
  /** 当前节点 ID */
  currentNode: string;
  /** 已访问的节点 ID（可选，用于跳过）*/
  visited: string[];
  /** 节点间传递的数据（如好感度）*/
  data: Record<string, any>;
};

// ============== 游戏状态 ==============

/** 当前游戏状态（传给 engine 检查触发器）*/
export type GameState = {
  currentLocation?: string;
  day: number;
  period: number;
  items: Array<{ itemId: string; quantity: number }>;
  characters: Record<string, any>;
  /** 其他 GameVar 透传 */
  vars: Record<string, any>;
};

// ============== 动作 ==============

/** 节点执行后返回的动作（StoryManager 消费）*/
export type StoryAction =
  | { type: 'play_scene'; sceneUrl: string; lineId?: string; nodeId?: string }
  | { type: 'show_choice'; lineId: string; nodeId: string; prompt: string; options: ChoiceOption[] }
  | { type: 'noop' };

// ============== 地点 hint ==============

/** 地点上是否有 pending 故事（红点提示）*/
export type LocationHint = 'normal' | 'story';
