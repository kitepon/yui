import Foundation
import StoreKit
import StoreKitTest
import XCTest
@testable import Yui

@MainActor
final class YuiBillingTests: XCTestCase {
    private var storeKit: SKTestSession!
    private let monthly = "dev.kitepon.yuihome.subscription.monthly"

    override func setUp() async throws {
        try await super.setUp()
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.resetToDefaultState()
        storeKit.clearTransactions()
        storeKit.disableDialogs = true
        storeKit.storefront = "JPN"
        URLProtocol.registerClass(HostedProtocol.self)
        HostedProtocol.reset()
        UserDefaults.standard.removeObject(forKey: "yui.paidUntil")
        UserDefaults.standard.removeObject(forKey: "yui.planCheckedAt")
    }

    override func tearDown() async throws {
        storeKit.clearTransactions()
        storeKit.resetToDefaultState()
        URLProtocol.unregisterClass(HostedProtocol.self)
        try await super.tearDown()
    }

    /// StoreKit presents its purchase sheet in a window; a Simulator without a window server never answers (the same on main before this change).
    private func requireWindow() throws {
        try XCTSkipUnless(UIApplication.shared.applicationState == .active, "StoreKitの購入画面には、ウィンドウのあるSimulatorが要ります")
    }

    private func readySession() -> SessionStore {
        let session = SessionStore()
        session.phase = .ready
        return session
    }

    func test購入すると契約の終わりをサーバーへ送る() async throws {
        try requireWindow()
        let session = readySession()

        await session.purchase(productId: monthly)

        let found = await PaidUntil.ownEnd(productIds: Hosted.productIds)
        let end = try XCTUnwrap(found)
        let sent = try XCTUnwrap(HostedProtocol.requests.last { $0.path == "/api/home/paid-until" })
        XCTAssertEqual(sent.method, "POST")
        XCTAssertEqual(sent.json["paidUntil"] as? Int64, Int64(end.timeIntervalSince1970 * 1000))
        XCTAssertEqual(session.paidUntil.map { Int64($0.timeIntervalSince1970 * 1000) }, Int64(end.timeIntervalSince1970 * 1000))
        XCTAssertNotNil(session.planCheckedAt)
        XCTAssertNil(session.accountError)
        XCTAssertFalse(session.appleBusy)
    }

    func test記録せずに終了しても次の起動で日付を送る() async throws {
        try requireWindow()
        try await storeKit.buyProduct(identifier: monthly)
        XCTAssertTrue(HostedProtocol.requests.isEmpty)

        await readySession().reportPaidUntil()

        XCTAssertEqual(HostedProtocol.requests.filter { $0.path == "/api/home/paid-until" }.count, 1)
    }

    func test契約が無い端末は日付を送らず確認時刻だけ残す() async throws {
        let session = readySession()

        await session.reportPaidUntil()

        XCTAssertTrue(HostedProtocol.requests.filter { $0.path == "/api/home/paid-until" }.isEmpty)
        XCTAssertNil(session.paidUntil)
        XCTAssertNotNil(session.planCheckedAt)
    }

    func testキャンセルは何も送らない() async throws {
        #if targetEnvironment(macCatalyst)
        throw XCTSkip("Mac CatalystのStoreKitTestには購入キャンセルの注入APIがないため、iOSで確認する")
        #else
        try requireWindow()
        try await storeKit.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        let session = readySession()

        await session.purchase(productId: monthly)

        XCTAssertTrue(HostedProtocol.requests.isEmpty)
        XCTAssertNil(session.accountError)
        #endif
    }

    func test承認待ちは案内を出して何も送らない() async throws {
        try requireWindow()
        storeKit.askToBuyEnabled = true
        let session = readySession()

        await session.purchase(productId: monthly)

        XCTAssertEqual(session.accountError, "購入は承認待ちです。承認されたら契約状態を更新してください")
        XCTAssertTrue(HostedProtocol.requests.isEmpty)
    }

    func test免除の日付はサーバーの上限より手前に収まる() {
        let now = Date()
        XCTAssertLessThan(PaidUntil.exempt(now: now).timeIntervalSince(now), 396 * 86_400)
        XCTAssertGreaterThan(PaidUntil.exempt(now: now).timeIntervalSince(now), 365 * 86_400)
    }

    func test家が無い削除は続行できる() async throws {
        HostedProtocol.answers["DELETE /api/account-data"] = (404, ["deleted": false])
        let deleted = try await YuiClient.shared.deleteAccountData()
        XCTAssertFalse(deleted)

        HostedProtocol.answers["DELETE /api/account-data"] = (200, ["deleted": true])
        let again = try await YuiClient.shared.deleteAccountData()
        XCTAssertTrue(again)
    }

    func test引き継ぎの失敗は理由ごとの文になる() async throws {
        for (status, text) in [(401, "以前のログインを確かめられませんでした"), (404, "引き継げる以前の家がありません"), (409, "すでに家があるか")] {
            HostedProtocol.answers["POST /api/claim"] = (status, ["error": "x"])
            do {
                try await YuiClient.shared.claim(["method": "password", "email": "a@example.invalid", "password": "x"])
                XCTFail("claim \(status) should fail")
            } catch YuiError.message(let message) {
                XCTAssertTrue(message.contains(text.prefix(6)), "\(status): \(message)")
            }
        }
        HostedProtocol.answers["POST /api/claim"] = (200, ["ok": true])
        try await YuiClient.shared.claim(["method": "password", "email": "a@example.invalid", "password": "x"])
    }

    func testリンクコードを受け取る() async throws {
        HostedProtocol.answers["POST /api/alexa/link-code"] = (200, ["code": "ABCD2345", "expiresInSeconds": 600])
        let session = readySession()

        await session.makeLinkCode()

        XCTAssertEqual(session.linkCode?.code, "ABCD2345")
        XCTAssertNotNil(session.linkCodeExpiresAt)
    }

    func test家のデータを書き出す() async throws {
        HostedProtocol.answers["GET /api/account-data"] = (200, ["devices": [], "scenes": []])
        let session = readySession()

        await session.exportData()

        let file = try XCTUnwrap(session.exportFile)
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any]
        XCTAssertNotNil(json?["devices"])
    }
}

// StoreKitは実際のローカル取引を作る。HTTPだけを試験用応答に差し替え、本番へ送らない。
final class HostedProtocol: URLProtocol, @unchecked Sendable {
    struct Seen {
        let method: String
        let path: String
        let body: Data
        var json: [String: Any] { (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:] }
    }

    private static let lock = NSLock()
    nonisolated(unsafe) private static var seen: [Seen] = []
    nonisolated(unsafe) static var answers: [String: (Int, [String: Any])] = [:]

    static var requests: [Seen] { lock.withLock { seen } }

    static func reset() {
        lock.withLock {
            seen = []
            answers = [
                "GET /api/home": (200, ["devices": [], "scenes": []]),
                "POST /api/home/paid-until": (200, [:]),
            ]
        }
    }

    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "yuihome.kitepon.dev" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let method = request.httpMethod ?? "GET", path = request.url?.path ?? ""
        let body = request.httpBody ?? request.httpBodyStream.map { stream -> Data in
            stream.open(); defer { stream.close() }
            var data = Data(), buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; data.append(buffer, count: n) }
            return data
        } ?? Data()
        var (status, json) = Self.lock.withLock { () -> (Int, [String: Any]) in
            Self.seen.append(Seen(method: method, path: path, body: body))
            return Self.answers["\(method) \(path)"] ?? (404, ["error": "未定義の試験リクエスト"])
        }
        // The server answers the stored date: the later of the stored and the stated one.
        if path == "/api/home/paid-until", status == 200, let stated = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["paidUntil"] { json = ["paidUntil": stated] }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: (try? JSONSerialization.data(withJSONObject: json)) ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
