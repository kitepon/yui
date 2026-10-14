import Foundation
import XCTest
@testable import Yui

@MainActor
final class YuiAutomationTests: XCTestCase {
    func test旧形式と戻り幅付きの条件を読み取り一覧へ表示する() throws {
        let old = try trigger()
        XCTAssertNil(old.hysteresis)
        XCTAssertFalse(old.summary(devices: [], scenes: []).contains("戻り幅"))
        XCTAssertEqual(AutomationTriggerDraft(old).hysteresisValue, 0)
        for op in ["gte", "lte", "between"] {
            let current = try trigger(op: op, width: 0.2)
            XCTAssertEqual(current.hysteresis, 0.2)
            XCTAssertTrue(current.summary(devices: [], scenes: []).contains("（戻り幅0.2）"))
            XCTAssertEqual(try AutomationTriggerDraft(current).dictionary()["hysteresis"] as? Double, 0.2)
        }
        XCTAssertFalse(try trigger(width: 0).summary(devices: [], scenes: []).contains("戻り幅"))
    }

    func test戻り幅は空欄を保持し小数点第一位と全角入力を検証する() throws {
        var draft = AutomationTriggerDraft(try trigger())
        for text in ["0", "100", "0.2", ".2", "０．２", "　０．２　", " 0.2 "] {
            draft.hysteresis = text
            XCTAssertNotNil(draft.hysteresisValue, text)
            XCTAssertNoThrow(try draft.dictionary(), text)
        }
        for text in ["", " ", "-0.1", "100.1", "0.25", "abc", "NaN", "1e1"] {
            draft.hysteresis = text
            XCTAssertNil(draft.hysteresisValue, text)
            XCTAssertThrowsError(try draft.dictionary(), text)
            XCTAssertEqual(draft.hysteresis, text)
        }
    }

    func test他のトリガーへ戻り幅を送らない() throws {
        var draft = AutomationTriggerDraft(try trigger(width: 0.2))
        for type in ["time", "device", "scene"] {
            draft.type = type
            XCTAssertNil(try draft.dictionary()["hysteresis"], type)
        }
    }

    func test保存口へ戻り幅と解除のゼロを送り応答を反映する() async throws {
        URLProtocol.registerClass(AutomationEditProtocol.self)
        defer { URLProtocol.unregisterClass(AutomationEditProtocol.self) }
        AutomationEditProtocol.status = 200
        let session = SessionStore()
        session.token = "local-test-token"
        var draft = AutomationTriggerDraft(try trigger(width: 0.2))
        for width in ["0.2", "0"] {
            draft.hysteresis = width
            let saved = await session.saveAutomation(nil, draft: [
                "name": "室温基準", "enabled": true, "stopOnMatch": true,
                "trigger": try draft.dictionary(), "actions": []
            ])
            XCTAssertTrue(saved)
            let body = try XCTUnwrap(AutomationEditProtocol.body)
            XCTAssertEqual(body["op"] as? String, "automation-save")
            let sent = try XCTUnwrap(body["automation"] as? [String: Any])
            XCTAssertEqual((sent["trigger"] as? [String: Any])?["hysteresis"] as? Double, Double(width))
            XCTAssertEqual(session.home?.automations?.first?.trigger.hysteresis, Double(width))
        }
        AutomationEditProtocol.status = 400
        draft.hysteresis = "0.3"
        let saved = await session.saveAutomation(nil, draft: ["trigger": try draft.dictionary()])
        XCTAssertFalse(saved)
        XCTAssertEqual(session.error, "保存できません")
        XCTAssertEqual(session.home?.automations?.first?.trigger.hysteresis, 0)
        XCTAssertEqual(draft.hysteresis, "0.3")
    }

    func test打ち切りの名前と一分以上続いた時刻だけを表示する() throws {
        for duration in [0.0, 59, 60, 240] {
            let start = try XCTUnwrap(AnalysisDate.formatter.date(from: "2026-10-14T00:00:00.000Z"))
            let until = AnalysisDate.formatter.string(from: start.addingTimeInterval(duration))
            let event = try stopped(#"{"by":"upper","name":"室温基準","until":"\#(until)"}"#)
            XCTAssertNil(event.deviceName)
            let text = try XCTUnwrap(event.reasonText)
            XCTAssertTrue(text.hasPrefix("室温基準 が下の判定を打ち切った（条件は満たしていた"))
            XCTAssertEqual(text.contains("まで"), duration >= 60)
            XCTAssertFalse(text.contains("stopped_by"))
        }
        XCTAssertEqual(try stopped(#"{"by":"upper","name":"室温基準"}"#).reasonText,
                       "室温基準 が下の判定を打ち切った（条件は満たしていた）")
    }

    func test壊れた打ち切りの詳細を明示し既存の理由表示を保つ() throws {
        for detail in ["not-json", #"{"by":"upper"}"#] {
            XCTAssertEqual(try stopped(detail).reasonText, "打ち切りの詳細を読み取れません")
        }
        XCTAssertEqual(try stopped(#"{"by":"upper","name":"室温基準","until":"invalid"}"#).reasonText,
                       "打ち切りの継続時刻を読み取れません")
        let event = AnalysisEvent(id: "old", ts: "2026-10-14T00:00:00.000Z", source: "tick",
                                  automationId: nil, deviceName: nil, automationName: nil,
                                  outcome: "skipped", reason: "group_locked", detail: nil)
        XCTAssertEqual(event.reasonText, "グループが操作を止めている")
    }

    private func trigger(op: String = "gte", width: Double? = nil) throws -> AutomationTrigger {
        var json: [String: Any] = ["type": "sensor", "deviceId": "sensor", "metric": "temperature",
                                  "op": op, "value": 28, "valueMax": 30]
        if let width { json["hysteresis"] = width }
        return try JSONDecoder().decode(AutomationTrigger.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func stopped(_ detail: String) throws -> AnalysisEvent {
        let json: [String: Any] = ["id": "stopped", "ts": "2026-10-14T00:00:00.000Z",
                                  "automationName": "外気を取り込む", "outcome": "skipped",
                                  "reason": "stopped_by", "detail": detail]
        return try JSONDecoder().decode(AnalysisEvent.self, from: JSONSerialization.data(withJSONObject: json))
    }
}

private final class AutomationEditProtocol: URLProtocol {
    static var body: [String: Any]?
    static var status = 200
    override class func canInit(with request: URLRequest) -> Bool { request.url?.path == "/api/home" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        do {
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count < 0 { throw stream.streamError ?? YuiError.message("送信内容を読めません") }
                    if count == 0 { break }
                    data.append(buffer, count: count)
                }
            }
            Self.body = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            var automation = Self.body?["automation"] as? [String: Any] ?? [:]
            automation["id"] = "saved"
            let json: [String: Any] = Self.status == 200
                ? ["devices": [], "scenes": [], "automations": [automation]]
                : ["error": "保存できません"]
            let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: json))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}
