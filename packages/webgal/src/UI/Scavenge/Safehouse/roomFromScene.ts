/**
 * 房间 ID 推断工具（2026-06-09 拆分）
 *
 * 从场景 URL 提取 room ID：
 *   ./game/scene/safehouse/living_room.txt → living_room
 *   ./game/scene/safehouse/entrance.txt → entrance
 *   ./game/scene/scavenge/scavenge_main.txt → null
 */

export function getRoomFromSceneUrl(sceneUrl: string | undefined): string | null {
  if (!sceneUrl) return null;
  // 匹配 safehouse/<room>.txt
  const m = sceneUrl.match(/safehouse[/\\]+(\w+)\.txt$/);
  if (!m) return null;
  const room = m[1];
  return room;
}