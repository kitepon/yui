import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var natureToken = ""
    @State private var switchbotToken = ""
    @State private var switchbotSecret = ""
    @State private var tuyaAccessId = ""
    @State private var tuyaSecret = ""
    @State private var tuyaUid = ""
    @State private var tuyaRegion = "auto"
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
            "tuyaRegion": tuyaRegion == session.home?.tuyaRegion ? "" : tuyaRegion,
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

                accountCard
                billingCard
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
                    helpLink("トークンの発行方法", path: "/help/remo")
                }
                connectionCard("SwitchBot", id: "switchbot", symbol: "switch.2") {
                    secretField("トークン", text: $switchbotToken, saved: flag(\.switchbotToken))
                    secretField("シークレット", text: $switchbotSecret, saved: flag(\.switchbotSecret))
                    helpLink("接続方法", path: "/help/switchbot")
                }
                if session.home?.daikinDirect == true {
                    connectionCard("ダイキン · LAN直結", id: "daikin", symbol: "air.conditioner.horizontal") {
                        Text("自宅の無線LAN内蔵エアコンと直接つながります")
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    }
                }
                if session.home?.odelicBridge == true {
                    connectionCard("オーデリック · ブリッジ", id: "odelec", symbol: "lightbulb") {
                        Text("自宅のブリッジを通して照明を操作します")
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    }
                }
                connectionCard("Smart Life", id: "smartlife", symbol: "network") {
                    secretField("Access ID", text: $tuyaAccessId, saved: flag(\.tuyaAccessId))
                    secretField("Secret", text: $tuyaSecret, saved: flag(\.tuyaSecret))
                    secretField("UID", text: $tuyaUid, saved: flag(\.tuyaUid))
                    Picker("データセンター", selection: $tuyaRegion) {
                        Text("自動").tag("auto")
                        Text("America").tag("us")
                        Text("Europe").tag("eu")
                        Text("Japan").tag("jp")
                        Text("Western Europe").tag("we")
                        Text("India").tag("in")
                        Text("China").tag("cn")
                    }
                    .tint(YuiTheme.accent)
                    smartLifeLanStatus
                    helpLink("Smart Life の接続方法", path: "/help/tuya")
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
        .task {
            tuyaRegion = session.home?.tuyaRegion ?? "auto"
            #if DEBUG
            if session.token == "visual-preview" { return }
            #endif
            await session.loadAccount()
        }
        .onChange(of: session.home?.tuyaRegion) { _, region in
            if let region { tuyaRegion = region }
        }
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("アカウント")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(YuiTheme.muted)
            Text(session.user?.email ?? "ログイン中")
                .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
            Text("接続コード  \(session.home?.pairPin ?? "—")")
                .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
            if let error = session.accountError {
                Text(error).font(.system(size: 11)).foregroundStyle(YuiTheme.warning)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private var billingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("この結について")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(YuiTheme.muted)
            if let billing = session.billingStatus {
                if billing.entitlement.writable {
                    Text(billing.entitlement.provider == "apple" ? "App Storeで契約中" : "契約中")
                        .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    Text(billing.entitlement.message ?? "家を操作できます")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    if billing.entitlement.provider == "apple" {
                        Link("Appleのサブスクリプションを管理", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.accent)
                        if billing.stripeEntitlement?.provider == "stripe" && billing.stripeEntitlement?.writable == true {
                            Text("Webの契約も有効です。Webのアカウント設定で確認してください")
                                .font(.system(size: 12)).foregroundStyle(YuiTheme.warning)
                        }
                    } else if billing.entitlement.provider == "stripe" {
                        Text("お支払い方法と解約はWebのアカウント設定で管理できます")
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    }
                } else if billing.appleConfigured == true {
                    Text("App Storeで利用を始める")
                        .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    Text("購入前にApp Storeに表示される価格と無料体験の条件を確認してください")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    if let monthly = session.appleProduct(plan: "monthly"),
                       let annual = session.appleProduct(plan: "annual") {
                        HStack {
                            billingButton("月額 \(monthly.displayPrice)", plan: "monthly")
                            billingButton("年額 \(annual.displayPrice)", plan: "annual")
                        }
                    }
                } else if billing.configured {
                    Text("App Storeでの購入は準備中です")
                        .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    Text("すでにWebで契約している場合は、そのままこのアプリで利用できます")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                } else {
                    Text("無料で使えます")
                        .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    Text("この結には課金も広告もありません")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                }
            } else if session.accountError == nil {
                ProgressView("契約を確認しています").tint(YuiTheme.accent)
            }
            Button(billingRestoreTitle) {
                Task {
                    if session.billingStatus?.appleConfigured == true {
                        await session.restoreApplePurchases()
                    } else {
                        await session.loadAccount(refreshBilling: true)
                    }
                }
            }
                .font(.system(size: 11)).foregroundStyle(YuiTheme.accent)
                .disabled(session.appleBusy)
            HStack(spacing: 12) {
                helpLink("利用規約", path: "/terms")
                helpLink("プライバシー", path: "/privacy")
                helpLink("特商法", path: "/legal")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private var billingRestoreTitle: String {
        session.billingStatus?.appleConfigured == true ? "購入を復元・契約状態を更新" : "契約状態を更新"
    }

    private func billingButton(_ title: String, plan: String) -> some View {
        Button {
            Task { await session.purchaseApple(plan: plan) }
        } label: {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(YuiTheme.bg)
                .frame(maxWidth: .infinity, minHeight: 45)
                .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 13))
        }
        .disabled(session.appleBusy)
    }

    private var smartLifeLanStatus: some View {
        let devices = (session.home?.liveDevices ?? []).filter { $0.connector == "smartlife" }
        let viaLan = devices.filter { $0.lan?.recent == true && $0.lan?.error == nil }.count
        return VStack(alignment: .leading, spacing: 8) {
            Text("LAN直結  \(viaLan)/\(devices.count) 台")
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(YuiTheme.fg)
            if let error = session.home?.tuyaLan?.error {
                Text(error).font(.system(size: 11)).foregroundStyle(YuiTheme.warning)
            }
            if !flag(\.tuyaLocal) {
                Text("機器の鍵がありません。同期すると受け取れます。")
                    .font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
            }
            ForEach(devices) { device in
                HStack(alignment: .top) {
                    Text(device.name).lineLimit(1).foregroundStyle(YuiTheme.fg)
                    Spacer()
                    Text(device.lan?.error ?? (device.lan?.recent == true ? "LAN \(device.lan?.host ?? "")" : "クラウド"))
                        .foregroundStyle(device.lan?.error == nil ? YuiTheme.muted : YuiTheme.warning)
                }
                .font(.system(size: 11))
            }
        }
        .padding(13)
        .background(YuiTheme.bg, in: RoundedRectangle(cornerRadius: 13))
    }

    private func helpLink(_ title: String, path: String) -> some View {
        Link(title, destination: URL(string: "https://yuihome.kitepon.dev\(path)")!)
            .font(.system(size: 11))
            .foregroundStyle(YuiTheme.accent)
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
