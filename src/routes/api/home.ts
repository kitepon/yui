import { createFileRoute } from "@tanstack/react-router";
import { randomUUID } from "node:crypto";
import { remoSync } from "@/lib/home/remo";
import { switchbotSync } from "@/lib/home/switchbot";
import { tuyaSync } from "@/lib/home/tuya";
import { odelicSync } from "@/lib/home/odelic";
import { daikinSync } from "@/lib/home/daikin";
import { isLanOwner } from "@/lib/server/lan-owner";
import { moveById, orderedByIds } from "@/lib/home/order";
import { patchFromAction } from "@/lib/home/device-patch";
import { parseNativeAutomation, parseNativeSceneSteps } from "@/lib/server/native-edit";
import type { Brand, Device, Scene } from "@/lib/home/types";
import { auth } from "@/lib/auth/server";
import { clientHome, loadHome, replaceHome, saveHome } from "@/lib/server/home-db";
import { executeDevice, executeScene } from "@/lib/server/execute";
import { fireDeviceOnServer, fireSceneOnServer, startControlRunner } from "@/lib/server/runner";
import { newWaveId } from "@/lib/server/analysis";
import { billingConfigured, loadEntitlement, paywall } from "@/lib/server/billing";

// 本番の着火点は server/plugins/control-runner.ts だけ。このモジュールは server と ssr の
// 両方の bundle に入るため、ここで無条件に呼ぶと 1 プロセスに runner が 2 つ立つ
// （tick と LAN 探索が二重になり、名乗りを受けない側が古い値で上書きした。2026-09-22 実被弾）。
// dev は nitro plugin が動かないので、ここでだけ起こす。
if (import.meta.env.DEV) startControlRunner();

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function requireOwner(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return null;
  return { id: session.user.id, lanOwner: isLanOwner(session.user.email) };
}

/** LAN 直結は宛先をサーバーが持つので、持ち主以外には触らせない。 */
const LAN_BRANDS = new Set<Brand>(["daikin", "odelec"]);

function deny() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export const Route = createFileRoute("/api/home")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const who = await requireOwner(request);
        if (!who) return deny();
        const userId = who.id;
        const { snap } = await loadHome(userId);
        const billing = billingConfigured() ? await loadEntitlement(userId) : null;
        return Response.json({ ...clientHome(snap, request.headers.get("host"), who.lanOwner), billing });
      },
      POST: async ({ request }) => {
        const who = await requireOwner(request);
        if (!who) return deny();
        const userId = who.id;
        if (billingConfigured()) {
          const entitlement = await loadEntitlement(userId);
          if (!entitlement.writable) return paywall();
        }
        const { id: homeId, snap } = await loadHome(userId);
        const body = await readJson(request);
        const op = String(body.op ?? "");

        if (op === "credentials") {
          const incoming = (body.credentials ?? {}) as Partial<typeof snap.credentials>;
          const saved = await saveHome(userId, {
            credentials: { ...snap.credentials, ...incoming },
          });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "automation-toggle") {
          const automationId = String(body.automationId ?? "");
          if (typeof body.enabled !== "boolean") {
            return Response.json({ error: "有効状態が不正です" }, { status: 400 });
          }
          if (!snap.automations.some((automation) => automation.id === automationId)) {
            return Response.json({ error: "オートメーションが見つかりません" }, { status: 404 });
          }
          const saved = await saveHome(userId, {
            automations: snap.automations.map((automation) =>
              automation.id === automationId ? { ...automation, enabled: body.enabled as boolean } : automation,
            ),
          });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "automation-save") {
          const automationId = String(body.automationId ?? "");
          const previous = automationId ? snap.automations.find((item) => item.id === automationId) : undefined;
          if (automationId && !previous) {
            return Response.json({ error: "オートメーションが見つかりません" }, { status: 404 });
          }
          const draft = parseNativeAutomation(body.automation, snap);
          if (!draft) return Response.json({ error: "オートメーションの設定が不正です" }, { status: 400 });
          const automation = {
            ...draft,
            id: previous?.id ?? `auto-${randomUUID()}`,
            lastExecutedKey: previous?.lastExecutedKey,
          };
          const automations = previous
            ? snap.automations.map((item) => item.id === previous.id ? automation : item)
            : [...snap.automations, automation];
          const saved = await saveHome(userId, { automations });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "automation-remove") {
          const automationId = String(body.automationId ?? "");
          if (!snap.automations.some((item) => item.id === automationId)) {
            return Response.json({ error: "オートメーションが見つかりません" }, { status: 404 });
          }
          const saved = await saveHome(userId, { automations: snap.automations.filter((item) => item.id !== automationId) });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "automation-run") {
          const automationId = String(body.automationId ?? "");
          const automation = snap.automations.find((item) => item.id === automationId);
          if (!automation) return Response.json({ error: "オートメーションが見つかりません" }, { status: 404 });
          let current = snap;
          const waveId = newWaveId();
          try {
            for (const action of automation.actions) {
              const device = current.devices.find((item) => item.id === action.deviceId);
              if (!device) throw new Error("機器が見つかりません");
              current = await executeDevice(homeId, current, device, patchFromAction(action), {
                source: "manual", waveId, automationId: automation.id, automationName: automation.name,
              });
              if (action.on !== undefined) {
                await fireDeviceOnServer(homeId, device.id, action.on, "manual");
                current = (await loadHome(userId)).snap;
              }
            }
            const saved = await saveHome(userId, { lastRanAutomationId: automation.id });
            return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
          } catch (error) {
            return Response.json({ error: error instanceof Error ? error.message : "実行に失敗しました" }, { status: 400 });
          }
        }

        if (op === "reorder") {
          const target = String(body.target ?? "");
          const id = String(body.id ?? "");
          const direction = body.direction;
          if (direction !== -1 && direction !== 1) {
            return Response.json({ error: "移動方向が不正です" }, { status: 400 });
          }
          if (target === "room") {
            const moved = moveById(snap.rooms.map((name) => ({ id: name })), id, direction);
            if (!moved) return Response.json({ error: "場所を移動できません" }, { status: 400 });
            const saved = await saveHome(userId, { rooms: moved.map((room) => room.id) });
            return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
          }
          if (target === "scene") {
            const moved = moveById(snap.scenes, id, direction);
            if (!moved) return Response.json({ error: "項目を移動できません" }, { status: 400 });
            const saved = await saveHome(userId, { scenes: moved });
            return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
          }
          if (target === "automation") {
            const moved = moveById(snap.automations, id, direction);
            if (!moved) return Response.json({ error: "項目を移動できません" }, { status: 400 });
            const saved = await saveHome(userId, { automations: moved });
            return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
          }
          if (target === "device") {
            const device = snap.devices.find((item) => item.id === id);
            if (!device) return Response.json({ error: "機器が見つかりません" }, { status: 404 });
            const inRoom = snap.devices.filter((item) => item.room === device.room && item.source === device.source);
            const ordered = orderedByIds(inRoom, snap.deviceOrder[device.room]);
            const moved = moveById(ordered, id, direction);
            if (!moved) return Response.json({ error: "機器を移動できません" }, { status: 400 });
            const saved = await saveHome(userId, {
              deviceOrder: { ...snap.deviceOrder, [device.room]: moved.map((item) => item.id) },
            });
            return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
          }
          return Response.json({ error: "並べ替え対象が不正です" }, { status: 400 });
        }

        if (op === "device-meta") {
          const deviceId = String(body.deviceId ?? "");
          const device = snap.devices.find((item) => item.id === deviceId);
          if (!device) return Response.json({ error: "機器が見つかりません" }, { status: 404 });
          const name = String(body.name ?? "").trim();
          const room = String(body.room ?? "").trim();
          if (!name || !room || (room !== device.room && !snap.rooms.includes(room))) {
            return Response.json({ error: "名前か場所が不正です" }, { status: 400 });
          }
          const deviceOrder = { ...snap.deviceOrder };
          if (room !== device.room) {
            deviceOrder[device.room] = (deviceOrder[device.room] ?? []).filter((id) => id !== deviceId);
            deviceOrder[room] = [...(deviceOrder[room] ?? []), deviceId];
          }
          const saved = await saveHome(userId, {
            overrides: { ...snap.overrides, [deviceId]: { ...snap.overrides[deviceId], name, room } },
            deviceOrder,
          });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "room-add") {
          const name = String(body.name ?? "").trim();
          if (!name || snap.rooms.includes(name)) {
            return Response.json({ error: "その場所は追加できません" }, { status: 400 });
          }
          const saved = await saveHome(userId, { rooms: [...snap.rooms, name] });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "room-rename" || op === "room-remove") {
          const from = String(body.from ?? "");
          if (!snap.rooms.includes(from)) {
            return Response.json({ error: "場所が見つかりません" }, { status: 404 });
          }
          const to = op === "room-rename"
            ? String(body.to ?? "").trim()
            : snap.rooms.find((room) => room !== from) ?? "";
          if (!to || (op === "room-rename" && snap.rooms.includes(to))) {
            return Response.json({ error: "その場所へ変更できません" }, { status: 400 });
          }
          const overrides = { ...snap.overrides };
          for (const device of snap.devices.filter((item) => item.room === from)) {
            overrides[device.id] = { ...overrides[device.id], room: to };
          }
          const deviceOrder = { ...snap.deviceOrder };
          if (op === "room-rename") {
            deviceOrder[to] = deviceOrder[from] ?? [];
          } else {
            deviceOrder[to] = [...(deviceOrder[to] ?? []), ...(deviceOrder[from] ?? [])];
          }
          delete deviceOrder[from];
          const rooms = op === "room-rename"
            ? snap.rooms.map((room) => room === from ? to : room)
            : snap.rooms.filter((room) => room !== from);
          const saved = await saveHome(userId, { rooms, overrides, deviceOrder });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "scene-save") {
          const sceneId = String(body.sceneId ?? "");
          const previous = snap.scenes.find((scene) => scene.id === sceneId);
          if (sceneId && !previous) {
            return Response.json({ error: "場面が見つかりません" }, { status: 404 });
          }
          const name = String(body.name ?? "").trim();
          const hint = String(body.hint ?? "").trim();
          if (!name) return Response.json({ error: "場面の名前が必要です" }, { status: 400 });
          const steps = body.steps == null && previous ? previous.steps : parseNativeSceneSteps(body.steps, snap, previous?.steps);
          if (!steps) return Response.json({ error: "場面の操作が不正です" }, { status: 400 });
          const scene: Scene = { id: previous?.id ?? `scene-${randomUUID()}`, name, hint, steps };
          const scenes = previous
            ? snap.scenes.map((item) => item.id === previous.id ? scene : item)
            : [...snap.scenes, scene];
          const saved = await saveHome(userId, { scenes });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "scene-remove") {
          const sceneId = String(body.sceneId ?? "");
          if (!snap.scenes.some((scene) => scene.id === sceneId)) {
            return Response.json({ error: "場面が見つかりません" }, { status: 404 });
          }
          const saved = await saveHome(userId, { scenes: snap.scenes.filter((scene) => scene.id !== sceneId) });
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "push") {
          const next = body.state as typeof snap | undefined;
          if (!next) return Response.json({ error: "state がありません" }, { status: 400 });
          const saved = await replaceHome(userId, next);
          return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
        }

        if (op === "sync") {
          const brand = String(body.brand ?? "") as Brand;
          // LAN 直結は宛先をサーバーが持ち、利用者ごとの認証情報が無い。
          // 持ち主以外へ同期させると、他人の家の機器がその人の家に入る。
          if (LAN_BRANDS.has(brand) && !who.lanOwner) {
            return Response.json({ error: "未対応の接続です" }, { status: 400 });
          }
          try {
            if (brand === "nature") {
              const res = await remoSync(snap.credentials.natureToken);
              const devices = [
                ...snap.devices.filter((d) => d.connector !== "nature" && d.source === "live"),
                ...res.devices,
              ];
              const saved = await saveHome(userId, {
                devices: devices.length ? devices : res.devices,
                climate: res.climate,
                connectors: {
                  ...snap.connectors,
                  nature: {
                    id: "nature",
                    connected: true,
                    deviceCount: res.devices.length,
                    lastSync: new Date().toISOString(),
                  },
                },
              });
              return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
            }
            if (brand === "switchbot") {
              const incoming = await switchbotSync(
                snap.credentials.switchbotToken,
                snap.credentials.switchbotSecret,
              );
              const devices = [
                ...snap.devices.filter((d) => d.connector !== "switchbot" && d.source === "live"),
                ...incoming,
              ];
              const saved = await saveHome(userId, {
                devices,
                connectors: {
                  ...snap.connectors,
                  switchbot: {
                    id: "switchbot",
                    connected: true,
                    deviceCount: incoming.length,
                    lastSync: new Date().toISOString(),
                  },
                },
              });
              return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
            }
            if (brand === "smartlife") {
              const res = await tuyaSync(
                snap.credentials.tuyaAccessId,
                snap.credentials.tuyaSecret,
                snap.credentials.tuyaUid,
                snap.credentials.tuyaRegion || "auto",
              );
              const devices = [
                ...snap.devices.filter((d) => d.connector !== "smartlife" && d.source === "live"),
                ...res.devices,
              ];
              const saved = await saveHome(userId, {
                devices,
                credentials: { ...snap.credentials, tuyaRegion: res.region, tuyaLocal: res.local },
                connectors: {
                  ...snap.connectors,
                  smartlife: {
                    id: "smartlife",
                    connected: true,
                    deviceCount: res.devices.length,
                    lastSync: new Date().toISOString(),
                  },
                },
              });
              return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
            }
            if (brand === "daikin") {
              const res = await daikinSync();
              const devices = [
                ...snap.devices.filter((d) => d.connector !== "daikin" && d.source === "live"),
                ...res.devices,
              ];
              const saved = await saveHome(userId, {
                devices,
                connectors: {
                  ...snap.connectors,
                  daikin: {
                    id: "daikin",
                    connected: true,
                    deviceCount: res.devices.length,
                    lastSync: new Date().toISOString(),
                  },
                },
              });
              return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
            }
            if (brand === "odelec") {
              const res = await odelicSync();
              const devices = [
                ...snap.devices.filter((d) => d.connector !== "odelec" && d.source === "live"),
                ...res.devices,
              ];
              const saved = await saveHome(userId, {
                devices,
                connectors: {
                  ...snap.connectors,
                  odelec: {
                    id: "odelec",
                    connected: true,
                    deviceCount: res.devices.length,
                    lastSync: new Date().toISOString(),
                  },
                },
              });
              return Response.json(clientHome(saved, request.headers.get("host"), who.lanOwner));
            }
            return Response.json({ error: "未対応の接続です" }, { status: 400 });
          } catch (err) {
            const message = err instanceof Error ? err.message : "同期に失敗しました";
            await saveHome(userId, {
              connectors: {
                ...snap.connectors,
                [brand]: { ...snap.connectors[brand], error: message, connected: false },
              },
            });
            return Response.json({ error: message }, { status: 400 });
          }
        }

        if (op === "control") {
          const deviceId = String(body.deviceId ?? "");
          const patch = (body.patch ?? {}) as Partial<Device>;
          const device = snap.devices.find((d) => d.id === deviceId);
          if (!device) return Response.json({ error: "機器が見つかりません" }, { status: 404 });
          try {
            await executeDevice(homeId, snap, device, patch, { source: "control", waveId: newWaveId() });
            if (patch.on !== undefined) await fireDeviceOnServer(homeId, device.id, patch.on, "control");
            const latest = await loadHome(userId);
            return Response.json(clientHome(latest.snap, request.headers.get("host"), who.lanOwner));
          } catch (err) {
            return Response.json(
              { error: err instanceof Error ? err.message : "操作に失敗しました" },
              { status: 400 },
            );
          }
        }

        if (op === "scene") {
          const sceneId = String(body.sceneId ?? "");
          try {
            await executeScene(homeId, snap, sceneId, "scene");
          } catch (err) {
            return Response.json(
              { error: err instanceof Error ? err.message : "場面がありません" },
              { status: 404 },
            );
          }
          await fireSceneOnServer(homeId, sceneId, "scene");
          const latest = await loadHome(userId);
          return Response.json(clientHome(latest.snap, request.headers.get("host"), who.lanOwner));
        }

        return Response.json({ error: "不明な操作です" }, { status: 400 });
      },
    },
  },
});
