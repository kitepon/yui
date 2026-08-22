import SwiftUI

struct MainTabs: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("家", systemImage: "house") }
            ScenesView()
                .tabItem { Label("場面", systemImage: "square.stack.3d.up") }
            SettingsView()
                .tabItem { Label("接続", systemImage: "point.3.connected.trianglepath.dotted") }
        }
        .toolbarBackground(YuiTheme.bg, for: .tabBar)
    }
}
