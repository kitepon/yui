import Foundation
import StoreKit
import StoreKitTest
import XCTest
@testable import Yui

@MainActor
final class YuiBillingTests: XCTestCase {
    private var storeKit: SKTestSession!

    override func setUp() async throws {
        try await super.setUp()
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.resetToDefaultState()
        storeKit.clearTransactions()
        storeKit.disableDialogs = true
        storeKit.storefront = "JPN"
        URLProtocol.registerClass(BillingProtocol.self)
        BillingProtocol.fixture = BillingFixture()
    }

    override func tearDown() async throws {
        storeKit.clearTransactions()
        storeKit.resetToDefaultState()
        URLProtocol.unregisterClass(BillingProtocol.self)
        try await super.tearDown()
    }

    private func session() -> SessionStore {
        let session = SessionStore()
        session.token = "local-test-token"
        return session
    }

    func test所属不一致の予約を解除して再度購入できる() async throws {
        let fixture = BillingProtocol.fixture
        fixture.registration = .accountMismatch
        let session = session()

        await session.purchaseApple(plan: "monthly")

        XCTAssertEqual(session.accountError, YuiError.appleAccountMismatch.localizedDescription)
        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 1)
        XCTAssertEqual(fixture.reservations, 1)

        await session.purchaseApple(plan: "monthly")

        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 2)
        XCTAssertEqual(fixture.reservations, 2)
        XCTAssertFalse(session.appleBusy)
    }

    func test購入成功で利用権を更新する() async throws {
        let fixture = BillingProtocol.fixture
        let session = session()

        await session.purchaseApple(plan: "monthly")

        XCTAssertNil(session.accountError)
        XCTAssertEqual(session.billingStatus?.entitlement.writable, true)
        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 0)
        XCTAssertGreaterThan(fixture.registrations, 0)
    }

    func testキャンセルは予約を解除する() async throws {
        try await storeKit.setSimulatedError(.generic(.userCancelled), forAPI: .purchase)
        let fixture = BillingProtocol.fixture
        let session = session()

        await session.purchaseApple(plan: "monthly")

        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 1)
        XCTAssertEqual(fixture.registrations, 0)
    }

    func test承認待ちは予約を保持して承認後に更新する() async throws {
        storeKit.askToBuyEnabled = true
        let fixture = BillingProtocol.fixture
        let session = session()

        await session.purchaseApple(plan: "monthly")

        XCTAssertTrue(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 0)
        XCTAssertEqual(session.billingStatus?.purchasePendingProvider, "apple")
        let transaction = try XCTUnwrap(storeKit.allTransactions().first)
        try storeKit.approveAskToBuyTransaction(identifier: transaction.identifier)
        try await waitForEntitlement(session)
        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 0)
    }

    func test成功取引の登録通信失敗は予約を解除しない() async throws {
        let fixture = BillingProtocol.fixture
        fixture.registration = .networkFailure
        let session = session()

        await session.purchaseApple(plan: "monthly")

        XCTAssertNotNil(session.accountError)
        XCTAssertTrue(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 0)
        XCTAssertGreaterThan(fixture.registrations, 0)
    }

    func test登録失敗後にセッションを作り直して復元できる() async throws {
        let fixture = BillingProtocol.fixture
        fixture.registration = .networkFailure
        var previous: SessionStore? = session()
        await previous?.purchaseApple(plan: "monthly")
        XCTAssertTrue(fixture.pending)
        previous = nil

        fixture.registration = .accepted
        let restored = session()
        await restored.restoreApplePurchases()

        XCTAssertNil(restored.accountError)
        XCTAssertEqual(restored.billingStatus?.entitlement.writable, true)
        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.reservations, 1)
        XCTAssertEqual(fixture.cancellations, 0)
    }

    func test保存CookieがあってもBearerでアカウントを切り替える() async throws {
        let cookie = try XCTUnwrap(HTTPCookie(properties: [
            .domain: "yuihome.kitepon.dev", .path: "/", .name: "better-auth.session_data", .value: "previous-account"
        ]))
        HTTPCookieStorage.shared.setCookie(cookie)
        defer { HTTPCookieStorage.shared.deleteCookie(cookie) }

        let first = try await YuiClient.shared.currentUser(token: "first-test-token")
        let second = try await YuiClient.shared.currentUser(token: "second-test-token")

        XCTAssertEqual(first?.id, "first-test-token")
        XCTAssertEqual(second?.id, "second-test-token")
        XCTAssertTrue(BillingProtocol.fixture.requests.allSatisfy { !$0.httpShouldHandleCookies })
        XCTAssertTrue(BillingProtocol.fixture.requests.allSatisfy { $0.value(forHTTPHeaderField: "Cookie") == nil })
    }

    private func waitForEntitlement(_ session: SessionStore) async throws {
        let deadline = Date().addingTimeInterval(5)
        while session.billingStatus?.entitlement.writable != true && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(session.billingStatus?.entitlement.writable, true)
    }
}

// StoreKitは実際のローカル取引を作る。HTTPだけを試験用応答に差し替え、本番へ送らない。
private final class BillingProtocol: URLProtocol, @unchecked Sendable {
    static var fixture = BillingFixture()

    override class func canInit(with request: URLRequest) -> Bool {
        request.url?.host == "yuihome.kitepon.dev"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        do {
            let (status, json) = try Self.fixture.respond(to: request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: json))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private final class BillingFixture: @unchecked Sendable {
    enum Registration { case accepted, accountMismatch, networkFailure }
    private let lock = NSLock()
    var registration = Registration.accepted
    private(set) var pending = false
    private(set) var writable = false
    private(set) var reservations = 0
    private(set) var cancellations = 0
    private(set) var registrations = 0
    private(set) var requests: [URLRequest] = []
    private let accountToken = UUID()
    private var attemptId = ""

    func respond(to request: URLRequest) throws -> (Int, [String: Any]) {
        lock.lock()
        defer { lock.unlock() }
        requests.append(request)
        let entitlement: [String: Any] = ["writable": writable, "provider": writable ? "apple" : NSNull(), "status": writable ? "active" : "none"]
        switch (request.httpMethod ?? "GET", request.url?.path ?? "") {
        case ("GET", "/api/stripe/status"):
            return (200, ["configured": true, "appleConfigured": true,
                          "purchasePendingProvider": pending ? "apple" : NSNull(), "entitlement": entitlement,
                          "plans": ["monthlyYen": 100, "annualYen": 1000, "trialDays": 30]])
        case ("GET", "/api/apple/account"):
            return (200, ["appAccountToken": accountToken.uuidString,
                          "productIds": ["monthly": "dev.kitepon.yuihome.subscription.monthly",
                                         "annual": "dev.kitepon.yuihome.subscription.annual"]])
        case ("POST", "/api/apple/refresh"):
            return (200, ["entitlement": entitlement])
        case ("POST", "/api/apple/purchase"):
            if pending { return (409, ["error": "App Storeの購入手続き中です"] ) }
            pending = true
            reservations += 1
            attemptId = UUID().uuidString
            return (200, ["attemptId": attemptId, "appAccountToken": accountToken.uuidString])
        case ("DELETE", "/api/apple/purchase"):
            pending = false
            cancellations += 1
            return (200, ["released": true])
        case ("POST", "/api/apple/transaction"):
            registrations += 1
            switch registration {
            case .networkFailure: throw URLError(.notConnectedToInternet)
            case .accountMismatch:
                return (400, ["error": "Appleの契約は別の結アカウントに紐づいています", "code": "APPLE_ACCOUNT_MISMATCH"])
            case .accepted:
                pending = false
                writable = true
                return (200, ["entitlement": ["writable": true, "provider": "apple", "status": "active"]])
            }
        case ("GET", "/api/home"):
            return (200, ["devices": [], "scenes": []])
        case ("GET", "/api/auth/get-session"):
            let token = request.value(forHTTPHeaderField: "Authorization")?.replacingOccurrences(of: "Bearer ", with: "") ?? "missing"
            return (200, ["user": ["id": token, "email": "\(token)@example.invalid"]])
        default:
            throw NSError(domain: "YuiBillingTests", code: 1, userInfo: [NSLocalizedDescriptionKey: "未定義の試験リクエスト: \(request.httpMethod ?? "GET") \(request.url?.path ?? "")"])
        }
    }
}
