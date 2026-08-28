# Yui

<p align="center">
  <img src="public/images/living.jpg" alt="Yui home dashboard" width="896">
</p>

<p align="center">
  One home, one screen.<br>
  A self-hostable home app that brings Nature Remo, SwitchBot, Smart Life, and supported Daikin air conditioners together.
</p>

<p align="center">
  <a href="https://yuihome.kitepon.dev">Hosted service</a> ·
  <a href="deploy/README.md">Self-host</a> ·
  <a href="README.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/kitepon/yui/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/kitepon/yui/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/license-MIT-37584b"></a>
  <a href="https://yuihome.kitepon.dev"><img alt="Hosted" src="https://img.shields.io/badge/hosted-yuihome.kitepon.dev-bb4d36"></a>
</p>

## What Yui does

- Brings Nature Remo, SwitchBot, and Smart Life (Tuya) devices into one dashboard.
- Controls supported Daikin air conditioners directly over your LAN, without a cloud round trip.
- Runs multi-device scenes and server-side automations triggered by time or sensor readings. Values shown on screen are saved even if left at their defaults. Sensor thresholds accept one decimal place. In-range conditions send a command only when the current setting differs, and only to devices that can report that setting.
- Works with Alexa Smart Home and can be installed from Safari as a home-screen web app. The official skill 「結ホーム」 is under Amazon review (submitted 2026-08-23). Until it is published, you can run your own skill from your server by following [docs/alexa.md](docs/alexa.md).

Yui only shows modes and temperature ranges reported by each air conditioner. Unsupported controls are not presented as if they worked.

## What the cloud connectors actually do

Yui does not ship Home Assistant. Device kinds are copied from [Home Assistant core](https://github.com/home-assistant/core) tables. Re-sync each connector after connecting so new fields appear.

- **Nature Remo** — sensors, air conditioners (temperature, mode, fan speed, swing), lights, and learned IR. Swing is vertical or fixed; independent left/right is not supported.
- **SwitchBot** — bots, plugs, lights, curtains, locks, meters/sensors, and IR air conditioners (temperature, mode, fan speed). Vacuums and humidifiers appear in the list but have no dedicated controls.
- **Smart Life** — lights (brightness), plugs, curtains, air conditioners, and temperature/humidity/water sensors. Commands are sent only for data points the device actually has. Unknown Tuya categories stay `other`.

## Hosted or self-hosted

|            | Hosted service                                     | Self-hosted                          |
| ---------- | -------------------------------------------------- | ------------------------------------ |
| Start      | [yuihome.kitepon.dev](https://yuihome.kitepon.dev) | [Deployment guide](deploy/README.md) |
| Price      | JPY 100/month or JPY 1,000/year, tax included      | Free                                 |
| Trial      | 30 days for first-time subscribers                 | Unlimited                            |
| Operations | Operated by kitepon.dev                            | Operated by you                      |
| Features   | Same                                               | Same                                 |

The software is MIT-licensed and the self-hosted edition has no feature restrictions. The paid service covers hosting and operations.

## Run locally

```bash
npm install
npm run dev
```

Development runs at `http://localhost:8080`. Production is designed for Docker behind a reverse proxy. See the [deployment guide](deploy/README.md).

Required values are `BETTER_AUTH_SECRET`, `HOME_SECRETS_KEY`, and `BETTER_AUTH_URL`. Losing `HOME_SECRETS_KEY` makes stored device tokens impossible to decrypt.

For direct Daikin control, set `YUI_DAIKIN_ADDRS` (for example `リビング=192.168.0.10`) and run Yui on the same LAN as the home.

Product decisions live in [docs/00_direction.md](docs/00_direction.md).

## Current limits

- Odelic lighting protocol and the author's private bridge are not distributed in this repository.
- Pre-2018 Daikin adapters using the older API are not supported.
- Direct Daikin control has been measured on one 2020 Urusara X unit; other models are not yet verified.
- Unknown cloud device types, vacuums, humidifiers, and Nature Remo left/right swing are out of scope. Smart Life cannot send commands the device does not expose.
- While releases are `v0.x`, long-term database and configuration upgrade compatibility is not guaranteed.
- The native iPhone app and the production Cloudflare migration remain future work.

For vulnerabilities, use the private route in [SECURITY.md](SECURITY.md). For bugs and compatibility reports, use [GitHub Issues](https://github.com/kitepon/yui/issues). Contributions are described in [CONTRIBUTING.md](CONTRIBUTING.md).

Yui is an Independent Product operated and supported by [kitepon.dev](https://kitepon.dev). It brings kitepon.dev's stance — 「面白いを見つけ、面白いを動かす。」— to everyday home control. Licensed under the [MIT License](LICENSE), without warranty.

Release history is recorded in [CHANGELOG.md](CHANGELOG.md).
