import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var natureToken = ""
    @State private var switchbotToken = ""
    @State private var switchbotSecret = ""
    @State private var tuyaAccessId = ""
    @State private var tuyaSecret = ""
    @State private var tuyaUid = ""
    @State private var notice: String?
    @State private var showRooms = false

    private var newCredentials: [String: String] {
        [
            "natureToken": natureToken,
            "switchbotToken": switchbotToken,
            "switchbotSecret": switchbotSecret,
            "tuyaAccessId": tuyaAccessId,
            "tuyaSecret": tuyaSecret,
            "tuyaUid": tuyaUid,
        ].filter { !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("CONNECTIONS")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .tracking(3)
                        .foregroundStyle(YuiTheme.accent)
                    Text("家電とつなぐ")
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .foregroundStyle(YuiTheme.fg)
                    Text("認証情報は結のサーバーに暗号化して保存されます")
                        .font(.system(size: 12))
                        .foregroundStyle(YuiTheme.muted)
                }

                serverCard

                Button { showRooms = true } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "square.grid.2x2")
                            .frame(width: 44, height: 44)
                            .foregroundStyle(YuiTheme.accent)
                        Text("場所を管理")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(YuiTheme.fg)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .foregroundStyle(YuiTheme.muted)
                    }
                    .padding(14)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 21))
                }

                connectionCard("Nature Remo", id: "nature", symbol: "thermometer.medium") {
                    secretField("アクセストークン", text: $natureToken, saved: flag(\.natureToken))
                }
                connectionCard("SwitchBot", id: "switchbot", symbol: "switch.2") {
                    secretField("トークン", text: $switchbotToken, saved: flag(\.switchbotToken))
                    secretField("シークレット", text: $switchbotSecret, saved: flag(\.switchbotSecret))
                }
                connectionCard("Smart Life", id: "smartlife", symbol: "network") {
                    secretField("Access ID", text: $tuyaAccessId, saved: flag(\.tuyaAccessId))
                    secretField("Secret", text: $tuyaSecret, saved: flag(\.tuyaSecret))
                    secretField("UID", text: $tuyaUid, saved: flag(\.tuyaUid))
                }

                Button {
                    Task {
                        let saved = await session.saveCredentials(newCredentials)
                        if saved {
                            natureToken = ""
                            switchbotToken = ""
                            switchbotSecret = ""
                            tuyaAccessId = ""
                            tuyaSecret = ""
                            tuyaUid = ""
                            notice = "保存しました。必要なサービスを同期してください。"
                        }
                    }
                } label: {
                    Label("認証情報を保存", systemImage: "lock.shield")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 55)
                        .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                        .foregroundStyle(YuiTheme.bg)
                }
                .disabled(session.busy || newCredentials.isEmpty)
                .opacity(session.busy || newCredentials.isEmpty ? 0.6 : 1)

                if let notice {
                    Text(notice)
                        .font(.system(size: 12))
                        .foregroundStyle(YuiTheme.mint)
                }

                Button(role: .destructive) { session.signOut() } label: {
                    Label("ログアウト", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(YuiTheme.muted)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)
            .padding(.bottom, 36)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .sheet(isPresented: $showRooms) {
            RoomManagementView()
                .environmentObject(session)
                .presentationDragIndicator(.visible)
        }
    }

    private var serverCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "house.fill")
                .foregroundStyle(YuiTheme.mint)
                .frame(width: 46, height: 46)
                .background(YuiTheme.mint.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
            VStack(alignment: .leading, spacing: 4) {
                Text("結のサーバー")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(YuiTheme.fg)
                Text(session.home == nil ? "接続を確認しています" : "yuihome.kitepon.dev")
                    .font(.system(size: 11))
                    .foregroundStyle(YuiTheme.muted)
            }
            Spacer()
            Circle().fill(session.home == nil ? YuiTheme.warning : YuiTheme.mint).frame(width: 8, height: 8)
        }
        .padding(16)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private func connectionCard<Content: View>(_ title: String, id: String, symbol: String, @ViewBuilder content: () -> Content) -> some View {
        let status = session.home?.connectors?[id]
        return VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 13) {
                Image(systemName: symbol)
                    .font(.system(size: 18))
                    .foregroundStyle(YuiTheme.accent)
                    .frame(width: 42, height: 42)
                    .background(YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(YuiTheme.fg)
                    Text(status?.connected == true ? "\(status?.deviceCount ?? 0) 台接続" : "未接続")
                        .font(.system(size: 11))
                        .foregroundStyle(status?.connected == true ? YuiTheme.mint : YuiTheme.muted)
                }
                Spacer()
                Button {
                    Task { await session.sync(id) }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(YuiTheme.accent)
                        .frame(width: 42, height: 42)
                        .background(YuiTheme.surfaceRaised, in: Circle())
                }
                .accessibilityLabel("\(title)を同期")
                .disabled(session.busy)
            }
            content()
            if let error = status?.error, !error.isEmpty {
                Text(error).font(.system(size: 11)).foregroundStyle(YuiTheme.warning)
            }
        }
        .padding(17)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 23))
        .overlay { RoundedRectangle(cornerRadius: 23).strokeBorder(YuiTheme.border, lineWidth: 1) }
    }

    private func secretField(_ title: String, text: Binding<String>, saved: Bool) -> some View {
        HStack {
            SecureField(saved ? "\(title) · 保存済み" : title, text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 13))
                .foregroundStyle(YuiTheme.fg)
            if saved && text.wrappedValue.isEmpty {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(YuiTheme.mint)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 45)
        .background(YuiTheme.bg, in: RoundedRectangle(cornerRadius: 12))
    }

    private func flag(_ keyPath: KeyPath<CredentialFlags, Bool?>) -> Bool {
        session.home?.credentialFlags?[keyPath: keyPath] ?? false
    }
}
