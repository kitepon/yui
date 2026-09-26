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

    var isMomentary: Bool { kind == "bot" && botMode != "switch" }
    var canQuickAct: Bool { online && ["light", "plug", "bot", "curtain", "ac", "ir"].contains(kind) }

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
            if on == false { return "停止中" }
            let modes = ["cool": "冷房", "heat": "暖房", "dry": "除湿", "fan": "送風", "auto": "自動", "humidify": "加湿"]
            return [modes[mode ?? ""] ?? "運転中", targetTemp.map { "\(Int($0))°" }].compactMap { $0 }.joined(separator: " · ")
        case "light":
            if on != true { return "消灯" }
            return brightness.map { "点灯 · \(Int($0))%" } ?? "点灯"
        case "curtain": return "開き \(Int(position ?? 0))%"
        case "sensor":
            let values = [temperature.map { String(format: "%.1f°", $0) }, humidity.map { "\(Int($0))%" }].compactMap { $0 }
            return values.isEmpty ? "計測中" : values.joined(separator: " · ")
        case "bot": return isMomentary ? "押して操作" : (on == true ? "オン" : "オフ")
        default: return on == true ? "オン" : "オフ"
        }
    }
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
}

struct HomeScenePatch: Decodable {
    let on: Bool?
}

struct CredentialFlags: Decodable {
    var natureToken: Bool?
    var switchbotToken: Bool?
    var switchbotSecret: Bool?
    var tuyaAccessId: Bool?
    var tuyaSecret: Bool?
    var tuyaUid: Bool?
}

struct HomeSnapshot: Decodable {
    var devices: [Device]
    var climate: Climate?
    var connectors: [String: ConnectorStatus]?
    var scenes: [HomeScene]
    var automations: [HomeAutomation]?
    var rooms: [String]?
    var lastScene: String?
    var savedAt: String?
    var pairPin: String?
    var credentialFlags: CredentialFlags?
    var host: String?
    var error: String?

    var liveDevices: [Device] {
        let live = devices.filter { $0.source == "live" }
        return live.isEmpty ? devices : live
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
    let deviceId: String?
    let sceneId: String?
    let metric: String?

    var summary: String {
        switch type {
        case "time":
            if let hour, let minute { return String(format: "%02d:%02d", hour, minute) }
            return "時刻"
        case "device": return "機器の状態"
        case "scene": return "場面の実行"
        case "sensor": return "センサー"
        default: return "条件"
        }
    }
}

struct AutomationAction: Decodable {
    let id: String
    let deviceId: String?
}

struct APIError: Decodable {
    let error: String?
    let message: String?
}

struct AnalysisData: Decodable {
    let series: [AnalysisSeries]
    let events: [AnalysisEvent]
}

struct AnalysisSeries: Decodable, Identifiable {
    let id: String
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
