import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

@MainActor
final class AppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var controller: ASAuthorizationController?
    private var continuation: CheckedContinuation<String, Error>?
    private var nonce: String?
    private var anchor: ASPresentationAnchor?

    func authenticate() async throws -> String {
        guard continuation == nil else { throw YuiError.message("Appleログインを処理中です") }
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first else {
            throw YuiError.message("認証画面を開けません")
        }
        anchor = window
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw YuiError.message("Appleログインを開始できません")
        }
        let rawNonce = Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        let hashedNonce = SHA256.hash(data: Data(rawNonce.utf8))
            .map { String(format: "%02x", $0) }.joined()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = hashedNonce
        nonce = rawNonce
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.controller = controller
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor!
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let identityToken = String(data: data, encoding: .utf8),
              let codeData = credential.authorizationCode,
              let authorizationCode = String(data: codeData, encoding: .utf8),
              let nonce else {
            finish(.failure(YuiError.message("Appleの認証結果を確認できません")))
            return
        }
        let firstName = credential.fullName?.givenName
        let lastName = credential.fullName?.familyName
        Task {
            do {
                let token = try await YuiClient.shared.signInWithApple(
                    identityToken: identityToken, nonce: nonce,
                    firstName: firstName, lastName: lastName, email: credential.email,
                    authorizationCode: authorizationCode
                )
                finish(.success(token))
            } catch {
                finish(.failure(error))
            }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        finish(.failure(error))
    }

    private func finish(_ result: Result<String, Error>) {
        let pending = continuation
        continuation = nil
        controller = nil
        nonce = nil
        anchor = nil
        pending?.resume(with: result)
    }
}
