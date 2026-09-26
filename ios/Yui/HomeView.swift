import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var selectedRoom = "すべて"
    @State private var selectedDevice: Device?
    @State private var showRooms = false

    private var devices: [Device] { session.home?.liveDevices ?? [] }
    private var rooms: [String] {
        let configured = session.home?.rooms ?? []
        let present = Set(devices.map(\.room))
        return ["すべて"] + configured.filter { present.contains($0) } + present.subtracting(configured).sorted()
    }
    private var visibleDevices: [Device] {
        guard let home = session.home else { return [] }
        if selectedRoom != "すべて" { return home.orderedDevices(in: selectedRoom) }
        return rooms.dropFirst().flatMap { home.orderedDevices(in: $0) }
    }
    private var visibleRooms: [String] {
        selectedRoom == "すべて" ? Array(rooms.dropFirst()) : [selectedRoom]
    }
    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case 5..<11: "おはよう"
        case 11..<18: "こんにちは"
        default: "こんばんは"
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header
                AtmosphereCard(climate: session.home?.climate, count: devices.filter(\.online).count)
                if let scenes = session.home?.scenes, !scenes.isEmpty { scenesSection(scenes) }
                devicesSection
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)
            .padding(.bottom, 36)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .refreshable { await session.refresh() }
        .sheet(item: $selectedDevice) { device in
            DeviceDetailView(initialDevice: device)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showRooms) {
            RoomManagementView().environmentObject(session).presentationDragIndicator(.visible)
        }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text("結  /  YUI")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .tracking(3.5)
                    .foregroundStyle(YuiTheme.accent)
                Text("\(greeting)、おかえり")
                    .font(.system(size: 28, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
            }
            Spacer()
            Button {
                Task { await session.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(YuiTheme.fg)
                    .frame(width: 44, height: 44)
                    .background(YuiTheme.surface, in: Circle())
            }
            .accessibilityLabel("家の状態を更新")
            .disabled(session.busy)
        }
    }

    private func scenesSection(_ scenes: [HomeScene]) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            sectionHeading("場面", subtitle: "ひと押しで、空気を変える")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(scenes.enumerated()), id: \.element.id) { index, scene in
                        Button {
                            Task { await session.runScene(scene) }
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: ["sun.max.fill", "moon.stars.fill", "sparkles", "leaf.fill", "drop.fill", "circle.grid.2x2.fill"][index % 6])
                                    .font(.system(size: 19))
                                    .frame(width: 34, height: 34)
                                Text(scene.name)
                                    .font(.system(size: 14, weight: .semibold))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(YuiTheme.fg)
                            .padding(.horizontal, 15)
                            .frame(height: 62)
                            .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
                            .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(YuiTheme.border, lineWidth: 1) }
                        }
                        .disabled(session.busy)
                    }
                }
            }
        }
    }

    private var devicesSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionHeading("デバイス", subtitle: "\(devices.count) 台の機器")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(rooms, id: \.self) { room in
                        Button {
                            withAnimation(.snappy(duration: 0.3)) { selectedRoom = room }
                        } label: {
                            Text(room)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(selectedRoom == room ? YuiTheme.bg : YuiTheme.muted)
                                .padding(.horizontal, 18)
                                .frame(height: 38)
                                .background(selectedRoom == room ? YuiTheme.accent : YuiTheme.surface, in: Capsule())
                        }
                    }
                    Button { showRooms = true } label: {
                        Label("場所を編集", systemImage: "slider.horizontal.3")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(YuiTheme.muted)
                            .padding(.horizontal, 15)
                            .frame(height: 38)
                            .background(YuiTheme.surface, in: Capsule())
                    }
                }
            }
            if let home = session.home {
                if visibleDevices.isEmpty {
                    ContentUnavailableView("機器がありません", systemImage: "house", description: Text("接続タブで家電サービスをつないでください"))
                        .frame(maxWidth: .infinity, minHeight: 180)
                } else {
                    LazyVStack(alignment: .leading, spacing: 24) {
                        ForEach(visibleRooms, id: \.self) { room in
                            VStack(alignment: .leading, spacing: 11) {
                                if selectedRoom == "すべて" {
                                    HStack(spacing: 12) {
                                        Text(room)
                                            .font(.system(size: 12, weight: .semibold))
                                            .tracking(0.7)
                                            .foregroundStyle(YuiTheme.muted)
                                        Rectangle()
                                            .fill(YuiTheme.border)
                                            .frame(height: 1)
                                    }
                                }
                                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                    ForEach(home.orderedDevices(in: room)) { device in
                                        DeviceTile(device: device, busy: session.busy) {
                                            selectedDevice = device
                                        } quickAct: {
                                            Task { await session.quickAct(device) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                ProgressView("家を読み込んでいます")
                    .tint(YuiTheme.accent)
                    .frame(maxWidth: .infinity, minHeight: 160)
            }
        }
    }

    private func sectionHeading(_ title: String, subtitle: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 21, weight: .semibold, design: .rounded)).foregroundStyle(YuiTheme.fg)
            Spacer()
            Text(subtitle).font(.system(size: 11)).foregroundStyle(YuiTheme.muted)
        }
    }
}

private struct AtmosphereCard: View {
    let climate: Climate?
    let count: Int
    @State private var breathing = false

    var body: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 30)
                .fill(LinearGradient(colors: [YuiTheme.heroTop, YuiTheme.heroBottom], startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle()
                .fill(YuiTheme.accent.opacity(0.44))
                .frame(width: 205, height: 205)
                .blur(radius: 50)
                .offset(x: breathing ? 240 : 155, y: breathing ? -65 : -10)
            Circle()
                .strokeBorder(YuiTheme.fg.opacity(0.13), lineWidth: 1)
                .frame(width: 210, height: 210)
                .offset(x: breathing ? 160 : 178, y: -55)
            Circle()
                .strokeBorder(YuiTheme.fg.opacity(0.1), lineWidth: 1)
                .frame(width: 148, height: 148)
                .offset(x: breathing ? 205 : 189, y: -26)
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    Circle().fill(YuiTheme.mint).frame(width: 6, height: 6)
                    Text("HOME ATMOSPHERE")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(2.2)
                }
                .foregroundStyle(YuiTheme.fg.opacity(0.72))
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    Text(context.date.formatted(.dateTime.hour().minute().locale(Locale(identifier: "ja_JP"))))
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(YuiTheme.fg.opacity(0.72))
                }
                Spacer()
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text(climate?.temperature.map { String(format: "%.1f", $0) } ?? "—")
                        .font(.system(size: 66, weight: .light, design: .rounded))
                        .monospacedDigit()
                        .contentTransition(.numericText())
                    Text("°").font(.system(size: 30, weight: .light))
                }
                .foregroundStyle(YuiTheme.fg)
                Text(climate?.label ?? "家の空気")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(YuiTheme.fg.opacity(0.75))
                Spacer().frame(height: 22)
                HStack(spacing: 18) {
                    if let humidity = climate?.humidity { Label("\(Int(humidity))%", systemImage: "humidity") }
                    if let lux = climate?.lux { Label("\(Int(lux)) lx", systemImage: "sun.max") }
                    Label("\(count) 台接続", systemImage: "point.3.connected.trianglepath.dotted")
                }
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(YuiTheme.fg.opacity(0.7))
            }
            .padding(25)
        }
        .frame(height: 264)
        .clipShape(RoundedRectangle(cornerRadius: 30))
        .overlay { RoundedRectangle(cornerRadius: 30).strokeBorder(YuiTheme.fg.opacity(0.11), lineWidth: 1) }
        .onAppear {
            withAnimation(.easeInOut(duration: 8).repeatForever(autoreverses: true)) { breathing = true }
        }
    }
}

private struct DeviceTile: View {
    let device: Device
    let busy: Bool
    let open: () -> Void
    let quickAct: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top) {
                Image(systemName: device.symbol)
                    .font(.system(size: 22, weight: .light))
                    .foregroundStyle(device.on == true ? YuiTheme.accent : YuiTheme.fg)
                    .frame(width: 46, height: 46)
                    .background(device.on == true ? YuiTheme.accent.opacity(0.14) : YuiTheme.surfaceRaised, in: RoundedRectangle(cornerRadius: 15))
                Spacer(minLength: 4)
                if device.canQuickAct {
                    Button(action: quickAct) {
                        Image(systemName: device.isMomentary ? "hand.tap" : "power")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(device.on == true ? YuiTheme.bg : YuiTheme.muted)
                            .frame(width: 36, height: 36)
                            .background(device.on == true ? YuiTheme.accent : YuiTheme.surfaceRaised, in: Circle())
                    }
                    .accessibilityLabel("\(device.name)を操作")
                    .disabled(busy)
                }
            }
            Spacer(minLength: 16)
            Text(device.room).font(.system(size: 10, weight: .semibold)).foregroundStyle(YuiTheme.muted).lineLimit(1)
            Text(device.name).font(.system(size: 16, weight: .semibold)).foregroundStyle(YuiTheme.fg).lineLimit(1).padding(.top, 4)
            Text(device.status)
                .font(.system(size: 11))
                .foregroundStyle(device.online ? YuiTheme.muted : YuiTheme.warning)
                .lineLimit(2)
                .padding(.top, 4)
            if let lan = device.lan, lan.error != nil || lan.recent {
                Text(lan.error == nil ? "LAN直結" : "LAN不可")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(lan.error == nil ? YuiTheme.mint : YuiTheme.warning)
                    .padding(.top, 5)
            }
        }
        .padding(15)
        .frame(maxWidth: .infinity, minHeight: 164, alignment: .leading)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 23))
        .overlay { RoundedRectangle(cornerRadius: 23).strokeBorder(device.on == true ? YuiTheme.accent.opacity(0.28) : YuiTheme.border, lineWidth: 1) }
        .contentShape(RoundedRectangle(cornerRadius: 23))
        .onTapGesture(perform: open)
        .accessibilityElement(children: .contain)
    }
}
