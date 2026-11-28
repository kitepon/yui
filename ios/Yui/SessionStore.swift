import AuthenticationServices
import Foundation
import LoginBilling
import StoreKit

enum ConnectionSyncPhase: Equatable {
    case syncing
    case completed
    case failed(String)
}

/// Where this device stands with its entry (diagram: ios/docs/apple-function-dataflow.md).
enum EntryPhase: Equatable {
    /// No kept sign-in.
    case signedOut
    /// Signed in with Apple, but the server knows no key of this device: start here or join an entry.
    case choosing
    /// Started a new entry; the legacy claim is offered before the first home is made.
    case claiming
    case ready
}

@MainActor
final class SessionStore: ObservableObject {
    @Published var phase: EntryPhase = .signedOut
    @Published var home: HomeSnapshot?
    @Published var error: String?
    @Published var busy = false
    @Published var syncPhases: [String: ConnectionSyncPhase] = [:]
    @Published var homeRefreshError: String?
    @Published var analysis: AnalysisData?
    @Published var analysisLoading = false
    @Published var analysisError: String?
    @Published var accountError: String?
    /// The end of the subscription this device last stated to the server, and when it last looked.
    @Published var paidUntil: Date? = UserDefaults.standard.object(forKey: "yui.paidUntil") as? Date
    @Published var planCheckedAt: Date? = UserDefaults.standard.object(forKey: "yui.planCheckedAt") as? Date
    @Published var products: [Product] = []
    @Published var introEligible = false
    @Published var appleBusy = false
    @Published var linkCode: LinkCode?
    @Published var linkCodeExpiresAt: Date?
    @Published var exportFile: URL?
    private var updatesTask: Task<Void, Never>?
    private var homeRevision = 0

    var isLoggedIn: Bool { phase == .ready }
    #if DEBUG
    var isVisualPreview = false
    #endif

    init() {
        updatesTask = Task { [weak self] in
            for await _ in Transaction.updates { await self?.reportPaidUntil() }
        }
    }

    static func words(_ error: Error) -> String {
        if let failure = error as? LoginBillingError {
            return LocalWords.ja(failure.code) ?? "うまくいきませんでした (\(failure.code))"
        }
        return error.localizedDescription
    }

    // MARK: sign in, start, join

    /// At launch: a device with a kept sign-in and a key goes on; the first call tells the server's side.
    func resume() async {
        phase = await Hosted.shared.hasKey ? .ready : .signedOut
    }

    func signInWithApple() async {
        await run {
            try await Hosted.shared.form.signInLocal("apple")
            await self.enter()
        }
    }

    /// Loads the home. An entry that does not know this device's key answers 401: the person chooses start or join.
    func enter() async {
        do {
            home = try await YuiClient.shared.home()
            phase = .ready
            await reportPaidUntil()
            await loadProducts()
        } catch YuiError.unauthorized {
            home = nil
            phase = .choosing
        } catch {
            self.error = Self.words(error)
        }
    }

    func startHere() async {
        await run {
            _ = try await Hosted.shared.client.start()
            self.phase = .claiming
        }
    }

    func finishClaiming() async {
        await run { await self.enter() }
    }

    /// The wanting device's add was taken: send it, then enter the entry.
    func joined(_ add: Add) async {
        await run {
            _ = try await Hosted.shared.client.sendAdd(add)
            await self.enter()
        }
    }

    func claim(_ body: [String: Any]) async -> Bool {
        await run {
            try await YuiClient.shared.claim(body)
            await self.enter()
        }
        return error == nil
    }

    func claim(method: String, proof: TeamProof) async {
        guard case .provider(_, let signIn) = proof else { return }
        let nonce = Self.nonce()
        await run {
            let token = try await signIn(nonce)
            try await YuiClient.shared.claim(["method": method, "idToken": token, "nonce": nonce])
            await self.enter()
        }
    }

    private static func nonce() -> String {
        Data((0..<16).map { _ in UInt8.random(in: 0...255) }).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    func refresh() async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.home()
        }
    }

    func refreshWhileActive() async {
        while !Task.isCancelled {
            await refreshHomeIfIdle()
            guard let seconds = home?.refreshSeconds, seconds > 0 else {
                if home != nil { homeRefreshError = "家の更新間隔を受信できません" }
                return
            }
            do { try await Task.sleep(for: .seconds(seconds)) }
            catch { return }
        }
    }

    func refreshHomeIfIdle() async {
        guard !busy, isLoggedIn else { return }
        let revision = homeRevision
        do {
            let snapshot = try await YuiClient.shared.home()
            guard !Task.isCancelled, isLoggedIn, !busy, homeRevision == revision else { return }
            home = snapshot
            homeRefreshError = nil
        } catch {
            guard !Task.isCancelled, isLoggedIn, homeRevision == revision else { return }
            if case YuiError.unauthorized = error { lostEntry() }
            homeRefreshError = "家の状態を更新できません: \(error.localizedDescription)"
        }
    }

    // MARK: subscription

    /// States the end of this device's own subscription to the server (contract: the only writer of the date from this device).
    /// The date is read from StoreKit's verified current entitlements; the server keeps the later of the stored and the stated date.
    func reportPaidUntil() async {
        guard isLoggedIn else { return }
        let now = Date()
        let date: Date
        if let free = await Hosted.shared.form.paidUntil(), free.store == "free" {
            date = PaidUntil.exempt(now: now)
        } else if let latest = await PaidUntil.ownEnd(productIds: Hosted.productIds) {
            date = latest
        } else {
            remember(paidUntil: paidUntil, at: now)
            return
        }
        do {
            let stored = try await YuiClient.shared.statePaidUntil(date)
            remember(paidUntil: stored ?? date, at: now)
            accountError = nil
        } catch {
            accountError = Self.words(error)
        }
    }

    private func remember(paidUntil date: Date?, at now: Date) {
        paidUntil = date
        planCheckedAt = now
        UserDefaults.standard.set(date, forKey: "yui.paidUntil")
        UserDefaults.standard.set(now, forKey: "yui.planCheckedAt")
    }

    func loadProducts() async {
        do {
            let found = try await Product.products(for: Hosted.productIds)
            products = Hosted.productIds.compactMap { id in found.first { $0.id == id } }
            if let subscription = products.first?.subscription {
                introEligible = await subscription.isEligibleForIntroOffer && products.allSatisfy { product in
                    guard let offer = product.subscription?.introductoryOffer else { return false }
                    return offer.paymentMode == .freeTrial && offer.period.unit == .month &&
                        offer.period.value == 1 && offer.periodCount == 1
                }
            }
        } catch {
            accountError = Self.words(error)
        }
    }

    func purchase(productId: String) async {
        appleBusy = true
        accountError = nil
        defer { appleBusy = false }
        do {
            switch try await Hosted.shared.form.purchaseLocal(productId) {
            case .purchased: await reportPaidUntil()
            case .cancelled: break
            case .pending: accountError = "購入は承認待ちです。承認されたら契約状態を更新してください"
            }
        } catch {
            accountError = Self.words(error)
        }
    }

    func restorePurchases() async {
        appleBusy = true
        accountError = nil
        defer { appleBusy = false }
        do {
            try await AppStore.sync()
            await reportPaidUntil()
        } catch {
            accountError = Self.words(error)
        }
    }

    // MARK: Alexa, export

    func makeLinkCode() async {
        accountError = nil
        do {
            let made = try await YuiClient.shared.linkCode()
            linkCode = made
            linkCodeExpiresAt = Date().addingTimeInterval(Double(made.expiresInSeconds))
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            accountError = Self.words(error)
        }
    }

    func exportData() async {
        accountError = nil
        do {
            let data = try await YuiClient.shared.exportAccountData()
            let url = FileManager.default.temporaryDirectory.appending(path: "yui-export.json")
            try data.write(to: url, options: .atomic)
            exportFile = url
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            accountError = Self.words(error)
        }
    }

    func loadAnalysis(days: Int) async {
        guard isLoggedIn else { return }
        analysisLoading = true
        analysisError = nil
        analysis = nil
        defer { analysisLoading = false }
        do {
            analysis = try await YuiClient.shared.analysis(days: days)
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            analysisError = error.localizedDescription
        }
    }

    func control(_ device: Device, patch: [String: Any]) async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.control(deviceId: device.id, patch: patch)
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
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.playScene(sceneId: scene.id)
        }
    }

    func toggleAutomation(_ automation: HomeAutomation) async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.toggleAutomation(
                automationId: automation.id, enabled: !automation.enabled
            )
        }
    }

    func saveAutomation(_ automation: HomeAutomation?, draft: [String: Any]) async -> Bool {
        guard isLoggedIn else { return false }
        await run {
            self.home = try await YuiClient.shared.saveAutomation(id: automation?.id, draft: draft)
        }
        return error == nil
    }

    func automationAction(_ automation: HomeAutomation, op: String) async -> Bool {
        guard isLoggedIn else { return false }
        await run {
            self.home = try await YuiClient.shared.automationAction(id: automation.id, op: op)
        }
        return error == nil
    }

    func updateDeviceMeta(_ device: Device, name: String, room: String) async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.updateDeviceMeta(
                deviceId: device.id, name: name, room: room
            )
        }
    }

    func roomAction(_ op: String, fields: [String: String]) async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.roomAction(op: op, fields: fields)
        }
    }

    func reorder(_ target: String, id: String, direction: Int) async {
        guard isLoggedIn else { return }
        await run {
            self.home = try await YuiClient.shared.reorder(target: target, id: id, direction: direction)
        }
    }

    func saveScene(_ scene: HomeScene?, name: String, hint: String, steps: [[String: Any]]) async -> Bool {
        guard isLoggedIn else { return false }
        await run {
            self.home = try await YuiClient.shared.saveScene(
                sceneId: scene?.id, name: name, hint: hint, steps: steps
            )
        }
        return error == nil
    }

    func removeScene(_ scene: HomeScene) async -> Bool {
        guard isLoggedIn else { return false }
        await run {
            self.home = try await YuiClient.shared.removeScene(sceneId: scene.id)
        }
        return error == nil
    }

    func saveDeviceGroup(_ group: HomeDeviceGroup?, draft: DeviceGroupDraft) async -> Bool {
        guard isLoggedIn, let minutes = draft.minutes, draft.canSave else { return false }
        await run {
            self.home = try await YuiClient.shared.saveDeviceGroup(
                groupId: group?.id, name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
                deviceIds: draft.deviceIds, lockMinutes: minutes
            )
        }
        return error == nil
    }

    func removeDeviceGroup(_ group: HomeDeviceGroup) async -> Bool {
        guard isLoggedIn else { return false }
        await run {
            self.home = try await YuiClient.shared.removeDeviceGroup(groupId: group.id)
        }
        return error == nil
    }

    func sync(_ brand: String) async {
        guard isLoggedIn else { return }
        syncPhases[brand] = .syncing
        await run {
            self.home = try await YuiClient.shared.sync(brand: brand)
        }
        if isLoggedIn {
            syncPhases[brand] = error.map(ConnectionSyncPhase.failed) ?? .completed
        }
    }

    func saveCredentials(_ fields: [String: String]) async -> Bool {
        guard isLoggedIn else { return false }
        busy = true
        error = nil
        defer { busy = false }
        do {
            home = try await YuiClient.shared.saveCredentials(fields: fields)
            return true
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            self.error = error.localizedDescription
            return false
        }
    }

    /// This device forgets its sign-in. The key stays, so signing in again with the same Apple account goes on with the same device.
    func signOut() {
        forget()
        phase = .signedOut
        Task { try? await Hosted.shared.form.signOutLocal() }
    }

    /// The server does not know this device's key: offer start or join.
    private func lostEntry() {
        forget()
        phase = .choosing
    }

    private func forget() {
        homeRevision += 1
        homeRefreshError = nil
        home = nil
        syncPhases = [:]
        analysis = nil
        products = []
        introEligible = false
        linkCode = nil
        exportFile = nil
        paidUntil = nil
        planCheckedAt = nil
        UserDefaults.standard.removeObject(forKey: "yui.paidUntil")
        UserDefaults.standard.removeObject(forKey: "yui.planCheckedAt")
    }

    /// Contract section 2, in order: the data first (404: it had no home, go on), then every other key, then this one, then the device key.
    /// A failure stops the order and the person may retry; once the data is gone a retry starts at step 1 and goes on.
    func deleteAccount() async {
        busy = true
        accountError = nil
        defer { busy = false }
        do {
            _ = try await YuiClient.shared.deleteAccountData()
            _ = try await Hosted.shared.client.signOutOthers()
            try await Hosted.shared.client.leave()
            try await Hosted.shared.form.signOutLocal()
            forget()
            phase = .signedOut
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            accountError = Self.words(error)
        }
    }

    @discardableResult
    private func run(_ work: () async throws -> Void) async -> Bool {
        homeRevision += 1
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await work()
            return true
        } catch {
            if case YuiError.unauthorized = error { lostEntry() }
            if let failure = error as? LoginBillingError, failure.code == "signin_cancelled" { return false }
            if let authorizationError = error as? ASAuthorizationError {
                if authorizationError.code == .canceled { return false }
                self.error = "Appleでのログインを完了できませんでした。端末のApple Account設定を確認して、もう一度お試しください"
            } else {
                self.error = Self.words(error)
            }
            return false
        }
    }
}
