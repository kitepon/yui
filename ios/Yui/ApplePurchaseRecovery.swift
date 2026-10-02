import Foundation

// StoreKitの確認画面を閉じずにアプリが終了しても、同じ購入予約を続けられるよう保存する。
enum ApplePurchaseRecovery {
    enum Stage: String, Codable {
        case presenting, pending, registering
    }

    struct Record: Codable {
        let attemptId: String
        let appAccountToken: UUID
        let plan: String
        var stage: Stage

        var attempt: ApplePurchaseAttempt {
            ApplePurchaseAttempt(attemptId: attemptId, appAccountToken: appAccountToken)
        }
    }

    private static var fileURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("apple-purchase-recovery.json")
    }

    private static func records() throws -> [String: Record] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [:] }
        return try JSONDecoder().decode([String: Record].self, from: Data(contentsOf: fileURL))
    }

    static func load(accountToken: UUID) throws -> Record? {
        try records()[accountToken.uuidString]
    }

    static func save(_ record: Record) throws {
        var values = try records()
        values[record.appAccountToken.uuidString] = record
        try write(values)
    }

    static func remove(accountToken: UUID, attemptId: String? = nil) throws {
        var values = try records()
        guard let record = values[accountToken.uuidString],
              attemptId == nil || record.attemptId == attemptId else { return }
        values.removeValue(forKey: accountToken.uuidString)
        try write(values)
    }

    private static func write(_ values: [String: Record]) throws {
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(values).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
