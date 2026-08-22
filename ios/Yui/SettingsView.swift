import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var natureToken = ""
    @State private var switchbotToken = ""
    @State private var switchbotSecret = ""
    @State private var tuyaAccessId = ""
    @State private var tuyaSecret = ""
    @State private var tuyaUid = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("制御サーバー") {
                    Text("yuihome.kitepon.dev")
                    if let pin = session.home?.pairPin {
                        Text("接続コード \(pin)")
                    }
                }
                Section("Nature Remo") {
                    SecureField(flag(\.natureToken) ? "保存済み" : "トークン", text: $natureToken)
                    syncButton("nature")
                }
                Section("SwitchBot") {
                    SecureField(flag(\.switchbotToken) ? "保存済み" : "トークン", text: $switchbotToken)
                    SecureField(flag(\.switchbotSecret) ? "保存済み" : "シークレット", text: $switchbotSecret)
                    syncButton("switchbot")
                }
                Section("Smart Life") {
                    TextField(flag(\.tuyaAccessId) ? "保存済み" : "Access ID", text: $tuyaAccessId)
                    SecureField(flag(\.tuyaSecret) ? "保存済み" : "Secret", text: $tuyaSecret)
                    TextField(flag(\.tuyaUid) ? "保存済み" : "UID", text: $tuyaUid)
                    syncButton("smartlife")
                }
                if let error = session.error {
                    Section { Text(error).foregroundStyle(.red) }
                }
                Section {
                    Button("保存する") {
                        Task {
                            await session.saveCredentials([
                                "natureToken": natureToken,
                                "switchbotToken": switchbotToken,
                                "switchbotSecret": switchbotSecret,
                                "tuyaAccessId": tuyaAccessId,
                                "tuyaSecret": tuyaSecret,
                                "tuyaUid": tuyaUid,
                            ])
                            natureToken = ""
                            switchbotToken = ""
                            switchbotSecret = ""
                            tuyaAccessId = ""
                            tuyaSecret = ""
                            tuyaUid = ""
                        }
                    }
                    Button("出る", role: .destructive) {
                        session.signOut()
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(YuiTheme.bg)
            .navigationTitle("接続")
        }
    }

    private func flag(_ keyPath: KeyPath<CredentialFlags, Bool?>) -> Bool {
        session.home?.credentialFlags?[keyPath: keyPath] ?? false
    }

    private func syncButton(_ brand: String) -> some View {
        Button("同期する") {
            Task { await session.sync(brand) }
        }
        .disabled(session.busy)
    }
}
