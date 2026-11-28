import BackgroundTasks
import Foundation
import StoreKit

/// The one reader of this device's own subscription end (contract section 2, reportPaidUntil).
enum PaidUntil {
    static let refreshId = "dev.kitepon.yuihome.paid-until"

    /// The server accepts at most now + 396 days; an exempt account states a date 390 days ahead and restates it at each run.
    static func exempt(now: Date) -> Date { now.addingTimeInterval(390 * 86_400) }

    /// The date this device states now; nil when it holds no subscription and is not exempt.
    @MainActor static func dateToState(now: Date) async -> Date? {
        if let free = await Hosted.shared.form.paidUntil(), free.store == "free" { return exempt(now: now) }
        return await ownEnd(productIds: Hosted.productIds)
    }

    /// The latest end among the verified, unrevoked current entitlements of these products; nil when the device holds none.
    /// StoreKit's own verification is the check; the library's purchaseLocal finishes a purchase, a renewal is finished here.
    static func ownEnd(productIds: [String]) async -> Date? {
        var latest: Date?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result, productIds.contains(transaction.productID),
                  transaction.revocationDate == nil, let end = transaction.expirationDate else { continue }
            await transaction.finish()
            latest = max(latest ?? end, end)
        }
        return latest
    }

    /// The background run (iPhone, iPad): no screen and no state. A failure is not shown; the next foreground run states the date and shows its error.
    @MainActor static func stateInBackground() async {
        guard await Hosted.shared.hasKey, let date = await dateToState(now: Date()) else { return }
        _ = try? await YuiClient.shared.statePaidUntil(date)
    }

    /// Asks for one background run in about 12 hours. The system may refuse or delay it; launch and foreground restate the date anyway.
    /// A Mac has no background run (launch and foreground only; the 7 days of grace cover it).
    static func scheduleRefresh() {
        #if !targetEnvironment(macCatalyst)
        let request = BGAppRefreshTaskRequest(identifier: refreshId)
        request.earliestBeginDate = Date().addingTimeInterval(12 * 3600)
        try? BGTaskScheduler.shared.submit(request)
        #endif
    }
}
