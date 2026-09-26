/** 部屋ごとの機器の並び順。部屋の名前が変わっても消えないように、鍵の付け替えをここに集める。 */
export type DeviceOrder = Record<string, string[]>;

export function orderedByIds<T extends { id: string }>(items: T[], order: string[] = []): T[] {
  if (!order.length) return items;
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

export function moveById<T extends { id: string }>(items: T[], id: string, direction: -1 | 1): T[] | null {
  const index = items.findIndex((item) => item.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return null;
  const moved = [...items];
  [moved[index], moved[destination]] = [moved[destination], moved[index]];
  return moved;
}

export function renameOrderKey(order: DeviceOrder, from: string, to: string): DeviceOrder {
  if (!order[from]) return order;
  const next = { ...order };
  next[to] = next[from];
  delete next[from];
  return next;
}

export function dropRoomFromOrder(
  order: DeviceOrder,
  room: string,
  fallback: string,
  movedIds: string[],
): DeviceOrder {
  const next = { ...order };
  delete next[room];
  if (movedIds.length) {
    const kept = next[fallback] ?? [];
    next[fallback] = [...kept, ...movedIds.filter((id) => !kept.includes(id))];
  }
  return next;
}
