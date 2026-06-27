# 🌅 Oh No It's Today

> *Your attention span deserves better than doomscrolling.*

A desktop app that gives you everything worth knowing before your first coffee. News, weather, recommendations, and one tiny reason to get out of bed.

Powered by **Groq**, **Open-Meteo**, **Letterboxd**, and RSS.

---

# Installation

### 1. Clone the project

```bash
git clone <your-repo> ohNoItsToday
cd ohNoItsToday
```

### 2. Create a virtual environment

```bash
python -m venv venv
venv\Scripts\activate
# source venv/bin/activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Create your config

```bash
copy config.example.yaml config.yaml
# cp config.example.yaml config.yaml
```

Open `config.yaml` and add:

* Groq API key
* City & country
* Letterboxd username (optional, but your recommendations will stop sucking if you do.)

### 5. Run

```bash
python run.py
```

On Windows, you can also use:

```bash
pythonw run.py
```

or simply double-click `start.bat` if typing is too physically demanding.

---

# Features

### 📰 Smart News

Top headlines filtered and summarized into a quick morning briefing.

### 🌤 Weather

Current conditions, rain alerts, Whether the sky has beef with you today and sunrise/sunset.

### 💬 Daily Quote

half profound - half complete horseshit. You'll read it anyway.

### 🎬 Watch Tonight

One movie and one TV recommendation, so you can spend your evening watching something instead of spending an hour deciding what to watch.

### 🎲 Side Quest

A small challenge to make today slightly less identical to yesterday. Touch grass. Learn to juggle. Start a revolution. Call your mum.

### 📚 Archive

Every day's briefing is saved forever so future-you can remember exactly when everything started going downhill.

---

# Privacy

Everything is stored locally.

The app only contacts Groq for AI responses and Open-Meteo for weather.

No accounts.
No analytics.
No telemetry.
No selling your soul for ads

---

# Why?

Most mornings begin the same way:

Open the weather.
Open the news.
Scroll Reddit.
Wonder what to watch tonight.
Forget what you were doing.

**Oh No It's Today** puts the useful bits in one place, then gets out of your way.

Then you can get on with whatever it is you pretend you're going to accomplish today.
