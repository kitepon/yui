import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        NavigationStack {
            List {
                if let climate = session.home?.climate {
                    Section {
                        HStack {
                            Text(climate.label ?? "家")
                            Spacer()
                            Text(climate.temperature.map { String(format: "%.1f°", $0) } ?? "—")
                                .font(.title2.monospacedDigit())
                        }
                        .foregroundStyle(YuiTheme.fg)
                        .listRowBackground(YuiTheme.surface)
                    }
                }
                let groups = Dictionary(grouping: session.home?.liveDevices ?? [], by: \.room)
                ForEach(groups.keys.sorted(), id: \.self) { room in
                    Section(room) {
                        ForEach(groups[room] ?? []) { device in
                            Button {
                                Task { await session.toggle(device) }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(device.name).foregroundStyle(YuiTheme.fg)
                                        Text(device.kind).font(.caption).foregroundStyle(YuiTheme.muted)
                                    }
                                    Spacer()
                                    Circle()
                                        .fill((device.on ?? false) ? YuiTheme.primary : YuiTheme.muted.opacity(0.4))
                                        .frame(width: 12, height: 12)
                                }
                            }
                            .listRowBackground(YuiTheme.surface)
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(YuiTheme.bg)
            .navigationTitle("家")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await session.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(session.busy)
                }
            }
        }
    }
}
