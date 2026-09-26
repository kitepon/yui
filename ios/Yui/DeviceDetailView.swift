import SwiftUI

struct DeviceDetailView: View {
    @EnvironmentObject private var session: SessionStore
    let initialDevice: Device
    @State private var brightness = 80.0
    @State private var position = 0.0
    @State private var draftName = ""
    @State private var draftRoom = ""

    private var device: Device {
        session.home?.devices.first { $0.id == initialDevice.id } ?? initialDevice
    }

    private var canOperate: Bool { device.online && !session.busy }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                if device.kind == "sensor" {
                    measurements
                } else if device.kind == "ac" {
                    airConditioner
                } else if device.kind == "curtain" {
                    curtain
                } else if device.kind == "other" {
                    Text("この機器の詳細操作にはまだ対応していません")
                        .foregroundStyle(YuiTheme.muted)
                } else {
                    simpleControls
                }
                metadataEditor
                Text(device.source == "demo" ? "デモ機器" : (device.connector ?? device.brand ?? "家電"))
                    .font(.system(size: 12))
                    .foregroundStyle(YuiTheme.muted)
            }
            .padding(24)
            .padding(.top, 8)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .onAppear {
            brightness = device.brightness ?? 80
            position = device.position ?? 0
            draftName = device.name
            draftRoom = device.room
        }
        .onChange(of: device.brightness) { _, value in brightness = value ?? 80 }
        .onChange(of: device.position) { _, value in position = value ?? 0 }
    }

    private var header: some View {
        HStack(spacing: 16) {
            Image(systemName: device.symbol)
                .font(.system(size: 30, weight: .light))
                .foregroundStyle(YuiTheme.accent)
                .frame(width: 66, height: 66)
                .background(YuiTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 22))
            VStack(alignment: .leading, spacing: 5) {
                Text(device.room.uppercased())
                    .font(.system(size: 10, weight: .bold, design: .rounded))
                    .tracking(2)
                    .foregroundStyle(YuiTheme.accent)
                Text(device.name)
                    .font(.system(size: 24, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                    .lineLimit(2)
                Text(device.status)
                    .font(.system(size: 12))
                    .foregroundStyle(device.online ? YuiTheme.muted : YuiTheme.warning)
            }
            Spacer(minLength: 0)
        }
    }

    private var simpleControls: some View {
        VStack(alignment: .leading, spacing: 18) {
            if ["light", "plug", "bot", "lock", "ir"].contains(device.kind) {
                Button {
                    let next = device.isMomentary ? true : !(device.on ?? false)
                    send(["on": next])
                } label: {
                    Label(actionTitle, systemImage: device.isMomentary ? "hand.tap" : "power")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 58)
                        .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 19))
                        .foregroundStyle(YuiTheme.bg)
                }
                .disabled(!canOperate)
            }
            if device.kind == "light", device.on == true, device.brightness != nil {
                sliderSection("明るさ", value: $brightness, range: 1...100, symbol: "sun.max.fill") { value in
                    send(["brightness": Int(value), "on": true])
                }
            }
            if device.kind == "sensor" { measurements }
        }
    }

    private var actionTitle: String {
        if device.kind == "lock" { return device.on == true ? "解錠する" : "施錠する" }
        if device.isMomentary { return "押す" }
        return device.on == true ? "切る" : "入れる"
    }

    private var metadataEditor: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("名前と場所")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            TextField("機器の名前", text: $draftName)
                .padding(.horizontal, 14)
                .frame(height: 46)
                .background(YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 13))
                .foregroundStyle(YuiTheme.fg)
            Picker("場所", selection: $draftRoom) {
                ForEach(Array(Set((session.home?.rooms ?? []) + [device.room])).sorted(), id: \.self) { room in
                    Text(room).tag(room)
                }
            }
            .tint(YuiTheme.accent)
            Button("変更を保存") {
                Task { await session.updateDeviceMeta(device, name: draftName, room: draftRoom) }
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(YuiTheme.bg)
            .frame(maxWidth: .infinity, minHeight: 45)
            .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 13))
            .disabled(session.busy || draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                      (draftName == device.name && draftRoom == device.room))
        }
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private var measurements: some View {
        HStack(spacing: 10) {
            if let temp = device.temperature { measure("気温", String(format: "%.1f°", temp), "thermometer.medium") }
            if let humidity = device.humidity { measure("湿度", "\(Int(humidity))%", "humidity") }
            if let lux = device.lux { measure("照度", "\(Int(lux)) lx", "sun.max") }
            if let outdoor = device.outdoorTemp { measure("外気温", String(format: "%.1f°", outdoor), "wind") }
        }
    }

    private func measure(_ title: String, _ value: String, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Image(systemName: symbol).foregroundStyle(YuiTheme.accent)
            Text(value).font(.system(size: 21, weight: .medium, design: .rounded)).foregroundStyle(YuiTheme.fg).minimumScaleFactor(0.7)
            Text(title).font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 18))
    }

    private var curtain: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 10) {
                actionButton("閉める", symbol: "arrow.down") { send(["position": 0, "on": false]) }
                actionButton("開ける", symbol: "arrow.up") { send(["position": 100, "on": true]) }
            }
            sliderSection("開き具合", value: $position, range: 0...100, symbol: "curtains.closed") { value in
                send(["position": Int(value), "on": value > 0])
            }
        }
    }

    private var airConditioner: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 10) {
                actionButton(device.on == true ? "運転を止める" : "運転する", symbol: "power") {
                    send(["on": !(device.on ?? false)])
                }
            }
            if device.temperature != nil || device.humidity != nil || device.outdoorTemp != nil { measurements }
            modePicker
            if !temperatures.isEmpty { temperatureControl }
            if canSetHumidity { humidityPicker }
            if canSetFanSpeed { chipSection("風量", options: ["auto", "quiet", "1", "2", "3", "4", "5"], selected: device.fanSpeed, labels: ["auto": "自動", "quiet": "しずか"]) { value in
                send(["fanSpeed": value, "on": true])
            } }
            if canSetFanSwing { chipSection("風向", options: ["auto", "off", "vertical", "horizontal", "both"], selected: device.fanSwing, labels: ["auto": "自動", "off": "固定", "vertical": "上下", "horizontal": "左右", "both": "両方"]) { value in
                send(["fanSwing": value, "on": true])
            } }
        }
    }

    private var modes: [String] {
        let order = ["cool", "heat", "dry", "humidify", "fan", "auto"]
        return order.filter { mode in
            if let acModes = device.acModes { return acModes[mode] != nil }
            return mode != "humidify"
        }
    }

    private var modePicker: some View {
        chipSection("運転モード", options: modes, selected: device.mode, labels: ["cool": "冷房", "heat": "暖房", "dry": "除湿", "humidify": "加湿", "fan": "送風", "auto": "自動"]) { value in
            send(["mode": value, "on": true])
        }
    }

    private var temperatures: [Double] {
        if let acModes = device.acModes {
            return (acModes[device.mode ?? "auto"] ?? []).compactMap(Double.init)
        }
        return (16...32).map(Double.init)
    }

    private var temperatureControl: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("設定温度").font(.system(size: 13, weight: .medium)).foregroundStyle(YuiTheme.muted)
            HStack {
                stepButton("minus") { stepTemperature(-1) }
                Spacer()
                Text(device.targetTemp.map { "\(Int($0))°" } ?? "—")
                    .font(.system(size: 54, weight: .light, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(YuiTheme.fg)
                Spacer()
                stepButton("plus") { stepTemperature(1) }
            }
            .padding(.horizontal, 15)
            .frame(height: 110)
            .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 24))
        }
    }

    private func stepTemperature(_ direction: Int) {
        guard !temperatures.isEmpty else { return }
        let target = device.targetTemp ?? 26
        let exact = temperatures.firstIndex(of: target)
        let nearest = temperatures.enumerated().min { abs($0.element - target) < abs($1.element - target) }?.offset ?? 0
        let index = min(max((exact ?? nearest) + direction, 0), temperatures.count - 1)
        send(["targetTemp": temperatures[index], "on": true])
    }

    private var canSetHumidity: Bool {
        guard device.mode == "dry" || device.mode == "humidify" else { return false }
        return device.targetHumidity != nil || device.connector == "daikin" || device.mode == "humidify" && device.acModes?["humidify"] != nil
    }
    private var canSetFanSpeed: Bool {
        guard ["auto", "cool", "heat", "fan"].contains(device.mode ?? "auto") else { return false }
        return device.fanSpeed != nil || device.connector == "daikin"
    }
    private var canSetFanSwing: Bool {
        guard ["auto", "cool", "heat", "fan", "dry"].contains(device.mode ?? "auto") else { return false }
        return device.fanSwing != nil || device.connector == "daikin"
    }

    private var humidityPicker: some View {
        let choices = device.mode == "dry" ? [0, 50, 55, 60] : [0, 40, 45, 50]
        return chipSection("目標湿度", options: choices.map(String.init), selected: device.targetHumidity.map { String(Int($0)) }, labels: ["0": "連続"]) { value in
            send(["targetHumidity": Int(value) ?? 0, "on": true])
        }
    }

    private func chipSection(_ title: String, options: [String], selected: String?, labels: [String: String], action: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: 13, weight: .medium)).foregroundStyle(YuiTheme.muted)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 69), spacing: 8)], spacing: 8) {
                ForEach(options, id: \.self) { option in
                    Button { action(option) } label: {
                        Text(labels[option] ?? option)
                            .font(.system(size: 13, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(selected == option ? YuiTheme.accent : YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .foregroundStyle(selected == option ? YuiTheme.bg : YuiTheme.fg)
                    }
                    .disabled(!canOperate)
                }
            }
        }
    }

    private func sliderSection(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, symbol: String, commit: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(title, systemImage: symbol)
                Spacer()
                Text("\(Int(value.wrappedValue))%")
            }
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(YuiTheme.fg)
            Slider(value: value, in: range, step: 1) { editing in
                if !editing { commit(value.wrappedValue) }
            }
            .tint(YuiTheme.accent)
            .disabled(!canOperate)
        }
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func actionButton(_ title: String, symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.system(size: 15, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 56)
                .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                .foregroundStyle(YuiTheme.bg)
        }
        .disabled(!canOperate)
    }

    private func stepButton(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(YuiTheme.fg)
                .frame(width: 48, height: 48)
                .background(YuiTheme.surfaceRaised, in: Circle())
        }
        .disabled(!canOperate)
    }

    private func send(_ patch: [String: Any]) {
        Task { await session.control(device, patch: patch) }
    }
}
