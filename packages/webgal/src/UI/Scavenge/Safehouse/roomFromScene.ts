/**
 * 房间 ID 推断工具（2026-06-09 拆分）
 *
 * 从场景 URL 提取 room ID：
 *   ./game/scene/safehouse/living_room.txt → living_room
 *   ./game/scene/safehouse/entrance.txt → entrance
 *   ./game/scene/market/market.txt → market
 *   ./game/scene/scavenge/scavenge_main.txt → null
 */

export function getRoomFromSceneUrl(sceneUrl: string | undefined): string | null {
  if (!sceneUrl) return null;
  // 匹配 safehouse/<room>.txt
  const m1 = sceneUrl.match(/safehouse[/\\]+(\w+)\.txt$/);
  if (m1) return m1[1];
  // 匹配 market/<room>.txt（2026-06-19 加：市场是独立场景）
  const m2 = sceneUrl.match(/market[/\\]+(\w+)\.txt$/);
  if (m2) return m2[1];
  return null;
}