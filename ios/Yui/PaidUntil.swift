import Foundation
import StoreKit

/// The one reader of this device's own subscription end (contract section 2, reportPaidUntil).
enum PaidUntil {
    /// The server accepts at most now + 396 days; an exempt account states a date 390 days ahead and restates it at each run.
    static func exempt(now: Date) -> Date { now.addingTimeInterval(390 * 86_400) }

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
}
