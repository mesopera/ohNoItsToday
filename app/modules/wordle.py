import datetime
import requests

WORDLE_EPOCH = datetime.date(2021, 6, 19)   # Puzzle #1


def fetch_wordle_word(date: datetime.date = None) -> dict:
    """
    Fetches today's Wordle solution from the NYT public API.
    Returns: {solution, date, number}
    The API is unauthenticated and publicly accessible.
    """
    if date is None:
        date = datetime.date.today()

    url = f"https://www.nytimes.com/svc/wordle/v2/{date:%Y-%m-%d}.json"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    number = data.get("days_since_launch", (date - WORDLE_EPOCH).days) + 1

    return {
        "solution": data["solution"].upper(),
        "date":     date.isoformat(),
        "number":   number,
        "status":   "pending",
        "attempts": None,
        "guesses":  [],
    }