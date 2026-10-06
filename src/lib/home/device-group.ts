import { clockInTokyo } from "./clock.ts";
import { patchAlreadyApplied, patchFromAction, reportsActuatorState } from "./device-patch.ts";
import {
  isMomentaryBot,
  type AutoAction,
  type Automation,
  type Device,
  type DeviceGroup,
  type DeviceGroupPending,
  type DeviceGroupState,
} from "./types.ts";

export const GROUP_LOCK_MINUTES_MIN = 1;
export const GROUP_LOCK_MINUTES_MAX = 24 * 60;
export const GROUP_LOCK_MINUTES_DEFAULT = 10;

export type DeviceGroupStates = Record<string, DeviceGroupState>;

export function newDeviceGroupId() {
  return `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function clampLockMinutes(value: unknown) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return GROUP_LOCK_MINUTES_DEFAULT;
  return Math.min(GROUP_LOCK_MINUTES_MAX, Math.max(GROUP_LOCK_MINUTES_MIN, n));
}

/**
 * 保存の入口で形を揃える。一つの機器が入れるグループは一つだけ。
 * 同期で一時的に消えた機器の id は残す。再同期で戻ったときに設定が続く。
 */
export function normalizeDeviceGroups(raw: unknown): DeviceGroup[] {
  if (!Array.isArray(raw)) return [];
  const groupIds = new Set<string>();
  const taken = new Set<string>();
  const out: DeviceGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    const id = typeof g.id === "string" ? g.id : "";
    if (!id || groupIds.has(id)) continue;
    groupIds.add(id);
    const deviceIds: string[] = [];
    for (const deviceId of Array.isArray(g.deviceIds) ? g.deviceIds : []) {
      if (typeof deviceId !== "string" || !deviceId || taken.has(deviceId)) continue;
      taken.add(deviceId);
      deviceIds.push(deviceId);
    }
    out.push({
      id,
      name: (typeof g.name === "string" ? g.name.trim() : "") || "グループ",
      deviceIds,
      lockMinutes: clampLockMinutes(g.lockMinutes),
    });
  }
  return out;
}

/** 無くなったグループの記録を落とす。 */
export function pruneGroupStates(groups: DeviceGroup[], states: DeviceGroupStates | undefined): DeviceGroupStates {
  const out: DeviceGroupStates = {};
  for (const group of groups) {
    const state = states?.[group.id];
    if (state) out[group.id] = state;
  }
  return out;
}

export function groupOfDevice(groups: DeviceGroup[] | undefined, deviceId: string | undefined) {
  if (!deviceId) return undefined;
  return groups?.find((group) => group.deviceIds.includes(deviceId));
}

/** いま操作を止めているなら、明ける時刻を返す。時計が戻って記録が未来にあるときは止めない。 */
export function groupLockedUntil(group: DeviceGroup, state: DeviceGroupState | undefined, nowMs: number): number | null {
  if (!state) return null;
  const at = Date.parse(state.operatedAt);
  if (!Number.isFinite(at)) return null;
  const until = at + group.lockMinutes * 60 * 1000;
  return nowMs >= at && nowMs < until ? until : null;
}

export function deviceGroupLock(
  groups: DeviceGroup[] | undefined,
  states: DeviceGroupStates | undefined,
  deviceId: string | undefined,
  nowMs: number,
): { group: DeviceGroup; until: number } | null {
  const group = groupOfDevice(groups, deviceId);
  if (!group) return null;
  const until = groupLockedUntil(group, states?.[group.id], nowMs);
  return until == null ? null : { group, until };
}

/** 画面に出す、いまの状態。止めていなければ null。 */
export function groupLockNote(
  group: DeviceGroup,
  state: DeviceGroupState | undefined,
  automations: Array<Pick<Automation, "id" | "name" | "enabled">>,
  nowMs: number,
): string | null {
  const until = groupLockedUntil(group, state, nowMs);
  if (until == null) return null;
  const note = `${clockInTokyo(new Date(until)).label} までオートメーションを止めています`;
  const pending = automations.find((a) => a.enabled && a.id === state?.pending?.automationId);
  return pending ? `${note}。明けたとき条件が続いていれば「${pending.name}」を動かします` : note;
}

/** オートメーションの操作を、送るものと、グループが止めているものに分ける。 */
export function partitionGroupLocked(
  actions: AutoAction[],
  groups: DeviceGroup[] | undefined,
  states: DeviceGroupStates | undefined,
  nowMs: number,
) {
  const run: AutoAction[] = [];
  const locked: Array<{ action: AutoAction; group: DeviceGroup; until: number }> = [];
  for (const action of actions) {
    const lock = deviceGroupLock(groups, states, action.deviceId, nowMs);
    if (lock) locked.push({ action, ...lock });
    else run.push(action);
  }
  return { run, locked };
}

/**
 * 機器を動かした記録を付ける。人の操作でもオートメーションでも数え直す。
 * 止めていた操作は、いま送った操作より古いので捨てる。
 */
export function stampGroupOperation(
  groups: DeviceGroup[] | undefined,
  states: DeviceGroupStates | undefined,
  deviceId: string,
  at: string,
): DeviceGroupStates | undefined {
  const group = groupOfDevice(groups, deviceId);
  if (!group) return states;
  return { ...states, [group.id]: { operatedAt: at, deviceId } };
}

/** 止めた操作を覚える。同じグループに前の分があれば置き換える。 */
export function deferGroupActions(
  states: DeviceGroupStates | undefined,
  pendings: Map<string, DeviceGroupPending>,
): DeviceGroupStates {
  const out: DeviceGroupStates = { ...states };
  for (const [groupId, pending] of pendings) {
    const state = out[groupId];
    if (state) out[groupId] = { ...state, pending };
  }
  return out;
}

export function clearGroupPendings(states: DeviceGroupStates | undefined, groupIds: string[]): DeviceGroupStates {
  const out: DeviceGroupStates = { ...states };
  for (const groupId of groupIds) {
    const state = out[groupId];
    if (state?.pending) out[groupId] = { operatedAt: state.operatedAt, deviceId: state.deviceId };
  }
  return out;
}

/** 止めたときの条件が、いまも成立しているか。時刻は成立し続ける条件を持たないので送る。 */
function pendingStillWanted(
  auto: Automation,
  snap: { automations: Automation[]; devices: Device[]; lastScene: string | null },
) {
  if (!auto.enabled) return false;
  // 上で条件が成立している「打ち切り」は、下のオートメーションを動かさない。
  for (const upper of snap.automations) {
    if (upper.id === auto.id) break;
    if (
      upper.enabled &&
      upper.stopOnMatch &&
      upper.actions.length > 0 &&
      upper.trigger.type === "sensor" &&
      upper.lastFiredKey?.endsWith(":pass")
    ) {
      return false;
    }
  }
  const t = auto.trigger;
  if (t.type === "sensor") return auto.lastFiredKey?.endsWith(":pass") === true;
  if (t.type === "scene") return snap.lastScene === t.sceneId;
  if (t.type === "device") {
    if (t.deviceOn === undefined) return true;
    const device = snap.devices.find((d) => d.id === t.deviceId);
    if (!device) return false;
    // 押すだけのボットは入のまま残らない。
    return isMomentaryBot(device) || device.on === t.deviceOn;
  }
  return true;
}

/**
 * グループが覚えている操作のうち、片付けるもの。
 * `clear` は条件が外れたグループと、操作を止める時間が明けたグループ。
 * `run` は明けたグループへ送る操作。送れなくても持ち越さない。
 */
export function dueGroupPendings(
  snap: {
    deviceGroups?: DeviceGroup[];
    deviceGroupStates?: DeviceGroupStates;
    automations: Automation[];
    devices: Device[];
    lastScene: string | null;
  },
  nowMs: number,
) {
  const run: Array<{ group: DeviceGroup; automation: Automation; actions: AutoAction[] }> = [];
  const clear: string[] = [];
  for (const group of snap.deviceGroups ?? []) {
    const state = snap.deviceGroupStates?.[group.id];
    const pending = state?.pending;
    if (!pending) continue;
    const automation = snap.automations.find((a) => a.id === pending.automationId);
    if (!automation || !pendingStillWanted(automation, snap)) {
      clear.push(group.id);
      continue;
    }
    if (groupLockedUntil(group, state, nowMs) != null) continue;
    clear.push(group.id);
    const actions = automation.actions.filter((action) => {
      if (!pending.actionIds.includes(action.id)) return false;
      if (!action.deviceId || !group.deviceIds.includes(action.deviceId)) return false;
      const device = snap.devices.find((d) => d.id === action.deviceId);
      if (!device) return false;
      // 設定を読み返せる機器が、もう目標どおりなら送らない。
      return !(reportsActuatorState(device) && patchAlreadyApplied(device, patchFromAction(action)));
    });
    if (actions.length) run.push({ group, automation, actions });
  }
  return { run, clear };
}
