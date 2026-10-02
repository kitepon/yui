import Darwin
import Foundation
import StoreKit
import StoreKitTest
import XCTest
@testable import Yui

// 専用プランで前半を強制終了し、別プロセスの後半で同じStoreKit取引を復元する。
@MainActor
final class YuiRestartTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }
    private struct InterruptedPurchase: Codable {
        let pid: Int32
        let transactionID: UInt64?
        let pending: Bool
        let accountToken: UUID
    }

    private var stateURL: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("yui-restart-test.json")
    }

    func test購入登録前に強制終了する() async throws {
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        let storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.resetToDefaultState()
        storeKit.clearTransactions()
        storeKit.disableDialogs = true
        storeKit.storefront = "JPN"
        URLProtocol.registerClass(BillingProtocol.self)
        let fixture = BillingFixture()
        fixture.registration = .networkFailure
        BillingProtocol.fixture = fixture
        let session = SessionStore()
        session.token = "local-test-token"

        await session.purchaseApple(plan: "monthly")

        XCTAssertNotNil(session.accountError)
        XCTAssertTrue(fixture.pending)
        XCTAssertEqual(fixture.cancellations, 0)
        var unfinished: [UInt64] = []
        for await result in Transaction.unfinished {
            if case .verified(let transaction) = result { unfinished.append(transaction.id) }
        }
        let transactionID = try XCTUnwrap(unfinished.first)
        let state = InterruptedPurchase(pid: getpid(), transactionID: transactionID, pending: fixture.pending,
                                        accountToken: fixture.accountToken)
        try JSONEncoder().encode(state).write(to: stateURL, options: .atomic)
        print("YUI_RESTART_READY pid=\(state.pid) transaction=\(transactionID) pending=\(state.pending)")
        fflush(stdout)
        kill(getpid(), SIGKILL)
        XCTFail("プロセスを終了できませんでした")
    }

    func test別プロセスで未完了取引を復元する() async throws {
        let state = try JSONDecoder().decode(InterruptedPurchase.self, from: Data(contentsOf: stateURL))
        XCTAssertNotEqual(getpid(), state.pid)
        XCTAssertTrue(state.pending)
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        let storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.disableDialogs = true
        var current: [UInt64] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result { current.append(transaction.id) }
        }
        let transactionID = try XCTUnwrap(state.transactionID)
        XCTAssertTrue(current.contains(transactionID), "中断前の同じ取引が復元対象として残っている必要があります")
        print("YUI_RESTART_CURRENT transactions=\(current) expected=\(transactionID)")
        URLProtocol.registerClass(BillingProtocol.self)
        defer {
            URLProtocol.unregisterClass(BillingProtocol.self)
            storeKit.clearTransactions()
            storeKit.resetToDefaultState()
        }
        let fixture = BillingFixture(pending: state.pending, accountToken: state.accountToken)
        BillingProtocol.fixture = fixture
        let session = SessionStore()
        session.token = "local-test-token"

        await session.restoreApplePurchases()

        XCTAssertNil(session.accountError)
        XCTAssertEqual(session.billingStatus?.entitlement.writable, true)
        XCTAssertFalse(fixture.pending)
        XCTAssertGreaterThan(fixture.registrations, 0)
        XCTAssertEqual(fixture.reservations, 0)
        XCTAssertEqual(fixture.cancellations, 0)
        print("YUI_RESTART_RECOVERED pid=\(getpid()) previousPid=\(state.pid) pending=\(fixture.pending)")
        try FileManager.default.removeItem(at: stateURL)
    }

    func test購入承認前に強制終了する() async throws {
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        let storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.resetToDefaultState()
        storeKit.clearTransactions()
        storeKit.disableDialogs = false
        storeKit.storefront = "JPN"
        URLProtocol.registerClass(BillingProtocol.self)
        let fixture = BillingFixture()
        BillingProtocol.fixture = fixture
        let session = SessionStore()
        session.token = "local-test-token"
        let purchase = Task { await session.purchaseApple(plan: "monthly") }
        let deadline = Date().addingTimeInterval(5)
        while fixture.reservations == 0 && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        try await Task.sleep(nanoseconds: 1_000_000_000)
        XCTAssertTrue(fixture.pending)
        XCTAssertTrue(session.appleBusy)
        XCTAssertEqual(fixture.registrations, 0)
        XCTAssertEqual(storeKit.allTransactions().count, 0)
        let state = InterruptedPurchase(pid: getpid(), transactionID: nil, pending: fixture.pending,
                                        accountToken: fixture.accountToken)
        try JSONEncoder().encode(state).write(to: stateURL, options: .atomic)
        print("YUI_RESTART_CONFIRMATION_READY pid=\(state.pid) pending=\(state.pending)")
        fflush(stdout)
        _ = withExtendedLifetime(purchase) { kill(getpid(), SIGKILL) }
        XCTFail("プロセスを終了できませんでした")
    }

    func test承認前の中断から購入できる状態へ戻る() async throws {
        let state = try JSONDecoder().decode(InterruptedPurchase.self, from: Data(contentsOf: stateURL))
        XCTAssertNotEqual(getpid(), state.pid)
        XCTAssertNil(state.transactionID)
        let configuration = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Yui", withExtension: "storekit"))
        let storeKit = try SKTestSession(contentsOf: configuration)
        storeKit.disableDialogs = true
        XCTAssertEqual(storeKit.allTransactions().count, 0)
        URLProtocol.registerClass(BillingProtocol.self)
        defer {
            URLProtocol.unregisterClass(BillingProtocol.self)
            storeKit.clearTransactions()
            storeKit.resetToDefaultState()
        }
        let fixture = BillingFixture(pending: state.pending, accountToken: state.accountToken)
        BillingProtocol.fixture = fixture
        let session = SessionStore()
        session.token = "local-test-token"

        await session.restoreApplePurchases()

        XCTAssertNil(session.accountError)
        XCTAssertTrue(fixture.pending)
        XCTAssertEqual(session.applePurchaseResumePlan, "monthly")
        await session.purchaseApple(plan: "monthly")
        XCTAssertNil(session.accountError)
        XCTAssertEqual(session.billingStatus?.entitlement.writable, true)
        XCTAssertFalse(fixture.pending)
        XCTAssertEqual(fixture.reservations, 0, "中断前の予約を再利用します")
        XCTAssertNil(try ApplePurchaseRecovery.load(accountToken: state.accountToken))
        print("YUI_RESTART_BEFORE_APPROVAL_RECOVERED pid=\(getpid()) previousPid=\(state.pid)")
    }
}
