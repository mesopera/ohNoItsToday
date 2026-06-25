import feedparser
import json
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from bs4 import BeautifulSoup
from groq import Groq

# feedparser's default UA gets blocked by some feeds (Reddit especially)
feedparser.USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ── Default sources (used when config has none / settings wiped them) ─────────
DEFAULT_SOURCES = {
    "international": [
        {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",          "name": "BBC World"},
        {"url": "https://www.aljazeera.com/xml/rss/all.xml",            "name": "Al Jazeera"},
        {"url": "https://www.theguardian.com/world/rss",                "name": "The Guardian"},
        {"url": "https://feeds.apnews.com/rss/apf-topnews",            "name": "AP News"},
    ],
    "national": [
        {"url": "https://www.thehindu.com/news/national/feeder/default.rss", "name": "The Hindu"},
        {"url": "https://timesofindia.indiatimes.com/rss.cms",               "name": "Times of India"},
        {"url": "https://www.ndtv.com/rss/2012",                            "name": "NDTV India"},
    ],
    "local": [
        {"url": "https://timesofindia.indiatimes.com/city/pune/rss.cms", "name": "TOI Pune"},
    ],
    "funny": [
        {"url": "https://www.reddit.com/r/nottheonion/.rss", "name": "Not The Onion"},
        {"url": "https://www.reddit.com/r/worldnews/.rss",  "name": "r/worldnews"},
    ],
}


# ── RSS Fetching ─────────────────────────────────────────────────────────────

def fetch_rss_items(config: dict, fetch_since: datetime) -> list[dict]:
    """
    fetch_since must be a naive UTC datetime.
    Returns all items published after fetch_since.
    """
    sources = config.get("news", {}).get("rss_sources") or {}
    # Merge with defaults: use config category if non-empty, else default
    merged: dict = {}
    for cat, default_feeds in DEFAULT_SOURCES.items():
        merged[cat] = sources.get(cat) or default_feeds

    print(f"[news] fetch_since (UTC): {fetch_since}")

    all_items = []
    for category, feeds in merged.items():
        for feed in feeds:
            try:
                parsed = feedparser.parse(feed["url"])
                n_total = len(parsed.entries)
                n_kept = 0
                for entry in parsed.entries:
                    published = _parse_entry_utc(entry)
                    if published is None:
                        # No date → include it anyway (better than missing news)
                        published = datetime.utcnow()
                    if published < fetch_since:
                        continue
                    n_kept += 1
                    item = {
                        "title":     entry.get("title", ""),
                        "summary":   _clean_html(entry.get("summary", entry.get("description", ""))),
                        "url":       entry.get("link", ""),
                        "image_url": _extract_image(entry),
                        "published": published.isoformat(),
                        "category":  category,
                        "source":    feed["name"],
                    }
                    if item["url"]:
                        all_items.append(item)
                print(f"[news]   {feed['name']}: {n_kept}/{n_total} items passed date filter")
            except Exception as e:
                print(f"[news]   WARNING: failed to fetch {feed.get('name', '?')}: {e}")

    # Deduplicate by URL
    seen: set = set()
    unique = []
    for item in all_items:
        if item["url"] not in seen:
            seen.add(item["url"])
            unique.append(item)

    print(f"[news] total unique items: {len(unique)}")
    return unique


def _parse_entry_utc(entry) -> datetime | None:
    """
    Always returns a naive UTC datetime, or None if unparseable.
    feedparser's *_parsed tuples are UTC — use them first.
    String date fields are converted to UTC explicitly.
    """
    for field in ("published_parsed", "updated_parsed"):
        val = entry.get(field)
        if val:
            try:
                return datetime(*val[:6])  # already UTC, naive
            except Exception:
                pass
    for field in ("published", "updated", "created"):
        raw = entry.get(field)
        if raw:
            try:
                dt = parsedate_to_datetime(raw)          # aware datetime
                return dt.astimezone(timezone.utc).replace(tzinfo=None)  # → naive UTC
            except Exception:
                pass
    return None


def _extract_image(entry) -> str | None:
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        url = entry.media_thumbnail[0].get("url")
        if url and _is_image_url(url):
            return url
    if hasattr(entry, "media_content") and entry.media_content:
        for mc in entry.media_content:
            url = mc.get("url")
            if url and _is_image_url(url):
                return url
    if hasattr(entry, "enclosures") and entry.enclosures:
        for enc in entry.enclosures:
            url = enc.get("href") or enc.get("url")
            mime = enc.get("type", "")
            if url and ("image" in mime or _is_image_url(url)):
                return url
    summary_html = entry.get("summary", "") or ""
    if not summary_html and hasattr(entry, "content") and entry.content:
        summary_html = entry.content[0].get("value", "")
    if summary_html:
        soup = BeautifulSoup(summary_html, "html.parser")
        img = soup.find("img")
        if img and img.get("src") and _is_image_url(img["src"]):
            return img["src"]
    return None


def _is_image_url(url: str) -> bool:
    return any(url.lower().split("?")[0].endswith(ext)
               for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif"))


def _clean_html(text: str) -> str:
    if not text:
        return ""
    soup = BeautifulSoup(text, "html.parser")
    return soup.get_text(separator=" ", strip=True)[:500]


# ── Groq Filtering ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a sharp, no-nonsense news editor. You receive a list of news items from RSS feeds. Your job is to select the best items and rewrite them as clean, human summaries.

SELECTION RULES:
- Select 6-7 important news items total.
- Try to include at least 1 "international", 1 "national", and 1 "local" item IF any exist that are genuinely noteworthy. Never pad with unimportant stories to fill a slot.
- Select up to 2 "funny" items — genuinely absurd, bizarre, or darkly comic. Not just mildly quirky. If none are worth including, include 0.
- SKIP politics of the "politician says thing about another politician" variety. Only include political news with concrete real-world impact.
- PRIORITIZE: natural disasters, scientific breakthroughs, major economic shifts, wars/conflicts, tech developments, anything that changes something real for real people.
- Total output: 7-9 items (news + funny combined).

WRITING RULES:
- Each summary: 1-3 sentences maximum.
- Write like a knowledgeable friend explaining the story. Not headline style. No corporate language.
- Each summary should give enough context to understand the situation.

OUTPUT: Return ONLY valid JSON. No preamble, no explanation, no markdown code blocks.

JSON STRUCTURE:
{
  "news": [
    {
      "id": <integer id of the selected item>,
      "summary": "1-3 sentence natural summary."
    }
  ],
  "funny": [
    {
      "id": <integer id of the selected item>,
      "summary": "1-3 sentence summary."
    }
  ]
}"""


def filter_news_with_llm(items: list[dict], config: dict, fetch_since: datetime) -> dict:
    client = Groq(api_key=config["groq"]["api_key"])

    items_for_llm = [
        {
            "id":          i,
            "title":       item["title"],
            "raw_summary": item["summary"][:150],
            "category":    item["category"],
        }
        for i, item in enumerate(items)
    ]

    user_message = (
        f"News items collected since {fetch_since.strftime('%Y-%m-%d %H:%M')} UTC:\n\n"
        f"{json.dumps(items_for_llm, indent=2)}\n\n"
        "Select and summarize the best items following all rules. Return only JSON."
    )

    response = client.chat.completions.create(
        model=config["groq"]["model"],
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_message},
        ],
        temperature=0.3,
        max_tokens=3000,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    result = json.loads(raw)
    
    # Map items by their sequence id
    items_by_id = {i: item for i, item in enumerate(items)}
    
    final_result = {"news": [], "funny": []}
    for key in ("news", "funny"):
        for llm_item in result.get(key, []):
            try:
                item_id = int(llm_item.get("id"))
                if item_id in items_by_id:
                    orig = items_by_id[item_id]
                    final_result[key].append({
                        "summary": llm_item.get("summary", ""),
                        "url": orig["url"],
                        "image_url": orig["image_url"],
                    })
            except (ValueError, TypeError):
                continue
                
    return final_result


# ── Public API ────────────────────────────────────────────────────────────────

def get_news(config: dict, fetch_since: datetime) -> dict:
    items = fetch_rss_items(config, fetch_since)
    if not items:
        return {"news": [], "funny": [], "error": "No RSS items fetched — check console output"}
        
    # Group items by category to limit the items sent to LLM (prevents TPM issues)
    by_category = {}
    for item in items:
        cat = item["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(item)
        
    limited_items = []
    for cat, cat_items in by_category.items():
        # Sort by published date descending (newest first)
        cat_items.sort(key=lambda x: x.get("published", ""), reverse=True)
        # Keep top 15 items per category
        limited_items.extend(cat_items[:15])
        
    print(f"[news] filtered/limited to {len(limited_items)} items for LLM")
    return filter_news_with_llm(limited_items, config, fetch_since)
