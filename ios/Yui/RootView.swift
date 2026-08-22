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
        .task {
            if session.isLoggedIn { await session.refresh() }
        }
    }
}
