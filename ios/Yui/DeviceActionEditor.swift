import SwiftUI

struct DeviceActionEditor: View {
    @Binding var draft: DeviceActionDraft
    let devices: [Device]
    let isAutomation: Bool

    private var device: Device? { devices.first { $0.id == draft.deviceId } }
    private var modes: [String] {
        guard let device else { return [] }
        let order = ["cool", "heat", "dry", "humidify", "fan", "auto"]
        if let supported = device.acModes { return order.filter { supported[$0] != nil } }
        return order.filter { $0 != "humidify" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Menu {
                ForEach(devices) { candidate in
                    Button("\(candidate.room) · \(candidate.name)") {
                        draft.deviceId = candidate.id
                        draft.match = ["id": candidate.id]
                        draft.patch = DevicePatchDraft()
                        draft.patch.on = true
                        if candidate.kind == "curtain" { draft.patch.position = 100 }
                    }
                }
            } label: {
                HStack {
                    Text(device.map { "\($0.room) · \($0.name)" } ?? "既存の条件")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(YuiTheme.fg)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .foregroundStyle(YuiTheme.accent)
                }
                .frame(minHeight: 44)
            }

            if device == nil {
                Text(isAutomation ? "機器を選んでください。" : "既存の条件を保ったまま保存します。機器を選ぶと個別操作に変わります。")
                    .font(.system(size: 12))
                    .foregroundStyle(YuiTheme.muted)
            } else if let device {
                if device.isMomentary {
                    Label("押す", systemImage: "hand.tap")
                        .foregroundStyle(YuiTheme.accent)
                } else if device.kind != "curtain" {
                    Toggle("電源", isOn: Binding(
                        get: { draft.patch.on ?? device.on ?? true },
                        set: { draft.patch.on = $0 }
                    ))
                    .tint(YuiTheme.accent)
                    .foregroundStyle(YuiTheme.fg)
                }

                if device.kind == "light" {
                    slider("明るさ", value: Binding(
                        get: { draft.patch.brightness ?? device.brightness ?? 80 },
                        set: { draft.patch.brightness = $0 }
                    ), range: 1...100, unit: "%")
                }
                if device.kind == "curtain" {
                    HStack(spacing: 8) {
                        Button("閉める") { draft.patch.position = 0; draft.patch.on = false }
                        Button("開ける") { draft.patch.position = 100; draft.patch.on = true }
                    }
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(YuiTheme.accent)
                    slider("開き具合", value: Binding(
                        get: { draft.patch.position ?? device.position ?? 0 },
                        set: { draft.patch.position = $0; draft.patch.on = $0 > 0 }
                    ), range: 0...100, unit: "%")
                }
                if device.kind == "ac" {
                    acFields(device)
                }
                if isAutomation {
                    Toggle("連続では動かさない", isOn: $draft.skipContinuous)
                        .tint(YuiTheme.accent)
                        .foregroundStyle(YuiTheme.fg)
                }
            }
        }
        .padding(16)
        .background(YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 17))
    }

    private func acFields(_ device: Device) -> some View {
        let mode = draft.patch.mode ?? device.mode ?? modes.first ?? "auto"
        let temps = device.acModes?[mode]?.compactMap(Double.init) ?? (16...32).map(Double.init)
        return VStack(alignment: .leading, spacing: 12) {
            Menu {
                ForEach(modes, id: \.self) { value in
                    Button(modeLabel(value)) { draft.patch.mode = value }
                }
            } label: {
                settingRow("運転", value: modeLabel(mode))
            }
            if !temps.isEmpty {
                Menu {
                    ForEach(temps, id: \.self) { value in
                        Button(String(format: "%.0f°", value)) { draft.patch.targetTemp = value }
                    }
                } label: {
                    settingRow("設定温度", value: String(format: "%.0f°", draft.patch.targetTemp ?? device.targetTemp ?? temps[0]))
                }
            }
            if mode == "dry" || mode == "humidify" {
                let choices = mode == "dry" ? [0, 50, 55, 60] : [0, 40, 45, 50]
                if device.targetHumidity != nil || device.connector == "daikin" || mode == "humidify" && device.acModes?["humidify"] != nil {
                    Menu {
                        ForEach(choices, id: \.self) { value in
                            Button(value == 0 ? "連続" : "\(value)%") { draft.patch.targetHumidity = Double(value) }
                        }
                    } label: {
                        let humidity = Int(draft.patch.targetHumidity ?? device.targetHumidity ?? 50)
                        settingRow("目標湿度", value: humidity == 0 ? "連続" : "\(humidity)%")
                    }
                }
            }
            if ["auto", "cool", "heat", "fan"].contains(mode) && (device.fanSpeed != nil || device.connector == "daikin") {
                Menu {
                    ForEach(["auto", "quiet", "1", "2", "3", "4", "5"], id: \.self) { value in
                        Button(value == "auto" ? "自動" : value == "quiet" ? "静音" : value) { draft.patch.fanSpeed = value }
                    }
                } label: {
                    settingRow("風量", value: draft.patch.fanSpeed ?? device.fanSpeed ?? "自動")
                }
            }
            if ["auto", "cool", "heat", "fan", "dry"].contains(mode) && (device.fanSwing != nil || device.connector == "daikin") {
                Menu {
                    ForEach(["auto", "off", "vertical", "horizontal", "both"], id: \.self) { value in
                        Button(swingLabel(value)) { draft.patch.fanSwing = value }
                    }
                } label: {
                    settingRow("風向", value: swingLabel(draft.patch.fanSwing ?? device.fanSwing ?? "auto"))
                }
            }
        }
    }

    private func slider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, unit: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).foregroundStyle(YuiTheme.fg)
                Spacer()
                Text("\(Int(value.wrappedValue))\(unit)").foregroundStyle(YuiTheme.accent)
            }
            .font(.system(size: 13))
            Slider(value: value, in: range, step: 1).tint(YuiTheme.accent)
        }
    }

    private func settingRow(_ title: String, value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(YuiTheme.fg)
            Spacer()
            Text(value).foregroundStyle(YuiTheme.accent)
            Image(systemName: "chevron.down").foregroundStyle(YuiTheme.muted)
        }
        .font(.system(size: 13))
        .frame(minHeight: 42)
    }

    private func modeLabel(_ mode: String) -> String {
        ["cool": "冷房", "heat": "暖房", "dry": "除湿", "humidify": "加湿", "fan": "送風", "auto": "自動"][mode] ?? mode
    }

    private func swingLabel(_ value: String) -> String {
        ["auto": "自動", "off": "固定", "vertical": "上下", "horizontal": "左右", "both": "上下左右"][value] ?? value
    }
}
