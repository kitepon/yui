import { billingConfigured, loadEntitlement } from "./billing";
import {
  acceptGrantResponse,
  alexaError,
  alexaOk,
  alexaToken,
  discoverEndpoints,
  discoverResponse,
  isSceneEndpoint,
  parseAlexaIntent,
  patchFromIntent,
  propertyContext,
  sceneIdFromEndpoint,
  type AlexaEvent,
} from "./alexa-core";
import { userIdForAlexaAccess } from "./alexa-oauth";
import { executeDevice, executeScene } from "./execute";
import { loadHome } from "./home-db";
import { fireDeviceOnServer, fireSceneOnServer } from "./runner";

export async function handleAlexaEvent(event: AlexaEvent) {
  if (!event?.directive?.header) {
    return {
      event: {
        header: { namespace: "Alexa", name: "ErrorResponse", messageId: "missing", payloadVersion: "3" },
        payload: { type: "INVALID_DIRECTIVE", message: "directive が無い" },
      },
    };
  }
  const token = alexaToken(event);
  if (!token) return alexaError(event.directive, "INVALID_AUTHORIZATION_CREDENTIAL", "トークンが無い");
  const userId = userIdForAlexaAccess(token);
  if (!userId) return alexaError(event.directive, "INVALID_AUTHORIZATION_CREDENTIAL", "結に繋がっていない");
  if (billingConfigured()) {
    const entitlement = await loadEntitlement(userId);
    if (!entitlement.writable) {
      // SUBSCRIPTION_REQUIRED は「サブスクリプションが必要なため無効」の公式type。
      // DISABLED_BY_USER はカメラのスナップショット機能専用で、ここでは誤用になる。
      return alexaError(event.directive, "SUBSCRIPTION_REQUIRED", "結の契約が必要です");
    }
  }
  const intent = parseAlexaIntent(event.directive);
  if ("error" in intent) return alexaError(event.directive, "INVALID_DIRECTIVE", intent.error);
  if (intent.type === "acceptGrant") return acceptGrantResponse(event.directive);

  const { id: homeId, snap } = await loadHome(userId);
  if (intent.type === "discover") {
    return discoverResponse(event.directive, discoverEndpoints(snap.devices, snap.scenes));
  }

  const endpointId = event.directive.endpoint?.endpointId;
  if (!endpointId) return alexaError(event.directive, "NO_SUCH_ENDPOINT", "機器が無い");

  if (isSceneEndpoint(endpointId)) {
    if (intent.type !== "scene" && intent.type !== "report") {
      return alexaError(event.directive, "INVALID_DIRECTIVE", "場面です");
    }
    if (intent.type === "scene") {
      await executeScene(homeId, snap, sceneIdFromEndpoint(endpointId));
      await fireSceneOnServer(homeId, sceneIdFromEndpoint(endpointId));
      return alexaOk(event.directive, {
        namespace: "Alexa.SceneController",
        name: "ActivationStarted",
        payload: { cause: { type: "VOICE_INTERACTION" }, timestamp: new Date().toISOString() },
      });
    }
    return alexaOk(event.directive, { name: "StateReport" });
  }

  const device = snap.devices.find((d) => d.id === endpointId);
  if (!device) return alexaError(event.directive, "NO_SUCH_ENDPOINT", "機器が無い");

  if (intent.type === "report") {
    // ReportState への応答名は Response ではなく StateReport（Alexa 仕様）。
    return alexaOk(event.directive, { name: "StateReport", context: { properties: propertyContext(device) } });
  }

  if (intent.type === "scene") return alexaError(event.directive, "INVALID_DIRECTIVE", "場面ではない");
  const patch = patchFromIntent(device, intent);
  if ("error" in patch) return alexaError(event.directive, "INVALID_DIRECTIVE", patch.error);

  try {
    const next = await executeDevice(homeId, snap, device, patch);
    // 指で押したときと同じにする。機器トリガーのオートメーションは入口で差を付けない。
    if (patch.on !== undefined) await fireDeviceOnServer(homeId, device.id, patch.on);
    const updated = next.devices.find((d) => d.id === device.id) ?? { ...device, ...patch };
    return alexaOk(event.directive, { context: { properties: propertyContext(updated) } });
  } catch (err) {
    return alexaError(
      event.directive,
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "操作に失敗しました",
    );
  }
}
