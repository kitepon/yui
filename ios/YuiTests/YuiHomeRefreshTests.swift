import Foundation
import XCTest
@testable import Yui

@MainActor
final class YuiHomeRefreshTests: XCTestCase {
    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(HomeRefreshProtocol.self)
        HomeRefreshProtocol.pending = nil
        HomeRefreshProtocol.delay = false
        HomeRefreshProtocol.requests = 0
        HomeRefreshProtocol.started = expectation(description: "家のGETを受信")
    }

    override func tearDown() {
        URLProtocol.unregisterClass(HomeRefreshProtocol.self)
        HomeRefreshProtocol.pending = nil
        super.tearDown()
    }

    func test遅れた読取は完了したOFFを上書きしない() async throws {
        let session = SessionStore()
        session.token = "local-test-token"
        session.home = try HomeRefreshProtocol.snapshot(on: true)
        HomeRefreshProtocol.delay = true
        let refresh = Task { await session.refreshHomeIfIdle() }
        await fulfillment(of: [HomeRefreshProtocol.started], timeout: 2)
        XCTAssertNotNil(HomeRefreshProtocol.pending)
        await session.control(try XCTUnwrap(session.home?.devices.first), patch: ["on": false])
        HomeRefreshProtocol.pending?.complete(on: true)
        await refresh.value
        XCTAssertEqual(session.home?.devices.first?.on, false)
        XCTAssertFalse(session.busy)
    }

    func test自動更新を取消した後は読取結果を適用しない() async throws {
        let session = SessionStore()
        session.token = "local-test-token"
        session.home = try HomeRefreshProtocol.snapshot(on: false)
        HomeRefreshProtocol.delay = true
        let refresh = Task { await session.refreshHomeIfIdle() }
        await fulfillment(of: [HomeRefreshProtocol.started], timeout: 2)
        XCTAssertNotNil(HomeRefreshProtocol.pending)
        refresh.cancel()
        HomeRefreshProtocol.pending?.complete(on: true)
        await refresh.value
        XCTAssertEqual(session.home?.devices.first?.on, false)
        XCTAssertNil(session.homeRefreshError)
    }

    func test自動更新は操作ボタンを止めず取消で終了する() async throws {
        let session = SessionStore()
        session.token = "local-test-token"
        session.home = try HomeRefreshProtocol.snapshot(on: false)
        let refresh = Task { await session.refreshWhileActive() }
        await fulfillment(of: [HomeRefreshProtocol.started], timeout: 2)
        XCTAssertGreaterThan(HomeRefreshProtocol.requests, 0)
        XCTAssertFalse(session.busy)
        refresh.cancel()
        await refresh.value
        XCTAssertNil(session.homeRefreshError)
    }
}

final class YuiDeviceStatusTests: XCTestCase {
    func test未受信の照明を消灯と表示しない() throws {
        let data = Data("""
        {"id":"odelec:020000000001","name":"照明","room":"部屋","connector":"odelec","kind":"light","source":"live","online":true,"extra":"状態未取得"}
        """.utf8)
        var device = try JSONDecoder().decode(Device.self, from: data)
        XCTAssertNil(device.on)
        XCTAssertEqual(device.status, "状態未取得")
        device.on = true
        XCTAssertEqual(device.status, "状態未取得")
        device.extra = nil
        device.on = false
        XCTAssertEqual(device.status, "消灯")
    }
}

private final class HomeRefreshProtocol: URLProtocol {
    static var pending: HomeRefreshProtocol?
    static var delay = false
    static var requests = 0
    static var started: XCTestExpectation!

    static func data(on: Bool) throws -> Data {
        try JSONSerialization.data(withJSONObject: [
            "devices": [["id": "plug", "name": "テレビ", "room": "部屋", "brand": "smartlife", "kind": "plug", "source": "live", "nativeId": "plug", "connector": "smartlife", "online": true, "on": on]],
            "scenes": [], "refreshSeconds": 2
        ])
    }

    static func snapshot(on: Bool) throws -> HomeSnapshot {
        try JSONDecoder().decode(HomeSnapshot.self, from: data(on: on))
    }

    override class func canInit(with request: URLRequest) -> Bool { request.url?.path == "/api/home" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        if request.httpMethod == "GET" {
            Self.requests += 1
            if Self.delay { Self.pending = self; Self.started.fulfill(); return }
            Self.started.fulfill()
            complete(on: true)
        } else {
            complete(on: false)
        }
    }

    func complete(on: Bool) {
        do {
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try Self.data(on: on))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
