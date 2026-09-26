import SwiftUI

struct SceneEditorView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    let scene: HomeScene?
    @State private var name: String
    @State private var hint: String
    @State private var steps: [DeviceActionDraft]
    @State private var confirmRemove = false

    init(scene: HomeScene?) {
        self.scene = scene
        _name = State(initialValue: scene?.name ?? "")
        _hint = State(initialValue: scene?.hint ?? "")
        _steps = State(initialValue: (scene?.steps ?? []).map(DeviceActionDraft.init(sceneStep:)))
    }

    private var devices: [Device] {
        (session.home?.liveDevices ?? []).filter { $0.kind != "sensor" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("MOMENT EDITOR")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .tracking(3)
                            .foregroundStyle(YuiTheme.accent)
                        Text(scene == nil ? "場面を作る" : "場面を編集")
                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                            .foregroundStyle(YuiTheme.fg)
                    }
                    Spacer()
                    Button("閉じる") { dismiss() }.foregroundStyle(YuiTheme.accent)
                }

                VStack(alignment: .leading, spacing: 12) {
                    TextField("場面の名前", text: $name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(YuiTheme.fg)
                    TextField("ひとこと説明", text: $hint)
                        .font(.system(size: 13))
                        .foregroundStyle(YuiTheme.fg)
                }
                .padding(18)
                .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 21))

                VStack(alignment: .leading, spacing: 13) {
                    Text("機器の操作")
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .foregroundStyle(YuiTheme.fg)

                    ForEach($steps) { $step in
                        VStack(alignment: .trailing, spacing: 6) {
                            Button(role: .destructive) { steps.removeAll { $0.id == step.id } } label: {
                                Label("操作を削除", systemImage: "trash")
                                    .font(.system(size: 12))
                                    .foregroundStyle(YuiTheme.warning)
                            }
                            DeviceActionEditor(draft: $step, devices: devices, isAutomation: false)
                        }
                    }
                    Button {
                        if let device = devices.first { steps.append(DeviceActionDraft(device: device)) }
                    } label: {
                        Label("操作を追加", systemImage: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(YuiTheme.accent)
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(devices.isEmpty)
                    if devices.isEmpty {
                        Text("機器を接続すると場面を作れます")
                            .font(.system(size: 12))
                            .foregroundStyle(YuiTheme.muted)
                    }
                }

                Button {
                    let payload = steps.map { $0.sceneDictionary() }
                    Task {
                        if await session.saveScene(scene, name: name, hint: hint, steps: payload) { dismiss() }
                    }
                } label: {
                    Text("場面を保存")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(YuiTheme.bg)
                        .frame(maxWidth: .infinity, minHeight: 55)
                        .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 17))
                }
                .disabled(session.busy || name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if scene != nil {
                    Button(role: .destructive) { confirmRemove = true } label: {
                        Label("この場面を削除", systemImage: "trash")
                            .font(.system(size: 13))
                            .foregroundStyle(YuiTheme.warning)
                            .frame(maxWidth: .infinity, minHeight: 45)
                    }
                }
            }
            .padding(22)
            .padding(.top, 14)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .confirmationDialog("場面を削除しますか", isPresented: $confirmRemove) {
            Button("削除", role: .destructive) {
                guard let scene else { return }
                Task { if await session.removeScene(scene) { dismiss() } }
            }
        }
    }

}
