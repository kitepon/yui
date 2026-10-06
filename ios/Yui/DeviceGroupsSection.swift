import SwiftUI

struct DeviceGroupsSection: View {
    @EnvironmentObject private var session: SessionStore
    @State private var editor: Editor?

    private enum Editor: Identifiable {
        case create
        case edit(HomeDeviceGroup)

        var id: String {
            switch self {
            case .create: "create"
            case .edit(let group): group.id
            }
        }
        var group: HomeDeviceGroup? {
            switch self {
            case .create: nil
            case .edit(let group): group
            }
        }
    }

    private var groups: [HomeDeviceGroup] { session.home?.deviceGroups ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text("機器グループ")
                    .font(.system(size: 21, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Spacer()
                Text("\(groups.count) 件").font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
            }
            Text("入と切が別々の機器をまとめて、連続する自動操作を止めます")
                .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
            ForEach(groups) { group in
                Button {
                    session.error = nil
                    editor = .edit(group)
                } label: {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(group.name).font(.system(size: 17, weight: .semibold))
                            Spacer()
                            Image(systemName: "pencil").foregroundStyle(YuiTheme.accent)
                        }
                        Text(group.deviceIds.map { id in
                            session.home?.devices.first { $0.id == id }?.name ?? "見つからない機器"
                        }.joined(separator: "、"))
                        .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
                        Text("連続操作を止める時間：\(group.lockMinutes)分")
                            .font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            if let state = session.home?.deviceGroupStates?[group.id],
                               let until = state.lockedUntil(for: group, now: context.date) {
                                Text("自動操作を\(until.formatted(date: .omitted, time: .shortened))まで停止\(state.pending == nil ? "" : " · 自動操作が待機中")")
                                    .font(.system(size: 12)).foregroundStyle(YuiTheme.warning)
                            }
                        }
                    }
                    .foregroundStyle(YuiTheme.fg)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 21))
                }
                .buttonStyle(.plain)
                .disabled(session.busy)
                .accessibilityLabel("\(group.name)を編集")
            }
            if groups.isEmpty {
                Text("機器グループはまだありません")
                    .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
            }
            Button {
                session.error = nil
                editor = .create
            } label: {
                Label("機器グループを作る", systemImage: "plus")
                    .font(.system(size: 14, weight: .semibold)).foregroundStyle(YuiTheme.accent)
                    .frame(maxWidth: .infinity, minHeight: 49)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 16))
            }
            .disabled(session.busy)
            .accessibilityIdentifier("device-group-create")
        }
        .sheet(item: $editor) { destination in
            DeviceGroupEditorView(group: destination.group)
                .environmentObject(session)
                .presentationDragIndicator(.visible)
        }
    }
}
