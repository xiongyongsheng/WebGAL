/**
 * 安全屋聊天系统 - 话题池（2026-06-09 加）
 *
 * 每个话题：
 * - id: 话题唯一 ID
 * - level: 'casual' | 'personal' | 'secret' - 话题分级（对应 characterRoster.chatAccessMap）
 * - text: 玩家选项文字
 * - response: 角色回复（基础静态文本）
 * - affinityChange: 好感度变化（可正可负）
 * - cooldownDay?: 多久后才能再聊（0 = 同一天可重复）
 *
 * 玩家对话时显示的话题是 "casual + 角色当前等级解锁的 personal/secret"
 */

export interface ChatTopic {
  /** 唯一 ID */
  id: string;
  /** 话题级别（决定需要的好感度等级）*/
  level: 'casual' | 'personal' | 'secret';
  /** 选项文字（玩家视角）*/
  text: string;
  /** 角色回复 */
  response: string;
  /** 好感度变化（-100~100）*/
  affinityChange: number;
  /** 冷却期（天）。0 = 无冷却；1 = 第二天才能再聊 */
  cooldownDay?: number;
  /** 关联剧情场景 ID（可选，触发剧情）
   *  如果填了，点击话题会触发 WebGAL changeScene 到这个 URL
   */
  storyScene?: string;
}

/** 露西的聊天话题池（2026-06-09 加）*/
export const LUCY_CHAT_TOPICS: ChatTopic[] = [
  // ============== 日常（casual，任何等级可聊）==============
  {
    id: 'lucy_casual_thanks',
    level: 'casual',
    text: '谢谢你救了我。',
    response: '……别客气啦，反正我也没什么事做。',
    affinityChange: 2,
    cooldownDay: 1,
  },
  {
    id: 'lucy_casual_weather',
    level: 'casual',
    text: '外面的天气看起来很差。',
    response: '嗯，今天又有沙尘。出门记得戴口罩。',
    affinityChange: 1,
  },
  {
    id: 'lucy_casual_food',
    level: 'casual',
    text: '今天吃什么？',
    response: '我随便。你想吃什么？',
    affinityChange: 1,
  },

  // ============== 私人（personal，熟悉以上可聊）==============
  {
    id: 'lucy_personal_past',
    level: 'personal',
    text: '你之前是做什么的？',
    response: '……做过很多事。重要的不是过去，是接下来要怎么办。',
    affinityChange: 5,
    cooldownDay: 1,
  },
  {
    id: 'lucy_personal_family',
    level: 'personal',
    text: '你有家人吗？',
    response: '也许吧。我已经很久没想起来了。',
    affinityChange: 4,
    cooldownDay: 1,
  },

  // ============== 秘密（secret，亲密以上可聊）==============
  {
    id: 'lucy_secret_warehouse',
    level: 'secret',
    text: '我找到一个藏匿物资的地方。',
    response: '真的吗？在哪？我们明天一起去看。',
    affinityChange: 10,
    cooldownDay: 1,
    storyScene: './game/scene/safehouse/event_lucy_warehouse.txt',
  },
  {
    id: 'lucy_secret_feeling',
    level: 'secret',
    text: '我...其实有点害怕。',
    response: '我也是。但是你在就好多了。',
    affinityChange: 8,
    cooldownDay: 2,
  },
];

/** 按角色 ID 取话题池 */
export function getChatTopicsByCharacter(characterId: string): ChatTopic[] {
  if (characterId === 'lucy') return LUCY_CHAT_TOPICS;
  return [];
}

/** 过滤：按当前等级返回可聊的话题 */
export function getAvailableTopics(
  characterId: string,
  availableLevels: string[],
): ChatTopic[] {
  const all = getChatTopicsByCharacter(characterId);
  return all.filter((t) => availableLevels.includes(t.level));
}