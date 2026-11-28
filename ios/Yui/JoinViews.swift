import CoreImage.CIFilterBuiltins
import LoginBilling
import SwiftUI

func qrImage(_ text: String) -> Image? {
    let filter = CIFilter.qrCodeGenerator()
    filter.message = Data(text.utf8)
    filter.correctionLevel = "M"
    guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
          let image = CIContext().createCGImage(output, from: output.extent) else { return nil }
    return Image(decorative: image, scale: 1)
}

/// The wanting device: shows a QR and a join code; a parent device of the entry reads it (contract data flow 2).
struct JoinWantView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var request: LocalRequest?
    @State private var message: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("別の端末の家に参加する")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Text("すでに結を使っている端末（iPhoneかiPad）で、設定の「別の端末を追加」を開き、この画面のQRを読み取ってください。同じWi-Fiにつないでおきます。")
                    .font(.system(size: 13))
                    .foregroundStyle(YuiTheme.muted)
                if let request {
                    if let qr = qrImage(request.qr) {
                        qr.interpolation(.none).resizable().scaledToFit()
                            .frame(width: 240, height: 240)
                            .padding(10)
                            .background(.white, in: RoundedRectangle(cornerRadius: 12))
                            .accessibilityLabel("参加用のQRコード")
                    }
                    if let code = request.code {
                        Text("カメラで読めない場合は、このリンクを開くか、コピーして貼り付けます")
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                        Button("リンクをコピー") { UIPasteboard.general.string = code }
                            .font(.system(size: 14, weight: .semibold)).foregroundStyle(YuiTheme.accent)
                    }
                    ProgressView("読み取りを待っています").tint(YuiTheme.accent)
                } else if message == nil {
                    ProgressView().tint(YuiTheme.accent)
                }
                if let message {
                    Text(message).font(.system(size: 13)).foregroundStyle(YuiTheme.warning)
                }
                Button("閉じる") { dismiss() }
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(YuiTheme.muted)
            }
            .padding(26)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .task { await wait() }
        .onChange(of: session.openedLink) { _, link in
            guard let link else { return }
            session.openedLink = nil
            Task { await take(link) }
        }
        .onDisappear { request?.close() }
    }

    /// The answering device may send the person back by a return link opened in this app; it gives the same outcome.
    private func take(_ link: String) async {
        do { await finish(try await Hosted.shared.form.take(link)) } catch { message = SessionStore.words(error) }
    }

    private func finish(_ outcome: LocalOutcome) async {
        if let add = outcome.add {
            dismiss()
            await session.joined(add)
        } else {
            message = SessionStore.words(LoginBillingError(code: outcome.refused ?? "refused"))
        }
    }

    private func wait() async {
        do {
            let made = try await Hosted.shared.form.makeRequest(provider: "apple")
            request = made
            await finish(try await made.awaitOutcome())
        } catch {
            if case let failure as LoginBillingError = error, failure.code == "signin_cancelled" || failure.code == "request_gone" { return }
            message = SessionStore.words(error)
        }
    }
}

@MainActor
final class JoinAsker: ObservableObject {
    @Published var asking = false
    private var continuation: CheckedContinuation<Bool, Never>?

    func ask() async -> Bool {
        asking = true
        return await withCheckedContinuation { continuation = $0 }
    }

    func answer(_ yes: Bool) {
        asking = false
        continuation?.resume(returning: yes)
        continuation = nil
    }
}

/// The answering device (iPhone, iPad): reads a QR or a pasted join link and, after the person confirms, admits the other device.
/// A Mac has no camera scanner and never answers (library rule), so it does not offer this screen.
struct JoinAnswerView: View {
    var link: String?
    @Environment(\.dismiss) private var dismiss
    @StateObject private var asker = JoinAsker()
    @State private var text = ""
    @State private var message: String?
    @State private var returnLink: URL?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("別の端末を追加")
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Text("追加する端末で「別の端末の家に参加する」を開き、出てきたQRを読み取ります。同じWi-Fiにつないでおきます。")
                    .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
                #if os(iOS) && !targetEnvironment(macCatalyst)
                if QRScannerView.isAvailable {
                    QRScannerView { payload in Task { await answer(payload) } }
                        .frame(height: 300)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
                #endif
                TextField("参加リンクを貼り付け", text: $text)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(14).background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                Button("このリンクで追加") { Task { await answer(text) } }
                    .disabled(busy || text.isEmpty)
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(YuiTheme.accent)
                if let message { Text(message).font(.system(size: 13)).foregroundStyle(YuiTheme.mint) }
                if let returnLink {
                    Link("相手の端末を開く", destination: returnLink).font(.system(size: 14, weight: .semibold))
                }
                Button("閉じる") { dismiss() }
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(YuiTheme.muted)
            }
            .padding(26)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .task {
            guard let link else { return }
            text = link
            await answer(link)
        }
        .alert("この端末を同じ家に追加しますか？", isPresented: Binding(get: { asker.asking }, set: { _ in })) {
            Button("追加する") { asker.answer(true) }
            Button("やめる", role: .cancel) { asker.answer(false) }
        } message: {
            Text("追加した端末は、この家を見たり操作したりできます。心当たりのない端末は追加しないでください。")
        }
    }

    private func answer(_ payload: String) async {
        guard isLibraryQR(payload) else {
            message = "読み取れない形式です。追加する端末に出ているQRかリンクを使ってください"
            return
        }
        busy = true
        defer { busy = false }
        do {
            switch try await Hosted.shared.form.answer(qr: payload, confirm: { _ in await asker.ask() }) {
            case .sent: message = "追加しました。相手の端末で家が開きます"
            case .noPurchase: message = "この端末では契約を確認できません。契約してからもう一度お試しください"
            case .declined: message = "追加をやめました"
            case .returnLink(let link, let cause):
                message = cause.flatMap(LocalWords.ja) ?? "相手の端末へ戻って続けてください"
                returnLink = URL(string: link)
            }
        } catch {
            message = SessionStore.words(error)
        }
    }
}
