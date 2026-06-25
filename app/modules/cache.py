from datetime import datetime, date, time, timedelta
import json
import os
import shutil

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'cache.json')
HISTORY_DIR = os.path.join(DATA_DIR, 'history')


def get_current_day(boundary_hour: int = 6) -> date:
    """
    Returns the logical 'current day'.
    Before 6 AM → returns yesterday's date.
    After 6 AM  → returns today's date.
    This means a late-night session won't get new content just because midnight passed.
    """
    now = datetime.now()
    if now.time() < time(boundary_hour, 0):
        return (now - timedelta(days=1)).date()
    return now.date()


def load_cache() -> dict | None:
    """Returns parsed cache.json, or None if it doesn't exist."""
    if not os.path.exists(CACHE_FILE):
        return None
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_cache(data: dict) -> None:
    """
    Writes data to cache.json and copies it to data/history/YYYY-MM-DD.json.
    Creates directories as needed.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    # Archive copy
    history_path = os.path.join(HISTORY_DIR, f"{data['date']}.json")
    shutil.copy2(CACHE_FILE, history_path)


def needs_refresh(boundary_hour: int = 6) -> tuple[bool, date | None]:
    """
    Returns (refresh_needed, last_cached_date).
    refresh_needed is True if content was generated on a different logical day.
    last_cached_date is used to compute the RSS fetch window.
    """
    cache = load_cache()
    if cache is None:
        return True, None
    last_date = date.fromisoformat(cache['date'])
    current_day = get_current_day(boundary_hour)
    return last_date != current_day, last_date


def get_fetch_since(boundary_hour: int = 6) -> datetime:
    """
    Always returns a naive UTC datetime (36h ago).
    This is intentionally simple: RSS published_parsed is UTC (naive),
    so fetch_since must also be UTC to avoid IST vs UTC mismatches
    silently filtering out every article.
    36h (not 24h) gives a safe buffer if the PC was off overnight.
    """
    return datetime.utcnow() - timedelta(hours=36)


def update_quest_status(status: str) -> bool:
    """
    Updates sidequest.status in both cache.json and the corresponding history file.
    status must be 'done' or 'skipped'.
    Returns True on success.
    """
    cache = load_cache()
    if cache is None:
        return False
    cache['sidequest']['status'] = status
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)
    # Mirror into history file
    history_path = os.path.join(HISTORY_DIR, f"{cache['date']}.json")
    if os.path.exists(history_path):
        with open(history_path, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    return True


def list_history_dates() -> list[str]:
    """
    Returns date strings for all history files, sorted descending (newest first).
    """
    os.makedirs(HISTORY_DIR, exist_ok=True)
    files = [f.replace('.json', '') for f in os.listdir(HISTORY_DIR) if f.endswith('.json')]
    return sorted(files, reverse=True)


def load_history_day(date_str: str) -> dict | None:
    """Returns parsed JSON for a specific history date, or None if not found."""
    path = os.path.join(HISTORY_DIR, f"{date_str}.json")
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
