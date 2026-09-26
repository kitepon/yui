import Charts
import SwiftUI

struct AnalysisView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var rangeDays = 1
    @State private var selectedSeriesId: String?

    private var selectedSeries: AnalysisSeries? {
        let series = session.analysis?.series ?? []
        return series.first { $0.id == selectedSeriesId } ?? series.first { $0.unit != "on" } ?? series.first
    }

    private var chartPoints: [(Date, Double)] {
        selectedSeries?.points.compactMap { point in
            point.date.map { ($0, point.value) }
        } ?? []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("INSIGHTS")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .tracking(3)
                        .foregroundStyle(YuiTheme.accent)
                    Text("家の記録")
                        .font(.system(size: 30, weight: .semibold, design: .rounded))
                        .foregroundStyle(YuiTheme.fg)
                    Text("温度の変化と機器の動きを確かめる")
                        .font(.system(size: 13))
                        .foregroundStyle(YuiTheme.muted)
                }

                HStack(spacing: 8) {
                    rangeButton(1, "24時間")
                    rangeButton(7, "7日間")
                    rangeButton(14, "14日間")
                }

                if let analysis = session.analysis {
                    if analysis.series.isEmpty {
                        ContentUnavailableView("まだ計測記録がありません", systemImage: "chart.xyaxis.line")
                            .frame(maxWidth: .infinity, minHeight: 240)
                    } else {
                        chartCard
                        seriesPicker(analysis.series)
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
        .refreshable { await session.loadAnalysis(days: rangeDays) }
        .task(id: rangeDays) { await session.loadAnalysis(days: rangeDays) }
    }

    private func rangeButton(_ days: Int, _ title: String) -> some View {
        Button {
            rangeDays = days
        } label: {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(rangeDays == days ? YuiTheme.bg : YuiTheme.muted)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(rangeDays == days ? YuiTheme.accent : YuiTheme.surface, in: Capsule())
        }
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: 17) {
            Text(selectedSeries?.label ?? "記録")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            if let latest = chartPoints.last?.1 {
                Text(valueLabel(latest, unit: selectedSeries?.unit ?? ""))
                    .font(.system(size: 35, weight: .light, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(YuiTheme.accent)
            }
            if chartPoints.isEmpty {
                Text("この期間の記録はありません")
                    .foregroundStyle(YuiTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 190)
            } else {
                Chart(chartPoints.indices, id: \.self) { index in
                    AreaMark(
                        x: .value("時刻", chartPoints[index].0),
                        y: .value("値", chartPoints[index].1)
                    )
                    .foregroundStyle(LinearGradient(colors: [YuiTheme.accent.opacity(0.26), .clear], startPoint: .top, endPoint: .bottom))
                    LineMark(
                        x: .value("時刻", chartPoints[index].0),
                        y: .value("値", chartPoints[index].1)
                    )
                    .interpolationMethod(.catmullRom)
                    .lineStyle(StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .foregroundStyle(YuiTheme.accent)
                }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) { _ in AxisGridLine().foregroundStyle(YuiTheme.border); AxisValueLabel() } }
                .chartYAxis { AxisMarks(position: .leading) { _ in AxisGridLine().foregroundStyle(YuiTheme.border); AxisValueLabel() } }
                .frame(height: 205)
            }
        }
        .padding(20)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 25))
    }

    private func seriesPicker(_ series: [AnalysisSeries]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(series) { item in
                    Button {
                        selectedSeriesId = item.id
                    } label: {
                        Text(item.label)
                            .font(.system(size: 12, weight: .medium))
                            .lineLimit(1)
                            .foregroundStyle(selectedSeries?.id == item.id ? YuiTheme.bg : YuiTheme.fg)
                            .padding(.horizontal, 15)
                            .frame(height: 38)
                            .background(selectedSeries?.id == item.id ? YuiTheme.accent : YuiTheme.surface, in: Capsule())
                    }
                }
            }
        }
    }

    private func eventSection(_ events: [AnalysisEvent]) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("最近の動き")
                .font(.system(size: 21, weight: .semibold, design: .rounded))
                .foregroundStyle(YuiTheme.fg)
            if events.isEmpty {
                Text("この期間の操作記録はありません")
                    .font(.system(size: 13))
                    .foregroundStyle(YuiTheme.muted)
            }
            ForEach(events.prefix(30)) { event in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: event.outcome == "sent" ? "checkmark" : "exclamationmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(event.outcome == "sent" ? YuiTheme.mint : YuiTheme.warning)
                        .frame(width: 30, height: 30)
                        .background(YuiTheme.surfaceRaised, in: Circle())
                    VStack(alignment: .leading, spacing: 4) {
                        Text(event.deviceName ?? event.automationName ?? "家の操作")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(YuiTheme.fg)
                        Text(event.detail ?? event.reason ?? event.outcome)
                            .font(.system(size: 11))
                            .foregroundStyle(YuiTheme.muted)
                    }
                    Spacer()
                    if let date = event.date {
                        Text(date.formatted(.dateTime.month().day().hour().minute()))
                            .font(.system(size: 10))
                            .foregroundStyle(YuiTheme.muted)
                    }
                }
                .padding(14)
                .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 17))
            }
        }
    }

    private func valueLabel(_ value: Double, unit: String) -> String {
        switch unit {
        case "celsius": String(format: "%.1f°", value)
        case "percent": "\(Int(value))%"
        case "lux": "\(Int(value)) lx"
        default: String(format: "%.1f", value)
        }
    }
}
