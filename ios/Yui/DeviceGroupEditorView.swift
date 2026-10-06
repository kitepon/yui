import SwiftUI

struct DeviceGroupEditorView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    let group: HomeDeviceGroup?
    @State private var draft: DeviceGroupDraft
    @State private var confirmRemove = false

    init(group: HomeDeviceGroup?) {
        self.group = group
        _draft = State(initialValue: DeviceGroupDraft(group: group))
    }

    private var devices: [Device] { (session.home?.liveDevices ?? []).filter { $0.kind != "sensor" } }
    private var missing: [String] { draft.deviceIds.filter { id in !devices.contains { $0.id == id } } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HStack {
                    Text(group == nil ? "機器グループを作る" : "機器グループを編集")
                        .font(.system(size: 26, weight: .semibold, design: .rounded))
                        .foregroundStyle(YuiTheme.fg)
                    Spacer()
                    Button("閉じる") { dismiss() }.foregroundStyle(YuiTheme.accent)
                        .disabled(session.busy)
                }
                VStack(alignment: .leading, spacing: 16) {
                    TextField("グループの名前（例：換気扇）", text: $draft.name)
                        .font(.system(size: 17, weight: .semibold))
                        .accessibilityIdentifier("device-group-name")
                    HStack {
                        Text("連続操作を止める時間")
                        Spacer()
                        TextField("10", text: $draft.lockMinutes)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 65)
                            .accessibilityLabel("連続操作を止める時間（分）")
                            .accessibilityIdentifier("device-group-minutes")
                        Text("分")
                    }
                    .font(.system(size: 14))
                    Text("1〜1440分で設定できます")
                        .font(.system(size: 12)).foregroundStyle(draft.minutes == nil ? YuiTheme.warning : YuiTheme.muted)
                }
                .foregroundStyle(YuiTheme.fg)
                .padding(18)
                .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 21))

                VStack(alignment: .leading, spacing: 10) {
                    Text("まとめる機器").font(.system(size: 20, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    ForEach(devices) { device in
                        deviceChoice(id: device.id, name: device.name, detail: otherGroup(device.id).map { "「\($0.name)」に入っています" } ?? device.room,
                                     unavailable: otherGroup(device.id) != nil)
                    }
                    ForEach(missing, id: \.self) { id in
                        deviceChoice(id: id, name: "見つからない機器", detail: "\(id) · 選択を外すまで設定に残ります", unavailable: false)
                    }
                    if devices.isEmpty && missing.isEmpty {
                        Text("機器を接続すると選べます").font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
                    }
                    if draft.deviceIds.isEmpty {
                        Text("機器を1つ以上選んでください").font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                    }
                }
                Text("グループのどれかを動かすと、設定した時間は自動操作を止めます。手操作・場面・Alexaは使えますが、停止時間を数え直します。止めた最後の操作は、時間が明けても条件が成立していれば送られます。")
                    .font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
                if let error = session.error {
                    Text(error).font(.system(size: 13)).foregroundStyle(YuiTheme.warning)
                        .accessibilityIdentifier("device-group-error")
                }
                Button {
                    Task { if await session.saveDeviceGroup(group, draft: draft) { dismiss() } }
                } label: {
                    Text(session.busy ? "保存中…" : "機器グループを保存")
                        .font(.system(size: 16, weight: .semibold)).foregroundStyle(YuiTheme.bg)
                        .frame(maxWidth: .infinity, minHeight: 55)
                        .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                }
                .disabled(!draft.canSave || session.busy)
                .accessibilityIdentifier("device-group-save")
                if group != nil {
                    Button(role: .destructive) { confirmRemove = true } label: {
                        Label("この機器グループを削除", systemImage: "trash")
                            .font(.system(size: 13)).foregroundStyle(YuiTheme.warning)
                            .frame(maxWidth: .infinity, minHeight: 45)
                    }
                    .disabled(session.busy)
                }
            }
            .padding(22)
            .frame(maxWidth: 680)
            .frame(maxWidth: .infinity)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .interactiveDismissDisabled(session.busy)
        .confirmationDialog("機器グループを削除しますか", isPresented: $confirmRemove) {
            Button("削除", role: .destructive) {
                guard let group else { return }
                Task { if await session.removeDeviceGroup(group) { dismiss() } }
            }
        } message: {
            Text("グループの設定と待機中の自動操作を削除します。機器は削除されません。")
        }
    }

    private func otherGroup(_ deviceId: String) -> HomeDeviceGroup? {
        session.home?.deviceGroups?.first { $0.id != group?.id && $0.deviceIds.contains(deviceId) }
    }

    private func deviceChoice(id: String, name: String, detail: String, unavailable: Bool) -> some View {
        let selected = draft.deviceIds.contains(id)
        return Button { draft.toggle(id) } label: {
            HStack(spacing: 12) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? YuiTheme.accent : YuiTheme.muted)
                VStack(alignment: .leading, spacing: 4) {
                    Text(name).font(.system(size: 15, weight: .semibold)).foregroundStyle(YuiTheme.fg)
                    Text(detail).font(.system(size: 12)).foregroundStyle(YuiTheme.muted)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(12)
            .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
            .opacity(unavailable ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(unavailable || session.busy)
        .accessibilityLabel("\(name)、\(selected ? "選択中" : "未選択")、\(detail)")
        .accessibilityIdentifier("device-group-device-\(id)")
    }
}
