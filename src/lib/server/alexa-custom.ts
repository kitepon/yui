import { billingConfigured, loadEntitlement } from "./billing";
import { interpretVoice } from "./alexa-interpret";
import { userIdForAlexaAccess } from "./alexa-oauth";
import { executeDevice, executeScene } from "./execute";
import { loadHome } from "./home-db";
import { fireSceneOnServer } from "./runner";

type AlexaCustomRequest = {
  request?: {
    type?: string;
    intent?: { name?: string; slots?: Record<string, { value?: string } | undefined> };
  };
  session?: { user?: { accessToken?: string } };
  context?: { System?: { user?: { accessToken?: string } } };
};

function speech(text: string, end = true) {
  return {
    version: "1.0",
    response: {
      outputSpeech: { type: "PlainText", text },
      shouldEndSession: end,
    },
  };
}

function slotText(req: AlexaCustomRequest) {
  const slots = req.request?.intent?.slots ?? {};
  const query = slots.query?.value?.trim();
  if (query) return query;
  return "";
}

export async function handleAlexaCustom(req: AlexaCustomRequest) {
  const type = req.request?.type ?? "";
  if (type === "LaunchRequest") return speech("結です。何をしますか", false);
  if (type === "SessionEndedRequest") return { version: "1.0", response: {} };
  const name = req.request?.intent?.name ?? "";
  if (name === "AMAZON.StopIntent" || name === "AMAZON.CancelIntent") {
    return speech("はい");
  }
  if (name === "AMAZON.HelpIntent") {
    return speech("たとえば、シーリング消して、おはよう、と言ってください", false);
  }

  const token = req.session?.user?.accessToken || req.context?.System?.user?.accessToken;
  if (!token) return speech("Alexaアプリで結を有効化して、ログインしてください");
  const userId = userIdForAlexaAccess(token);
  if (!userId) return speech("結に繋がっていません。スキルを結び直してください");
  if (billingConfigured()) {
    const entitlement = await loadEntitlement(userId);
    if (!entitlement.writable) return speech("結の契約が必要です");
  }

  const query = slotText(req);
  const { id: homeId, snap } = await loadHome(userId);
  const cmd = interpretVoice(query, snap.devices, snap.scenes);
  if (cmd.type === "none") return speech(cmd.speech, false);
  if (cmd.type === "scene") {
    await executeScene(homeId, snap, cmd.sceneId);
    await fireSceneOnServer(homeId, cmd.sceneId);
    return speech(cmd.speech);
  }
  let cur = snap;
  for (const patch of cmd.patches) {
    const device = cur.devices.find((d) => d.id === patch.id);
    if (!device) continue;
    try {
      cur = await executeDevice(homeId, cur, device, { on: patch.on });
    } catch {
      /* continue */
    }
  }
  return speech(cmd.speech);
}
