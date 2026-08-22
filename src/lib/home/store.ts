import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { phoneStorage } from "./phone-storage";
import { DEMO_CLIMATE, DEMO_DEVICES, matchesStep, SCENES } from "./demo";
import { emptyConnectors, type HomeSnapshot } from "./snapshot";
import { dropRoomFromOrder, renameOrderKey } from "./order";
import { applyOverrides } from "./overrides";
import {
  DEFAULT_ROOMS,
  EMPTY_CREDENTIALS,
  type Automation,
  type Brand,
  type Climate,
  type ConnectorStatus,
  type Credentials,
  type Device,
  type DeviceCommand,
  type DeviceOverride,
  type Scene,
  migrateAutomation,
} from "./types";

interface HomeState {
  credentials: Credentials;
  devices: Device[];
  climate: Climate;
  connectors: Record<Brand, ConnectorStatus>;
  demoVisible: boolean;
  lastScene: string | null;
  savedAt: string | null;
  rooms: string[];
  overrides: Record<string, DeviceOverride>;
  deviceOrder: Record<string, string[]>;
  scenes: Scene[];
  automations: Automation[];
  pairPin: string;
  credentialFlags: Record<keyof Credentials, boolean> | null;
  odelicBridge: boolean;
  daikinDirect: boolean;
  serverHost: string | null;
  applySnapshot: (snap: HomeSnapshot, host?: string | null) => void;
  setCredentials: (patch: Partial<Credentials>) => void;
  setDevicesForBrand: (brand: Brand, incoming: Device[]) => void;
  setClimate: (climate: Climate) => void;
  setConnector: (brand: Brand, patch: Partial<ConnectorStatus>) => void;
  applyLocal: (cmd: DeviceCommand) => Device | undefined;
  revertDevice: (device: Device) => void;
  applySceneLocal: (sceneId: string) => DeviceCommand[];
  resetDemo: () => void;
  touchSaved: () => void;
  addRoom: (name: string) => boolean;
  renameRoom: (from: string, to: string) => boolean;
  removeRoom: (name: string) => void;
  updateDeviceMeta: (id: string, patch: DeviceOverride) => void;
  moveRoom: (name: string, dir: -1 | 1) => void;
  moveDevice: (id: string, dir: -1 | 1) => void;
  addScene: (scene: Omit<Scene, "id">) => string;
  updateScene: (id: string, patch: Partial<Scene>) => void;
  removeScene: (id: string) => void;
  moveScene: (id: string, dir: -1 | 1) => void;
  addAutomation: (item: Omit<Automation, "id" | "lastFiredKey">) => string;
  updateAutomation: (id: string, patch: Partial<Automation>) => void;
  toggleAutomation: (id: string, enabled?: boolean) => void;
  removeAutomation: (id: string) => void;
  markAutomationFired: (id: string, key: string) => void;
}

const defaultConnectors = emptyConnectors;

function mergeBrand(current: Device[], brand: Brand, incoming: Device[]) {
  const others = current.filter((d) => d.connector !== brand && d.source === "live");
  const live = [...others, ...incoming];
  if (live.length > 0) return live;

  return DEMO_DEVICES.filter((demo) => demo.brand !== brand);
}

function nowIso() {
  return new Date().toISOString();
}

export function snapshotFromState(s: {
  credentials: Credentials;
  devices: Device[];
  climate: Climate;
  connectors: Record<Brand, ConnectorStatus>;
  rooms: string[];
  overrides: Record<string, DeviceOverride>;
  deviceOrder: Record<string, string[]>;
  scenes: Scene[];
  automations: Automation[];
  lastScene: string | null;
  savedAt: string | null;
  pairPin?: string;
}): HomeSnapshot {
  return {
    credentials: s.credentials,
    devices: s.devices,
    climate: s.climate,
    connectors: s.connectors,
    rooms: s.rooms,
    overrides: s.overrides,
    deviceOrder: s.deviceOrder,
    scenes: s.scenes,
    automations: s.automations,
    lastScene: s.lastScene,
    savedAt: s.savedAt,
    pairPin: s.pairPin ?? "",
  };
}

export function sortByOrder<T extends { id: string }>(items: T[], order?: string[]) {
  if (!order?.length) return items;
  return [...items].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export const useHome = create<HomeState>()(
  persist(
    (set, get) => ({
      credentials: EMPTY_CREDENTIALS,
      devices: DEMO_DEVICES,
      climate: DEMO_CLIMATE,
      connectors: defaultConnectors(),
      demoVisible: true,
      lastScene: null,
      savedAt: null,
      rooms: [...DEFAULT_ROOMS],
      overrides: {},
      deviceOrder: {},
      scenes: SCENES,
      automations: [],
      pairPin: "",
      credentialFlags: null,
      odelicBridge: false,
      daikinDirect: false,
      serverHost: null,
      applySnapshot: (snap, host) =>
        set({
          credentials: Object.values(snap.credentials).some((v) => v.trim())
            ? snap.credentials
            : get().credentials,
          credentialFlags: snap.credentialFlags ?? get().credentialFlags,
          odelicBridge: snap.odelicBridge ?? get().odelicBridge,
          daikinDirect: snap.daikinDirect ?? get().daikinDirect,
          devices: snap.devices,
          climate: snap.climate,
          connectors: snap.connectors,
          rooms: snap.rooms,
          overrides: snap.overrides,
          deviceOrder: snap.deviceOrder,
          scenes: snap.scenes,
          automations: snap.automations,
          lastScene: snap.lastScene,
          savedAt: snap.savedAt,
          pairPin: snap.pairPin,
          serverHost: host ?? get().serverHost,
          demoVisible: snap.devices.some((d) => d.source === "demo"),
        }),
      touchSaved: () => set({ savedAt: nowIso() }),
      setCredentials: (patch) =>
        set((s) => ({
          credentials: { ...s.credentials, ...patch },
          savedAt: nowIso(),
        })),
      setDevicesForBrand: (brand, incoming) =>
        set((s) => {
          const devices = applyOverrides(mergeBrand(s.devices, brand, incoming), s.overrides);
          return {
            devices,
            demoVisible: devices.some((d) => d.source === "demo"),
            savedAt: nowIso(),
          };
        }),
      setClimate: (climate) => set({ climate, savedAt: nowIso() }),
      setConnector: (brand, patch) =>
        set((s) => ({
          connectors: {
            ...s.connectors,
            [brand]: { ...s.connectors[brand], ...patch, id: brand },
          },
          savedAt: nowIso(),
        })),
      applyLocal: (cmd) => {
        const prev = get().devices.find((d) => d.id === cmd.id);
        set((s) => ({
          devices: s.devices.map((d) => (d.id === cmd.id ? { ...d, ...cmd } : d)),
          savedAt: nowIso(),
        }));
        return prev;
      },
      revertDevice: (device) =>
        set((s) => ({
          devices: s.devices.map((d) => (d.id === device.id ? device : d)),
          savedAt: nowIso(),
        })),
      applySceneLocal: (sceneId) => {
        const scene = get().scenes.find((sc) => sc.id === sceneId);
        if (!scene) return [];
        const cmds: DeviceCommand[] = [];
        set((s) => {
          const devices = s.devices.map((d) => {
            let next = d;
            for (const step of scene.steps) {
              if (matchesStep(d, step)) {
                next = { ...next, ...step.patch };
                cmds.push({ id: d.id, ...step.patch });
              }
            }
            return next;
          });
          return { devices, lastScene: sceneId, savedAt: nowIso() };
        });
        return cmds;
      },
      resetDemo: () =>
        set((s) => ({
          devices: applyOverrides(DEMO_DEVICES, s.overrides),
          climate: DEMO_CLIMATE,
          connectors: defaultConnectors(),
          demoVisible: true,
          lastScene: null,
          savedAt: nowIso(),
          credentials: s.credentials,
          rooms: s.rooms,
          overrides: s.overrides,
          deviceOrder: s.deviceOrder,
          scenes: s.scenes,
          automations: s.automations,
        })),
      addRoom: (name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        const exists = get().rooms.some((r) => r === trimmed);
        if (exists) return false;
        set((s) => ({ rooms: [...s.rooms, trimmed], savedAt: nowIso() }));
        return true;
      },
      renameRoom: (from, to) => {
        const trimmed = to.trim();
        if (!trimmed || trimmed === from) return false;
        if (get().rooms.includes(trimmed)) return false;
        set((s) => {
          const rooms = s.rooms.map((r) => (r === from ? trimmed : r));
          const devices = s.devices.map((d) => (d.room === from ? { ...d, room: trimmed } : d));
          const overrides = { ...s.overrides };
          for (const [id, o] of Object.entries(overrides)) {
            if (o.room === from) overrides[id] = { ...o, room: trimmed };
          }
          const deviceOrder = renameOrderKey(s.deviceOrder, from, trimmed);
          return { rooms, devices, overrides, deviceOrder, savedAt: nowIso() };
        });
        return true;
      },
      removeRoom: (name) => {
        const fallback = get().rooms.find((r) => r !== name) ?? "その他";
        set((s) => {
          const rooms = s.rooms.filter((r) => r !== name);
          if (!rooms.length) return s;
          const devices = s.devices.map((d) => (d.room === name ? { ...d, room: fallback } : d));
          const overrides = { ...s.overrides };
          for (const [id, o] of Object.entries(overrides)) {
            if (o.room === name) overrides[id] = { ...o, room: fallback };
          }
          const moved = s.devices.filter((d) => d.room === name).map((d) => d.id);
          const deviceOrder = dropRoomFromOrder(s.deviceOrder, name, fallback, moved);
          return { rooms, devices, overrides, deviceOrder, savedAt: nowIso() };
        });
      },
      updateDeviceMeta: (id, patch) =>
        set((s) => {
          const prev = s.overrides[id] ?? {};
          const overrides = {
            ...s.overrides,
            [id]: { ...prev, ...patch },
          };
          const before = s.devices.find((d) => d.id === id);
          const devices = applyOverrides(
            s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
            overrides,
          );
          const deviceOrder = { ...s.deviceOrder };
          if (patch.room && before && before.room !== patch.room) {
            deviceOrder[before.room] = (deviceOrder[before.room] ?? []).filter((x) => x !== id);
            deviceOrder[patch.room] = [...(deviceOrder[patch.room] ?? []), id];
          }
          return { overrides, devices, deviceOrder, savedAt: nowIso() };
        }),
      moveRoom: (name, dir) =>
        set((s) => {
          const i = s.rooms.indexOf(name);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.rooms.length) return s;
          const rooms = [...s.rooms];
          [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
          return { rooms, savedAt: nowIso() };
        }),
      moveDevice: (id, dir) =>
        set((s) => {
          const device = s.devices.find((d) => d.id === id);
          if (!device) return s;
          const room = device.room;
          const inRoom = s.devices.filter((d) => d.room === room);
          const ordered = sortByOrder(inRoom, s.deviceOrder[room]);
          const i = ordered.findIndex((d) => d.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= ordered.length) return s;
          const next = [...ordered];
          [next[i], next[j]] = [next[j], next[i]];
          return {
            deviceOrder: { ...s.deviceOrder, [room]: next.map((d) => d.id) },
            savedAt: nowIso(),
          };
        }),
      addScene: (scene) => {
        const id = `scene-${Date.now().toString(36)}`;
        set((s) => ({
          scenes: [...s.scenes, { ...scene, id }],
          savedAt: nowIso(),
        }));
        return id;
      },
      updateScene: (id, patch) =>
        set((s) => ({
          scenes: s.scenes.map((sc) => (sc.id === id ? { ...sc, ...patch } : sc)),
          savedAt: nowIso(),
        })),
      removeScene: (id) =>
        set((s) => ({
          scenes: s.scenes.filter((sc) => sc.id !== id),
          savedAt: nowIso(),
        })),
      moveScene: (id, dir) =>
        set((s) => {
          const i = s.scenes.findIndex((sc) => sc.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= s.scenes.length) return s;
          const scenes = [...s.scenes];
          [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
          return { scenes, savedAt: nowIso() };
        }),
      addAutomation: (item) => {
        const id = `auto-${Date.now().toString(36)}`;
        set((s) => ({
          automations: [...s.automations, { ...item, id }],
          savedAt: nowIso(),
        }));
        return id;
      },
      updateAutomation: (id, patch) =>
        set((s) => ({
          automations: s.automations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
          savedAt: nowIso(),
        })),
      toggleAutomation: (id, enabled) =>
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, enabled: enabled ?? !a.enabled } : a,
          ),
          savedAt: nowIso(),
        })),
      removeAutomation: (id) =>
        set((s) => ({
          automations: s.automations.filter((a) => a.id !== id),
          savedAt: nowIso(),
        })),
      markAutomationFired: (id, key) =>
        set((s) => ({
          automations: s.automations.map((a) => (a.id === id ? { ...a, lastFiredKey: key } : a)),
        })),
    }),
    {
      name: "yui-home",
      storage: createJSONStorage(() => phoneStorage),
      skipHydration: true,
      version: 4,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<HomeState> & { automations?: unknown[] };
        return {
          ...current,
          ...p,
          credentials: { ...EMPTY_CREDENTIALS, ...p.credentials },
          rooms: p.rooms?.length ? p.rooms : [...DEFAULT_ROOMS],
          overrides: p.overrides ?? {},
          deviceOrder: p.deviceOrder ?? {},
          scenes: p.scenes?.length ? p.scenes : SCENES,
          automations: (p.automations ?? []).map(migrateAutomation).filter((a): a is Automation => a != null),
          devices: (() => {
            const list = (p.devices ?? current.devices).filter((d) => d.id !== "demo-entry-lock");
            return list.some((d) => d.source === "live") ? list.filter((d) => d.source === "live") : list;
          })(),
        };
      },
      partialize: (s) => ({
        credentials: s.credentials,
        devices: s.devices,
        climate: s.climate,
        connectors: s.connectors,
        demoVisible: s.demoVisible,
        lastScene: s.lastScene,
        savedAt: s.savedAt,
        rooms: s.rooms,
        overrides: s.overrides,
        deviceOrder: s.deviceOrder,
        scenes: s.scenes,
        automations: s.automations,
        pairPin: s.pairPin,
      }),
    },
  ),
);
