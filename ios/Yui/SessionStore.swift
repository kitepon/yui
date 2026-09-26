import AuthenticationServices
import Foundation
import StoreKit

@MainActor
final class SessionStore: ObservableObject {
    private let googleSignIn = GoogleSignIn()
    private let appleSignIn = AppleSignIn()
    @Published var token: String?
    @Published var home: HomeSnapshot?
    @Published var error: String?
    @Published var busy = false
    @Published var analysis: AnalysisData?
    @Published var analysisLoading = false
    @Published var analysisError: String?
    @Published var user: AuthUser?
    @Published var billingStatus: BillingStatus?
    @Published var accountError: String?
    @Published var appleProducts: [String: Product] = [:]
    @Published var appleIntroEligible = false
    @Published var appleBusy = false
    private var appleAccount: AppleBillingAccount?
    private var updatesTask: Task<Void, Never>?

    var isLoggedIn: Bool { token != nil }

    init() {
        token = Keychain.load()
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self, let token = self.token else { continue }
                do {
                    try await self.registerAppleTransaction(result, token: token)
                    self.billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: true)
                    self.home = try await YuiClient.shared.home(token: token)
                } catch {
                    self.accountError = error.localizedDescription
                }
            }
        }
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

    func signInWithApple() async {
        await run {
            let token = try await appleSignIn.authenticate()
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

    func loadAccount(refreshBilling: Bool = false) async {
        guard let token else { return }
        accountError = nil
        do {
            user = try await YuiClient.shared.currentUser(token: token)
        } catch {
            accountError = error.localizedDescription
        }
        do {
            billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: refreshBilling)
            if billingStatus?.appleConfigured == true && billingStatus?.entitlement.writable != true {
                try await prepareApplePurchases(token: token)
            }
        } catch {
            accountError = error.localizedDescription
        }
    }

    private func prepareApplePurchases(token: String) async throws {
        if appleAccount == nil { appleAccount = try await YuiClient.shared.appleBillingAccount(token: token) }
        guard let appleAccount else { throw YuiError.message("Appleの課金情報を取得できません") }
        let ids = [appleAccount.productIds.monthly, appleAccount.productIds.annual]
        let products = try await Product.products(for: ids)
        appleProducts = Dictionary(uniqueKeysWithValues: products.map { ($0.id, $0) })
        if products.count != ids.count { throw YuiError.message("App Storeの商品がまだ利用できません") }
        if let subscription = products.first?.subscription {
            appleIntroEligible = await subscription.isEligibleForIntroOffer && products.allSatisfy { product in
                guard let offer = product.subscription?.introductoryOffer else { return false }
                return offer.paymentMode == .freeTrial && offer.period.unit == .month &&
                    offer.period.value == 1 && offer.periodCount == 1
            }
        }
    }

    func appleProduct(plan: String) -> Product? {
        guard let appleAccount else { return nil }
        let id = plan == "monthly" ? appleAccount.productIds.monthly : appleAccount.productIds.annual
        return appleProducts[id]
    }

    private func registerAppleTransaction(_ result: VerificationResult<Transaction>, token: String) async throws {
        guard case .verified(let transaction) = result else {
            throw YuiError.message("App Storeの取引を検証できません")
        }
        _ = try await YuiClient.shared.registerAppleTransaction(token: token, signedTransaction: result.jwsRepresentation)
        await transaction.finish()
    }

    func purchaseApple(plan: String) async {
        guard let token else { return }
        appleBusy = true
        accountError = nil
        defer { appleBusy = false }
        do {
            let latest = try await YuiClient.shared.billingStatus(token: token, refresh: true)
            billingStatus = latest
            if latest.entitlement.writable { throw YuiError.message("すでに契約中です") }
            try await prepareApplePurchases(token: token)
            guard let appleAccount else { throw YuiError.message("Appleの課金情報を取得できません") }
            let id = plan == "monthly" ? appleAccount.productIds.monthly : appleAccount.productIds.annual
            guard let product = appleProducts[id] else { throw YuiError.message("App Storeの商品が見つかりません") }
            let attempt = try await YuiClient.shared.beginApplePurchase(token: token)
            let result = try await product.purchase(options: [.appAccountToken(attempt.appAccountToken)])
            switch result {
            case .success(let verified):
                try await registerAppleTransaction(verified, token: token)
                billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: true)
                home = try await YuiClient.shared.home(token: token)
            case .pending:
                accountError = "購入の承認を待っています。承認後に契約が反映されます。"
                billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: true)
            case .userCancelled:
                try await YuiClient.shared.cancelApplePurchase(token: token, attemptId: attempt.attemptId)
                billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: true)
            @unknown default:
                throw YuiError.message("App Storeの購入結果を確認できません")
            }
        } catch {
            accountError = error.localizedDescription
        }
    }

    func restoreApplePurchases() async {
        guard let token else { return }
        appleBusy = true
        accountError = nil
        defer { appleBusy = false }
        do {
            _ = try await YuiClient.shared.appleBillingAccount(token: token)
            try await AppStore.sync()
            for await result in Transaction.currentEntitlements {
                try await registerAppleTransaction(result, token: token)
            }
            _ = try await YuiClient.shared.refreshAppleSubscription(token: token)
            billingStatus = try await YuiClient.shared.billingStatus(token: token, refresh: true)
            home = try await YuiClient.shared.home(token: token)
        } catch {
            accountError = error.localizedDescription
        }
    }

    func loadAnalysis(days: Int) async {
        guard let token else { return }
        analysisLoading = true
        analysisError = nil
        analysis = nil
        defer { analysisLoading = false }
        do {
            analysis = try await YuiClient.shared.analysis(token: token, days: days)
        } catch {
            if case YuiError.unauthorized = error { signOut() }
            analysisError = error.localizedDescription
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

    func saveAutomation(_ automation: HomeAutomation?, draft: [String: Any]) async -> Bool {
        guard let token else { return false }
        await run {
            self.home = try await YuiClient.shared.saveAutomation(token: token, id: automation?.id, draft: draft)
        }
        return error == nil
    }

    func automationAction(_ automation: HomeAutomation, op: String) async -> Bool {
        guard let token else { return false }
        await run {
            self.home = try await YuiClient.shared.automationAction(token: token, id: automation.id, op: op)
        }
        return error == nil
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

    func reorder(_ target: String, id: String, direction: Int) async {
        guard let token else { return }
        await run {
            self.home = try await YuiClient.shared.reorder(token: token, target: target, id: id, direction: direction)
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
        analysis = nil
        user = nil
        billingStatus = nil
        appleAccount = nil
        appleProducts = [:]
        appleIntroEligible = false
        Keychain.clear()
    }

    func deleteAccount() async {
        guard let token else { return }
        busy = true
        accountError = nil
        defer { busy = false }
        do {
            try await YuiClient.shared.deleteAccount(token: token)
            signOut()
        } catch {
            if case YuiError.unauthorized = error {
                signOut()
                self.error = error.localizedDescription
            } else {
                accountError = error.localizedDescription
            }
        }
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
            if let authorizationError = error as? ASAuthorizationError {
                if authorizationError.code == .canceled { return }
                self.error = "Appleでのログインを完了できませんでした。端末のApple Account設定を確認して、もう一度お試しください"
            } else {
                self.error = error.localizedDescription
            }
        }
    }
}
