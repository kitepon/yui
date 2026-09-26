#if DEBUG
import Foundation

extension SessionStore {
    static func visualPreview() -> SessionStore {
        let store = SessionStore()
        let json = """
        {
          "devices": [
            {"id":"preview-ac","name":"リビングのエアコン","room":"リビング","kind":"ac","source":"demo","online":true,"on":true,"targetTemp":25,"temperature":24.6,"humidity":48,"mode":"cool","connector":"daikin","fanSpeed":"auto","fanSwing":"vertical"},
            {"id":"preview-light","name":"メインライト","room":"リビング","kind":"light","source":"demo","online":true,"on":true,"brightness":72,"connector":"nature"},
            {"id":"preview-curtain","name":"カーテン","room":"リビング","kind":"curtain","source":"demo","online":true,"on":false,"position":0,"connector":"switchbot"},
            {"id":"preview-sensor","name":"温湿度センサー","room":"寝室","kind":"sensor","source":"demo","online":true,"temperature":23.8,"humidity":52,"connector":"switchbot"},
            {"id":"preview-plug","name":"デスクライト","room":"寝室","kind":"plug","source":"demo","online":true,"on":false,"connector":"smartlife"}
          ],
          "climate":{"temperature":24.6,"humidity":48,"lux":286,"label":"リビング"},
          "scenes":[{"id":"scene-1","name":"おはよう","hint":"朝の明かり"},{"id":"scene-2","name":"おやすみ","hint":"夜の準備"},{"id":"scene-3","name":"映画の時間","hint":"照明を落とす"}],
          "automations":[{"id":"auto-1","name":"朝は快適な温度に","enabled":true,"trigger":{"type":"time","repeat":"daily","hour":7,"minute":0},"actions":[{"id":"action-1","deviceId":"preview-ac","on":true,"mode":"cool","targetTemp":25}],"stopOnMatch":false}],
          "rooms":["リビング","寝室"],
          "pairPin":"123456",
          "daikinDirect":true,
          "odelicBridge":true,
          "tuyaLan":{"listening":true,"seen":1}
        }
        """
        store.token = "visual-preview"
        store.home = try! JSONDecoder().decode(HomeSnapshot.self, from: Data(json.utf8))
        store.user = AuthUser(id: "preview-user", email: "preview@example.com", name: "プレビュー")
        store.billingStatus = BillingStatus(
            configured: true,
            entitlement: BillingEntitlement(writable: true, message: "契約中", status: "active"),
            plans: BillingPlans(monthlyYen: 100, annualYen: 1000, trialDays: 30)
        )
        return store
    }

    static func analysisPreview() -> SessionStore {
        let store = visualPreview()
        let end = Date()
        let points = (0..<1440).map { index -> AnalysisPoint in
            let date = end.addingTimeInterval(Double(index - 1439) * 60)
            return AnalysisPoint(ts: AnalysisDate.formatter.string(from: date), value: 22 + sin(Double(index) / 80) * 2)
        }
        let labels = ["室温", "外気温", "湿度", "水温"]
        let series = (0..<25).map { index in
            AnalysisSeries(
                id: "preview-\(index)", deviceId: index == 24 ? "preview-ac" : "preview-sensor-\(index)",
                metric: index == 24 ? "on" : "temperature",
                label: index < 4 ? "リビング \(labels[index])" : "計測 \(index)",
                unit: index == 24 ? "on" : index == 2 ? "percent" : "celsius",
                points: points.map { AnalysisPoint(ts: $0.ts, value: index == 24 ? ($0.value > 22 ? 1 : 0) : $0.value + Double(index) * 0.1) }
            )
        }
        let events = (0..<224).map { index in
            AnalysisEvent(
                id: "event-\(index)", ts: points[1439 - index * 6].ts, source: "tick",
                automationId: "preview-auto", deviceName: "リビングのエアコン",
                automationName: "暑い日に冷房", outcome: index % 5 == 0 ? "skipped" : "sent",
                reason: index % 5 == 0 ? "already_applied" : nil, detail: nil
            )
        }
        store.analysis = AnalysisData(
            from: points.first!.ts, to: points.last!.ts,
            series: series,
            automations: [AnalysisNamedItem(id: "preview-auto", name: "暑い日に冷房")],
            devices: [AnalysisNamedItem(id: "preview-ac", name: "リビングのエアコン")],
            events: events
        )
        return store
    }
}
#endif
