import SwiftUI

struct ScenesView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        NavigationStack {
            List(session.home?.scenes ?? []) { scene in
                Button {
                    Task { await session.runScene(scene) }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scene.name).foregroundStyle(YuiTheme.fg)
                        if let hint = scene.hint {
                            Text(hint).font(.caption).foregroundStyle(YuiTheme.muted)
                        }
                    }
                }
                .listRowBackground(YuiTheme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(YuiTheme.bg)
            .navigationTitle("場面")
        }
    }
}
