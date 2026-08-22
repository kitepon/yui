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

    func home(token: String) async throws -> HomeSnapshot {
        try await send(path: "/api/home", method: "GET", token: token)
    }

    func control(token: String, deviceId: String, on: Bool) async throws -> HomeSnapshot {
        try await send(
            path: "/api/home",
            method: "POST",
            token: token,
            body: ["op": "control", "deviceId": deviceId, "patch": ["on": on]]
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
        if code == 401 { throw YuiError.message("ログインが必要です") }
        if code >= 400 {
            let err = try? JSONDecoder().decode(APIError.self, from: data)
            throw YuiError.message(err?.error ?? err?.message ?? "サーバーエラー \(code)")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

enum YuiError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self {
        case .message(let text): return text
        }
    }
}
