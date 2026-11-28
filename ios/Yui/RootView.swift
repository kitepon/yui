import SwiftUI

struct RootView: View {
    @StateObject private var session = SessionStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            switch session.phase {
            case .ready: MainTabs()
            case .claiming: ClaimView()
            case .choosing, .signedOut: LoginView()
            }
        }
        .environmentObject(session)
        .background(YuiTheme.bg.ignoresSafeArea())
        .alert("操作できませんでした", isPresented: Binding(
            get: { session.isLoggedIn && session.error != nil },
            set: { if !$0 { session.error = nil } }
        )) {
            Button("閉じる", role: .cancel) { session.error = nil }
        } message: {
            Text(session.error ?? "")
        }
        .safeAreaInset(edge: .bottom) {
            if let message = session.homeRefreshError, session.isLoggedIn {
                Text(message).font(.footnote).padding(12).frame(maxWidth: .infinity).background(YuiTheme.surface)
            }
        }
        .task { await session.resume() }
        .task(id: HomeRefreshTask(ready: session.isLoggedIn, active: scenePhase == .active)) {
            guard scenePhase == .active && session.isLoggedIn else { return }
            // Launch and foreground: restate the date this device holds, then keep the home fresh.
            await session.reportPaidUntil()
            await session.loadProducts()
            await session.refreshWhileActive()
        }
    }
}

private struct HomeRefreshTask: Equatable {
    let ready: Bool
    let active: Bool
}
