import requests
import json
import os
from datetime import datetime

GEO_CACHE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'geo_cache.json')


def get_coordinates(city: str, country: str) -> tuple[float, float]:
    """
    Returns (lat, lon) for the given city.
    Uses cached value if city/country match; otherwise geocodes via Open-Meteo and caches.
    """
    if os.path.exists(GEO_CACHE_PATH):
        with open(GEO_CACHE_PATH, 'r') as f:
            cached = json.load(f)
        if cached.get('city') == city and cached.get('country') == country:
            return cached['lat'], cached['lon']

    url = 'https://geocoding-api.open-meteo.com/v1/search'
    params = {'name': f'{city}, {country}', 'count': 1, 'language': 'en', 'format': 'json'}
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    if not data.get('results'):
        # Fallback: try just the city name
        params['name'] = city
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()

    if not data.get('results'):
        raise ValueError(f"Could not geocode '{city}, {country}'")

    result = data['results'][0]
    lat, lon = result['latitude'], result['longitude']

    os.makedirs(os.path.dirname(GEO_CACHE_PATH), exist_ok=True)
    with open(GEO_CACHE_PATH, 'w') as f:
        json.dump({'city': city, 'country': country, 'lat': lat, 'lon': lon}, f)

    return lat, lon


def build_rain_status(max_prob: float, rain_sum: float, hourly: dict) -> str:
    """
    Returns a human-readable rain status string.
    < 30%  → empty string (no mention at all)
    30-60% → "Might rain (X%)"
    > 60%  → "Rain expected around X AM/PM" (first hour with >50% probability)
    """
    if max_prob < 30:
        return ''
    if max_prob < 60:
        return f'Might rain ({int(max_prob)}%)'

    probs = hourly.get('precipitation_probability', [])
    times = hourly.get('time', [])
    for i, prob in enumerate(probs):
        if prob is not None and prob > 50:
            hour_str = datetime.fromisoformat(times[i]).strftime('%I %p').lstrip('0')
            return f'Rain expected around {hour_str}'

    return f'Rain likely today ({int(max_prob)}%)'


def fetch_weather(config: dict) -> dict:
    """
    Fetches weather for the configured city via Open-Meteo (no API key needed).
    Returns: {temp_c, sunrise, sunset, rain_status, rain_probability}
    Only the fields the spec mandates — nothing extra.
    """
    city = config['location']['city']
    country = config['location']['country']

    # Allow manual lat/lon override in config
    if config['location'].get('lat') and config['location'].get('lon'):
        lat = config['location']['lat']
        lon = config['location']['lon']
    else:
        lat, lon = get_coordinates(city, country)

    url = 'https://api.open-meteo.com/v1/forecast'
    params = {
        'latitude': lat,
        'longitude': lon,
        'current': 'temperature_2m,apparent_temperature',
        'hourly': 'precipitation_probability',
        'daily': 'sunrise,sunset,precipitation_probability_max,precipitation_sum',
        'timezone': 'auto',
        'forecast_days': 1,
    }
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    current = data['current']
    daily = data['daily']
    hourly = data['hourly']

    temp_c = round(current['temperature_2m'])
    feels_like_c = round(current['apparent_temperature'])

    sunrise = datetime.fromisoformat(daily['sunrise'][0]).strftime('%I:%M %p').lstrip('0')
    sunset = datetime.fromisoformat(daily['sunset'][0]).strftime('%I:%M %p').lstrip('0')

    max_rain_prob = daily['precipitation_probability_max'][0] or 0
    rain_sum = daily['precipitation_sum'][0] or 0
    rain_status = build_rain_status(max_rain_prob, rain_sum, hourly)

    return {
        'temp_c': temp_c,
        'feels_like_c': feels_like_c,
        'sunrise': sunrise,
        'sunset': sunset,
        'rain_status': rain_status,
        'rain_probability': max_rain_prob,
    }
