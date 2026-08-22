import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var mode = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("YUI")
                .font(.caption)
                .tracking(3)
                .foregroundStyle(YuiTheme.muted)
            Text("結に入る")
                .font(.largeTitle.weight(.medium))
                .foregroundStyle(YuiTheme.fg)
            Text("自分の家だけが見えます。")
                .foregroundStyle(YuiTheme.muted)

            if mode {
                field("名前", text: $name)
            }
            field("メール", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
            SecureField("パスワード", text: $password)
                .textContentType(mode ? .newPassword : .password)
                .padding()
                .background(YuiTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .foregroundStyle(YuiTheme.fg)

            if let error = session.error {
                Text(error).foregroundStyle(.red).font(.footnote)
            }

            Button(mode ? "アカウントを作る" : "入る") {
                Task {
                    if mode {
                        await session.signUp(email: email, password: password, name: name.isEmpty ? email : name)
                    } else {
                        await session.signIn(email: email, password: password)
                    }
                }
            }
            .buttonStyle(YuiButtonStyle())
            .disabled(session.busy || email.isEmpty || password.count < 8)

            Button(mode ? "すでにアカウントがある" : "初めてなら作成する") {
                mode.toggle()
            }
            .foregroundStyle(YuiTheme.muted)
            .frame(maxWidth: .infinity)
        }
        .padding(28)
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text)
            .padding()
            .background(YuiTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .foregroundStyle(YuiTheme.fg)
    }
}

struct YuiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(YuiTheme.primary.opacity(configuration.isPressed ? 0.7 : 1))
            .foregroundStyle(YuiTheme.bg)
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
