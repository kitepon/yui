import Foundation

struct AlexaSkill: Decodable {
    let name: String
    let storeURL: URL
    let hostedOrigin: URL

    static let official: AlexaSkill = {
        let resource = Bundle.main.url(forResource: "alexa-skill", withExtension: "json")!
        let data = try! Data(contentsOf: resource)
        return try! JSONDecoder().decode(AlexaSkill.self, from: data)
    }()
}
