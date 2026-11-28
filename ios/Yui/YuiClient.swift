import Foundation

struct YuiClient {
    static let shared = YuiClient()
    let origin = URL(string: "https://yuihome.kitepon.dev")!

    func home() async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "GET")
    }

    /// States the end of the subscription this device holds; the server keeps the later date. Answers the stored date.
    func statePaidUntil(_ date: Date) async throws -> Date? {
        let response: PaidUntilResponse = try await send(
            path: "/api/home/paid-until", method: "POST",
            body: ["paidUntil": Int64(date.timeIntervalSince1970 * 1000)])
        return response.paidUntil.map { Date(timeIntervalSince1970: Double($0) / 1000) }
    }

    /// Moves the legacy home to this entry. The body is the proof (contract section 2, claimLegacyHome).
    func claim(_ body: [String: Any]) async throws {
        let (_, code) = try await sendRaw(path: "/api/claim", method: "POST", body: body)
        switch code {
        case 200..<300: return
        case 401: throw YuiError.message("以前のログインを確認できませんでした")
        case 404: throw YuiError.message("引き継げる以前の家がありません。引き継ぎの受付が終わった可能性もあります")
        case 409: throw YuiError.message("この家にはすでに家があるか、引き継ぎ済みです")
        default: throw YuiError.message("サーバーエラー \(code)")
        }
    }

    func linkCode() async throws -> LinkCode {
        let (data, code) = try await sendRaw(path: "/api/alexa/link-code", method: "POST")
        if code == 429 { throw YuiError.message("コードを作りすぎています。しばらくしてからやり直してください") }
        return try decode(data, code)
    }

    /// Deletes the home, vendor keys, Alexa rows and history of this entry. False: it had no home (the deletion goes on).
    func deleteAccountData() async throws -> Bool {
        let (data, code) = try await sendRaw(path: "/api/account-data", method: "DELETE")
        if code == 404 { return false }
        let _: DeletedResponse = try decode(data, code)
        return true
    }

    func exportAccountData() async throws -> Data {
        let (data, code) = try await sendRaw(path: "/api/account-data", method: "GET")
        if code == 401 { throw YuiError.unauthorized }
        if code >= 400 { throw YuiError.message("書き出せません (\(code))") }
        return data
    }


    func control(deviceId: String, patch: [String: Any]) async throws -> HomeSnapshot {
        try await send(
            path: "/api/home",
            method: "POST",
            body: ["op": "control", "deviceId": deviceId, "patch": patch]
        )
    }

    func playScene(sceneId: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": "scene", "sceneId": sceneId])
    }

    func sync(brand: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": "sync", "brand": brand])
    }

    func saveCredentials(fields: [String: String]) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": "credentials", "credentials": fields])
    }

    func analysis(days: Int) async throws -> AnalysisData {
        let end = Date()
        let start = end.addingTimeInterval(-Double(days) * 86_400)
        let from = AnalysisDate.formatter.string(from: start)
        let to = AnalysisDate.formatter.string(from: end)
        let path = "/api/analysis?from=\(from)&to=\(to)"
        return try await send(path: path, method: "GET")
    }

    func toggleAutomation(automationId: String, enabled: Bool) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: [
            "op": "automation-toggle", "automationId": automationId, "enabled": enabled,
        ])
    }

    func updateDeviceMeta(deviceId: String, name: String, room: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: [
            "op": "device-meta", "deviceId": deviceId, "name": name, "room": room,
        ])
    }

    func roomAction(op: String, fields: [String: String]) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": op].merging(fields) { _, new in new })
    }

    func reorder(target: String, id: String, direction: Int) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: [
            "op": "reorder", "target": target, "id": id, "direction": direction,
        ])
    }

    func saveScene(sceneId: String?, name: String, hint: String, steps: [[String: Any]]) async throws -> HomeSnapshot {
        var body: [String: Any] = ["op": "scene-save", "name": name, "hint": hint]
        if let sceneId { body["sceneId"] = sceneId }
        body["steps"] = steps
        return try await send(path: "/api/home", method: "POST", body: body)
    }

    func saveAutomation(id: String?, draft: [String: Any]) async throws -> HomeSnapshot {
        var body: [String: Any] = ["op": "automation-save", "automation": draft]
        if let id { body["automationId"] = id }
        return try await send(path: "/api/home", method: "POST", body: body)
    }

    func automationAction(id: String, op: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: [
            "op": op, "automationId": id,
        ])
    }

    func removeScene(sceneId: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": "scene-remove", "sceneId": sceneId])
    }

    func saveDeviceGroup(groupId: String?, name: String, deviceIds: [String], lockMinutes: Int) async throws -> HomeSnapshot {
        var body: [String: Any] = ["op": "group-save", "group": [
            "name": name, "deviceIds": deviceIds, "lockMinutes": lockMinutes,
        ]]
        if let groupId { body["groupId"] = groupId }
        return try await send(path: "/api/home", method: "POST", body: body)
    }

    func removeDeviceGroup(groupId: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", body: ["op": "group-remove", "groupId": groupId])
    }

    private struct TimeOff: Decodable { let error: String?; let now: Int64? }

    /// A call signed with the library's Login-Billing-Key. On 401 time_off the server's clock is taken and the same call is signed once more.
    /// Answers the body and the status; the callers turn a status into their own words.
    private func sendRaw(path: String, method: String, body: [String: Any]? = nil) async throws -> (Data, Int) {
        guard let url = URL(string: origin.absoluteString + path) else {
            throw YuiError.message("URL が不正です")
        }
        let bytes = try body.map { try JSONSerialization.data(withJSONObject: $0) } ?? Data()
        for attempt in 0..<2 {
            var request = URLRequest(url: url)
            request.httpShouldHandleCookies = false
            request.httpMethod = method
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            if body != nil {
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.httpBody = bytes
            }
            if let value = await Hosted.shared.header(method: method, url: url, body: bytes) {
                request.setValue(value, forHTTPHeaderField: "Login-Billing-Key")
            }
            let (data, response) = try await URLSession.shared.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if attempt == 0, code == 401, let off = try? JSONDecoder().decode(TimeOff.self, from: data),
               off.error == "time_off", let now = off.now {
                await Hosted.shared.useServerTime(now)
                continue
            }
            return (data, code)
        }
        throw YuiError.unauthorized
    }

    private func decode<T: Decodable>(_ data: Data, _ code: Int) throws -> T {
        if code == 401 { throw YuiError.unauthorized }
        if code >= 400 {
            let err = try? JSONDecoder().decode(APIError.self, from: data)
            throw YuiError.message(err?.error ?? err?.message ?? "サーバーエラー \(code)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func send<T: Decodable>(path: String, method: String, body: [String: Any]? = nil) async throws -> T {
        let (data, code) = try await sendRaw(path: path, method: method, body: body)
        return try decode(data, code)
    }
}

struct LinkCode: Decodable {
    let code: String
    let expiresInSeconds: Int
}

private struct PaidUntilResponse: Decodable { let paidUntil: Int64? }
private struct DeletedResponse: Decodable { let deleted: Bool }

enum YuiError: LocalizedError {
    case message(String)
    case unauthorized
    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        case .unauthorized: return "この端末は家に参加していません。始めるか、別の端末から参加してください"
        }
    }
}
