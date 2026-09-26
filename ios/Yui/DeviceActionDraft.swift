import Foundation

struct DevicePatchDraft {
    var on: Bool?
    var brightness: Double?
    var targetTemp: Double?
    var targetHumidity: Double?
    var fanSpeed: String?
    var fanSwing: String?
    var mode: String?
    var position: Double?

    init() {}

    init(_ patch: HomeScenePatch) {
        on = patch.on
        brightness = patch.brightness
        targetTemp = patch.targetTemp
        targetHumidity = patch.targetHumidity
        fanSpeed = patch.fanSpeed
        fanSwing = patch.fanSwing
        mode = patch.mode
        position = patch.position
    }

    init(_ action: AutomationAction) {
        on = action.on
        brightness = action.brightness
        targetTemp = action.targetTemp
        targetHumidity = action.targetHumidity
        fanSpeed = action.fanSpeed
        fanSwing = action.fanSwing
        mode = action.mode
        position = action.position
    }

    func dictionary() -> [String: Any] {
        var result: [String: Any] = [:]
        if let on { result["on"] = on }
        if let brightness { result["brightness"] = brightness }
        if let targetTemp { result["targetTemp"] = targetTemp }
        if let targetHumidity { result["targetHumidity"] = targetHumidity }
        if let fanSpeed { result["fanSpeed"] = fanSpeed }
        if let fanSwing { result["fanSwing"] = fanSwing }
        if let mode { result["mode"] = mode }
        if let position { result["position"] = position }
        return result
    }
}

struct DeviceActionDraft: Identifiable {
    let id: String
    var deviceId: String
    var match: [String: String]
    var patch: DevicePatchDraft
    var skipContinuous: Bool

    init(device: Device) {
        id = UUID().uuidString
        deviceId = device.id
        match = ["id": device.id]
        patch = DevicePatchDraft()
        patch.on = true
        if device.kind == "curtain" { patch.position = 100 }
        skipContinuous = false
    }

    init(sceneStep: HomeSceneStep) {
        id = UUID().uuidString
        var selector: [String: String] = [:]
        if let value = sceneStep.match.id { selector["id"] = value }
        if let value = sceneStep.match.room { selector["room"] = value }
        if let value = sceneStep.match.kind { selector["kind"] = value }
        if let value = sceneStep.match.brand { selector["brand"] = value }
        match = selector
        deviceId = sceneStep.match.id ?? ""
        patch = DevicePatchDraft(sceneStep.patch)
        skipContinuous = false
    }

    init(automationAction: AutomationAction) {
        id = automationAction.id
        deviceId = automationAction.deviceId ?? ""
        match = [:]
        patch = DevicePatchDraft(automationAction)
        skipContinuous = automationAction.skipContinuous == true
    }

    func sceneDictionary() -> [String: Any] {
        ["match": match, "patch": patch.dictionary()]
    }

    func automationDictionary() -> [String: Any] {
        var result = patch.dictionary()
        result["id"] = id
        result["deviceId"] = deviceId
        if skipContinuous { result["skipContinuous"] = true }
        return result
    }
}
