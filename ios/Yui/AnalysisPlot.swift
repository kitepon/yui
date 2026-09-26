import Foundation

struct AnalysisPlotPoint: Identifiable {
    let id: Int
    let time: Date
    let value: Double
}

enum AnalysisPlot {
    static func points(_ source: [AnalysisPoint], limit: Int = 360) -> [AnalysisPlotPoint] {
        var dates: [String: Date] = [:]
        return points(source, limit: limit, dates: &dates)
    }

    static func points(_ source: [AnalysisPoint], limit: Int, dates: inout [String: Date]) -> [AnalysisPlotPoint] {
        let parsed = source.enumerated().compactMap { index, point -> AnalysisPlotPoint? in
            let time: Date
            if let known = dates[point.ts] {
                time = known
            } else {
                guard let parsed = point.date else { return nil }
                dates[point.ts] = parsed
                time = parsed
            }
            return AnalysisPlotPoint(id: index, time: time, value: point.value)
        }
        guard parsed.count > limit else { return parsed }

        let interiorCount = parsed.count - 2
        let bucketCount = (limit - 2) / 2
        var result = [parsed[0]]
        result.reserveCapacity(limit)
        for bucket in 0..<bucketCount {
            let start = 1 + bucket * interiorCount / bucketCount
            let end = 1 + (bucket + 1) * interiorCount / bucketCount
            guard start < end else { continue }
            var lowest = start
            var highest = start
            for index in start..<end {
                if parsed[index].value < parsed[lowest].value { lowest = index }
                if parsed[index].value > parsed[highest].value { highest = index }
            }
            result.append(parsed[min(lowest, highest)])
            if lowest != highest { result.append(parsed[max(lowest, highest)]) }
        }
        result.append(parsed[parsed.count - 1])
        return result
    }
}
