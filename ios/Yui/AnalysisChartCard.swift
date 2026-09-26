import Charts
import SwiftUI

struct AnalysisChartLine: Identifiable {
    let id: String
    let label: String
    let unit: String
    let color: Color
    let points: [AnalysisPlotPoint]
}

struct AnalysisChartCard: View {
    let title: String
    let unit: String
    let lines: [AnalysisChartLine]
    let events: [AnalysisEvent]
    let from: Date
    let to: Date
    let timeStart: Double
    let timeEnd: Double

    @State private var yStart = 0.0
    @State private var yEnd = 1.0
    @State private var selectedTime: Date?

    private var fullYRange: ClosedRange<Double> {
        if unit == "on" { return -0.1...1.1 }
        let values = lines.flatMap { $0.points.map(\.value) }
        let low = values.min() ?? 0
        let high = values.max() ?? 1
        let padding = max((high - low) * 0.08, unit == "celsius" ? 0.5 : 1)
        return (low - padding)...(high + padding)
    }

    private var visibleYRange: ClosedRange<Double> {
        let full = fullYRange
        let span = full.upperBound - full.lowerBound
        return (full.lowerBound + span * yStart)...(full.lowerBound + span * yEnd)
    }

    private var visibleTimeRange: ClosedRange<Date> {
        let duration = to.timeIntervalSince(from)
        return from.addingTimeInterval(duration * timeStart)...from.addingTimeInterval(duration * timeEnd)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .foregroundStyle(YuiTheme.fg)
                Spacer()
                if let value = lines.first?.points.last?.value {
                    Text(valueLabel(value))
                        .font(.system(size: 19, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(lines.first?.color ?? YuiTheme.accent)
                }
            }

            if lines.allSatisfy({ $0.points.isEmpty }) {
                Text("この期間の記録はありません")
                    .font(.system(size: 13))
                    .foregroundStyle(YuiTheme.muted)
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                Chart {
                    ForEach(lines) { line in
                        ForEach(line.points) { point in
                            LineMark(
                                x: .value("時刻", point.time),
                                y: .value("値", point.value),
                                series: .value("項目", line.id)
                            )
                            .interpolationMethod(line.unit == "on" ? .stepEnd : .catmullRom)
                            .lineStyle(StrokeStyle(lineWidth: line.unit == "on" ? 1.8 : 2.4, lineCap: .round))
                            .foregroundStyle(line.color)
                        }
                    }
                    ForEach(events) { event in
                        if let date = event.date {
                            RuleMark(x: .value("実行", date))
                                .foregroundStyle(event.outcome == "failed" ? YuiTheme.warning.opacity(0.8) : YuiTheme.accent.opacity(0.4))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: event.outcome == "failed" ? [3, 3] : []))
                        }
                    }
                }
                .chartXScale(domain: visibleTimeRange)
                .chartYScale(domain: visibleYRange)
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 3)) { _ in
                    AxisGridLine().foregroundStyle(YuiTheme.border)
                    AxisValueLabel()
                } }
                .chartYAxis { AxisMarks(position: .leading) { _ in
                    AxisGridLine().foregroundStyle(YuiTheme.border)
                    AxisValueLabel()
                } }
                .chartXSelection(value: $selectedTime)
                .frame(height: 220)

                if let selectedTime {
                    Text(selectedTime.formatted(.dateTime.month().day().hour().minute().locale(Locale(identifier: "ja_JP"))))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(YuiTheme.muted)
                }
            }

            ForEach(lines) { line in
                HStack(spacing: 8) {
                    Capsule().fill(line.color).frame(width: 16, height: 4)
                    Text(line.label)
                        .font(.system(size: 12))
                        .foregroundStyle(YuiTheme.fg)
                    Spacer()
                    if let value = line.points.last?.value {
                        Text(valueLabel(value))
                            .font(.system(size: 12, weight: .medium))
                            .monospacedDigit()
                            .foregroundStyle(YuiTheme.muted)
                    }
                }
            }

            if unit != "on", fullYRange.upperBound > fullYRange.lowerBound {
                VStack(alignment: .leading, spacing: 1) {
                    Text("縦軸 · \(valueLabel(visibleYRange.lowerBound)) 〜 \(valueLabel(visibleYRange.upperBound))")
                        .font(.system(size: 11))
                        .foregroundStyle(YuiTheme.muted)
                    Slider(value: $yStart, in: 0...max(0, yEnd - 0.05))
                        .tint(YuiTheme.accent)
                        .accessibilityLabel("\(title)の下限")
                    Slider(value: $yEnd, in: min(1, yStart + 0.05)...1)
                        .tint(YuiTheme.accent)
                        .accessibilityLabel("\(title)の上限")
                }
            }
        }
        .padding(19)
        .background(YuiTheme.surface, in: RoundedRectangle(cornerRadius: 24))
    }

    private func valueLabel(_ value: Double) -> String {
        switch unit {
        case "celsius": return String(format: "%.1f°", value)
        case "percent": return String(format: "%.0f%%", value)
        case "lux": return String(format: "%.0f lx", value)
        case "on": return value >= 0.5 ? "入" : "切"
        default: return String(format: "%.1f", value)
        }
    }
}
