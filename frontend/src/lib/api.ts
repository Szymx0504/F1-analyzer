import type {
    Session,
    Driver,
    Lap,
    Position,
    SessionResultRow,
    CarData,
    PitStop,
    Stint,
    Interval,
    Weather,
    LocationPoint,
    TrackMapData,
    DriverChampionshipEntry,
    ConstructorChampionshipEntry,
} from "../types";

const BASE = "/api";

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(`${BASE}${url}`);
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    return res.json();
}

export const api = {
    // Sessions
    getSessions: (year?: number, sessionType?: string) => {
        const params = new URLSearchParams();
        if (year) params.set("year", String(year));
        if (sessionType) params.set("session_type", sessionType);
        const qs = params.toString();
        return fetchJson<Session[]>(`/sessions${qs ? `?${qs}` : ""}`);
    },

    getSession: (sessionKey: number) =>
        fetchJson<Session>(`/sessions/${sessionKey}`),

    // Drivers
    getDrivers: (sessionKey: number) =>
        fetchJson<Driver[]>(`/sessions/${sessionKey}/drivers`),

    // Laps
    getLaps: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<Lap[]>(`/sessions/${sessionKey}/laps${qs}`);
    },

    // Position
    getPosition: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<Position[]>(`/sessions/${sessionKey}/position${qs}`);
    },

    getSessionResult: (sessionKey: number, maxPosition?: number) => {
        const params = new URLSearchParams();
        if (maxPosition) params.set("position<=", String(maxPosition));
        const qs = params.toString();
        return fetchJson<SessionResultRow[]>(
            `/sessions/${sessionKey}/result${qs ? `?${qs}` : ""}`,
        );
    },

    getDriverChampionship: (sessionKey: number) =>
        fetchJson<DriverChampionshipEntry[]>(
            `/championship/drivers?session_key=${sessionKey}`,
        ),

    getConstructorChampionship: (sessionKey: number) =>
        fetchJson<ConstructorChampionshipEntry[]>(
            `/championship/teams?session_key=${sessionKey}`,
        ),

    // Car data (telemetry)
    getCarData: (sessionKey: number, driverNumber: number) =>
        fetchJson<CarData[]>(
            `/sessions/${sessionKey}/car_data/${driverNumber}`,
        ),

    // Pit stops
    getPitStops: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<PitStop[]>(`/sessions/${sessionKey}/pit_stops${qs}`);
    },

    // Stints
    getStints: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<Stint[]>(`/sessions/${sessionKey}/stints${qs}`);
    },

    // Intervals
    getIntervals: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<Interval[]>(`/sessions/${sessionKey}/intervals${qs}`);
    },

    // Weather
    getWeather: (sessionKey: number) =>
        fetchJson<Weather[]>(`/sessions/${sessionKey}/weather`),

    // Location
    getLocation: (sessionKey: number, driverNumber?: number) => {
        const qs = driverNumber ? `?driver_number=${driverNumber}` : "";
        return fetchJson<LocationPoint[]>(
            `/sessions/${sessionKey}/location${qs}`,
        );
    },

    // Track map (downsampled locations for all drivers + outline)
    getTrackMap: (sessionKey: number) =>
        fetchJson<TrackMapData>(`/sessions/${sessionKey}/track_map`),
};
