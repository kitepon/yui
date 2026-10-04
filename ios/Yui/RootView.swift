import SwiftUI

struct RootView: View {
    @StateObject private var session = SessionStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if session.isLoggedIn {
                MainTabs()
            } else {
                LoginView()
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
        .task(id: HomeRefreshTask(token: session.token, active: scenePhase == .active)) {
            if scenePhase == .active && session.isLoggedIn { await session.refreshWhileActive() }
        }
        #if DEBUG
        .task {
            // 実際の認証とKeychain保存を、配布物へ認証情報を含めずに確認する。
            if ProcessInfo.processInfo.arguments.contains("-yui-test-login"),
               let email = ProcessInfo.processInfo.environment["YUI_TEST_EMAIL"],
               let password = ProcessInfo.processInfo.environment["YUI_TEST_PASSWORD"] {
                await session.signIn(email: email, password: password)
            }
        }
        #endif
    }
}

private struct HomeRefreshTask: Equatable {
    let token: String?
    let active: Bool
}
