"""ZMSOfficeMCP.exe 進入點：MCP 伺服器（stdio）。設定方式見程式內「MCP 連線設定」。"""
import os
import sys

if not os.environ.get("SSL_CERT_FILE"):
    try:
        import certifi
        os.environ["SSL_CERT_FILE"] = certifi.where()
    except Exception:
        pass
sys.stdout.reconfigure(encoding="utf-8") if hasattr(sys.stdout, "reconfigure") else None

from zo import mcp_server  # noqa: E402

mcp_server.run()
