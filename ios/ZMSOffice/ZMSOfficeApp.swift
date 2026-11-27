import AVFoundation
import SwiftUI
import UIKit
import WebKit

/// 資料助秘文件office彙整 — iPhone／iPad 版
/// WKWebView 開啟 App 內建的網頁（和線上版同一份程式），由 LocalServer 在 127.0.0.1 提供 → 不用網路也能用。
/// 文件存在網頁的 IndexedDB；匯出的檔案經 LocalServer 傳回 App，再用分享選單存到檔案或傳出去。
@main
struct ZMSOfficeApp: App {
    init() {
        LocalServer.shared.start()
        // 教學語音：靜音開關打開時也要聽得到
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
        try? AVAudioSession.sharedInstance().setActive(true)
        LocalServer.shared.onSaved = { url in Web.shared.share(url) }
    }

    var body: some Scene {
        WindowGroup {
            WebContainer()
                .background(Color(red: 0.953, green: 0.953, blue: 0.953))
                .ignoresSafeArea()
        }
    }
}

struct WebContainer: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView { Web.shared.view }
    func updateUIView(_ v: WKWebView, context: Context) {}
}

/// 網頁與 App 之間的橋：網頁呼叫 window.webkit.messageHandlers.zms.postMessage({cmd, args})，回傳 Promise
final class Web: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate {
    static let shared = Web()
    let view: WKWebView

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []      // 教學語音一步接一步自動播放
        cfg.websiteDataStore = .default()
        let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        // 讓網頁知道自己在 iPhone／iPad App 裡；網頁的錯誤訊息轉到 iOS 系統記錄
        let shim = WKUserScript(source: """
            window.ZMSIOS = { version: '\(ver)' };
            (function () {
              function send(k, a) { try { window.webkit.messageHandlers.zms.postMessage({ cmd: 'log', args: [k, Array.prototype.map.call(a, function (x) { return x && x.stack ? x.stack : String(x); }).join(' ')] }); } catch (e) {} }
              var ce = console.error.bind(console);
              console.error = function () { send('error', arguments); ce.apply(null, arguments); };
              window.addEventListener('error', function (e) { send('pageerror', [e.message + ' @' + e.filename + ':' + e.lineno]); });
              window.addEventListener('unhandledrejection', function (e) { send('rejection', [e.reason]); });
            })();
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        cfg.userContentController.addUserScript(shim)
        view = WKWebView(frame: .zero, configuration: cfg)
        super.init()
        cfg.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "zms")
        view.navigationDelegate = self
        view.uiDelegate = self
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.953, green: 0.953, blue: 0.953, alpha: 1)
        view.scrollView.backgroundColor = view.backgroundColor
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsBackForwardNavigationGestures = false
        if #available(iOS 16.4, *) { view.isInspectable = true }
        view.load(URLRequest(url: LocalServer.shared.url))
    }

    /// 匯出的文件：開分享選單（存到檔案、LINE、AirDrop、郵件…）
    func share(_ url: URL) {
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let pop = vc.popoverPresentationController {         // iPad 一定要指定位置
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        present(vc) {}
    }

    // 網頁要用麥克風／相機時直接允許（系統第一次仍會詢問使用者）
    @available(iOS 15.0, *)
    func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "127.0.0.1" ? .grant : .prompt)
    }

    // 外部連結（GitHub、安裝頁、YouTube 上傳）用 Safari 開
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, u.host != "127.0.0.1", ["http", "https", "itms-services"].contains(u.scheme ?? ""), a.targetFrame?.isMainFrame != false {
            UIApplication.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures f: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { UIApplication.shared.open(u) }
        return nil
    }

    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let ac = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        ac.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        ac.addAction(UIAlertAction(title: "確定", style: .default) { _ in completionHandler(true) })
        present(ac) { completionHandler(false) }
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let ac = UIAlertController(title: nil, message: m, preferredStyle: .alert)
        ac.addAction(UIAlertAction(title: "確定", style: .default) { _ in completionHandler() })
        present(ac) { completionHandler() }
    }

    // 模擬器測試（啟動參數 -autotest）：載入完成後自動建立一份文件並開啟，方便截圖檢查
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        guard ProcessInfo.processInfo.arguments.contains("-autotest") else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            w.evaluateJavaScript("(async()=>{document.querySelectorAll('.dlg-wrap .btn').forEach(b=>{if(!b.classList.contains('primary'))b.click()});await ZO.api('pref',{guideSeen:true});const d=await ZO.api('doc_new',{kind:'word',name:'iOS 測試'});ZO.openDoc(d);setTimeout(()=>{try{const f=document.querySelector('.view.doc iframe').contentWindow;f.ZOE.runBuilder('var p=Api.CreateParagraph();p.AddText(\"iPhone 版編輯測試 OK\");Api.GetDocument().Push(p);')}catch(e){}},20000)})()", completionHandler: nil)
        }
    }

    // 網頁被系統回收時（記憶體不足）自動重新載入
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }

    func userContentController(_ u: WKUserContentController, didReceive m: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = m.body as? [String: Any], let cmd = body["cmd"] as? String else { replyHandler(nil, "bad message"); return }
        let args = body["args"] as? [Any] ?? []
        let s = { (i: Int) -> String in args.count > i ? "\(args[i])" : "" }
        let ver = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        switch cmd {
        case "app_info":
            replyHandler(["status": "ok", "name": "資料助秘文件office彙整", "version": ver, "platform": "ios", "model": UIDevice.current.model], nil)
        case "log":
            NSLog("[web %@] %@", s(0), s(1))
            replyHandler(true, nil)
        case "open_url":
            if let u = URL(string: s(0)), u.scheme == "https" { UIApplication.shared.open(u) }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown command \(cmd)")
        }
    }

    private func present(_ vc: UIViewController, fail: () -> Void) {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
        while let p = top?.presentedViewController { top = p }
        if let top { top.present(vc, animated: true) } else { fail() }
    }
}
