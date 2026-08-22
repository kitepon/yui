import assert from "node:assert/strict";
import { test } from "node:test";
import type { Device, Scene } from "@/lib/home/types";
import {
  alexaToken,
  allowedAlexaRedirect,
  deviceDiscoverable,
  discoverEndpoints,
  isSceneEndpoint,
  parseAlexaIntent,
  patchFromIntent,
} from "./alexa-core.ts";

const light: Device = {
  id: "nature:abc",
  name: "シーリング",
  room: "リビング",
  brand: "nature",
  kind: "light",
  online: true,
  source: "live",
  nativeId: "abc",
  connector: "nature",
  on: true,
  brightness: 80,
};

const ac: Device = {
  ...light,
  id: "nature:ac",
  name: "エアコン",
  kind: "ac",
  targetTemp: 26,
  mode: "cool",
};

test("live lights are discovered, demo and sensors are not", () => {
  const sensor: Device = { ...light, id: "nature:s", kind: "sensor", name: "Remo" };
  const demo: Device = { ...light, id: "demo-1", source: "demo" };
  const scene: Scene = { id: "sc1", name: "おはよう", hint: "", steps: [] };
  const endpoints = discoverEndpoints([light, sensor, demo, ac], [scene]);
  assert.equal(endpoints.length, 3);
  assert.equal(endpoints[0]?.friendlyName, "シーリング");
  assert.deepEqual(endpoints[0]?.displayCategories, ["LIGHT"]);
  assert.deepEqual(endpoints[1]?.displayCategories, ["THERMOSTAT"]);
  assert.equal(endpoints[1]?.capabilities.some((c) => "interface" in c && c.interface === "Alexa.ThermostatController"), true);
  assert.equal(endpoints[2]?.endpointId, "scene:sc1");
  assert.equal(deviceDiscoverable(sensor), false);
});

test("token is read from payload or endpoint", () => {
  assert.equal(
    alexaToken({
      directive: {
        header: { namespace: "Alexa.Discovery", name: "Discover", messageId: "1" },
        payload: { scope: { token: "abc" } },
      },
    }),
    "abc",
  );
});

test("intents do not require a phrase catalog", () => {
  assert.deepEqual(
    parseAlexaIntent({
      header: { namespace: "Alexa.PowerController", name: "TurnOff", messageId: "1" },
    }),
    { type: "power", on: false },
  );
  assert.equal(isSceneEndpoint("scene:sc1"), true);
  assert.deepEqual(
    parseAlexaIntent({
      header: { namespace: "Alexa.Authorization", name: "AcceptGrant", messageId: "2" },
    }),
    { type: "acceptGrant" },
  );
  assert.deepEqual(
    parseAlexaIntent({
      header: { namespace: "Alexa.ThermostatController", name: "SetTargetTemperature", messageId: "3" },
      payload: { targetSetpoint: { value: 22, scale: "CELSIUS" } },
    }),
    { type: "thermostat", targetTemp: 22 },
  );
  assert.deepEqual(
    parseAlexaIntent({
      header: { namespace: "Alexa.BrightnessController", name: "AdjustBrightness", messageId: "4" },
      payload: { brightnessDelta: -20 },
    }),
    { type: "brightnessDelta", delta: -20 },
  );
});

test("AcceptGrant reads the grantee token", () => {
  assert.equal(
    alexaToken({
      directive: {
        header: { namespace: "Alexa.Authorization", name: "AcceptGrant", messageId: "g" },
        payload: { grantee: { type: "BearerToken", token: "grant-token" } },
      },
    }),
    "grant-token",
  );
});

test("Alexa temperature and dim deltas become device patches", () => {
  assert.deepEqual(patchFromIntent(ac, { type: "thermostat", targetTemp: 22 }), {
    targetTemp: 22,
    on: true,
  });
  assert.deepEqual(patchFromIntent(ac, { type: "thermostat", deltaTemp: -2 }), {
    targetTemp: 24,
    on: true,
  });
  assert.deepEqual(patchFromIntent(ac, { type: "thermostat", mode: "heat" }), {
    mode: "heat",
    on: true,
  });
  assert.deepEqual(patchFromIntent(light, { type: "brightnessDelta", delta: 30 }), {
    brightness: 100,
    on: true,
  });
});

test("Alexa account-link redirects are limited to Amazon", () => {
  assert.equal(allowedAlexaRedirect("https://alexa.amazon.co.jp/api/skill/link/vendor"), true);
  assert.equal(allowedAlexaRedirect("https://evil.example/callback"), false);
});
