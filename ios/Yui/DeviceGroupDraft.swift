import Foundation

struct DeviceGroupDraft {
    var name: String
    var deviceIds: [String]
    var lockMinutes: String

    init(group: HomeDeviceGroup?) {
        name = group?.name ?? ""
        deviceIds = group?.deviceIds ?? []
        lockMinutes = String(group?.lockMinutes ?? 10)
    }

    var minutes: Int? {
        guard let value = Int(lockMinutes), (1...1440).contains(value) else { return nil }
        return value
    }

    var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !deviceIds.isEmpty && minutes != nil
    }

    mutating func toggle(_ id: String) {
        if deviceIds.contains(id) { deviceIds.removeAll { $0 == id } }
        else { deviceIds.append(id) }
    }
}
