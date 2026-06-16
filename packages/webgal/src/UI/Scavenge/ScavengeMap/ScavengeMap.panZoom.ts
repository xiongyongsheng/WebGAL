/**
 * Scavenge 地图 pan + zoom hook（2026-06-09 新建 / 修正）
 *
 * 功能（仅鼠标）：
 * - 拖拽：左键按住拖动
 * - 缩放：滚轮（以鼠标位置为中心缩放）— 用原生 addEventListener + passive: false
 * - Bounds clamp：SVG 不完全移出容器
 * - Programmatic centerOn(x, y, scale?)：用动画过渡到指定点（默认 200ms）
 * - zoomIn / zoomOut / reset：暴露给按钮
 * - 动态 minScale：mount 时按容器尺寸算出，缩到 fit 以下就 clamp（永不出黑底）
 *
 * 坐标系：
 * - world：SVG 自身 0-100% 坐标（来自 locations[].position）
 * - screen：容器内的像素坐标
 * - transform：translate(x, y) scale(s) 应用在 wrapper 上
 *   → 屏幕坐标 = 世界坐标 × scale + (x, y)
 */
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';

export interface PanZoomState {
  x: number;
  y: number;
  scale: number;
}

export interface UsePanZoomOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  worldWidth: number;
  worldHeight: number;
  /** 缩放下限（用户传入的"绝对最小"），最终 minScale = max(此值, fit.scale) */
  minScale?: number;
  /** 缩放上限 */
  maxScale?: number;
  /** 初始缩放（仅当未触发 auto-fit 时用） */
  initialScale?: number;
  /** centerOn 动画时长（ms） */
  animationMs?: number;
}

export interface UsePanZoomReturn {
  state: PanZoomState;
  /** 容器事件处理（不含 onWheel — wheel 用原生 listener） */
  panHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  centerOn: (worldX: number, worldY: number, scale?: number) => void;
  zoomPercent: number;
  /** 当前有效最小缩放（动态）— 给 UI 显示用 */
  effectiveMinScale: number;
}

const clamp = (val: number, min: number, max: number) =>
  Math.min(Math.max(val, min), max);

const computeBounds = (
  state: PanZoomState,
  worldWidth: number,
  worldHeight: number,
  containerW: number,
  containerH: number,
): { minX: number; maxX: number; minY: number; maxY: number } => {
  const scaledW = worldWidth * state.scale;
  const scaledH = worldHeight * state.scale;
  if (scaledW <= containerW) {
    const cx = (containerW - scaledW) / 2;
    return { minX: cx, maxX: cx, minY: 0, maxY: 0 };  // Y 也会在下面覆盖
  } else {
    const minX = containerW - scaledW;
    const maxX = 0;
    if (scaledH <= containerH) {
      const cy = (containerH - scaledH) / 2;
      return { minX, maxX, minY: cy, maxY: cy };
    } else {
      return { minX, maxX, minY: containerH - scaledH, maxY: 0 };
    }
  }
};

export const usePanZoom = (opts: UsePanZoomOptions): UsePanZoomReturn => {
  const {
    containerRef,
    worldWidth,
    worldHeight,
    minScale = 0.3,
    maxScale = 4,
    initialScale = 1,
    animationMs = 200,
  } = opts;

  const [state, setState] = useState<PanZoomState>({ x: 0, y: 0, scale: initialScale });

  // 2026-06-09 改：动态 minScale（避免缩出黑底）
  // 初始值 = 1.0（防黑底兜底），mount 后由 ResizeObserver 覆盖
  const [effectiveMinScale, setEffectiveMinScale] = useState<number>(1.0);

  const draggingRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const animRef = useRef<number | null>(null);

  // 2026-06-09 加：跟踪鼠标位置（按钮 +/- 的缩放中心）
  // 滚轮缩放已经在 onWheel handler 里直接用 event.clientX/Y
  // 但按钮点击时需要从 ref 拿最近一次的鼠标位置
  const mousePosRef = useRef<{ x: number; y: number } | null>(null);

  // 取消正在进行的动画
  const cancelAnim = useCallback(() => {
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }, []);

  useEffect(() => () => cancelAnim(), [cancelAnim]);

  // ============== fit-to-screen（cover with 5% slack）==============

  const computeAutoFit = useCallback(
    (containerW: number, containerH: number, mode: 'cover' | 'contain' = 'cover'): PanZoomState => {
      if (containerW <= 0 || containerH <= 0) return { x: 0, y: 0, scale: initialScale };
      const scaleX = containerW / worldWidth;
      const scaleY = containerH / worldHeight;
      // cover 模式加 5% slack：让两个维度都溢出 ~5%，允许双向 pan
      const raw = mode === 'cover' ? Math.max(scaleX, scaleY) * 1.05 : Math.min(scaleX, scaleY);
      // 注：这里 clamp 暂用传入的 minScale（mount 时 fit.scale 还没确定）
      const scale = clamp(raw, 0.01, maxScale);
      const x = (containerW - worldWidth * scale) / 2;
      const y = (containerH - worldHeight * scale) / 2;
      return { x, y, scale };
    },
    [worldWidth, worldHeight, maxScale],
  );

  /** 用 transform 后再 clamp（bounds） */
  const clamped = useCallback(
    (s: PanZoomState): PanZoomState => {
      const el = containerRef.current;
      if (!el) return s;
      const cw = el.clientWidth || 1;
      const ch = el.clientHeight || 1;
      const clampedScale = clamp(s.scale, effectiveMinScale, maxScale);
      const b = computeBounds({ ...s, scale: clampedScale }, worldWidth, worldHeight, cw, ch);
      return {
        scale: clampedScale,
        x: clamp(s.x, b.minX, b.maxX),
        y: clamp(s.y, b.minY, b.maxY),
      };
    },
    [containerRef, worldWidth, worldHeight, effectiveMinScale, maxScale],
  );

  // ============== mount 时自动 fit + 设置 dynamic minScale ==============
  // 2026-06-09 改：用 ResizeObserver 替代 mounted effect + window resize
  // 原因：之前 mounted effect 只在 [] deps 时跑一次，容器是 0×0 时 fit 不生效
  //  → effectiveMinScale 永远停在默认 0.3 → 用户能缩到 30%（黑边出现）
  // 修复：ResizeObserver 监听容器尺寸变化（包括从 0→有尺寸的瞬间）
  //  → 进入 scavenge 场景时自动 fit + 设置正确的 minScale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const fit = computeAutoFit(cw, ch, 'cover');
      setState(fit);
      // 2026-06-09 改：minScale = max(1.0, cover)
      // - 下限 1.0：zoom 100% 是最远视角（用户期望）
      // - 上限 cover：保证 SVG 撑满容器（不出黑底）
      // fit.scale = cover × 1.05，所以 cover = fit.scale / 1.05
      setEffectiveMinScale(Math.max(1.0, fit.scale / 1.05));
    };
    const observer = new ResizeObserver(() => apply());
    observer.observe(el);
    apply();  // 立即跑一次（如果容器已经有尺寸）
    return () => observer.disconnect();
  }, [computeAutoFit]);

  // ============== 跟踪鼠标位置（用于按钮 +/- 缩放中心）==============
  // 2026-06-09 加：用原生 mousemove 监听器（保证覆盖到 children 上的移动）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    el.addEventListener('mousemove', handler);
    return () => el.removeEventListener('mousemove', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // ============== 拖拽 ==============

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      cancelAnim();
      draggingRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: state.x,
        origY: state.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [state.x, state.y, cancelAnim],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      setState(clamped({
        scale: state.scale,
        x: d.origX + (e.clientX - d.startX),
        y: d.origY + (e.clientY - d.startY),
      }));
    },
    [state.scale, clamped],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (draggingRef.current) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        draggingRef.current = null;
      }
    },
    [],
  );

  const onPointerLeave = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ============== 滚轮缩放（原生 listener，passive: false）==============
  // 2026-06-09 修：React 17+ 把 onWheel 注册为 passive，preventDefault 报错
  // → 用 addEventListener 显式指定 passive: false
  // → handler 通过 stateRef 读最新 state（避免重新绑定）
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const s = stateRef.current;
      cancelAnim();
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      // 缩放因子：向上滚 deltaY 负 → 放大
      const delta = -e.deltaY;
      const factor = Math.exp(delta * 0.0015);
      const newScale = clamp(s.scale * factor, effectiveMinScale, maxScale);
      if (Math.abs(newScale - s.scale) < 1e-6) return;
      // 2026-06-09 修：保持鼠标所在的世界点在屏幕上不变
      // 推导：(mouseX - newX) / newScale = (mouseX - s.x) / s.scale
      //   → newX = mouseX - (mouseX - s.x) * (newScale / s.scale)
      // 旧公式 s.x + mouseX * (s.scale - newScale) 在 s.x != 0 或 s.scale != 1 时是错的
      const ratio = newScale / s.scale;
      const newX = mouseX - (mouseX - s.x) * ratio;
      const newY = mouseY - (mouseY - s.y) * ratio;
      setState(clamped({ x: newX, y: newY, scale: newScale }));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveMinScale, maxScale, clamped, cancelAnim, containerRef]);

  // ============== 程序化缩放（带动画） ==============

  const animateTo = useCallback(
    (target: PanZoomState) => {
      cancelAnim();
      const start = { ...stateRef.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / animationMs);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const cur: PanZoomState = {
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          scale: start.scale + (target.scale - start.scale) * eased,
        };
        setState(clamped(cur));
        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          animRef.current = null;
        }
      };
      animRef.current = requestAnimationFrame(step);
    },
    [animationMs, clamped, cancelAnim],
  );

  const zoomIn = useCallback(() => {
    const targetScale = clamp(stateRef.current.scale * 1.4, effectiveMinScale, maxScale);
    const el = containerRef.current;
    if (!el) return;
    // 用鼠标位置作为缩放中心（没有就回退到容器中心）
    const pos = mousePosRef.current;
    const cx = pos?.x ?? el.clientWidth / 2;
    const cy = pos?.y ?? el.clientHeight / 2;
    const s = stateRef.current;
    // 2026-06-09 修：正确公式（保持鼠标点不动）
    // ratio = targetScale / s.scale
    // newX = mouseX - (mouseX - s.x) * ratio
    const ratio = targetScale / s.scale;
    animateTo({
      x: cx - (cx - s.x) * ratio,
      y: cy - (cy - s.y) * ratio,
      scale: targetScale,
    });
  }, [effectiveMinScale, maxScale, animateTo, containerRef]);

  const zoomOut = useCallback(() => {
    const targetScale = clamp(stateRef.current.scale / 1.4, effectiveMinScale, maxScale);
    const el = containerRef.current;
    if (!el) return;
    // 用鼠标位置作为缩放中心（没有就回退到容器中心）
    const pos = mousePosRef.current;
    const cx = pos?.x ?? el.clientWidth / 2;
    const cy = pos?.y ?? el.clientHeight / 2;
    const s = stateRef.current;
    // 2026-06-09 修：正确公式
    const ratio = targetScale / s.scale;
    animateTo({
      x: cx - (cx - s.x) * ratio,
      y: cy - (cy - s.y) * ratio,
      scale: targetScale,
    });
  }, [effectiveMinScale, maxScale, animateTo, containerRef]);

  const reset = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = computeAutoFit(el.clientWidth, el.clientHeight, 'cover');
    animateTo(target);
  }, [animateTo, computeAutoFit, containerRef]);

  // ============== centerOn：把世界坐标点移动到屏幕中心 ==============

  const centerOn = useCallback(
    (worldX: number, worldY: number, scale?: number) => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const s = stateRef.current;
      const targetScale = scale ?? s.scale;
      const newX = cw / 2 - worldX * targetScale;
      const newY = ch / 2 - worldY * targetScale;
      animateTo(clamped({ x: newX, y: newY, scale: targetScale }));
    },
    [animateTo, clamped, containerRef],
  );

  const zoomPercent = useMemo(() => Math.round(state.scale * 100), [state.scale]);

  return {
    state,
    panHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerLeave,
    },
    zoomIn,
    zoomOut,
    reset,
    centerOn,
    zoomPercent,
    effectiveMinScale,
  };
};
