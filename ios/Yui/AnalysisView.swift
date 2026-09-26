import SwiftUI

struct AnalysisView: View {
    @EnvironmentObject private var session: SessionStore
    @AppStorage("analysis.rangeDays") private var rangeDays = 1
    @AppStorage("analysis.hasSelection") private var hasSavedSelection = false
    @AppStorage("analysis.parameters") private var savedParameterIDs = ""
    @AppStorage("analysis.automations") private var savedAutomationIDs = ""
    @AppStorage("analysis.devices") private var savedDeviceIDs = ""
    @State private var selectedParameterIDs = Set<String>()
    @State private var selectedAutomationIDs = Set<String>()
    @State private var selectedDeviceIDs = Set<String>()
    @State private var plotByID = [String: [AnalysisPlotPoint]]()
    @State private var timeStart = 0.0
    @State private var timeEnd = 1.0
    @State private var selectionLoaded = false

    private let units = ["celsius", "percent", "lux", "on"]
    private let colors: [Color] = [YuiTheme.accent, YuiTheme.mint, .cyan, .pink, .orange, .purple, .yellow]

    private var numericSeries: [AnalysisSeries] {
        (session.analysis?.series ?? [])
            .filter { $0.unit != "on" }
            .sorted { priority($0.label) == priority($1.label) ? $0.label < $1.label : priority($0.label) < priority($1.label) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 23) {
                header
                HStack(spacing: 8) {
                    rangeButton(1, "24時間")
                    rangeButton(7, "7日間")
                    rangeButton(14, "14日間")
                }

                if let error = session.analysisError {
                    errorCard(error)
                } else if let analysis = session.analysis {
                    selectionSection("パラメータ", isEmpty: numericSeries.isEmpty, empty: "まだ数値がありません") {
                        ForEach(numericSeries) { series in
                            chip(series.label, selected: selectedParameterIDs.contains(series.id)) {
                                toggle(&selectedParameterIDs, id: series.id)
                                savedParameterIDs = selectedParameterIDs.sorted().joined(separator: "\n")
                                hasSavedSelection = true
                            }
                        }
                    }
                    selectionSection("オートメーション", isEmpty: analysis.automations.isEmpty, empty: "まだありません") {
                        ForEach(analysis.automations) { item in
                            chip(item.name, selected: selectedAutomationIDs.contains(item.id)) {
                                toggle(&selectedAutomationIDs, id: item.id)
                                savedAutomationIDs = selectedAutomationIDs.sorted().joined(separator: "\n")
                            }
                        }
                    }
                    selectionSection("機器の入切", isEmpty: analysis.devices.isEmpty, empty: "まだありません") {
                        ForEach(analysis.devices) { item in
                            chip(item.name, selected: selectedDeviceIDs.contains(item.id)) {
                                toggle(&selectedDeviceIDs, id: item.id)
                                savedDeviceIDs = selectedDeviceIDs.sorted().joined(separator: "\n")
                            }
                        }
                    }

                    if let from = AnalysisDate.formatter.date(from: analysis.from),
                       let to = AnalysisDate.formatter.date(from: analysis.to), from < to {
                        chartSection(analysis, from: from, to: to)
                    }
                    eventSection(analysis.events)
                } else {
                    ProgressView("記録を読み込んでいます")
                        .tint(YuiTheme.accent)
                        .frame(maxWidth: .infinity, minHeight: 260)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 20)
            .padding(.bottom, 36)
        }
        .background(YuiTheme.bg.ignoresSafeArea())
        .refreshable { await reload() }
        .task(id: rangeDays) {
            #if DEBUG
            if session.token == "visual-preview" {
                if let analysis = session.analysis { prepare(analysis) }
                return
            }
            #endif
            await reload()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("INSIGHTS")
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .tracking(3)
                .foregroundStyle(YuiTheme.accent)
            Text("家の記録")
                .font(.system(size: 30, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            Text("センサーの変化と、動いた・動かさなかった記録")
                .font(.system(size: 13))
                .foregroundStyle(YuiTheme.muted)
        }
    }

    private func rangeButton(_ days: Int, _ title: String) -> some View {
        Button { rangeDays = days } label: {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(rangeDays == days ? YuiTheme.bg : YuiTheme.muted)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(rangeDays == days ? YuiTheme.accent : YuiTheme.surface, in: Capsule())
        }
    }

    private func selectionSection<Content: View>(
        _ title: String, isEmpty: Bool, empty: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(YuiTheme.muted)
            if isEmpty {
                Text(empty).font(.system(size: 13)).foregroundStyle(YuiTheme.muted)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8, content: content)
                }
            }
        }
    }

    private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .foregroundStyle(selected ? YuiTheme.bg : YuiTheme.fg)
                .padding(.horizontal, 14)
                .frame(height: 38)
                .background(selected ? YuiTheme.accent : YuiTheme.surface, in: Capsule())
        }
    }

    private func chartSection(_ analysis: AnalysisData, from: Date, to: Date) -> some View {
        let selected = analysis.series.filter {
            $0.unit == "on" ? selectedDeviceIDs.contains($0.deviceId) : selectedParameterIDs.contains($0.id)
        }
        let overlays = analysis.events.filter {
            guard let id = $0.automationId else { return false }
            return selectedAutomationIDs.contains(id) && ($0.outcome == "sent" || $0.outcome == "failed")
        }
        return VStack(alignment: .leading, spacing: 15) {
            if selected.isEmpty {
                ContentUnavailableView("表示する項目を選んでください", systemImage: "chart.xyaxis.line")
                    .frame(maxWidth: .infinity, minHeight: 210)
            } else {
                timeControls(from: from, to: to)
                ForEach(units, id: \.self) { unit in
                    let grouped = selected.filter { $0.unit == unit }
                    if !grouped.isEmpty {
                        AnalysisChartCard(
                            title: unitTitle(unit), unit: unit,
                            lines: grouped.enumerated().map { index, series in
                                AnalysisChartLine(
                                    id: series.id, label: series.label, unit: series.unit,
                                    color: colors[index % colors.count], points: plotByID[series.id] ?? []
                                )
                            },
                            events: overlays, from: from, to: to,
                            timeStart: timeStart, timeEnd: timeEnd
                        )
                    }
                }
            }
        }
    }

    private func timeControls(from: Date, to: Date) -> some View {
        let duration = to.timeIntervalSince(from)
        let gap = min(1, 3600 / duration)
        let first = from.addingTimeInterval(duration * timeStart)
        let last = from.addingTimeInterval(duration * timeEnd)
        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("表示する時間")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(YuiTheme.fg)
                Spacer()
                Button("全期間") { timeStart = 0; timeEnd = 1 }
                    .font(.system(size: 11))
                    .foregroundStyle(YuiTheme.accent)
            }
            Text("\(first.formatted(.dateTime.month().day().hour().minute().locale(Locale(identifier: "ja_JP")))) 〜 \(last.formatted(.dateTime.month().day().hour().minute().locale(Locale(identifier: "ja_JP"))))")
                .font(.system(size: 11))
                .monospacedDigit()
                .foregroundStyle(YuiTheme.muted)
            Slider(value: $timeStart, in: 0...max(0, timeEnd - gap))
                .tint(YuiTheme.accent)
                .accessibilityLabel("時間の開始")
            Slider(value: $timeEnd, in: min(1, timeStart + gap)...1)
                .tint(YuiTheme.accent)
                .accessibilityLabel("時間の終了")
        }
        .padding(17)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func eventSection(_ events: [AnalysisEvent]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("操作の記録")
                    .font(.system(size: 21, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Spacer()
                Text("\(events.count) 件")
                    .font(.system(size: 11))
                    .foregroundStyle(YuiTheme.muted)
            }
            if events.isEmpty {
                Text("この期間の操作記録はありません")
                    .font(.system(size: 13))
                    .foregroundStyle(YuiTheme.muted)
            }
            LazyVStack(spacing: 8) {
                ForEach(events) { event in
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: event.outcome == "sent" ? "checkmark" : "exclamationmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(event.outcome == "sent" ? YuiTheme.mint : YuiTheme.warning)
                            .frame(width: 30, height: 30)
                            .background(YuiTheme.surfaceRaised, in: Circle())
                        VStack(alignment: .leading, spacing: 4) {
                            if let date = event.date {
                                Text(date.formatted(.dateTime.month().day().hour().minute().second().locale(Locale(identifier: "ja_JP"))))
                                    .font(.system(size: 10))
                                    .foregroundStyle(YuiTheme.muted)
                            }
                            Text(eventTitle(event))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(YuiTheme.fg)
                            if let reason = reasonText(event), !reason.isEmpty {
                                Text(reason)
                                    .font(.system(size: 11))
                                    .foregroundStyle(YuiTheme.muted)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(14)
                    .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 17))
                }
            }
        }
    }

    private func errorCard(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message).font(.system(size: 13)).foregroundStyle(YuiTheme.warning)
            Button("もう一度読み込む") { Task { await reload() } }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(YuiTheme.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 20))
    }

    private func eventTitle(_ event: AnalysisEvent) -> String {
        let outcome = ["sent": "送った", "failed": "送れなかった", "skipped": "動かさなかった", "left": "条件を外れた"][event.outcome] ?? event.outcome
        return ([outcome, event.automationName, event.deviceName] as [String?])
            .compactMap { $0 }.joined(separator: " · ")
    }

    private func reasonText(_ event: AnalysisEvent) -> String? {
        let labels = [
            "skip_continuous": "連続では動かさない",
            "claimed_by": "上のオートメーションが機器を取った",
            "already_applied": "いまの設定と同じ",
            "unreadable": "設定を読み返せない",
        ]
        if let reason = event.reason { return labels[reason] ?? reason }
        return event.detail
    }

    private func unitTitle(_ unit: String) -> String {
        switch unit {
        case "celsius": "温度"
        case "percent": "湿度・割合"
        case "lux": "照度"
        case "on": "機器の入切"
        default: "記録"
        }
    }

    private func priority(_ label: String) -> Int {
        ["室温", "外気温", "湿度", "水温"].firstIndex { label == $0 || label.hasSuffix(" \($0)") } ?? 4
    }

    private func toggle(_ set: inout Set<String>, id: String) {
        if set.contains(id) { set.remove(id) } else { set.insert(id) }
    }

    private func reload() async {
        await session.loadAnalysis(days: rangeDays)
        if let analysis = session.analysis { prepare(analysis) }
    }

    private func prepare(_ analysis: AnalysisData) {
        if !selectionLoaded {
            selectedParameterIDs = Set(savedParameterIDs.split(separator: "\n").map(String.init))
            selectedAutomationIDs = Set(savedAutomationIDs.split(separator: "\n").map(String.init))
            selectedDeviceIDs = Set(savedDeviceIDs.split(separator: "\n").map(String.init))
            selectionLoaded = true
        }
        let availableParameters = Set(analysis.series.filter { $0.unit != "on" }.map(\.id))
        selectedParameterIDs.formIntersection(availableParameters)
        if !hasSavedSelection {
            let preferred = numericSeries.filter { priority($0.label) < 4 }.map(\.id)
            selectedParameterIDs = Set(preferred.isEmpty ? Array(numericSeries.prefix(4).map(\.id)) : preferred)
        }
        selectedDeviceIDs.formIntersection(Set(analysis.devices.map(\.id)))
        selectedAutomationIDs.formIntersection(Set(analysis.automations.map(\.id)))
        var dates: [String: Date] = [:]
        plotByID = Dictionary(uniqueKeysWithValues: analysis.series.map {
            ($0.id, AnalysisPlot.points($0.points, limit: 120, dates: &dates))
        })
        timeStart = 0
        timeEnd = 1
    }
}
