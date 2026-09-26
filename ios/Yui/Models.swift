import Foundation

struct AuthUser: Decodable {
    let id: String
    let email: String?
    let name: String?
}

struct AuthResponse: Decodable {
    let token: String?
    let user: AuthUser?
}

struct DeleteAccountResponse: Decodable {
    let success: Bool
}

struct AppleLoginTokenResponse: Decodable {
    let success: Bool
}

struct AuthSessionEnvelope: Decodable {
    let user: AuthUser?
}

struct BillingStatus: Decodable {
    let configured: Bool
    let appleConfigured: Bool?
    let purchasePendingProvider: String?
    let entitlement: BillingEntitlement
    let stripeEntitlement: BillingEntitlement?
    let plans: BillingPlans
}

struct BillingPlans: Decodable {
    let monthlyYen: Int
    let annualYen: Int
    let trialDays: Int
}

struct BillingEntitlement: Decodable {
    let writable: Bool
    let provider: String?
    let message: String?
    let status: String?
}

struct AppleBillingAccount: Decodable {
    let appAccountToken: UUID
    let productIds: AppleProductIds
}

struct AppleProductIds: Decodable {
    let monthly: String
    let annual: String
}

struct AppleBillingResult: Decodable {
    let entitlement: BillingEntitlement
}

struct ApplePurchaseAttempt: Decodable {
    let attemptId: String
    let appAccountToken: UUID
}

struct ApplePurchaseCancellation: Decodable {
    let released: Bool
}

struct ExternalURLResponse: Decodable {
    let url: URL
}

struct Climate: Decodable {
    let temperature: Double?
    let humidity: Double?
    let lux: Double?
    let label: String?
}

struct ConnectorStatus: Decodable {
    let id: String
    let connected: Bool
    let deviceCount: Int?
    let error: String?
}

struct Device: Decodable, Identifiable {
    let id: String
    var name: String
    var room: String
    var brand: String?
    var connector: String?
    var kind: String
    var source: String
    var online: Bool
    var on: Bool?
    var brightness: Double?
    var temperature: Double?
    var humidity: Double?
    var outdoorTemp: Double?
    var lux: Double?
    var targetTemp: Double?
    var targetHumidity: Double?
    var fanSpeed: String?
    var fanSwing: String?
    var mode: String?
    var acModes: [String: [String]]?
    var position: Double?
    var extra: String?
    var botMode: String?
    var lan: DeviceLan?

    var isMomentary: Bool { kind == "bot" && botMode != "switch" }
    var canQuickAct: Bool { online && ["light", "plug", "bot", "curtain", "ac", "ir", "lock"].contains(kind) }
    var reportsActuatorState: Bool {
        if ["sensor", "ir", "other"].contains(kind) || id.hasPrefix("switchbot-ir:") || connector == "odelec" { return false }
        if source == "demo" { return true }
        if ["daikin", "smartlife", "switchbot"].contains(connector ?? "") { return true }
        return connector == "nature" && ["ac", "light", "plug"].contains(kind)
    }

    var symbol: String {
        switch kind {
        case "light": "lightbulb.fill"
        case "ac": "air.conditioner.horizontal.fill"
        case "plug": "powerplug.fill"
        case "curtain": "curtains.closed"
        case "bot": "hand.tap.fill"
        case "sensor": "sensor.fill"
        case "lock": "lock.fill"
        case "ir": "remote.fill"
        default: "square.grid.2x2.fill"
        }
    }

    var status: String {
        if !online { return "接続できません" }
        switch kind {
        case "ac":
            let modes = ["cool": "冷房", "heat": "暖房", "dry": "除湿", "fan": "送風", "auto": "自動", "humidify": "加湿"]
            var parts = [on == false ? "停止" : (modes[mode ?? ""] ?? "運転中")]
            if on != false, let targetTemp { parts.append("\(Int(targetTemp))°") }
            if let temperature { parts.append(String(format: "室温%.1f°", temperature)) }
            if let humidity { parts.append("\(Int(humidity))%") }
            if let outdoorTemp { parts.append(String(format: "外%.1f°", outdoorTemp)) }
            return parts.joined(separator: " · ")
        case "light":
            if on != true { return "消灯" }
            return brightness.map { "点灯 · \(Int($0))%" } ?? "点灯"
        case "curtain": return "開き \(Int(position ?? 0))%"
        case "sensor":
            let values = [temperature.map { String(format: "%.1f°", $0) }, humidity.map { "\(Int($0))%" }].compactMap { $0 }
            return values.isEmpty ? "計測中" : values.joined(separator: " · ")
        case "bot": return isMomentary ? "押して操作" : (on == true ? "オン" : "オフ")
        case "lock": return on == true ? "施錠" : "解錠"
        default: return on == true ? "オン" : "オフ"
        }
    }
}

struct DeviceLan: Decodable {
    let host: String
    let version: String
    let readAt: String?
    let error: String?

    var recent: Bool {
        guard let readAt, let date = AnalysisDate.formatter.date(from: readAt) else { return false }
        return Date().timeIntervalSince(date) <= 30 * 60
    }
}

struct TuyaLanStatus: Decodable {
    let listening: Bool
    let error: String?
    let seen: Int
}

struct HomeScene: Decodable, Identifiable {
    let id: String
    let name: String
    let hint: String?
    let steps: [HomeSceneStep]?
}

struct HomeSceneStep: Decodable {
    let match: HomeSceneMatch
    let patch: HomeScenePatch
}

struct HomeSceneMatch: Decodable {
    let id: String?
    let room: String?
    let kind: String?
    let brand: String?
}

struct HomeScenePatch: Decodable {
    let on: Bool?
    let brightness: Double?
    let targetTemp: Double?
    let targetHumidity: Double?
    let fanSpeed: String?
    let fanSwing: String?
    let mode: String?
    let position: Double?
}

struct CredentialFlags: Decodable {
    var natureToken: Bool?
    var switchbotToken: Bool?
    var switchbotSecret: Bool?
    var tuyaAccessId: Bool?
    var tuyaSecret: Bool?
    var tuyaUid: Bool?
    var tuyaLocal: Bool?
}

struct HomeSnapshot: Decodable {
    var devices: [Device]
    var climate: Climate?
    var connectors: [String: ConnectorStatus]?
    var scenes: [HomeScene]
    var automations: [HomeAutomation]?
    var rooms: [String]?
    var deviceOrder: [String: [String]]?
    var lastScene: String?
    var savedAt: String?
    var pairPin: String?
    var credentialFlags: CredentialFlags?
    var tuyaRegion: String?
    var tuyaLan: TuyaLanStatus?
    var daikinDirect: Bool?
    var odelicBridge: Bool?
    var host: String?
    var error: String?

    var liveDevices: [Device] {
        let live = devices.filter { $0.source == "live" }
        return live.isEmpty ? devices : live
    }

    func orderedDevices(in room: String) -> [Device] {
        let items = liveDevices.filter { $0.room == room }
        let order = deviceOrder?[room] ?? []
        return items.sorted {
            let left = order.firstIndex(of: $0.id) ?? Int.max
            let right = order.firstIndex(of: $1.id) ?? Int.max
            return left < right
        }
    }
}

struct HomeAutomation: Decodable, Identifiable {
    let id: String
    let name: String
    let enabled: Bool
    let trigger: AutomationTrigger
    let actions: [AutomationAction]
    let stopOnMatch: Bool?
}

struct AutomationTrigger: Decodable {
    let type: String
    let `repeat`: String?
    let hour: Int?
    let minute: Int?
    let everyHours: Int?
    let days: [Int]?
    let deviceId: String?
    let deviceOn: Bool?
    let sceneId: String?
    let metric: String?
    let op: String?
    let value: Double?
    let valueMax: Double?

    func summary(devices: [Device], scenes: [HomeScene]) -> String {
        switch type {
        case "time":
            if `repeat` == "interval" { return "\(everyHours ?? 2)時間おき" }
            let clock = String(format: "%02d:%02d", hour ?? 7, minute ?? 0)
            if `repeat` == "weekly" {
                let weekdays = ["日", "月", "火", "水", "木", "金", "土"]
                let names = (days ?? []).filter { (0..<7).contains($0) }.map { weekdays[$0] }.joined()
                return "\(names) \(clock)"
            }
            return "毎日 \(clock)"
        case "device":
            let name = devices.first { $0.id == deviceId }?.name ?? "機器"
            return "\(name) が\(deviceOn == false ? "切" : "入")"
        case "scene":
            let name = scenes.first { $0.id == sceneId }?.name ?? "場面"
            return "場面「\(name)」"
        case "sensor":
            let name = devices.first { $0.id == deviceId }?.name ?? "センサー"
            let label = ["temperature": "気温", "humidity": "湿度", "lux": "照度", "outdoorTemp": "外気温"][metric ?? ""] ?? "値"
            if op == "between" { return "\(name) \(label)\(value ?? 0)〜\(valueMax ?? 0)の範囲" }
            return "\(name) \(label)\(value ?? 0)\(op == "lte" ? "以下" : "以上")"
        default: return "条件"
        }
    }
}

struct AutomationAction: Decodable {
    let id: String
    let deviceId: String?
    let on: Bool?
    let brightness: Double?
    let targetTemp: Double?
    let targetHumidity: Double?
    let fanSpeed: String?
    let fanSwing: String?
    let mode: String?
    let position: Double?
    let skipContinuous: Bool?

    func summary(devices: [Device]) -> String {
        let name = devices.first { $0.id == deviceId }?.name ?? "機器"
        let modeName = ["cool": "冷房", "heat": "暖房", "dry": "除湿", "fan": "送風", "auto": "自動", "humidify": "加湿"]
        let details: [String?] = [
            on.map { $0 ? "入" : "切" },
            mode.flatMap { modeName[$0] },
            targetTemp.map { "\(Int($0))°" },
            targetHumidity.map { "\(Int($0))%" },
            brightness.map { "明るさ\(Int($0))%" },
            position.map { "開き\(Int($0))%" },
            skipContinuous == true ? "連続省略" : nil,
        ]
        return ([name] + details.compactMap { $0 }).joined(separator: " ")
    }
}

struct APIError: Decodable {
    let error: String?
    let message: String?
}

struct AnalysisData: Decodable {
    let from: String
    let to: String
    let series: [AnalysisSeries]
    let automations: [AnalysisNamedItem]
    let devices: [AnalysisNamedItem]
    let events: [AnalysisEvent]
}

struct AnalysisNamedItem: Decodable, Identifiable {
    let id: String
    let name: String
}

struct AnalysisSeries: Decodable, Identifiable {
    let id: String
    let deviceId: String
    let metric: String
    let label: String
    let unit: String
    let points: [AnalysisPoint]
}

struct AnalysisPoint: Decodable {
    let ts: String
    let value: Double

    var date: Date? { AnalysisDate.formatter.date(from: ts) }
}

struct AnalysisEvent: Decodable, Identifiable {
    let id: String
    let ts: String
    let source: String?
    let automationId: String?
    let deviceName: String?
    let automationName: String?
    let outcome: String
    let reason: String?
    let detail: String?

    var date: Date? { AnalysisDate.formatter.date(from: ts) }
}

enum AnalysisDate {
    static let formatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
