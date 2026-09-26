#if DEBUG
import Foundation

extension SessionStore {
    static func visualPreview() -> SessionStore {
        let store = SessionStore()
        let json = """
        {
          "devices": [
            {"id":"preview-ac","name":"リビングのエアコン","room":"リビング","kind":"ac","source":"demo","online":true,"on":true,"targetTemp":25,"temperature":24.6,"humidity":48,"mode":"cool","connector":"daikin","fanSpeed":"auto","fanSwing":"vertical"},
            {"id":"preview-light","name":"メインライト","room":"リビング","kind":"light","source":"demo","online":true,"on":true,"brightness":72,"connector":"nature"},
            {"id":"preview-curtain","name":"カーテン","room":"リビング","kind":"curtain","source":"demo","online":true,"on":false,"position":0,"connector":"switchbot"},
            {"id":"preview-sensor","name":"温湿度センサー","room":"寝室","kind":"sensor","source":"demo","online":true,"temperature":23.8,"humidity":52,"connector":"switchbot"},
            {"id":"preview-plug","name":"デスクライト","room":"寝室","kind":"plug","source":"demo","online":true,"on":false,"connector":"smartlife"}
          ],
          "climate":{"temperature":24.6,"humidity":48,"lux":286,"label":"リビング"},
          "scenes":[{"id":"scene-1","name":"おはよう","hint":"朝の明かり"},{"id":"scene-2","name":"おやすみ","hint":"夜の準備"},{"id":"scene-3","name":"映画の時間","hint":"照明を落とす"}],
          "rooms":["リビング","寝室"]
        }
        """
        store.token = "visual-preview"
        store.home = try! JSONDecoder().decode(HomeSnapshot.self, from: Data(json.utf8))
        return store
    }
}
#endif
