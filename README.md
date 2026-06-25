# Oh No It's Today — Desktop App

A personal morning dashboard. Runs as a native desktop window (no browser).
Powered by Groq LLM, Open-Meteo, Letterboxd RSS, and your local news feeds.

---

## What it does

Opens a dark, minimal window every morning with:
- **News** — RSS headlines filtered and summarised by an LLM
- **Weather** — temperature, sunrise/sunset, rain warning
- **Quote** — 50/50 motivational vs. absurd
- **Watch** — one film + one TV series, personalised from your Letterboxd
- **Side Quest** — one small actionable challenge for the day
- **Archive** — every past day's brief, browsable

---

## Quick Start

### 1. Clone / download the project
```
git clone <your-repo> ohNoItsToday
cd ohNoItsToday
```

### 2. Create a virtual environment
```
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
```

### 3. Install dependencies
```
pip install -r requirements.txt
```

### 4. Copy the example config
```
copy config.example.yaml config.yaml   # Windows
# cp config.example.yaml config.yaml   # macOS / Linux
```

### 5. Edit config.yaml
Open `config.yaml` and fill in:
- `groq.api_key` — free at https://console.groq.com
- `location.city` / `location.country` — for weather
- `letterboxd.username` — your Letterboxd username (or leave blank)

### 6. Launch
```
python run.py          # shows a console window
pythonw run.py         # no console window (Windows only)
start.bat              # double-click shortcut (Windows, no console)
```

The app opens a native frameless window with a custom titlebar. No browser tab. No terminal needed after launch.

---

## Building a standalone .exe (Windows)

Packages everything into `dist\OhNoItsToday\OhNoItsToday.exe`.
No Python installation required on the target machine.

```
build.bat
```

Distribute by zipping the entire `dist\OhNoItsToday\` folder.

---

## Settings

Click **settings** in the footer, or go to `http://localhost:5000/settings` in a browser.

You can also edit `config.yaml` directly and restart the app.

### Themes

Five themes are available in **Settings → Appearance**:

| Theme | Vibe |
|-------|------|
| **Default** | Warm dark minimal (JetBrains Mono + Lora) |
| **Hacker** | Matrix green terminal, 1999 basement |
| **Newspaper** | Aged newsprint broadsheet |
| **Magic** | Hand-drawn star chart, purple ink |
| **Monochrome** | Pure black & white photocopier zine |

Theme choice is saved in your browser's local storage and persists across sessions.

---

## Data

- `data/cache.json` — today's cached brief (regenerated each new day)
- `data/history/YYYY-MM-DD.json` — one file per day, kept forever
- `data/geo_cache.json` — cached lat/lon for your city

All data is local. Nothing leaves your machine except API calls to Groq and Open-Meteo.

---

## Groq usage

The free Groq tier is sufficient. Each morning refresh makes ~3 LLM calls:
1. News filter + summarise (~2000 tokens in, ~800 out)
2. Movie/TV recommendation (~500 tokens in, ~200 out)
3. Side quest generation (~100 tokens in, ~150 out)

Total: well within free daily limits.
