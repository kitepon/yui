import SwiftUI

@main
struct YuiApp: App {
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-yui-visual-preview") {
                MainTabs(initialSelection: ProcessInfo.processInfo.arguments.contains("-yui-preview-scenes") ? 1 : 0)
                    .environmentObject(SessionStore.visualPreview())
                    .preferredColorScheme(.dark)
            } else {
                RootView().preferredColorScheme(.dark)
            }
            #else
            RootView()
                .preferredColorScheme(.dark)
            #endif
        }
    }
}
