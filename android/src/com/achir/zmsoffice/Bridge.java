package com.achir.zmsoffice;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * 網頁呼叫的 Android 功能（window.ZMSAndroid）：
 * 存檔（分段傳進來，避免大檔一次吃光記憶體）→ 手機「下載/文件office彙整」＋分享選單、開網址、版本資訊。
 * JavaScript 介面在背景執行緒執行；回傳值一律是 JSON 字串。
 */
final class Bridge {
    final MainActivity a;
    final Map<String, Save> saves = new HashMap<>();

    static final class Save { String name, mime; Uri uri; File file; OutputStream out; }

    Bridge(MainActivity a) { this.a = a; }

    static String ok(Object... kv) {
        JSONObject o = new JSONObject();
        try { o.put("status", "ok"); for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]); } catch (Exception ignored) { }
        return o.toString();
    }
    static String err(Exception e) {
        JSONObject o = new JSONObject();
        try { o.put("status", "error"); o.put("message", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        return o.toString();
    }

    static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
    }

    @JavascriptInterface
    public String getVersion() { return version(a); }

    @JavascriptInterface
    public String appInfo() { return ok("name", a.getString(R.string.app_name), "version", version(a), "platform", "android", "sdk", Build.VERSION.SDK_INT, "model", Build.MODEL); }

    // ---- 存檔：saveBegin → saveChunk（base64，多次）→ saveEnd ----
    @JavascriptInterface
    public String saveBegin(String name, String mime) {
        try {
            Save s = new Save();
            s.name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            s.mime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, s.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, s.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/文件office彙整");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                ContentResolver cr = a.getContentResolver();
                s.uri = cr.insert(MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                s.out = cr.openOutputStream(s.uri);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "文件office彙整");
                dir.mkdirs();
                s.file = new File(dir, s.name);
                s.out = new FileOutputStream(s.file);
            }
            String id = String.valueOf(System.nanoTime());
            synchronized (saves) { saves.put(id, s); }
            return ok("id", id);
        } catch (Exception e) { return err(e); }
    }

    @JavascriptInterface
    public String saveChunk(String id, String b64) {
        Save s;
        synchronized (saves) { s = saves.get(id); }
        if (s == null) return err(new Exception("no save"));
        try { s.out.write(Base64.decode(b64, Base64.DEFAULT)); return ok(); } catch (Exception e) { return err(e); }
    }

    @JavascriptInterface
    public String saveEnd(String id) {
        Save s;
        synchronized (saves) { s = saves.remove(id); }
        if (s == null) return err(new Exception("no save"));
        try {
            s.out.close();
            Uri share = s.uri;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                a.getContentResolver().update(s.uri, v, null, null);
            } else {
                android.media.MediaScannerConnection.scanFile(a, new String[] { s.file.getAbsolutePath() }, new String[] { s.mime }, null);
                share = null;
            }
            final Uri u = share;
            final String mime = s.mime;
            if (u != null) a.runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { a.startActivity(Intent.createChooser(send, "分享檔案").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); } catch (Exception ignored) { }
            });
            return ok("path", "下載/文件office彙整/" + s.name);
        } catch (Exception e) { return err(e); }
    }

    /** 只允許開啟 https 網址（GitHub 下載新版、說明頁） */
    @JavascriptInterface
    public boolean openUrl(String url) {
        if (!url.startsWith("https://")) return false;
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return true; } catch (Exception e) { return false; }
    }
}
