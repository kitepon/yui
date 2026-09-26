import SwiftUI

struct RootView: View {
    @StateObject private var session = SessionStore()

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
        .task {
            if session.isLoggedIn { await session.refresh() }
        }
    }
}
