import SwiftUI

@main
struct YuiApp: App {
    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-yui-visual-preview") {
                MainTabs(initialSelection: ProcessInfo.processInfo.arguments.contains("-yui-preview-analysis") ? 2 :
                    (ProcessInfo.processInfo.arguments.contains("-yui-preview-scenes") ? 1 :
                     ProcessInfo.processInfo.arguments.contains("-yui-preview-settings") ? 3 : 0))
                    .environmentObject(ProcessInfo.processInfo.arguments.contains("-yui-preview-analysis") ?
                        SessionStore.analysisPreview() : SessionStore.visualPreview())
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
