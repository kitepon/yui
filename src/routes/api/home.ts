import { createFileRoute } from "@tanstack/react-router";
import { remoSync } from "@/lib/home/remo";
import { switchbotSync } from "@/lib/home/switchbot";
import { tuyaSync } from "@/lib/home/tuya";
import { odelicSync } from "@/lib/home/odelic";
import { daikinSync } from "@/lib/home/daikin";
import type { Brand, Device } from "@/lib/home/types";
import { auth } from "@/lib/auth/server";
import { clientHome, loadHome, replaceHome, saveHome } from "@/lib/server/home-db";
import { executeDevice, executeScene } from "@/lib/server/execute";
import { fireDeviceOnServer, fireSceneOnServer, startControlRunner } from "@/lib/server/runner";
import { billingConfigured, loadEntitlement, paywall } from "@/lib/server/billing";

startControlRunner();

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
  return session.user.id;
}

function deny() {
  return Response.json({ error: "ログインが必要です" }, { status: 401 });
}

export const Route = createFileRoute("/api/home")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireOwner(request);
        if (!userId) return deny();
        const { snap } = await loadHome(userId);
        const billing = billingConfigured() ? await loadEntitlement(userId) : null;
        return Response.json({ ...clientHome(snap, request.headers.get("host")), billing });
      },
      POST: async ({ request }) => {
        const userId = await requireOwner(request);
        if (!userId) return deny();
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
          return Response.json(clientHome(saved, request.headers.get("host")));
        }

        if (op === "push") {
          const next = body.state as typeof snap | undefined;
          if (!next) return Response.json({ error: "state がありません" }, { status: 400 });
          const saved = await replaceHome(userId, next);
          return Response.json(clientHome(saved, request.headers.get("host")));
        }

        if (op === "sync") {
          const brand = String(body.brand ?? "") as Brand;
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
              return Response.json(clientHome(saved, request.headers.get("host")));
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
              return Response.json(clientHome(saved, request.headers.get("host")));
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
                credentials: { ...snap.credentials, tuyaRegion: res.region },
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
              return Response.json(clientHome(saved, request.headers.get("host")));
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
              return Response.json(clientHome(saved, request.headers.get("host")));
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
              return Response.json(clientHome(saved, request.headers.get("host")));
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
            await executeDevice(homeId, snap, device, patch);
            if (patch.on !== undefined) await fireDeviceOnServer(homeId, device.id, patch.on);
            const latest = await loadHome(userId);
            return Response.json(clientHome(latest.snap, request.headers.get("host")));
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
            await executeScene(homeId, snap, sceneId);
          } catch (err) {
            return Response.json(
              { error: err instanceof Error ? err.message : "場面がありません" },
              { status: 404 },
            );
          }
          await fireSceneOnServer(homeId, sceneId);
          const latest = await loadHome(userId);
          return Response.json(clientHome(latest.snap, request.headers.get("host")));
        }

        return Response.json({ error: "不明な操作です" }, { status: 400 });
      },
    },
  },
});
