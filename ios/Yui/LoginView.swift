import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var creatingAccount = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""

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
                Text(creatingAccount ? "家と、つながろう。" : "家に、ただいま。")
                    .font(.system(size: 32, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                    .padding(.top, 12)
                Text(creatingAccount ? "アカウントを作って、結を始めましょう。" : "いつもの家が、ここにあります。")
                    .font(.system(size: 14))
                    .foregroundStyle(YuiTheme.muted)
                    .padding(.top, 7)

                Button {
                    Task { await session.signInWithGoogle() }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "g.circle.fill")
                            .font(.system(size: 24))
                        Spacer()
                        Text("Googleでログイン")
                            .font(.system(size: 16, weight: .semibold))
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundStyle(YuiTheme.bg)
                    .padding(.horizontal, 20)
                    .frame(height: 57)
                    .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                }
                .disabled(session.busy)
                .padding(.top, 29)

                HStack(spacing: 12) {
                    Rectangle().frame(height: 1)
                    Text("またはメールで")
                        .font(.system(size: 11))
                        .fixedSize()
                    Rectangle().frame(height: 1)
                }
                .foregroundStyle(YuiTheme.muted.opacity(0.65))
                .padding(.top, 24)

                VStack(spacing: 12) {
                    if creatingAccount {
                        entry("名前", systemImage: "person", text: $name)
                            .textContentType(.name)
                    }
                    entry("メールアドレス", systemImage: "envelope", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    HStack(spacing: 13) {
                        Image(systemName: "lock")
                            .frame(width: 20)
                            .foregroundStyle(YuiTheme.muted)
                        SecureField("パスワード", text: $password)
                            .textContentType(creatingAccount ? .newPassword : .password)
                            .foregroundStyle(YuiTheme.fg)
                    }
                    .padding(.horizontal, 18)
                    .frame(height: 56)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 17))
                }
                .padding(.top, 24)

                if let error = session.error {
                    Text(error)
                        .font(.system(size: 12))
                        .foregroundStyle(YuiTheme.warning)
                        .padding(.top, 12)
                }

                Button {
                    Task {
                        if creatingAccount {
                            await session.signUp(email: email, password: password, name: name.isEmpty ? email : name)
                        } else {
                            await session.signIn(email: email, password: password)
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        Text(creatingAccount ? "アカウントを作る" : "ログイン")
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(YuiTheme.bg)
                    .padding(.horizontal, 20)
                    .frame(height: 57)
                    .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                }
                .disabled(session.busy || email.isEmpty || password.count < 8)
                .opacity(session.busy || email.isEmpty || password.count < 8 ? 0.62 : 1)
                .padding(.top, 20)

                Button {
                    withAnimation(.easeInOut(duration: 0.25)) { creatingAccount.toggle() }
                } label: {
                    Text(creatingAccount ? "すでにアカウントがある方はログイン" : "初めての方はアカウントを作成")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(YuiTheme.muted)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .padding(.top, 8)
            }
            .padding(.horizontal, 26)
            .padding(.bottom, 28)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
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

    private func entry(_ title: String, systemImage: String, text: Binding<String>) -> some View {
        HStack(spacing: 13) {
            Image(systemName: systemImage)
                .frame(width: 20)
                .foregroundStyle(YuiTheme.muted)
            TextField(title, text: text)
                .foregroundStyle(YuiTheme.fg)
        }
        .padding(.horizontal, 18)
        .frame(height: 56)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 17))
    }
}
