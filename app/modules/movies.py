import json
import re
# pyrefly: ignore [missing-import]
from bs4 import BeautifulSoup
from groq import Groq




def fetch_letterboxd_list(username: str, list_type: str) -> list[dict]:
    """
    list_type: 'films' (watched), 'watchlist', or 'films/liked'
    Returns list of {title, year} dicts — first 50 items.
    """
    # pyrefly: ignore [missing-import]
    from curl_cffi import requests as cffi_requests

    username = username.strip()
    if list_type == 'films/liked':
        list_type = 'likes/films'

    url = f'https://letterboxd.com/{username}/{list_type}/'
    results = []
    try:
        r = cffi_requests.get(url, impersonate="chrome120", timeout=10)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, 'html.parser')
            film_elements = soup.find_all(attrs={"data-item-slug": True})
            for el in film_elements[:50]:
                display_name = el.get("data-item-full-display-name") or el.get("data-item-name") or ""
                # Parse "Nosferatu (2024)" -> ("Nosferatu", "2024")
                m = re.match(r"^(.*?)\s*\((\d{4})\)$", display_name)
                if m:
                    title, year = m.group(1).strip(), m.group(2).strip()
                else:
                    title, year = display_name.strip(), ""
                if title:
                    results.append({"title": title, "year": year})
    except Exception as e:
        print(f"[movies] Error fetching Letterboxd list {list_type}: {e}")
    return results


MOVIE_SYSTEM_PROMPT = """You are a film and TV recommendation engine with deep knowledge of cinema.

You receive a user's Letterboxd data: their liked films (taste profile), watchlist (want to watch), and recently watched films (already seen — NEVER recommend these).

Your job:
1. Recommend ONE movie. Prefer picking from the watchlist if there's a good match. If the watchlist has nothing fitting or is empty, recommend something new entirely.
2. Recommend ONE TV show. You have no data on what shows they've watched, so recommend based purely on taste profile from their liked films.

Rules:
- Base recommendations on genuine thematic, tonal, and stylistic similarities to liked films — not just genre.
- Write 1-2 sentences explaining WHY this recommendation fits THIS user's taste. Be specific. Mention films from their liked list by name.
- Do NOT recommend anything from the watched list.
- Return ONLY valid JSON. No preamble, no explanation, no markdown.

JSON:
{
  "movie": {
    "title": "Film Title",
    "year": 2001,
    "reason": "1-2 sentences referencing their specific taste.",
    "from_watchlist": true
  },
  "show": {
    "title": "Show Title",
    "year": 2022,
    "reason": "1-2 sentences referencing their specific taste."
  }
}"""


def get_movie_recommendation(config: dict) -> dict:
    """
    Main entry point for the movies module.
    Fetches Letterboxd data and gets an LLM recommendation.
    Returns: {movie_rec: {...}, show_rec: {...}}
    """
    username = config.get('letterboxd', {}).get('username', '').strip()
    if not username:
        return {'error': 'No Letterboxd username configured'}

    try:
        watched = fetch_letterboxd_list(username, 'films')
        watchlist = fetch_letterboxd_list(username, 'watchlist')
        liked = fetch_letterboxd_list(username, 'films/liked')
    except Exception as e:
        raise RuntimeError(f'Could not fetch Letterboxd data: {e}')

    liked_str = ', '.join(f"{f['title']} ({f['year']})" for f in liked[:30]) or 'none yet'
    watchlist_str = ', '.join(f"{f['title']} ({f['year']})" for f in watchlist[:30]) or 'empty'
    watched_str = ', '.join(f"{f['title']} ({f['year']})" for f in watched[:30]) or 'none'

    user_message = (
        f"Liked films (taste profile): {liked_str}\n\n"
        f"Watchlist (want to watch): {watchlist_str}\n\n"
        f"Recently watched (DO NOT recommend): {watched_str}\n\n"
        "Recommend one movie and one TV show."
    )

    client = Groq(api_key=config['groq']['api_key'])
    response = client.chat.completions.create(
        model=config['groq']['model'],
        messages=[
            {'role': 'system', 'content': MOVIE_SYSTEM_PROMPT},
            {'role': 'user', 'content': user_message},
        ],
        temperature=0.6,
        max_tokens=500,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1].rsplit('```', 1)[0]

    result = json.loads(raw)
    return {
        'movie_rec': result.get('movie', {}),
        'show_rec': result.get('show', {}),
    }
