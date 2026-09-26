import Foundation

@MainActor
final class SessionStore: ObservableObject {
    private let googleSignIn = GoogleSignIn()
    @Published var token: String?
    @Published var home: HomeSnapshot?
    @Published var error: String?
    @Published var busy = false
    @Published var analysis: AnalysisData?

    var isLoggedIn: Bool { token != nil }

    init() {
        token = Keychain.load()
    }

    func signIn(email: String, password: String) async {
        await run {
            let token = try await YuiClient.shared.signIn(email: email, password: password)
            self.store(token)
            self.home = try await YuiClient.shared.home(token: token)
        }
    }

    func signUp(email: String, password: String, name: String) async {
        await run {
            let token = try await YuiClient.shared.signUp(email: email, password: password, name: name)
            self.store(token)
            self.home = try await YuiClient.shared.home(token: token)
        }
    }

    func signInWithGoogle() async {
        await run {
            let token = try await googleSignIn.authenticate()
            self.store(token)
            self.home = try await YuiClient.shared.home(token: token)
        }
    }

    func refresh() async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.home(token: token)
        }
    }

    func loadAnalysis(days: Int) async {
        guard let token else { return }
        await run {
            self.analysis = try await YuiClient.shared.analysis(token: token, days: days)
        }
    }

    func control(_ device: Device, patch: [String: Any]) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.control(token: token, deviceId: device.id, patch: patch)
        }
    }

    func quickAct(_ device: Device) async {
        guard device.canQuickAct else { return }
        let patch: [String: Any]
        if device.isMomentary {
            patch = ["on": true]
        } else if device.kind == "curtain" {
            let open = (device.position ?? 0) == 0
            patch = ["position": open ? 100 : 0, "on": open]
        } else {
            patch = ["on": !(device.on ?? false)]
        }
        await control(device, patch: patch)
    }

    func runScene(_ scene: HomeScene) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.playScene(token: token, sceneId: scene.id)
        }
    }

    func toggleAutomation(_ automation: HomeAutomation) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.toggleAutomation(
                token: token, automationId: automation.id, enabled: !automation.enabled
            )
        }
    }

    func updateDeviceMeta(_ device: Device, name: String, room: String) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.updateDeviceMeta(
                token: token, deviceId: device.id, name: name, room: room
            )
        }
    }

    func roomAction(_ op: String, fields: [String: String]) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.roomAction(token: token, op: op, fields: fields)
        }
    }

    func saveScene(_ scene: HomeScene?, name: String, hint: String, steps: [[String: Any]]) async -> Bool {
        guard let token else { return false }
        await run {
            self.home = try await YuiClient.shared.saveScene(
                token: token, sceneId: scene?.id, name: name, hint: hint, steps: steps
            )
        }
        return error == nil
    }

    func removeScene(_ scene: HomeScene) async -> Bool {
        guard let token else { return false }
        await run {
            self.home = try await YuiClient.shared.removeScene(token: token, sceneId: scene.id)
        }
        return error == nil
    }

    func sync(_ brand: String) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.sync(token: token, brand: brand)
        }
    }

    func saveCredentials(_ fields: [String: String]) async -> Bool {
        guard let token else { return false }
        busy = true
        error = nil
        defer { busy = false }
        do {
            home = try await YuiClient.shared.saveCredentials(token: token, fields: fields)
            return true
        } catch {
            if case YuiError.unauthorized = error { signOut() }
            self.error = error.localizedDescription
            return false
        }
    }

    func signOut() {
        token = nil
        home = nil
        Keychain.clear()
    }

    private func store(_ token: String) {
        self.token = token
        Keychain.save(token)
    }

    private func run(_ work: () async throws -> Void) async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await work()
        } catch {
            if case YuiError.unauthorized = error { signOut() }
            self.error = error.localizedDescription
        }
    }
}
