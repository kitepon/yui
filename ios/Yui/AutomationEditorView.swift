import SwiftUI

private struct AutomationTriggerDraft {
    var type = "time"
    var repeatType = "daily"
    var hour = 7
    var minute = 0
    var everyHours = 2
    var days = Set([0, 6])
    var deviceId = ""
    var deviceOn = true
    var sceneId = ""
    var metric = "temperature"
    var op = "gte"
    var value = 28.0
    var valueMax = 30.0

    init(_ current: AutomationTrigger? = nil) {
        guard let current else { return }
        type = current.type
        repeatType = current.repeat ?? "daily"
        hour = current.hour ?? 7
        minute = current.minute ?? 0
        everyHours = current.everyHours ?? 2
        days = Set(current.days ?? [0, 6])
        deviceId = current.deviceId ?? ""
        deviceOn = current.deviceOn ?? true
        sceneId = current.sceneId ?? ""
        metric = current.metric ?? "temperature"
        op = current.op ?? "gte"
        value = current.value ?? 28
        valueMax = current.valueMax ?? 30
    }

    func dictionary() -> [String: Any] {
        switch type {
        case "time":
            if repeatType == "interval" {
                return ["type": "time", "repeat": repeatType, "everyHours": everyHours]
            }
            var result: [String: Any] = ["type": "time", "repeat": repeatType, "hour": hour, "minute": minute]
            if repeatType == "weekly" { result["days"] = days.sorted() }
            return result
        case "device":
            return ["type": "device", "deviceId": deviceId, "deviceOn": deviceOn]
        case "scene":
            return ["type": "scene", "sceneId": sceneId]
        default:
            var result: [String: Any] = ["type": "sensor", "deviceId": deviceId, "metric": metric, "op": op, "value": value]
            if op == "between" { result["valueMax"] = valueMax }
            return result
        }
    }
}

struct AutomationEditorView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    let automation: HomeAutomation?
    @State private var name: String
    @State private var enabled: Bool
    @State private var stopOnMatch: Bool
    @State private var trigger: AutomationTriggerDraft
    @State private var actions: [DeviceActionDraft]
    @State private var message: String?
    @State private var confirmRemove = false

    init(automation: HomeAutomation?) {
        self.automation = automation
        _name = State(initialValue: automation?.name ?? "")
        _enabled = State(initialValue: automation?.enabled ?? true)
        _stopOnMatch = State(initialValue: automation?.stopOnMatch == true)
        _trigger = State(initialValue: AutomationTriggerDraft(automation?.trigger))
        _actions = State(initialValue: (automation?.actions ?? []).map(DeviceActionDraft.init(automationAction:)))
    }

    private var devices: [Device] { (session.home?.liveDevices ?? []).filter { $0.kind != "sensor" } }
    private var sensors: [Device] {
        (session.home?.liveDevices ?? []).filter { $0.kind == "sensor" || $0.kind == "ac" && ($0.temperature != nil || $0.outdoorTemp != nil) }
    }
    private var scenes: [HomeScene] { session.home?.scenes ?? [] }
    private var actionDevices: [Device] {
        trigger.type == "sensor" && trigger.op == "between" ? devices.filter(\.reportsActuatorState) : devices
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("AUTOMATION EDITOR")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .tracking(3)
                            .foregroundStyle(YuiTheme.accent)
                        Text(automation == nil ? "自動化を作る" : "自動化を編集")
                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                            .foregroundStyle(YuiTheme.fg)
                    }
                    Spacer()
                    Button("閉じる") { dismiss() }.foregroundStyle(YuiTheme.accent)
                }

                VStack(alignment: .leading, spacing: 14) {
                    TextField("名前 · 暑い日は冷房", text: $name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(YuiTheme.fg)
                    Toggle("有効にする", isOn: $enabled)
                        .tint(YuiTheme.accent)
                        .foregroundStyle(YuiTheme.fg)
                }
                .padding(18)
                .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))

                triggerSection
                actionSection

                Toggle("条件成立で下の判定を打ち切る", isOn: $stopOnMatch)
                    .font(.system(size: 13))
                    .tint(YuiTheme.accent)
                    .foregroundStyle(YuiTheme.fg)
                    .padding(17)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 18))

                if let message {
                    Text(message).font(.system(size: 12)).foregroundStyle(YuiTheme.warning)
                }
                Button { Task { await save() } } label: {
                    Text("オートメーションを保存")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(YuiTheme.bg)
                        .frame(maxWidth: .infinity, minHeight: 55)
                        .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                }
                .disabled(session.busy)

                if automation != nil {
                    Button(role: .destructive) { confirmRemove = true } label: {
                        Label("このオートメーションを削除", systemImage: "trash")
                            .font(.system(size: 13))
                            .foregroundStyle(YuiTheme.warning)
                            .frame(maxWidth: .infinity, minHeight: 45)
                    }
                }
            }
            .padding(22)
            .padding(.top, 14)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .confirmationDialog("オートメーションを削除しますか", isPresented: $confirmRemove) {
            Button("削除", role: .destructive) {
                guard let automation else { return }
                Task { if await session.automationAction(automation, op: "automation-remove") { dismiss() } }
            }
        }
    }

    private var triggerSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("開始する条件")
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            HStack(spacing: 6) {
                ForEach([("time", "時刻"), ("device", "機器"), ("sensor", "センサー"), ("scene", "場面")], id: \.0) { item in
                    Button(item.1) {
                        trigger.type = item.0
                        if item.0 == "device" && !devices.contains(where: { $0.id == trigger.deviceId }) {
                            trigger.deviceId = devices.first?.id ?? ""
                        }
                        if item.0 == "sensor" { trigger.deviceId = sensors.first?.id ?? "" }
                        if item.0 == "scene" { trigger.sceneId = scenes.first?.id ?? "" }
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(trigger.type == item.0 ? YuiTheme.bg : YuiTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 42)
                    .background(trigger.type == item.0 ? YuiTheme.accent : YuiTheme.surfaceRaised,
                                in: RoundedRectangle(cornerRadius: 12))
                }
            }
            triggerFields
        }
        .padding(17)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    @ViewBuilder private var triggerFields: some View {
        if trigger.type == "time" {
            Picker("繰り返し", selection: $trigger.repeatType) {
                Text("毎日").tag("daily")
                Text("何時間おき").tag("interval")
                Text("曜日").tag("weekly")
            }
            .tint(YuiTheme.accent)
            if trigger.repeatType == "interval" {
                Stepper("\(trigger.everyHours) 時間おき", value: $trigger.everyHours, in: 1...24)
                    .foregroundStyle(YuiTheme.fg)
            } else {
                Stepper("\(String(format: "%02d:%02d", trigger.hour, trigger.minute)) · 時", value: $trigger.hour, in: 0...23)
                    .foregroundStyle(YuiTheme.fg)
                Stepper("分 · \(trigger.minute)", value: $trigger.minute, in: 0...59)
                    .foregroundStyle(YuiTheme.fg)
                if trigger.repeatType == "weekly" {
                    HStack(spacing: 5) {
                        ForEach(0..<7) { day in
                            Button(["日", "月", "火", "水", "木", "金", "土"][day]) {
                                if trigger.days.contains(day) { trigger.days.remove(day) } else { trigger.days.insert(day) }
                            }
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(trigger.days.contains(day) ? YuiTheme.bg : YuiTheme.muted)
                            .frame(maxWidth: .infinity, minHeight: 38)
                            .background(trigger.days.contains(day) ? YuiTheme.accent : YuiTheme.bg,
                                        in: RoundedRectangle(cornerRadius: 10))
                        }
                    }
                }
            }
        } else if trigger.type == "device" {
            Picker("機器", selection: $trigger.deviceId) {
                ForEach(devices) { device in Text(device.name).tag(device.id) }
            }.tint(YuiTheme.accent)
            Toggle("入ったとき", isOn: $trigger.deviceOn).tint(YuiTheme.accent).foregroundStyle(YuiTheme.fg)
        } else if trigger.type == "scene" {
            Picker("場面", selection: $trigger.sceneId) {
                ForEach(scenes) { scene in Text(scene.name).tag(scene.id) }
            }.tint(YuiTheme.accent)
        } else {
            Picker("センサー", selection: $trigger.deviceId) {
                ForEach(sensors) { device in Text(device.name).tag(device.id) }
            }
            .tint(YuiTheme.accent)
            .onChange(of: trigger.deviceId) { _, _ in
                if !metrics.contains(trigger.metric) { trigger.metric = metrics.first ?? "temperature" }
            }
            Picker("値", selection: $trigger.metric) {
                ForEach(metrics, id: \.self) { metric in Text(metricLabel(metric)).tag(metric) }
            }
            .tint(YuiTheme.accent)
            Picker("条件", selection: $trigger.op) {
                Text("以上").tag("gte")
                Text("以下").tag("lte")
                Text("範囲内").tag("between")
            }
            .tint(YuiTheme.accent)
            TextField(trigger.op == "between" ? "下限" : "しきい値", value: $trigger.value, format: .number)
                .keyboardType(.decimalPad)
                .foregroundStyle(YuiTheme.fg)
                .padding(12)
                .background(YuiTheme.bg, in: RoundedRectangle(cornerRadius: 10))
            if trigger.op == "between" {
                TextField("上限", value: $trigger.valueMax, format: .number)
                    .keyboardType(.decimalPad)
                    .foregroundStyle(YuiTheme.fg)
                    .padding(12)
                    .background(YuiTheme.bg, in: RoundedRectangle(cornerRadius: 10))
                Text("範囲条件は、現在の設定を読み返せる機器だけを操作します。")
                    .font(.system(size: 11))
                    .foregroundStyle(YuiTheme.muted)
            }
        }
    }

    private var actionSection: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("動かす機器")
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            ForEach($actions) { $action in
                VStack(alignment: .trailing, spacing: 6) {
                    Button(role: .destructive) { actions.removeAll { $0.id == action.id } } label: {
                        Label("操作を削除", systemImage: "trash")
                            .font(.system(size: 12))
                            .foregroundStyle(YuiTheme.warning)
                    }
                    DeviceActionEditor(draft: $action, devices: actionDevices, isAutomation: true)
                }
            }
            Button {
                if let device = actionDevices.first { actions.append(DeviceActionDraft(device: device)) }
            } label: {
                Label("機器を足す", systemImage: "plus")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(YuiTheme.accent)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            }
            .disabled(actionDevices.isEmpty)
        }
    }

    private var metrics: [String] {
        guard let device = sensors.first(where: { $0.id == trigger.deviceId }) else { return ["temperature"] }
        var result: [String] = []
        if device.temperature != nil { result.append("temperature") }
        if device.humidity != nil { result.append("humidity") }
        if device.lux != nil { result.append("lux") }
        if device.outdoorTemp != nil { result.append("outdoorTemp") }
        return result.isEmpty ? ["temperature"] : result
    }

    private func metricLabel(_ metric: String) -> String {
        ["temperature": "気温", "humidity": "湿度", "lux": "照度", "outdoorTemp": "外気温"][metric] ?? metric
    }

    private func save() async {
        message = nil
        if actions.isEmpty { message = "機器の操作を一つ以上追加してください"; return }
        if trigger.type == "time" && trigger.repeatType == "weekly" && trigger.days.isEmpty {
            message = "曜日を選んでください"; return
        }
        if trigger.type == "sensor" && trigger.op == "between" && trigger.value > trigger.valueMax {
            message = "下限は上限以下にしてください"; return
        }
        if actions.contains(where: { action in !actionDevices.contains(where: { $0.id == action.deviceId }) }) {
            message = "条件で使える機器を選んでください"; return
        }
        let draft: [String: Any] = [
            "name": name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "オートメーション" : name.trimmingCharacters(in: .whitespacesAndNewlines),
            "enabled": enabled,
            "stopOnMatch": stopOnMatch,
            "trigger": trigger.dictionary(),
            "actions": actions.map { $0.automationDictionary() },
        ]
        if await session.saveAutomation(automation, draft: draft) { dismiss() }
    }
}
