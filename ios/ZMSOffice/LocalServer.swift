import Foundation
import Network

/// App 內的小型網頁伺服器（只聽 127.0.0.1）：提供 App 裡的 web 資料夾（和線上版同一份網頁）。
/// 用 http://127.0.0.1 載入才算「安全來源」：IndexedDB、WebCodecs、麥克風都能正常使用。
/// 固定埠號（和資料助秘／小柯系列其他 App 錯開），文件資料綁在這個網址上，每次開啟都還在。
/// - GET：網頁檔案，支援 Range（影片、音樂一定會用 Range）
/// - POST /__save?name=檔名：網頁匯出的文件傳進來 → 存到暫存資料夾 → 開分享選單（存到照片、檔案、LINE…）
final class LocalServer {
    static let shared = LocalServer()
    private(set) var port: UInt16 = 48591
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "zms.server", attributes: .concurrent)
    private let root = Bundle.main.url(forResource: "web", withExtension: nil)!
    var onSaved: ((URL) -> Void)?

    var url: URL { URL(string: "http://127.0.0.1:\(port)/index.html")! }

    func start() {
        for p in [UInt16(48591), 48592, 48593, 0] {
            do {
                let params = NWParameters.tcp
                params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: p)!)
                params.allowLocalEndpointReuse = true
                let l = try NWListener(using: params)
                let ready = DispatchSemaphore(value: 0)
                var ok = false
                l.stateUpdateHandler = { st in
                    switch st {
                    case .ready: ok = true; ready.signal()
                    case .failed, .cancelled: ready.signal()
                    default: break
                    }
                }
                l.newConnectionHandler = { [weak self] c in self?.handle(c) }
                l.start(queue: queue)
                _ = ready.wait(timeout: .now() + 2)
                if ok { listener = l; port = l.port?.rawValue ?? p; return }
                l.cancel()
            } catch { continue }
        }
    }

    private func handle(_ c: NWConnection) {
        c.start(queue: queue)
        var buf = Data()
        var head: String?
        var bodyStart = 0
        var need = 0
        func read() {
            c.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] data, _, done, err in
                guard let self else { return }
                if let data { buf.append(data) }
                if head == nil, let end = buf.range(of: Data("\r\n\r\n".utf8)) {
                    head = String(decoding: buf[..<end.lowerBound], as: UTF8.self)
                    bodyStart = end.upperBound
                    for l in head!.components(separatedBy: "\r\n") where l.lowercased().hasPrefix("content-length:") {
                        need = Int(l.dropFirst(15).trimmingCharacters(in: .whitespaces)) ?? 0
                    }
                }
                if let h = head, buf.count - bodyStart >= need {
                    self.respond(c, head: h, body: need > 0 ? buf.subdata(in: bodyStart..<(bodyStart + need)) : Data())
                } else if done || err != nil || (head == nil && buf.count > 1_000_000) {
                    c.cancel()
                } else { read() }
            }
        }
        read()
    }

    private func respond(_ c: NWConnection, head: String, body reqBody: Data) {
        let lines = head.components(separatedBy: "\r\n")
        let parts = (lines.first ?? "").split(separator: " ")
        let method = parts.first.map(String.init) ?? "GET"
        var path = parts.count > 1 ? String(parts[1]) : "/"
        var query = ""
        if let q = path.firstIndex(of: "?") { query = String(path[path.index(after: q)...]); path = String(path[..<q]) }
        path = path.removingPercentEncoding ?? path

        if method == "POST" && path == "/__save" {
            var name = "文件"
            for kv in query.split(separator: "&") where kv.hasPrefix("name=") {
                name = String(kv.dropFirst(5)).removingPercentEncoding ?? name
            }
            name = name.replacingOccurrences(of: "/", with: "_")
            let dir = FileManager.default.temporaryDirectory.appendingPathComponent("export", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            let f = dir.appendingPathComponent(name)
            try? FileManager.default.removeItem(at: f)
            do {
                try reqBody.write(to: f)
                DispatchQueue.main.async { self.onSaved?(f) }
                send(c, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n", Data("{\"ok\":true}".utf8))
            } catch {
                send(c, "HTTP/1.1 500 Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", nil)
            }
            return
        }

        if path.hasSuffix("/") { path += "index.html" }
        var range: String?
        for l in lines.dropFirst() where l.lowercased().hasPrefix("range:") { range = l.dropFirst(6).trimmingCharacters(in: .whitespaces) }

        guard !path.contains(".."), let body = try? Data(contentsOf: root.appendingPathComponent(String(path.dropFirst())), options: .mappedIfSafe) else {
            send(c, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", nil)
            return
        }
        let type = Self.mime((path as NSString).pathExtension.lowercased())
        let total = body.count
        if let range, range.hasPrefix("bytes="), total > 0 {
            let spec = range.dropFirst(6).split(separator: ",").first.map(String.init) ?? ""
            let se = spec.split(separator: "-", omittingEmptySubsequences: false).map { String($0).trimmingCharacters(in: .whitespaces) }
            var start = 0, end = total - 1
            if se.count == 2 {
                if se[0].isEmpty, let n = Int(se[1]) { start = max(0, total - n) }
                else { start = Int(se[0]) ?? 0; if let e = Int(se[1]) { end = min(e, total - 1) } }
            }
            if start > end || start >= total {
                send(c, "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */\(total)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", nil)
                return
            }
            let h = "HTTP/1.1 206 Partial Content\r\nContent-Type: \(type)\r\nAccept-Ranges: bytes\r\nContent-Range: bytes \(start)-\(end)/\(total)\r\nContent-Length: \(end - start + 1)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
            send(c, h, body.subdata(in: start..<(end + 1)))
            return
        }
        let h = "HTTP/1.1 200 OK\r\nContent-Type: \(type)\r\nAccept-Ranges: bytes\r\nContent-Length: \(total)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        send(c, h, body)
    }

    private func send(_ c: NWConnection, _ head: String, _ body: Data?) {
        var out = Data(head.utf8)
        if let body { out.append(body) }
        c.send(content: out, completion: .contentProcessed { _ in c.cancel() })
    }

    static func mime(_ ext: String) -> String {
        switch ext {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "gif": return "image/gif"
        case "mp3": return "audio/mpeg"
        case "m4a": return "audio/mp4"
        case "mp4": return "video/mp4"
        case "ttf": return "font/ttf"
        case "woff2": return "font/woff2"
        case "wasm", "br": return "application/wasm"
        case "pdf": return "application/pdf"
        case "xml": return "application/xml"
        default: return "application/octet-stream"
        }
    }
}
