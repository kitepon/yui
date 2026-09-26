import SwiftUI

struct ScenesView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var editingScene: HomeScene?
    @State private var creatingScene = false

    private var scenes: [HomeScene] { session.home?.scenes ?? [] }
    private var automations: [HomeAutomation] { session.home?.automations ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 30) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("MOMENTS")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .tracking(3)
                        .foregroundStyle(YuiTheme.accent)
                    Text("暮らしの場面")
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .foregroundStyle(YuiTheme.fg)
                    Text("いつもの組み合わせを、ひと押しで")
                        .font(.system(size: 13))
                        .foregroundStyle(YuiTheme.muted)
                }

                VStack(spacing: 12) {
                    ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                        HStack(spacing: 8) {
                            Button {
                                Task { await session.runScene(scene) }
                            } label: {
                                HStack(spacing: 17) {
                                Image(systemName: ["sun.max.fill", "moon.stars.fill", "sparkles", "leaf.fill", "drop.fill", "circle.grid.2x2.fill"][index % 6])
                                    .font(.system(size: 25, weight: .light))
                                    .foregroundStyle(YuiTheme.accent)
                                    .frame(width: 58, height: 58)
                                    .background(YuiTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 19))
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(scene.name)
                                        .font(.system(size: 19, weight: .semibold, design: .rounded))
                                        .foregroundStyle(YuiTheme.fg)
                                    if let hint = scene.hint, !hint.isEmpty {
                                        Text(hint)
                                            .font(.system(size: 12))
                                            .foregroundStyle(YuiTheme.muted)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: session.home?.lastScene == scene.id ? "checkmark.circle.fill" : "arrow.up.right")
                                    .font(.system(size: 17))
                                    .foregroundStyle(YuiTheme.accent)
                                }
                                .frame(maxWidth: .infinity, minHeight: 59)
                            }
                            .buttonStyle(.plain)
                            .disabled(session.busy)
                            Button { editingScene = scene } label: {
                                Image(systemName: "pencil")
                                    .foregroundStyle(YuiTheme.muted)
                                    .frame(width: 38, height: 48)
                            }
                            .accessibilityLabel("\(scene.name)を編集")
                        }
                        .padding(16)
                        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 24))
                        .overlay { RoundedRectangle(cornerRadius: 24).strokeBorder(YuiTheme.border, lineWidth: 1) }
                    }
                    if scenes.isEmpty {
                        emptyCard("場面はまだありません", symbol: "square.stack.3d.up")
                    }
                    Button { creatingScene = true } label: {
                        Label("場面を作る", systemImage: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(YuiTheme.accent)
                            .frame(maxWidth: .infinity, minHeight: 49)
                            .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 16))
                    }
                }

                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("オートメーション")
                            .font(.system(size: 21, weight: .semibold, design: .rounded))
                            .foregroundStyle(YuiTheme.fg)
                        Spacer()
                        Text("\(automations.count) 件")
                            .font(.system(size: 11))
                            .foregroundStyle(YuiTheme.muted)
                    }
                    if automations.isEmpty {
                        emptyCard("自動化はまだありません", symbol: "timer")
                    }
                    ForEach(automations) { automation in
                        HStack(spacing: 14) {
                            Image(systemName: symbol(for: automation.trigger.type))
                                .font(.system(size: 19))
                                .foregroundStyle(automation.enabled ? YuiTheme.mint : YuiTheme.muted)
                                .frame(width: 43, height: 43)
                                .background(YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 14))
                            VStack(alignment: .leading, spacing: 4) {
                                Text(automation.name)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(YuiTheme.fg)
                                    .lineLimit(1)
                                Text("\(automation.trigger.summary) · \(automation.actions.count) 件の操作")
                                    .font(.system(size: 11))
                                    .foregroundStyle(YuiTheme.muted)
                            }
                            Spacer(minLength: 0)
                            Toggle(automation.name, isOn: Binding(
                                get: { session.home?.automations?.first { $0.id == automation.id }?.enabled ?? automation.enabled },
                                set: { _ in Task { await session.toggleAutomation(automation) } }
                            ))
                            .labelsHidden()
                            .tint(YuiTheme.accent)
                            .disabled(session.busy)
                        }
                        .padding(15)
                        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 21))
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)
            .padding(.bottom, 36)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .refreshable { await session.refresh() }
        .sheet(item: $editingScene) { scene in
            SceneEditorView(scene: scene).environmentObject(session).presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $creatingScene) {
            SceneEditorView(scene: nil).environmentObject(session).presentationDragIndicator(.visible)
        }
    }

    private func emptyCard(_ text: String, symbol: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 26))
            Text(text).font(.system(size: 13))
        }
        .foregroundStyle(YuiTheme.muted)
        .frame(maxWidth: .infinity, minHeight: 130)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 22))
    }

    private func symbol(for type: String) -> String {
        switch type {
        case "time": "clock"
        case "device": "power"
        case "scene": "square.stack.3d.up"
        case "sensor": "thermometer.medium"
        default: "timer"
        }
    }
}
