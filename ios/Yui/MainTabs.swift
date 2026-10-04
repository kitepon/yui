import SwiftUI

struct MainTabs: View {
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var selection: Int

    private let sections = [
        (title: "家", symbol: "house"),
        (title: "場面", symbol: "square.stack.3d.up"),
        (title: "分析", symbol: "chart.xyaxis.line"),
        (title: "接続", symbol: "point.3.connected.trianglepath.dotted"),
    ]

    init(initialSelection: Int = 0) {
        _selection = State(initialValue: initialSelection)
    }

    var body: some View {
        if sizeClass == .regular {
            NavigationSplitView {
                List {
                    ForEach(sections.indices, id: \.self) { index in
                        Button { selection = index } label: {
                            Label(sections[index].title, systemImage: sections[index].symbol)
                                .foregroundStyle(selection == index ? YuiTheme.accent : YuiTheme.fg)
                                .padding(.vertical, 5)
                        }
                        .buttonStyle(.plain)
                        .keyboardShortcut(KeyEquivalent(Character(String(index + 1))), modifiers: .command)
                        .listRowBackground(selection == index ? YuiTheme.accent.opacity(0.13) : Color.clear)
                        .accessibilityIdentifier("navigation-\(index)")
                    }
                }
                .scrollContentBackground(.hidden)
                .background(YuiTheme.bg)
                .navigationTitle("結")
                .navigationSplitViewColumnWidth(min: 190, ideal: 220, max: 260)
            } detail: {
                page(selection)
                    .id(selection)
            }
            .navigationSplitViewStyle(.balanced)
            .tint(YuiTheme.accent)
        } else {
            TabView(selection: $selection) {
                ForEach(sections.indices, id: \.self) { index in
                    page(index)
                        .tabItem { Label(sections[index].title, systemImage: sections[index].symbol) }
                        .tag(index)
                }
            }
            .toolbarBackground(YuiTheme.bg, for: .tabBar)
        }
    }

    @ViewBuilder private func page(_ index: Int) -> some View {
        switch index {
        case 0: HomeView()
        case 1: ScenesView()
        case 2: AnalysisView()
        default: SettingsView()
        }
    }
}
