/**
 * GameVar 事件总线（2026-06-19 加：Plan 16 重构）
 *
 * 目的：**替**代 React `useEffect` + `useStageState` 的隐**式**订阅模式
 *
 * 之前：
 * - 各业务系统**用** `useEffect(() => { ... }, [stageState])` 隐**式**监**听**
 * - React 重**渲**染**才**能触发**回**调
 * - 难**控**制**顺**序
 *
 * 现在：
 * - `bus.subscribe(key, listener)` 显**式**订阅
 * - `setStageVarAndCommit` **自**动发布**事**件
 * - 订阅者**直**接响应（不依赖 React 重**渲**染**）
 *
 * 设**计**原则：
 * - 订阅 / 取**消**订阅**函**数**对**（**不**会**漏**回**收**）
 * - 错**误**隔离（一**个**订阅**抛**错**不**影**响**其**他**）
 * - 支**持** `subscribe('*', listener)` **通**配订阅（**所**有** key）
 */
import { logger } from '@/Core/util/logger';
import { stageStateManager } from '../../Modules/stage/stageStateManager';

/** 事件监听器函数 */
export type GameVarListener = (newValue: unknown, oldValue: unknown, key: string) => void;

/** 取消订阅函数 */
export type Unsubscribe = () => void;

/** 通配符 */
const WILDCARD = '*';

export class GameVarEventBus {
  /** key -> listeners */
  private listeners: Map<string, Set<GameVarListener>> = new Map();
  /** 缓存上一次的值（用于提供 oldValue）*/
  private cache: Map<string, unknown> = new Map();
  /** 是否已订阅 stageStateManager */
  private bound = false;

  constructor() {
    this.bindToStageStateManager();
  }

  /**
   * 订阅某个 key 的变化
   *
   * @param key GameVar key，'*' 表**示**订阅**所**有
   * @param listener 变化**时**触**发**的**回**调
   * @returns 取**消**订阅**函**数
   */
  subscribe(key: string, listener: GameVarListener): Unsubscribe {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);

    // **立**即触**发**一次（**携**带**当**前值）
    const currentValue = this.getCurrentValue(key);
    if (currentValue !== undefined) {
      try {
        listener(currentValue, undefined, key);
      } catch (err) {
        logger.error(`[GameVarEventBus] ${key} 初**始**订阅回调**错**误:`, err);
      }
    }

    logger.debug(`[GameVarEventBus] 订阅 ${key} (总计: ${this.listeners.get(key)!.size})`);

    return () => {
      this.listeners.get(key)?.delete(listener);
    };
  }

  /**
   * 取**消**订阅
   */
  unsubscribe(key: string, listener: GameVarListener): void {
    this.listeners.get(key)?.delete(listener);
  }

  /**
   * 手**动**发布事件（**主**要**用**于测试和调**试**）
   *
   * 业务系统**一**般**不**需要调**用**——**由** setStageVarAndCommit **自**动触**发**
   */
  publish(key: string, newValue: unknown): void {
    const oldValue = this.cache.get(key);
    this.cache.set(key, newValue);
    this.notify(key, newValue, oldValue);
  }

  /**
   * 获**取**当**前**值（**用**于 subscribe 时**的**初**始**触发）
   */
  private getCurrentValue(key: string): unknown {
    if (key === WILDCARD) return undefined;
    const stageState = stageStateManager.getCalculationStageState();
    return stageState.GameVar[key];
  }

  /**
   * 绑**定**到 stageStateManager
   * **每**次 `setStageVar` **时**自动**发**布**事**件
   */
  private bindToStageStateManager(): void {
    if (this.bound) return;
    this.bound = true;

    // 拦**截** setStageVar **在**原方法**之**前**先**记**录** oldValue
    const originalSetStageVar = stageStateManager.setStageVar.bind(stageStateManager);
    stageStateManager.setStageVar = (payload: { key: string; value: string | number | boolean }) => {
      const oldValue = this.getCurrentValue(payload.key);
      originalSetStageVar(payload);
      this.cache.set(payload.key, payload.value);
      this.notify(payload.key, payload.value, oldValue);
    };
  }

  /**
   * 通知订阅者
   */
  private notify(key: string, newValue: unknown, oldValue: unknown): void {
    // 1. 通知**该** key 的订阅者
    const keyListeners = this.listeners.get(key);
    if (keyListeners) {
      for (const listener of keyListeners) {
        try {
          listener(newValue, oldValue, key);
        } catch (err) {
          logger.error(`[GameVarEventBus] ${key} 订阅者**错**误:`, err);
        }
      }
    }

    // 2. 通知**通**配订阅者
    const wildcardListeners = this.listeners.get(WILDCARD);
    if (wildcardListeners) {
      for (const listener of wildcardListeners) {
        try {
          listener(newValue, oldValue, key);
        } catch (err) {
          logger.error(`[GameVarEventBus] ${key} (**通**配) 订阅者**错**误:`, err);
        }
      }
    }
  }

  /**
   * 调**试**：**获**取**所**有订阅统计
   */
  debugListeners(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [key, listeners] of this.listeners.entries()) {
      result[key] = listeners.size;
    }
    return result;
  }

  /**
   * 清**理**所**有**订阅（**用**于测试 / 热重**载**）
   */
  clear(): void {
    this.listeners.clear();
    this.cache.clear();
  }
}
