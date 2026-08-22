import type { Device, DeviceKind, Scene } from "@/lib/home/types";

export type VoicePatch = { id: string; on?: boolean; brightness?: number };

export type VoiceCommand =
  | { type: "scene"; sceneId: string; speech: string }
  | { type: "devices"; patches: VoicePatch[]; speech: string }
  | { type: "none"; speech: string };

const KIND_WORDS: Array<[RegExp, DeviceKind]> = [
  [/エアコン|冷房|暖房/, "ac"],
  [/カーテン|窓/, "curtain"],
  [/照明|電気|ライト|シーリング/, "light"],
  [/テレビ/, "ir"],
];

export function normalizeVoice(q: string) {
  return q.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

function wantsOff(q: string) {
  return /消して|けして|切って|きって|オフ|止め|とめ/.test(q);
}

function wantsOn(q: string) {
  return /つけて|点け|入れて|いれ|オン/.test(q);
}

function kindFromQuery(q: string): DeviceKind | null {
  for (const [re, kind] of KIND_WORDS) {
    if (re.test(q)) return kind;
  }
  return null;
}

function live(devices: Device[]) {
  return devices.filter((d) => d.source === "live");
}

export function interpretVoice(query: string, devices: Device[], scenes: Scene[]): VoiceCommand {
  const q = normalizeVoice(query);
  if (!q) return { type: "none", speech: "何をしますか" };

  const scene = [...scenes]
    .sort((a, b) => b.name.length - a.name.length)
    .find((s) => q.includes(normalizeVoice(s.name)));
  if (scene) return { type: "scene", sceneId: scene.id, speech: `${scene.name}をやります` };

  const off = wantsOff(q);
  const on = !off && wantsOn(q);
  if (!off && !on) return { type: "none", speech: "オンかオフか、場面の名前を言ってください" };

  const named = live(devices)
    .filter((d) => q.includes(normalizeVoice(d.name)))
    .sort((a, b) => b.name.length - a.name.length);

  const room = [...new Set(live(devices).map((d) => d.room))]
    .sort((a, b) => b.length - a.length)
    .find((r) => q.includes(normalizeVoice(r)));
  const kind = kindFromQuery(q);
  const all = /全部|すべて|みんな/.test(q);

  let targets = named;
  if (!targets.length) {
    targets = live(devices).filter((d) => {
      if (d.kind === "sensor" || d.kind === "other") return false;
      if (room && d.room !== room) return false;
      if (kind && d.kind !== kind) return false;
      if (!room && !kind && !all) return false;
      return true;
    });
  }
  if (!targets.length) return { type: "none", speech: "どの機器かわかりませんでした" };

  const patches = targets.map((d) => ({ id: d.id, on: on }));
  const verb = on ? "つけます" : "消します";
  const label = targets.length === 1 ? targets[0]!.name : `${targets.length}個`;
  return { type: "devices", patches, speech: `${label}を${verb}` };
}
