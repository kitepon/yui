import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

@MainActor
final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var webSession: ASWebAuthenticationSession?
    private var anchor: ASPresentationAnchor?

    func authenticate() async throws -> String {
        let verifier = try randomValue()
        let state = try randomValue()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else {
            throw YuiError.message("認証画面を開けません")
        }
        anchor = window
        defer {
            webSession = nil
            anchor = nil
        }

        var url = URLComponents(url: YuiClient.shared.origin.appending(path: "/api/ios-auth"), resolvingAgainstBaseURL: false)!
        url.queryItems = [
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "challenge", value: challenge),
        ]
        guard let startURL = url.url else { throw YuiError.message("認証URLが不正です") }

        let callback = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "yuihome") { url, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let url {
                    continuation.resume(returning: url)
                } else {
                    continuation.resume(throwing: YuiError.message("Googleログインが完了しませんでした"))
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            webSession = session
            if !session.start() {
                continuation.resume(throwing: YuiError.message("認証画面を開けません"))
            }
        }
        guard callback.scheme == "yuihome", callback.host == "auth",
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              items.first(where: { $0.name == "state" })?.value == state else {
            throw YuiError.message("認証結果を確認できません")
        }
        guard let code = items.first(where: { $0.name == "code" })?.value else {
            throw YuiError.message("Googleログインが完了しませんでした")
        }
        return try await YuiClient.shared.exchangeGoogle(code: code, verifier: verifier)
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor!
    }

    private func randomValue() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw YuiError.message("認証を開始できません")
        }
        return Data(bytes).base64URL
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
