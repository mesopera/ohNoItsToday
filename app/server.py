from flask import Flask, jsonify, render_template, request, redirect, url_for
from app.config_loader import get_config, save_config
from app.modules.cache import (
    load_cache, save_cache, needs_refresh, get_fetch_since,
    update_quest_status, list_history_dates, load_history_day, get_current_day,
)
from app.modules.news import get_news
from app.modules.weather import fetch_weather
from app.modules.movies import get_movie_recommendation
from app.modules.quotes import get_quote
from app.modules.sidequest import generate_sidequest
from app.modules.wordle import fetch_wordle_word
from app.modules.cache import update_wordle_status
from datetime import datetime
import threading

app = Flask(__name__)
_generation_lock = threading.Lock()
_is_generating = False


# ── Pages ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    config = get_config()
    if config is None:
        return redirect(url_for('settings'))
    if not config.get('groq', {}).get('api_key'):
        return redirect(url_for('settings'))
    return render_template('index.html')


@app.route('/settings')
def settings():
    config = get_config() or {}
    return render_template('settings.html', config=config)


# ── API ──────────────────────────────────────────────────────────────────────

@app.route('/api/data')
def get_data():
    """
    Main data endpoint.
    Returns cached data if fresh; generates new data if stale.
    A cache miss can take 10-20 seconds (multiple LLM calls).
    """
    global _is_generating
    config = get_config()

    if config is None or not config.get('groq', {}).get('api_key'):
        return jsonify({'error': 'no_key'}), 400

    boundary_hour = config.get('app', {}).get('day_boundary_hour', 6)
    refresh_needed, last_date = needs_refresh(boundary_hour)

    if not refresh_needed:
        return jsonify(load_cache())

    with _generation_lock:
        # Re-check after acquiring lock — another thread may have just generated
        refresh_needed, last_date = needs_refresh(boundary_hour)
        if not refresh_needed:
            return jsonify(load_cache())

        _is_generating = True
        try:
            data = _generate_day_data(config, last_date)
            return jsonify(data)
        finally:
            _is_generating = False


@app.route('/api/generating')
def is_generating():
    """Lets the frontend poll to know if generation is in progress."""
    return jsonify({'generating': _is_generating})


@app.route('/api/history')
def get_history():
    """Returns list of all history date strings, newest first."""
    return jsonify(list_history_dates())


@app.route('/api/history/<date_str>')
def get_history_day(date_str):
    """Returns full data for a specific historical day."""
    data = load_history_day(date_str)
    if data is None:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(data)


@app.route('/api/quest/status', methods=['POST'])
def update_quest():
    """Updates sidequest status. Body: {status: 'done'|'skipped'}"""
    body = request.get_json()
    status = body.get('status')
    if status not in ('done', 'skipped'):
        return jsonify({'error': 'Invalid status'}), 400
    success = update_quest_status(status)
    return jsonify({'success': success})


@app.route('/api/refresh', methods=['POST'])
def force_refresh():
    """Force-regenerates today's content, ignoring the cache."""
    config = get_config()
    if config is None:
        return jsonify({'error': 'no_config'}), 400
    data = _generate_day_data(config, last_date=None)
    return jsonify(data)


@app.route('/api/settings', methods=['POST'])
def save_settings():
    """Saves POSTed JSON as new config.yaml."""
    new_config = request.get_json()
    save_config(new_config)
    return jsonify({'success': True})

@app.route('/wordle')
def wordle_page():
    return render_template('wordle.html')


@app.route('/api/wordle/word')
def get_wordle_word():
    """Returns today's Wordle word. Served from cache if available."""
    cache = load_cache()
    if cache and cache.get('wordle', {}).get('solution'):
        w = cache['wordle']
        return jsonify({
            'solution': w['solution'],
            'date':     w.get('date', cache.get('date', '')),
            'number':   w.get('number', 0),
        })
    try:
        data = fetch_wordle_word()
        return jsonify({'solution': data['solution'], 'date': data['date'], 'number': data['number']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/wordle/solved', methods=['POST'])
def wordle_solved():
    """Called when game ends. Updates cache + history file."""
    body    = request.get_json() or {}
    status  = body.get('status', 'failed')
    attempts = body.get('attempts')
    guesses  = body.get('guesses', [])
    success  = update_wordle_status(status, attempts, guesses)
    return jsonify({'success': success})

# ── Orchestrator ─────────────────────────────────────────────────────────────

def _generate_day_data(config: dict, last_date) -> dict:
    """
    Runs all modules and assembles the full day's data dict.
    Saves to cache.json and copies to history.
    last_date: the date of the last cached day, or None on first run.
    """
    boundary_hour = config.get('app', {}).get('day_boundary_hour', 6)
    today = get_current_day(boundary_hour)
    fetch_since = get_fetch_since(boundary_hour)
    errors = {}

    # 1. News
    try:
        news_data = get_news(config, fetch_since)
    except Exception as e:
        news_data = {'news': [], 'funny': [], 'error': str(e)}
        errors['news'] = str(e)

    # 2. Weather
    try:
        weather_data = fetch_weather(config)
    except Exception as e:
        weather_data = {'error': str(e)}
        errors['weather'] = str(e)

    # 3. Movies
    try:
        movie_data = get_movie_recommendation(config)
    except Exception as e:
        movie_data = {'movie_rec': {}, 'show_rec': {}, 'error': str(e)}
        errors['movies'] = str(e)

    # 4. Quote
    try:
        quote_data = get_quote()
    except Exception as e:
        quote_data = {'text': '', 'author': '', 'type': 'error'}
        errors['quote'] = str(e)

    # 5. Side quest
    try:
        quest_data = generate_sidequest(config)
    except Exception as e:
        quest_data = {
            'title': 'Take a 10-minute walk',
            'description': "Step away from the screen. Walk somewhere you haven't been in a while.",
            'difficulty': 'easy',
            'type': 'irl',
            'estimated_time': '10 minutes',
            'status': 'pending',
        }
        errors['sidequest'] = str(e)
    
    # 6. Wordle
    try:
        wordle_data = fetch_wordle_word()
    except Exception as e:
        wordle_data = {'solution': '', 'date': today.isoformat(), 'number': 0,
                       'status': 'pending', 'attempts': None, 'guesses': [], 'error': str(e)}
        errors['wordle'] = str(e)

    data = {
        'date': today.isoformat(),
        'generated_at': datetime.utcnow().isoformat(),
        'fetch_since': fetch_since.isoformat(),
        'news': news_data.get('news', []),
        'funny': news_data.get('funny', []),
        'weather': weather_data,
        'quote': quote_data,
        'movie_rec': movie_data.get('movie_rec', {}),
        'show_rec': movie_data.get('show_rec', {}),
        'sidequest': quest_data,
        'errors': errors,
    }

    save_cache(data)
    return data