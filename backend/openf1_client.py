"""
OpenF1 API client with in-memory TTL caching and retry logic.
Docs: https://openf1.org
"""

import asyncio
import os
import httpx
from cachetools import TTLCache
from dotenv import load_dotenv
from typing import Any

load_dotenv()

BASE_URL = "https://api.openf1.org/v1"
OPENF1_API_KEY = os.getenv("OPENF1_API_KEY")
OPENF1_API_KEY_HEADER = os.getenv("OPENF1_API_KEY_HEADER", "Authorization")
OPENF1_API_KEY_QUERY_PARAM = os.getenv("OPENF1_API_KEY_QUERY_PARAM")

# Cache: max 512 entries, 5-minute TTL for historical data
_cache: TTLCache = TTLCache(maxsize=512, ttl=300)

# Short TTL cache for live data (10 seconds)
_live_cache: TTLCache = TTLCache(maxsize=128, ttl=10)

# Persistent HTTP client (reuse connections)
_client: httpx.AsyncClient | None = None

# Semaphore to limit concurrent requests to OpenF1 (avoid 429)
_semaphore = asyncio.Semaphore(2)

MAX_RETRIES = 6
RETRY_BACKOFF = [1.0, 2.0, 4.0, 8.0, 12.0, 20.0]


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        headers = {
            "Accept": "application/json",
            "User-Agent": "F1 Analyzer Backend/1.0",
        }
        if OPENF1_API_KEY and not OPENF1_API_KEY_QUERY_PARAM:
            headers[OPENF1_API_KEY_HEADER] = f"Bearer {OPENF1_API_KEY}"
        _client = httpx.AsyncClient(timeout=30.0, headers=headers)
    return _client


async def _fetch(endpoint: str, params: dict[str, Any] | None = None, live: bool = False, bypass_cache: bool = False) -> list[dict]:
    cache = _live_cache if live else _cache
    key = f"{endpoint}:{sorted(params.items()) if params else ''}"

    if not bypass_cache and key in cache:
        return cache[key]

    resp = None
    for attempt in range(MAX_RETRIES):
        async with _semaphore:
            if not bypass_cache and key in cache:
                return cache[key]

            client = _get_client()
            request_params = dict(params or {})
            if OPENF1_API_KEY and OPENF1_API_KEY_QUERY_PARAM:
                request_params[OPENF1_API_KEY_QUERY_PARAM] = OPENF1_API_KEY
            resp = await client.get(f"{BASE_URL}{endpoint}", params=request_params)

        if resp.status_code == 429:
            wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
            print(
                f"[OpenF1] 429 rate-limited on {endpoint}, retrying in {wait}s (attempt {attempt+1})")
            await asyncio.sleep(wait)
            continue
        if resp.status_code == 401:
            raise httpx.HTTPStatusError(
                f"Unauthorized access to OpenF1: {resp.text}",
                request=resp.request,
                response=resp,
            )
        resp.raise_for_status()
        data = resp.json()
        cache[key] = data
        return data

    raise httpx.HTTPStatusError(
        f"Rate-limited after {MAX_RETRIES} retries on {endpoint}",
        request=httpx.Request("GET", f"{BASE_URL}{endpoint}"),
        response=resp,
    )


# ─── Sessions ────────────────────────────────────────────────────────

async def get_sessions(year: int | None = None, session_type: str | None = None) -> list[dict]:
    params = {}
    if year:
        params["year"] = year
    if session_type:
        params["session_type"] = session_type
    return await _fetch("/sessions", params)


async def get_session(session_key: int) -> dict | None:
    data = await _fetch("/sessions", {"session_key": session_key})
    return data[0] if data else None


# ─── Drivers ─────────────────────────────────────────────────────────

async def get_drivers(session_key: int) -> list[dict]:
    return await _fetch("/drivers", {"session_key": session_key})


# ─── Laps ────────────────────────────────────────────────────────────

async def get_laps(session_key: int, driver_number: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await _fetch("/laps", params)


# ─── Position ────────────────────────────────────────────────────────

async def get_position(session_key: int, driver_number: int | None = None, fresh: bool = True) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    data = await _fetch("/position", params, bypass_cache=fresh)
    if data and not driver_number:
        print(f"[OpenF1] Position data for session {session_key}: {len(data)} records")
        if data:
            print(f"[OpenF1] Sample: {data[-1]}")
    return data


# ─── Car Data (telemetry) ────────────────────────────────────────────

async def get_car_data(
    session_key: int,
    driver_number: int,
) -> list[dict]:
    params: dict[str, Any] = {
        "session_key": session_key,
        "driver_number": driver_number,
    }
    return await _fetch("/car_data", params)


# ─── Pit Stops ───────────────────────────────────────────────────────

async def get_pit_stops(session_key: int, driver_number: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await _fetch("/pit", params)


# ─── Stints (tire data) ─────────────────────────────────────────────

async def get_stints(session_key: int, driver_number: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await _fetch("/stints", params)


# ─── Intervals (gap to leader) ──────────────────────────────────────

async def get_intervals(session_key: int, driver_number: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await _fetch("/intervals", params)


# ─── Weather ─────────────────────────────────────────────────────────

async def get_weather(session_key: int) -> list[dict]:
    return await _fetch("/weather", {"session_key": session_key})


# ─── Location (car positions on track) ──────────────────────────────

async def get_location(session_key: int, driver_number: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    return await _fetch("/location", params)


# ─── Live helpers ────────────────────────────────────────────────────

async def get_latest_session() -> dict | None:
    """Get the most recent session."""
    data = await _fetch("/sessions", {"session_key": "latest"}, live=True)
    return data[0] if data else None


async def get_live_position(session_key: int) -> list[dict]:
    """Get latest position data (short cache)."""
    return await _fetch("/position", {"session_key": session_key}, live=True)


async def get_live_car_data(session_key: int, driver_number: int) -> list[dict]:
    return await _fetch(
        "/car_data",
        {"session_key": session_key, "driver_number": driver_number},
        live=True,
    )
