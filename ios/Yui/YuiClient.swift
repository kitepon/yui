import Foundation

struct YuiClient {
    static let shared = YuiClient()
    let origin = URL(string: "https://yuihome.kitepon.dev")!

    func signIn(email: String, password: String) async throws -> String {
        try await auth("sign-in", email: email, password: password, name: nil)
    }

    func signUp(email: String, password: String, name: String) async throws -> String {
        try await auth("sign-up", email: email, password: password, name: name)
    }

    func exchangeGoogle(code: String, verifier: String) async throws -> String {
        let response: AuthResponse = try await send(
            path: "/api/ios-auth", method: "POST", token: nil,
            body: ["code": code, "verifier": verifier]
        )
        guard let token = response.token, !token.isEmpty else {
            throw YuiError.message("Googleログインが完了しませんでした")
        }
        return token
    }

    func home(token: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "GET", token: token)
    }

    func currentUser(token: String) async throws -> AuthUser? {
        let response: AuthSessionEnvelope = try await send(path: "/api/auth/get-session", method: "GET", token: token)
        return response.user
    }

    func billingStatus(token: String, refresh: Bool) async throws -> BillingStatus {
        try await send(path: refresh ? "/api/stripe/status?refresh=1" : "/api/stripe/status", method: "GET", token: token)
    }

    func billingURL(token: String, action: String, plan: String? = nil) async throws -> URL {
        let body = plan.map { ["plan": $0] }
        let response: ExternalURLResponse = try await send(
            path: "/api/stripe/\(action)", method: "POST", token: token, body: body
        )
        return response.url
    }

    func control(token: String, deviceId: String, patch: [String: Any]) async throws -> HomeSnapshot {
        try await send(
            path: "/api/home",
            method: "POST",
            token: token,
            body: ["op": "control", "deviceId": deviceId, "patch": patch]
        )
    }

    func playScene(token: String, sceneId: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: ["op": "scene", "sceneId": sceneId])
    }

    func sync(token: String, brand: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: ["op": "sync", "brand": brand])
    }

    func saveCredentials(token: String, fields: [String: String]) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: ["op": "credentials", "credentials": fields])
    }

    func analysis(token: String, days: Int) async throws -> AnalysisData {
        let end = Date()
        let start = end.addingTimeInterval(-Double(days) * 86_400)
        let from = AnalysisDate.formatter.string(from: start)
        let to = AnalysisDate.formatter.string(from: end)
        let path = "/api/analysis?from=\(from)&to=\(to)"
        return try await send(path: path, method: "GET", token: token)
    }

    func toggleAutomation(token: String, automationId: String, enabled: Bool) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: [
            "op": "automation-toggle", "automationId": automationId, "enabled": enabled,
        ])
    }

    func updateDeviceMeta(token: String, deviceId: String, name: String, room: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: [
            "op": "device-meta", "deviceId": deviceId, "name": name, "room": room,
        ])
    }

    func roomAction(token: String, op: String, fields: [String: String]) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: ["op": op].merging(fields) { _, new in new })
    }

    func reorder(token: String, target: String, id: String, direction: Int) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: [
            "op": "reorder", "target": target, "id": id, "direction": direction,
        ])
    }

    func saveScene(token: String, sceneId: String?, name: String, hint: String, steps: [[String: Any]]) async throws -> HomeSnapshot {
        var body: [String: Any] = ["op": "scene-save", "name": name, "hint": hint]
        if let sceneId { body["sceneId"] = sceneId }
        body["steps"] = steps
        return try await send(path: "/api/home", method: "POST", token: token, body: body)
    }

    func saveAutomation(token: String, id: String?, draft: [String: Any]) async throws -> HomeSnapshot {
        var body: [String: Any] = ["op": "automation-save", "automation": draft]
        if let id { body["automationId"] = id }
        return try await send(path: "/api/home", method: "POST", token: token, body: body)
    }

    func automationAction(token: String, id: String, op: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: [
            "op": op, "automationId": id,
        ])
    }

    func removeScene(token: String, sceneId: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "POST", token: token, body: ["op": "scene-remove", "sceneId": sceneId])
    }

    private func auth(_ kind: String, email: String, password: String, name: String?) async throws -> String {
        var payload: [String: Any] = ["email": email, "password": password]
        if let name { payload["name"] = name }
        let res: AuthResponse = try await send(path: "/api/auth/\(kind)/email", method: "POST", token: nil, body: payload)
        guard let token = res.token, !token.isEmpty else {
            throw YuiError.message("ログインできません")
        }
        return token
    }

    private func send<T: Decodable>(path: String, method: String, token: String?, body: [String: Any]? = nil) async throws -> T {
        guard let url = URL(string: origin.absoluteString + path) else {
            throw YuiError.message("URL が不正です")
        }
        var request = URLRequest(url: url)
        // Better Auth の Origin 検査。ネイティブには Origin が無いので公開面を明示する。
        request.setValue(origin.absoluteString, forHTTPHeaderField: "Origin")
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401 {
            if token != nil { throw YuiError.unauthorized }
            let err = try? JSONDecoder().decode(APIError.self, from: data)
            throw YuiError.message(err?.message ?? err?.error ?? "ログインできません")
        }
        if code >= 400 {
            let err = try? JSONDecoder().decode(APIError.self, from: data)
            throw YuiError.message(err?.error ?? err?.message ?? "サーバーエラー \(code)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum YuiError: LocalizedError {
    case message(String)
    case unauthorized
    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        case .unauthorized: return "ログインの期限が切れました。もう一度ログインしてください"
        }
    }
}
