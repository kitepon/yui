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
    @State private var confirmDelete = false
    @State private var showAnswer = false

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
                devicesCard
                alexaCard
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

                Button { Task { await session.exportData() } } label: {
                    Label("家のデータを書き出す", systemImage: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(YuiTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .accessibilityIdentifier("export-data")
                if let file = session.exportFile {
                    ShareLink(item: file) {
                        Label("書き出したファイルを保存・共有", systemImage: "doc")
                            .font(.system(size: 13)).foregroundStyle(YuiTheme.mint)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }

                Button(role: .destructive) { session.signOut() } label: {
                    Label("ログアウト", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(YuiTheme.muted)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }

                Button(role: .destructive) { confirmDelete = true } label: {
                    Label("アカウントを削除", systemImage: "person.crop.circle.badge.minus")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(YuiTheme.warning)
                        .frame(maxWidth: .infinity, minHeight: 50)
                }
                .disabled(session.busy)
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)
            .padding(.bottom, 36)
            .frame(maxWidth: 840)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .sheet(isPresented: $showRooms) {
            RoomManagementView()
                .environmentObject(session)
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("結のアカウントを完全に削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("アカウントを削除", role: .destructive) {
                Task { await session.deleteAccount() }
            }
        } message: {
            Text("この家の設定と記録がすぐに消え、この家につながっている端末はすべて外れます。家に残る端末がこの1台だけの場合、消えた家は元に戻せません。App Storeの契約はAppleのサブスクリプション管理で別途解約してください。削除後もAppleから請求される場合があります。")
        }
        .sheet(isPresented: $showAnswer) {
            JoinAnswerView()
        }
        .task {
            tuyaRegion = session.home?.tuyaRegion ?? "auto"
        }
        .onChange(of: session.home?.tuyaRegion) { _, region in
            if let region { tuyaRegion = region }
        }
    }

    private var alexaCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Alexa", systemImage: "waveform")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(YuiTheme.fg)
            Text("公式スキル「\(AlexaSkill.official.name)」で、結の機器と場面を声で操作できます。")
                .font(.system(size: 12))
                .foregroundStyle(YuiTheme.muted)
            Link(destination: AlexaSkill.official.storeURL) {
                Label("\(AlexaSkill.official.name)を有効にする", systemImage: "arrow.up.right")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 13))
                    .foregroundStyle(YuiTheme.bg)
            }
            .accessibilityIdentifier("alexa-enable-skill")
            Text("1. Amazonのページでスキルを有効にします。\n2. 下のリンクコードを作り、Amazonの画面に入力します。\n3. Alexaでデバイスを検出します。")
                .font(.system(size: 12))
                .foregroundStyle(YuiTheme.muted)
                .lineSpacing(4)
            Button("リンクコードを作る") { Task { await session.makeLinkCode() } }
                .font(.system(size: 14, weight: .semibold)).foregroundStyle(YuiTheme.accent)
            if let code = session.linkCode, let expires = session.linkCodeExpiresAt, expires > Date() {
                Text(code.code)
                    .font(.system(size: 28, weight: .bold, design: .monospaced)).foregroundStyle(YuiTheme.fg)
                    .textSelection(.enabled)
                    .accessibilityIdentifier("alexa-link-code")
                Text("\(expires.formatted(date: .omitted, time: .shortened))まで有効。1回だけ使えます")
                    .font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("アカウント")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(YuiTheme.muted)
            Text("Appleでログイン中")
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

    private var devicesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("端末")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(YuiTheme.muted)
            #if targetEnvironment(macCatalyst)
            Text("このMacは、iPhoneかiPadから追加してもらいます。別の端末の追加は、iPhoneかiPadで行ってください。")
                .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
            #else
            Text("別の端末（iPad、Mac、ブラウザ）を、この家に追加します。")
                .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
            Button { showAnswer = true } label: {
                Label("別の端末を追加", systemImage: "qrcode.viewfinder")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 13))
                    .foregroundStyle(YuiTheme.bg)
            }
            #endif
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private var billingCard: some View {
        let now = Date()
        let end = session.paidUntil
        let active = end.map { $0 > now } ?? false
        let grace = end.map { $0 <= now && $0.addingTimeInterval(7 * 86_400) > now } ?? false
        return VStack(alignment: .leading, spacing: 10) {
            Text("この結について")
                .font(.system(size: 11, weight: .bold)).foregroundStyle(YuiTheme.muted)
            if active || grace {
                Text(active ? "App Storeで契約中" : "契約の更新を確認しています")
                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                Text(active ? "家を操作できます" : "更新が確認できるまでの猶予期間です。猶予が終わると、家は見るだけになります")
                    .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                Link("Appleのサブスクリプションを管理", destination: URL(string: "https://apps.apple.com/account/subscriptions")!)
                    .font(.system(size: 12)).foregroundStyle(YuiTheme.accent)
            } else {
                Text("App Storeで利用を始める")
                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                Text("一つの家の機器操作、場面、オートメーション、分析を利用できます。")
                    .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                if session.products.count == Hosted.productIds.count {
                    let monthly = session.products[0], annual = session.products[1]
                    Text(session.introEligible
                         ? "初回1か月無料。その後は月額 \(monthly.displayPrice) または年額 \(annual.displayPrice) で自動更新します。"
                         : "月額 \(monthly.displayPrice) または年額 \(annual.displayPrice) で自動更新します。")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    HStack {
                        billingButton("月額 \(monthly.displayPrice)", productId: monthly.id)
                        billingButton("年額 \(annual.displayPrice)", productId: annual.id)
                    }
                } else {
                    ProgressView("商品を確認しています").tint(YuiTheme.accent)
                }
            }
            Text(planLine)
                .font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
            Button("購入を復元・契約状態を更新") {
                Task { await session.restorePurchases() }
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

    private var planLine: String {
        guard let checked = session.planCheckedAt else { return "契約はまだ確認していません" }
        let when = checked.formatted(date: .abbreviated, time: .shortened)
        guard let end = session.paidUntil else { return "最後に確認: \(when)。この端末に契約はありません" }
        return "最後に確認: \(when)。この端末の契約は\(end.formatted(date: .abbreviated, time: .omitted))までです"
    }

    private func billingButton(_ title: String, productId: String) -> some View {
        Button {
            Task { await session.purchase(productId: productId) }
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
        let phase = session.syncPhases[id]
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
                    Group {
                        if phase == .syncing {
                            ProgressView().tint(YuiTheme.accent)
                        } else {
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(YuiTheme.accent)
                        }
                    }
                    .frame(width: 42, height: 42)
                    .background(YuiTheme.surfaceRaised, in: Circle())
                }
                .accessibilityLabel(phase == .syncing ? "\(title)を同期中" : "\(title)を同期")
                .disabled(session.busy)
            }
            if let phase {
                switch phase {
                case .syncing:
                    Text(id == "odelec" ? "照明を探索中… しばらくお待ちください" : "同期中…")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.accent)
                        .accessibilityIdentifier("sync-progress-\(id)")
                case .completed:
                    Label("同期が完了しました", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 12)).foregroundStyle(YuiTheme.mint)
                        .accessibilityIdentifier("sync-complete-\(id)")
                case .failed(let message):
                    Text(message).font(.system(size: 12)).foregroundStyle(YuiTheme.warning)
                        .accessibilityIdentifier("sync-error-\(id)")
                }
            }
            content()
            if phase == nil, let error = status?.error, !error.isEmpty {
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
