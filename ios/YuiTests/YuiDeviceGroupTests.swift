import Foundation
import XCTest
@testable import Yui

@MainActor
final class YuiDeviceGroupTests: XCTestCase {
    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(DeviceGroupProtocol.self)
        DeviceGroupProtocol.body = nil
        DeviceGroupProtocol.statusCode = 200
        DeviceGroupProtocol.response = DeviceGroupProtocol.home
    }

    override func tearDown() {
        URLProtocol.unregisterClass(DeviceGroupProtocol.self)
        super.tearDown()
    }

    func test旧サーバーの家と待機中のグループを読み取れる() throws {
        let old = try JSONDecoder().decode(HomeSnapshot.self, from: Data("{\"devices\":[],\"scenes\":[]}".utf8))
        XCTAssertNil(old.deviceGroups)
        XCTAssertNil(old.deviceGroupStates)
        let home = try snapshot()
        let group = try XCTUnwrap(home.deviceGroups?.first)
        let state = try XCTUnwrap(home.deviceGroupStates?[group.id])
        XCTAssertEqual(group.deviceIds, ["fan-on", "fan-off", "missing-device"])
        XCTAssertEqual(state.pending?.actionIds, ["off-action"])
        let operated = try XCTUnwrap(AnalysisDate.formatter.date(from: state.operatedAt))
        XCTAssertEqual(state.lockedUntil(for: group, now: operated), operated.addingTimeInterval(120))
        XCTAssertNil(state.lockedUntil(for: group, now: operated.addingTimeInterval(120)))
    }

    func test作成編集削除は個別の保存口を使いサーバーの応答を反映する() async throws {
        let session = SessionStore()
        session.token = "local-test-token"
        var draft = DeviceGroupDraft(group: nil)
        draft.name = " 換気扇 "
        draft.deviceIds = ["fan-on", "fan-off"]
        draft.lockMinutes = "2"
        let created = await session.saveDeviceGroup(nil, draft: draft)
        XCTAssertTrue(created)
        var body = try XCTUnwrap(DeviceGroupProtocol.body)
        XCTAssertEqual(body["op"] as? String, "group-save")
        XCTAssertNil(body["groupId"])
        XCTAssertEqual(Set(body.keys), ["op", "group"])
        let sent = try XCTUnwrap(body["group"] as? [String: Any])
        XCTAssertEqual(sent["name"] as? String, "換気扇")
        XCTAssertEqual(sent["lockMinutes"] as? Int, 2)
        XCTAssertEqual(sent["deviceIds"] as? [String], ["fan-on", "fan-off"])
        let group = try XCTUnwrap(session.home?.deviceGroups?.first)
        XCTAssertEqual(session.home?.deviceGroupStates?[group.id]?.pending?.automationId, "humidity-off")

        draft = DeviceGroupDraft(group: group)
        draft.name = "換気扇の入切"
        let updated = await session.saveDeviceGroup(group, draft: draft)
        XCTAssertTrue(updated)
        body = try XCTUnwrap(DeviceGroupProtocol.body)
        XCTAssertEqual(body["groupId"] as? String, group.id)
        XCTAssertEqual((body["group"] as? [String: Any])?["deviceIds"] as? [String], group.deviceIds)

        DeviceGroupProtocol.response = "{\"devices\":[],\"scenes\":[],\"deviceGroups\":[],\"deviceGroupStates\":{}}"
        let removed = await session.removeDeviceGroup(group)
        XCTAssertTrue(removed)
        body = try XCTUnwrap(DeviceGroupProtocol.body)
        XCTAssertEqual(body["op"] as? String, "group-remove")
        XCTAssertEqual(body["groupId"] as? String, group.id)
        XCTAssertEqual(Set(body.keys), ["op", "groupId"])
        XCTAssertEqual(session.home?.deviceGroups?.count, 0)
    }

    func test保存と削除の失敗を表示し家と待機中の操作を消さない() async throws {
        let session = SessionStore()
        session.token = "local-test-token"
        session.home = try snapshot()
        let group = try XCTUnwrap(session.home?.deviceGroups?.first)
        DeviceGroupProtocol.statusCode = 400
        DeviceGroupProtocol.response = "{\"error\":\"機器は別のグループに入っています\"}"
        let saved = await session.saveDeviceGroup(group, draft: DeviceGroupDraft(group: group))
        XCTAssertFalse(saved)
        XCTAssertEqual(session.error, "機器は別のグループに入っています")
        XCTAssertEqual(session.home?.deviceGroupStates?[group.id]?.pending?.automationId, "humidity-off")
        let removed = await session.removeDeviceGroup(group)
        XCTAssertFalse(removed)
        XCTAssertEqual(session.home?.deviceGroups?.first?.id, group.id)
        XCTAssertFalse(session.busy)
    }

    func test入力の境界と一覧にない機器の維持() throws {
        let group = try XCTUnwrap(snapshot().deviceGroups?.first)
        var draft = DeviceGroupDraft(group: group)
        XCTAssertTrue(draft.canSave)
        draft.name = " \n "
        XCTAssertFalse(draft.canSave)
        draft.name = "換気扇"
        for value in ["", "0", "1441", "2.5", "abc"] {
            draft.lockMinutes = value
            XCTAssertFalse(draft.canSave, value)
        }
        for value in ["1", "1440"] {
            draft.lockMinutes = value
            XCTAssertTrue(draft.canSave, value)
        }
        draft.toggle("fan-on")
        XCTAssertTrue(draft.deviceIds.contains("missing-device"))
        draft.toggle("fan-on")
        XCTAssertEqual(draft.deviceIds.filter { $0 == "fan-on" }.count, 1)
        draft.deviceIds = []
        XCTAssertFalse(draft.canSave)
    }

    private func snapshot() throws -> HomeSnapshot {
        try JSONDecoder().decode(HomeSnapshot.self, from: Data(DeviceGroupProtocol.home.utf8))
    }
}

private final class DeviceGroupProtocol: URLProtocol {
    static var body: [String: Any]?
    static var statusCode = 200
    static var response = home
    static let home = """
    {"devices":[],"scenes":[],"deviceGroups":[{"id":"fan","name":"換気扇","deviceIds":["fan-on","fan-off","missing-device"],"lockMinutes":2}],"deviceGroupStates":{"fan":{"operatedAt":"2026-10-07T00:00:00.000Z","deviceId":"fan-on","pending":{"automationId":"humidity-off","actionIds":["off-action"],"at":"2026-10-07T00:00:30.000Z"}}}}
    """

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
            let response = HTTPURLResponse(url: request.url!, statusCode: Self.statusCode, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(Self.response.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}
