import AuthenticationServices
import Foundation
import LoginBilling
import UIKit

/// The library's objects for this app, built once: the device key, the keyholes client and the local form.
/// Function and data-flow diagram: ios/docs/apple-function-dataflow.md.
@MainActor
final class Hosted {
    static let shared = Hosted()
    static let appId = "dev.kitepon.yuihome"
    static let servicesId = "dev.kitepon.yuihome.web"
    static let googleClientId = "916284233737-09v748ukr3f48v56fgfqj8et7kgqt15d.apps.googleusercontent.com"
    static let productIds = ["dev.kitepon.yuihome.subscription.monthly", "dev.kitepon.yuihome.subscription.annual"]

    let keys: DeviceKeys
    let client: KeyholeClient
    let form: LocalForm
    let appleRules: AppleRules

    private init() {
        let keys = DeviceKeys()
        // The constants are fixed in this file; a throw here is a typo in them, not a runtime state.
        let client = try! KeyholeClient(origin: URL(string: "https://yuihome.kitepon.dev/api/")!, appId: Self.appId, keys: keys)
        let apple = AppleRules(bundleIds: [Self.appId], products: Self.productIds)
        let rules = LocalRules(apple: apple, audiences: [Self.appId, Self.servicesId], appId: Self.appId)
        let keyholes = try! LocalKeyholes(
            appId: Self.appId, keys: keys,
            leave: { try await client.leave() },
            admit: { add, consent in try await client.admit(add, consent) })
        self.keys = keys
        self.client = client
        self.appleRules = apple
        self.form = LocalForm(rules: rules, anchor: { Hosted.anchor() }, keyholes: keyholes)
    }

    static func anchor() -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    /// True when the device holds a kept sign-in and a key (it may still hold no entry on the server).
    var hasKey: Bool {
        get async { await form.keptSignIn() != nil && ((try? keys.publicKey()) ?? nil) != nil }
    }

    /// The Login-Billing-Key value for one call of the product's own HTTP stack; nil without a key.
    func header(method: String, url: URL, body: Data) -> String? {
        client.header(method: method, url: url, body: body)
    }

    func useServerTime(_ nowMs: Int64) { client.useServerTime(nowMs) }
}
