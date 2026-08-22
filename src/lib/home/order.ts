/** 部屋ごとの機器の並び順。部屋の名前が変わっても消えないように、鍵の付け替えをここに集める。 */
export type DeviceOrder = Record<string, string[]>;

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
