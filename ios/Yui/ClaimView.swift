import AuthenticationServices
import SwiftUI

/// Offered once, right after "start here" and before the first home is made: move a legacy home into this entry (contract: claimLegacyHome).
struct ClaimView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text("以前の結のアカウントはありますか？")
                    .font(.system(size: 26, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Text("以前のログインを確かめると、前の家（部屋、場面、オートメーション、機器の認証情報）をこの家へ移します。確かめたあと、以前のアカウントは消えます。")
                    .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
                claimButton("Appleで引き継ぐ") { await session.claim(method: "apple", proof: .apple(anchor: { Hosted.anchor() })) }
                claimButton("Googleで引き継ぐ") {
                    await session.claim(method: "google", proof: .google(clientId: Hosted.googleClientId, anchor: { Hosted.anchor() }))
                }
                VStack(spacing: 12) {
                    TextField("メールアドレス", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .padding(14).background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                    SecureField("パスワード", text: $password)
                        .textContentType(.password)
                        .padding(14).background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                }
                claimButton("メールで引き継ぐ") {
                    _ = await session.claim(["method": "password", "email": email, "password": password])
                }
                .disabled(email.isEmpty || password.isEmpty)
                if let error = session.error {
                    Text(error).font(.system(size: 12)).foregroundStyle(YuiTheme.warning)
                }
                Button("引き継がずに新しく始める") { Task { await session.finishClaiming() } }
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(YuiTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 50)
            }
            .padding(26)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .disabled(session.busy)
    }

    private func claimButton(_ title: String, action: @escaping () async -> Void) -> some View {
        Button { Task { await action() } } label: {
            Text(title)
                .font(.system(size: 15, weight: .semibold)).foregroundStyle(YuiTheme.bg)
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 15))
        }
    }
}
