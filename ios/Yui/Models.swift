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
    var kind: String
    var source: String
    var online: Bool
    var on: Bool?
    var brightness: Double?
    var targetTemp: Double?
    var mode: String?
}

struct HomeScene: Decodable, Identifiable {
    let id: String
    let name: String
    let hint: String?
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
    var pairPin: String?
    var credentialFlags: CredentialFlags?
    var host: String?
    var error: String?

    var liveDevices: [Device] {
        let live = devices.filter { $0.source == "live" }
        return live.isEmpty ? devices : live
    }
}

struct APIError: Decodable {
    let error: String?
    let message: String?
}
