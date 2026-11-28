import SwiftUI

/// Sign in with Apple, then (when the server knows no key of this device) start a new entry or join one.
struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var joining = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                artwork
                    .frame(maxWidth: .infinity)
                    .frame(height: 236)

                Text("結  /  YUI")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(3.5)
                    .foregroundStyle(YuiTheme.accent)
                    .padding(.top, 6)
                Text(session.phase == .choosing ? "この端末を、家につなぎます。" : "家に、ただいま。")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                    .padding(.top, 12)

                if session.phase == .choosing {
                    choosing
                } else {
                    Text("Appleでログインして始めます。以前の結のアカウントがある方も、まずここから入って引き継ぎます。")
                        .font(.system(size: 14))
                        .foregroundStyle(YuiTheme.muted)
                        .padding(.top, 7)
                    AppleSignInButton {
                        Task { await session.signInWithApple() }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 57)
                    .disabled(session.busy)
                    .padding(.top, 29)
                }

                if let error = session.error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(YuiTheme.warning)
                        .padding(.top, 12)
                }
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 28)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .sheet(isPresented: $joining) {
            JoinWantView().environmentObject(session)
        }
    }

    private var choosing: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("はじめての方は「ここから始める」を選びます。すでに別の端末で結を使っている方は、その端末から参加します。")
                .font(.system(size: 14))
                .foregroundStyle(YuiTheme.muted)
            choice("ここから始める", systemImage: "house") { Task { await session.startHere() } }
            choice("別の端末の家に参加する", systemImage: "qrcode") { joining = true }
            Button("別のAppleアカウントでログインする") { session.signOut() }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(YuiTheme.muted)
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .padding(.top, 7)
        .disabled(session.busy)
    }

    private func choice(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Spacer()
                Label(title, systemImage: systemImage)
                Spacer()
            }
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(YuiTheme.bg)
            .frame(height: 57)
            .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
        }
    }

    private var artwork: some View {
        ZStack {
            Circle()
                .fill(YuiTheme.accent.opacity(0.28))
                .frame(width: 150, height: 150)
                .blur(radius: 45)
            Circle()
                .strokeBorder(YuiTheme.accent.opacity(0.17), lineWidth: 1)
                .frame(width: 210, height: 210)
            Circle()
                .strokeBorder(YuiTheme.accent.opacity(0.26), lineWidth: 1)
                .frame(width: 155, height: 155)
            Circle()
                .fill(LinearGradient(colors: [YuiTheme.heroTop, YuiTheme.surface], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 112, height: 112)
                .overlay {
                    Image(systemName: "house.fill")
                        .font(.system(size: 39, weight: .ultraLight))
                        .foregroundStyle(YuiTheme.accent)
                }
        }
        .accessibilityHidden(true)
    }

}
