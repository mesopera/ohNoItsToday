import yaml
import os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config.yaml')

_config = None


def get_config() -> dict | None:
    global _config
    if _config is None:
        _config = _load_config()
    return _config


def _load_config() -> dict | None:
    if not os.path.exists(CONFIG_PATH):
        return None  # Signals "first run — no config"
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


def save_config(new_config: dict) -> None:
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        yaml.dump(new_config, f, default_flow_style=False, allow_unicode=True)
    global _config
    _config = new_config  # Invalidate in-memory cache
