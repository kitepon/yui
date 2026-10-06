import Foundation

struct DeviceGroupDraft {
    enum ValidationIssue: Equatable {
        case name, devices, minutes

        var message: String {
            switch self {
            case .name: "グループ名を入力してください"
            case .devices: "機器を1つ以上選んでください"
            case .minutes: "停止時間は1〜1440分の整数で入力してください"
            }
        }
    }

    var name: String
    var deviceIds: [String]
    var lockMinutes: String

    init(group: HomeDeviceGroup?) {
        name = group?.name ?? ""
        deviceIds = group?.deviceIds ?? []
        lockMinutes = String(group?.lockMinutes ?? 10)
    }

    var minutes: Int? {
        let text = lockMinutes.folding(options: .widthInsensitive, locale: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = Int(text), (1...1440).contains(value) else { return nil }
        return value
    }

    var validationIssue: ValidationIssue? {
        if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .name }
        if deviceIds.isEmpty { return .devices }
        if minutes == nil { return .minutes }
        return nil
    }

    var canSave: Bool {
        validationIssue == nil
    }

    mutating func toggle(_ id: String) {
        if deviceIds.contains(id) { deviceIds.removeAll { $0 == id } }
        else { deviceIds.append(id) }
    }
}
