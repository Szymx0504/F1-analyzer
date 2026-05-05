"""
F1 Analyzer — FastAPI Backend
Serves OpenF1 data via REST + WebSocket for race replay.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import httpx
import json

from openf1_client import (
    get_sessions,
    get_session,
    get_drivers,
    get_laps,
    get_position,
    get_session_result,
    get_driver_championship,
    get_constructor_championship,
    get_car_data,
    get_pit_stops,
    get_stints,
    get_intervals,
    get_race_control,
    get_weather,
    get_location,
    get_latest_session,
    get_driver_by_number,
)
from ws_manager import replay_manager

app = FastAPI(title="F1 Analyzer API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(httpx.HTTPStatusError)
async def openf1_http_error(request: Request, exc: httpx.HTTPStatusError):
    status_code = 502
    detail = "OpenF1 API request failed."
    if exc.response is not None:
        body = exc.response.text
        if exc.response.status_code == 401:
            detail = "OpenF1 API returned 401 Unauthorized. Check OPENF1_API_KEY and service availability."
        else:
            detail = f"OpenF1 API returned {exc.response.status_code}."
        return JSONResponse(status_code=status_code, content={"error": detail, "body": body})
    return JSONResponse(status_code=status_code, content={"error": detail})


# ─── Health ──────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ─── Sessions ────────────────────────────────────────────────────────

@app.get("/api/sessions")
async def sessions(year: int | None = None, session_type: str | None = None):
    return await get_sessions(year, session_type)


@app.get("/api/sessions/{session_key}")
async def session_detail(session_key: int):
    data = await get_session(session_key)
    if not data:
        return {"error": "Session not found"}
    return data


@app.get("/api/sessions/latest")
async def latest_session():
    data = await get_latest_session()
    if not data:
        return {"error": "No session found"}
    return data


# ─── Season Results (bulk) ───────────────────────────────────────────

@app.get("/api/season/{year}/results")
async def season_results(year: int):
    """
    Return finishing positions for every Race session in a year in one call.
    Uses session_result (one compact row per driver) instead of /position
    (thousands of timestamped rows). Fetches in small sequential chunks to
    avoid hammering OpenF1 with 24 simultaneous requests.

    Response:
    {
      "sessions": [{ session_key, session_name, country_name, circuit_short_name, date_start, year }],
      "results":  { "<session_key>": [{ driver_number, position, name_acronym, team_name, team_colour }] }
    }
    """
    all_sessions = await get_sessions(year=year, session_type="Race")
    if not all_sessions:
        return {"sessions": [], "results": {}}

    async def fetch_result(s: dict) -> tuple[int, list[dict]]:
        try:
            data = await get_session_result(s["session_key"])
            return s["session_key"], data or []
        except Exception:
            return s["session_key"], []

    # Fetch in chunks of 3 with a small pause between chunks so we don't
    # saturate the semaphore and trigger cascading 429s.
    CHUNK = 3
    pairs: list[tuple[int, list[dict]]] = []
    for i in range(0, len(all_sessions), CHUNK):
        chunk = all_sessions[i : i + CHUNK]
        chunk_results = await asyncio.gather(*(fetch_result(s) for s in chunk))
        pairs.extend(chunk_results)
        if i + CHUNK < len(all_sessions):
            await asyncio.sleep(0.5)

    return {
        "sessions": [
            {
                "session_key": s["session_key"],
                "session_name": s.get("session_name", "Race"),
                "country_name": s.get("country_name", ""),
                "circuit_short_name": s.get("circuit_short_name", ""),
                "date_start": s.get("date_start", ""),
                "year": s.get("year", year),
            }
            for s in all_sessions
        ],
        "results": {str(sk): data for sk, data in pairs},
    }


# ─── Drivers ─────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/drivers")
async def drivers(session_key: int):
    return await get_drivers(session_key)


@app.get("/api/sessions/{session_key}/result")
async def session_result(session_key: int, max_position: int | None = None):
    return await get_session_result(session_key, max_position)


@app.get("/api/championship/drivers")
async def driver_championship(
    session_key: int,
    driver_number: int | None = None,
):
    standings, drivers_list = await asyncio.gather(
        get_driver_championship(session_key, driver_number),
        get_drivers(session_key),
    )
    drivers_map = {d["driver_number"]: d for d in drivers_list}

    # Some drivers (e.g. mid-season replacements) won't appear in the final
    # session's driver list — fetch them individually across all sessions.
    missing = [
        e["driver_number"] for e in standings
        if e.get("driver_number") not in drivers_map
    ]
    if missing:
        extras = await asyncio.gather(*(get_driver_by_number(dn) for dn in missing))
        for d in extras:
            if d:
                drivers_map[d["driver_number"]] = d

    for entry in standings:
        driver = drivers_map.get(entry.get("driver_number"))
        if driver:
            entry["full_name"] = driver.get("full_name")
            entry["name_acronym"] = driver.get("name_acronym")
            entry["broadcast_name"] = driver.get("broadcast_name")
            entry["team_name"] = driver.get("team_name")
            entry["team_colour"] = driver.get("team_colour")
    return standings


@app.get("/api/championship/teams")
async def constructor_championship(
    session_key: int,
    team_name: str | None = None,
):
    standings, drivers_list = await asyncio.gather(
        get_constructor_championship(session_key, team_name),
        get_drivers(session_key),
    )
    team_colours = {
        d["team_name"]: d["team_colour"]
        for d in drivers_list
        if d.get("team_name") and d.get("team_colour")
    }
    for entry in standings:
        if entry.get("team_name") in team_colours:
            entry["team_colour"] = team_colours[entry["team_name"]]
    return standings


# ─── Laps ────────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/laps")
async def laps(session_key: int, driver_number: int | None = None):
    return await get_laps(session_key, driver_number)


# ─── Position ────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/position")
async def position(session_key: int, driver_number: int | None = None, fresh: bool = True):
    return await get_position(session_key, driver_number, fresh)


# ─── Car Data (telemetry) ────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/car_data/{driver_number}")
async def car_data(session_key: int, driver_number: int):
    return await get_car_data(session_key, driver_number)


# ─── Pit Stops ───────────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/pit_stops")
async def pit_stops(session_key: int, driver_number: int | None = None):
    return await get_pit_stops(session_key, driver_number)


# ─── Stints (tires) ─────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/stints")
async def stints(session_key: int, driver_number: int | None = None):
    return await get_stints(session_key, driver_number)


# ─── Intervals (gap to leader) ──────────────────────────────────────

@app.get("/api/sessions/{session_key}/intervals")
async def intervals(session_key: int, driver_number: int | None = None):
    return await get_intervals(session_key, driver_number)


# ─── Race Control (flags, SC, VSC) ──────────────────────────────────

@app.get("/api/sessions/{session_key}/race_control")
async def race_control(session_key: int):
    return await get_race_control(session_key)


# ─── Weather ─────────────────────────────────────────────────────────

@app.get("/api/sessions/{session_key}/weather")
async def weather(session_key: int):
    return await get_weather(session_key)


# ─── Location (car positions on track) ──────────────────────────────

@app.get("/api/sessions/{session_key}/location")
async def location(session_key: int, driver_number: int | None = None):
    return await get_location(session_key, driver_number)


@app.get("/api/sessions/{session_key}/track_map")
async def track_map(session_key: int):
    """Return downsampled location data for every driver.

    Fetches all drivers in parallel (semaphore limits concurrency).
    Returns {outline: [{x,y},...], drivers: {driver_number: [{x,y,date},...]}}.
    """
    drivers_list = await get_drivers(session_key)
    if not drivers_list:
        return {"outline": [], "drivers": {}}

    driver_numbers = list({d["driver_number"] for d in drivers_list})
    DRIVER_TARGET = 3000

    # Fetch all drivers in parallel (semaphore in _fetch handles rate limiting)
    async def fetch_one(dn: int) -> tuple[int, list[dict]]:
        try:
            raw = await get_location(session_key, dn)
            return dn, raw or []
        except Exception:
            return dn, []

    results = await asyncio.gather(*(fetch_one(dn) for dn in driver_numbers))

    # Process results
    outline: list[dict] = []
    drivers_data: dict[int, list[dict]] = {}

    for dn, raw in results:
        if not raw:
            continue

        raw.sort(key=lambda p: p.get("date", ""))

        # First driver with data → extract one full-res lap for a clean outline
        if not outline:
            try:
                dn_laps = await get_laps(session_key, dn)
                # Try several laps in case early ones don't exist
                for try_lap in [3, 2, 4, 5, 1]:
                    lap_s = next(
                        (l for l in dn_laps if l.get("lap_number") == try_lap), None)
                    lap_e = next(
                        (l for l in dn_laps if l.get("lap_number") == try_lap + 1), None)
                    if lap_s and lap_e:
                        t0, t1 = lap_s["date_start"], lap_e["date_start"]
                        candidate = [
                            {"x": p["x"], "y": p["y"]}
                            for p in raw
                            if t0 <= p.get("date", "") <= t1 and p.get("x") is not None
                        ]
                        if len(candidate) > 20:
                            outline = candidate
                            break
            except Exception:
                pass
            if not outline:
                step = max(1, len(raw) // 2000)
                outline = [
                    {"x": p["x"], "y": p["y"]}
                    for p in raw[::step]
                    if p.get("x") is not None
                ]

        # Downsample for driver tracking
        step = max(1, len(raw) // DRIVER_TARGET)
        drivers_data[dn] = [
            {"x": p["x"], "y": p["y"], "date": p["date"]}
            for p in raw[::step]
            if p.get("x") is not None
        ]

    return {"outline": outline, "drivers": drivers_data}


# ─── WebSocket: Race Replay ─────────────────────────────────────────

@app.websocket("/ws/replay/{session_key}")
async def ws_replay(websocket: WebSocket, session_key: int):
    await replay_manager.connect(websocket)
    try:
        # Wait for client commands
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            cmd = msg.get("command")

            if cmd == "start":
                speed = msg.get("speed", 1.0)
                await replay_manager.start_replay(websocket, session_key, speed)
            elif cmd == "load_full":
                await replay_manager.send_full_race_data(websocket, session_key)
            elif cmd == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        replay_manager.disconnect(websocket)
    except Exception as e:
        replay_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
