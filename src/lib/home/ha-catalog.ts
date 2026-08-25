/**
 * 機器種別の表。Home Assistant core（Apache-2.0）の tuya / switchbot_cloud から、
 * 結が持つ kind へ写した。https://github.com/home-assistant/core
 *
 * Tuya は category が複数 platform を持つ。結は機器あたり kind が1つなので
 * カーテン → エアコン → センサー専用 → コンセント → 照明 → スイッチ の順。
 */
import type { DeviceKind } from "./types.ts";

export const TUYA_KIND_BY_CATEGORY: Record<string, DeviceKind> = {
  "aqcz": "sensor",
  "bh": "plug",
  "bzyd": "light",
  "cjkg": "plug",
  "ckmkzq": "curtain",
  "cl": "curtain",
  "clkg": "curtain",
  "cn": "plug",
  "co2bj": "sensor",
  "cobj": "sensor",
  "cs": "plug",
  "cwjwq": "plug",
  "cwwsq": "plug",
  "cwysj": "plug",
  "cz": "plug",
  "dbl": "ac",
  "dc": "light",
  "dd": "light",
  "dghsxj": "plug",
  "dgnbj": "sensor",
  "dj": "light",
  "dlq": "plug",
  "dr": "plug",
  "dsd": "light",
  "fs": "light",
  "fsd": "light",
  "fwd": "light",
  "ggq": "plug",
  "gyd": "light",
  "hcdd": "light",
  "hjjcy": "sensor",
  "hxd": "light",
  "jdcljqr": "curtain",
  "jqbj": "sensor",
  "jsq": "plug",
  "jwbj": "sensor",
  "kg": "plug",
  "kj": "plug",
  "ks": "light",
  "kt": "ac",
  "ldcg": "sensor",
  "mal": "plug",
  "mbd": "light",
  "mc": "sensor",
  "mcs": "sensor",
  "msp": "plug",
  "mzj": "plug",
  "pc": "plug",
  "pir": "sensor",
  "pm2.5": "sensor",
  "qccdz": "plug",
  "qjdcz": "light",
  "qn": "ac",
  "qxj": "plug",
  "rqbj": "sensor",
  "rs": "ac",
  "sd": "plug",
  "sfkzq": "sensor",
  "sgbj": "sensor",
  "sj": "sensor",
  "sjz": "plug",
  "sos": "sensor",
  "sp": "plug",
  "swtz": "sensor",
  "sz": "sensor",
  "szjcy": "sensor",
  "szjqr": "plug",
  "tdq": "light",
  "tgkg": "light",
  "tgq": "light",
  "tyd": "light",
  "tyndj": "light",
  "voc": "sensor",
  "wg2": "plug",
  "wk": "ac",
  "wkcz": "plug",
  "wkf": "ac",
  "wnykq": "plug",
  "wsdcg": "sensor",
  "wxkg": "sensor",
  "xdd": "light",
  "xnyjcn": "plug",
  "xxj": "plug",
  "ykq": "light",
  "ylcg": "sensor",
  "ywbj": "sensor",
  "ywcgq": "sensor",
  "zd": "sensor",
  "zndb": "sensor",
  "znjxs": "plug",
  "znnbq": "sensor",
  "znrb": "plug",
  "zwjcy": "sensor"
};

const SWITCHBOT_KIND_BY_TYPE: Record<string, DeviceKind> = {
  Bot: "bot",
  Curtain: "curtain",
  Curtain3: "curtain",
  Curtain4: "curtain",
  "Roller Shade": "curtain",
  "Blind Tilt": "curtain",
  "Garage Door Opener": "curtain",
  "Strip Light": "light",
  "Strip Light 3": "light",
  "Floor Lamp": "light",
  "Color Bulb": "light",
  "RGBICWW Floor Lamp": "light",
  "Permanent Outdoor Lights": "light",
  "RGBICWW Strip Light": "light",
  "Ceiling Light": "light",
  "Ceiling Light Pro": "light",
  "RGBIC Neon Wire Rope Light": "light",
  "RGBIC Neon Rope Light": "light",
  "Candle Warmer Lamp": "light",
  "Motion Sensor": "sensor",
  "Contact Sensor": "sensor",
  "Presence Sensor": "sensor",
  "Hub 3": "sensor",
  "Home Climate Panel": "sensor",
  WeatherStation: "sensor",
  Meter: "sensor",
  MeterPlus: "sensor",
  WoIOSensor: "sensor",
  "Hub 2": "sensor",
  MeterPro: "sensor",
  "MeterPro(CO2)": "sensor",
  "Water Detector": "sensor",
  "Smart Lock": "lock",
  "Smart Lock Ultra": "lock",
  "Smart Lock Vision": "lock",
  "Smart Lock Vision Pro": "lock",
  "Lock Vision": "lock",
  "Lock Vision Pro": "lock",
  "Smart Lock Lite": "lock",
  "Smart Lock Pro": "lock",
  "Smart Lock Pro Wifi": "lock",
};

/** Tuya の category を結の kind へ。表に無いものは other。 */
export function tuyaKindFromCategory(category: string): DeviceKind {
  const c = category.trim().toLowerCase();
  if (!c) return "other";
  return TUYA_KIND_BY_CATEGORY[c] ?? "other";
}

/** SwitchBot の deviceType。IR は deviceType の末尾でエアコンを見分ける（HA と同じ）。 */
export function switchbotKindFromType(deviceType: string, infrared = false): DeviceKind {
  const t = deviceType.trim();
  if (infrared) {
    if (t.endsWith("Air Conditioner") || t === "Air Conditioner") return "ac";
    if (/light/i.test(t)) return "light";
    return "ir";
  }
  if (SWITCHBOT_KIND_BY_TYPE[t]) return SWITCHBOT_KIND_BY_TYPE[t];
  if (t.startsWith("Plug") || t.startsWith("Relay Switch")) return "plug";
  if (t === "Humidifier" || t === "Humidifier2") return "other";
  if (t.startsWith("Air Purifier")) return "other";
  if (
    t.startsWith("K10") ||
    t.startsWith("K20") ||
    t.startsWith("S20") ||
    t.includes("Vacuum")
  ) {
    return "other";
  }
  if (t.includes("Curtain") || t.includes("Blind") || t.includes("Shade")) return "curtain";
  if (t.includes("Lock")) return "lock";
  if (t.includes("Meter") || t.includes("Sensor") || t.includes("Hub 2") || t.includes("Hub 3")) {
    return "sensor";
  }
  if (t.includes("Bulb") || t.includes("Light") || t.includes("Lamp") || t.includes("Ceiling")) {
    return "light";
  }
  return "other";
}
