"""
Oh No It's Today — Desktop Entry Point
Starts Flask in a background thread, then opens a native pywebview window.
No browser required. No terminal window shown when launched via start.bat.
"""

import os
import sys
import time
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.server import app as flask_app
from app.config_loader import get_config

try:
    import webview
except ImportError:
    print("[ohNoItsToday] pywebview is not installed.")
    print("  Run: pip install pywebview")
    sys.exit(1)


def run_flask(port: int) -> None:
    """Run Flask server in a daemon thread."""
    flask_app.run(
        port=port,
        debug=False,
        use_reloader=False,
        threaded=True,
    )


class WindowAPI:
    """
    Python methods exposed to JavaScript via window.pywebview.api.*
    Called from the frontend for window control (minimize, close).
    """
    def __init__(self) -> None:
        self._window = None

    def set_window(self, win) -> None:
        self._window = win

    def minimize_window(self) -> None:
        if self._window:
            self._window.minimize()

    def close_window(self) -> None:
        if self._window:
            self._window.destroy()


if __name__ == "__main__":
    config = get_config()
    port = 5000

    if config:
        port = config.get("app", {}).get("port", 5000)

    # --- Start Flask in background ---
    flask_thread = threading.Thread(
        target=run_flask,
        args=(port,),
        daemon=True,
    )
    flask_thread.start()
    time.sleep(1.0)  # Give Flask time to bind before webview opens

    # --- Create pywebview window ---
    api = WindowAPI()

    window = webview.create_window(
        title="Oh No It's Today",
        url=f"http://localhost:{port}",
        width=980,
        height=920,
        min_size=(720, 600),
        background_color="#0a0a0a",
        js_api=api,
        frameless=True,
    )

    api.set_window(window)

    # start() blocks until window is closed — this is the main thread
    webview.start(debug=False)
