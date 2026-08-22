import Foundation

@MainActor
final class SessionStore: ObservableObject {
    @Published var token: String?
    @Published var home: HomeSnapshot?
    @Published var error: String?
    @Published var busy = false

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

    func refresh() async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.home(token: token)
        }
    }

    func toggle(_ device: Device) async {
        guard let token else { return }
        let next = !(device.on ?? false)
        await run {
            self.home = try await YuiClient.shared.control(token: token, deviceId: device.id, on: next)
        }
    }

    func runScene(_ scene: HomeScene) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.playScene(token: token, sceneId: scene.id)
        }
    }

    func sync(_ brand: String) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.sync(token: token, brand: brand)
        }
    }

    func saveCredentials(_ fields: [String: String]) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.saveCredentials(token: token, fields: fields)
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
            self.error = error.localizedDescription
        }
    }
}
