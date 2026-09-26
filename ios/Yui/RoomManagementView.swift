import SwiftUI

struct RoomManagementView: View {
    @EnvironmentObject private var session: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var newRoom = ""
    @State private var renamingRoom: String?
    @State private var newName = ""
    @State private var removingRoom: String?

    private var rooms: [String] { session.home?.rooms ?? [] }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("PLACES")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .tracking(3)
                            .foregroundStyle(YuiTheme.accent)
                        Text("場所を整える")
                            .font(.system(size: 28, weight: .semibold, design: .rounded))
                            .foregroundStyle(YuiTheme.fg)
                    }
                    Spacer()
                    Button("閉じる") { dismiss() }
                        .foregroundStyle(YuiTheme.accent)
                }

                HStack(spacing: 10) {
                    TextField("新しい場所の名前", text: $newRoom)
                        .padding(.horizontal, 14)
                        .frame(height: 49)
                        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(YuiTheme.fg)
                    Button {
                        let name = newRoom.trimmingCharacters(in: .whitespacesAndNewlines)
                        Task {
                            await session.roomAction("room-add", fields: ["name": name])
                            if session.error == nil { newRoom = "" }
                        }
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(YuiTheme.bg)
                            .frame(width: 49, height: 49)
                            .background(YuiTheme.accent, in: RoundedRectangle(cornerRadius: 14))
                    }
                    .disabled(session.busy || newRoom.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityLabel("場所を追加")
                }

                ForEach(Array(rooms.enumerated()), id: \.element) { roomIndex, room in
                    VStack(spacing: 12) {
                    HStack(spacing: 13) {
                        reorderButtons(target: "room", id: room, index: roomIndex, count: rooms.count)
                        Image(systemName: "door.left.hand.closed")
                            .font(.system(size: 19))
                            .foregroundStyle(YuiTheme.accent)
                            .frame(width: 42, height: 42)
                            .background(YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 4) {
                            Text(room)
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(YuiTheme.fg)
                            Text("\(session.home?.devices.filter { $0.room == room }.count ?? 0) 台の機器")
                                .font(.system(size: 11))
                                .foregroundStyle(YuiTheme.muted)
                        }
                        Spacer()
                        Button {
                            newName = room
                            renamingRoom = room
                        } label: {
                            Image(systemName: "pencil")
                                .frame(width: 37, height: 37)
                        }
                        .accessibilityLabel("\(room)の名前を変更")
                        Button(role: .destructive) { removingRoom = room } label: {
                            Image(systemName: "trash")
                                .frame(width: 37, height: 37)
                        }
                        .accessibilityLabel("\(room)を削除")
                        .disabled(rooms.count <= 1)
                    }
                    .font(.system(size: 14))
                    .foregroundStyle(YuiTheme.muted)
                    ForEach(Array((session.home?.orderedDevices(in: room) ?? []).enumerated()), id: \.element.id) { index, device in
                        HStack(spacing: 8) {
                            reorderButtons(target: "device", id: device.id, index: index,
                                           count: session.home?.orderedDevices(in: room).count ?? 0)
                            Image(systemName: device.symbol)
                                .foregroundStyle(YuiTheme.accent)
                                .frame(width: 28)
                            Text(device.name)
                                .font(.system(size: 13))
                                .foregroundStyle(YuiTheme.fg)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            Menu {
                                ForEach(rooms.filter { $0 != room }, id: \.self) { destination in
                                    Button(destination) {
                                        Task { await session.updateDeviceMeta(device, name: device.name, room: destination) }
                                    }
                                }
                            } label: {
                                Image(systemName: "arrow.right")
                                    .foregroundStyle(YuiTheme.muted)
                                    .frame(width: 38, height: 38)
                            }
                            .accessibilityLabel("\(device.name)を別の場所へ移す")
                        }
                    }
                    }
                    .padding(14)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                }
            }
            .padding(22)
            .padding(.top, 14)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .alert("場所の名前", isPresented: Binding(
            get: { renamingRoom != nil },
            set: { if !$0 { renamingRoom = nil } }
        )) {
            TextField("新しい名前", text: $newName)
            Button("保存") {
                guard let from = renamingRoom else { return }
                Task { await session.roomAction("room-rename", fields: ["from": from, "to": newName]) }
                renamingRoom = nil
            }
            Button("キャンセル", role: .cancel) { renamingRoom = nil }
        } message: {
            Text("機器の場所も一緒に変更します")
        }
        .confirmationDialog("場所を削除", isPresented: Binding(
            get: { removingRoom != nil },
            set: { if !$0 { removingRoom = nil } }
        )) {
            Button("削除して機器を別の場所へ移す", role: .destructive) {
                guard let from = removingRoom else { return }
                Task { await session.roomAction("room-remove", fields: ["from": from]) }
                removingRoom = nil
            }
        } message: {
            Text("この場所の機器は、一覧の最初の別の場所へ移ります")
        }
    }

    private func reorderButtons(target: String, id: String, index: Int, count: Int) -> some View {
        VStack(spacing: 0) {
            Button {
                Task { await session.reorder(target, id: id, direction: -1) }
            } label: {
                Image(systemName: "chevron.up").frame(width: 32, height: 27)
            }
            .disabled(index == 0 || session.busy)
            Button {
                Task { await session.reorder(target, id: id, direction: 1) }
            } label: {
                Image(systemName: "chevron.down").frame(width: 32, height: 27)
            }
            .disabled(index >= count - 1 || session.busy)
        }
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(YuiTheme.accent)
    }
}
