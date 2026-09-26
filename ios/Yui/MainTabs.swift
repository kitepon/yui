import SwiftUI

struct MainTabs: View {
    @State private var selection: Int

    init(initialSelection: Int = 0) {
        _selection = State(initialValue: initialSelection)
    }

    var body: some View {
        TabView(selection: $selection) {
            HomeView()
                .tabItem { Label("家", systemImage: "house") }
                .tag(0)
            ScenesView()
                .tabItem { Label("場面", systemImage: "square.stack.3d.up") }
                .tag(1)
            AnalysisView()
                .tabItem { Label("分析", systemImage: "chart.xyaxis.line") }
                .tag(2)
            SettingsView()
                .tabItem { Label("接続", systemImage: "point.3.connected.trianglepath.dotted") }
                .tag(3)
        }
        .toolbarBackground(YuiTheme.bg, for: .tabBar)
    }
}
