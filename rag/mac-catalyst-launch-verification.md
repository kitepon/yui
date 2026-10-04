# Mac Catalystの起動検証

出典: Xcode 27の実ビルド、macOS 27のクラッシュレポート、`otool`・`vmmap`・Swift実行環境の実測。取得日: 2026年10月4日。確度: 同じバイナリと起動コードで再現・比較した。

Mac Catalystは同じbundle IDでiPhone・iPadとアカウントおよびApp Store商品を共有できる。[Appleのbundle ID仕様](https://help.apple.com/xcode/mac/current/en.lproj/dev07ed024a6.html)。本プロジェクトは既存のアプリ登録を利用する。

## 検証用ランチャーによるクラッシュ

認証情報を環境変数へ渡す検証用ランチャーをSwiftのインタープリターで実行したとき、Mac版1.0（10）が起動直後に`DYLD / Symbol missing`で終了した。欠けたシンボルは`TextInputAutocapitalization.never`。クラッシュしたdylibのUUIDと、通常起動で動いたdylibのUUIDは一致した。

`swift -e`で起動したプロセスには`DYLD_FRAMEWORK_PATH=/System/Library/Frameworks`が設定されていた。この環境がNSWorkspaceの子へ渡り、アプリが指定した`/System/iOSSupport/System/Library/Frameworks/SwiftUI.framework`をMac標準のSwiftUIへ置き換えていた。

環境変数指定と`createsNewApplicationInstance`を個別に外しても、インタープリター経由では同じクラッシュを再現した。同じ起動コードを`swiftc`でコンパイルしてから実行すると正常起動し、`vmmap`でもMac Catalyst用のSwiftUIを確認した。アプリのリンク設定や入力APIは変更していない。

クラッシュ本文を読む前に起動確認を進めた順序は不適切だった。ファイルの存在だけを確認して原因を未確認のまま審査準備へ進めたことと、検証環境の失敗を実装の失敗と混同しないための比較結果を記録する。

## 機器詳細を開くと終了する不具合

通常起動後、21時00分に機器名を押して詳細を開くと`EXC_BREAKPOINT / SIGTRAP`で終了した。起動時のDYLD失敗とは別の不具合で、スタックは`EnvironmentObject.error()`から`DeviceDetailView.device`へ続き、実行ログにも`No ObservableObject of type SessionStore found`が残った。

`HomeView`の機器詳細sheetにだけ、親が持つ`SessionStore`の明示的な注入がなかった。場面・オートメーション・場所のsheetにはすでに注入があった。機器詳細にも同じセッションを渡す1行を追加し、MacとiPadで詳細を開き、デモ照明のON→OFFと表示、画面の閉じ方を確認した。場面編集とオートメーション作成の開閉もMacで成功した。

## 配布と画面写真の要件

Mac版にはApp Sandboxと送信ネットワークの権限を設定し、Sign in with Appleを持つ既存のUNIVERSAL App IDで署名する。開発実行にはMac Catalyst開発プロファイル、審査にはApp Store用プロファイルを使う。

iPad対応には13インチの画面写真が必要。Macの画面写真はAppleが受理するサイズを使う。[画面写真の仕様](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)。

公開待ちの既存iOS版は、Appleが用意する審査取り下げから最新版のビルドへ差し替え、再審査する。[審査取り下げの仕様](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/remove-a-submission-from-review/)。
