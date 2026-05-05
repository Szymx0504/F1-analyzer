import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "../lib/api";
import { useApi } from "../hooks/useApi";
import type { FullRaceData, Position, Lap } from "../types";
import PositionChart from "../components/charts/PositionChart";
import LapTimesChart from "../components/charts/LapTimesChart";
import GapChart from "../components/charts/GapChart";
import TireStrategy from "../components/charts/TireStrategy";
import WeatherPanel from "../components/charts/WeatherPanel";
import RaceEventsFeed from "../components/charts/RaceEventsFeed";
import TrackMap from "../components/charts/TrackMap";
import ReplayControls from "../components/replay/ReplayControls";

export default function RaceReplay() {
    const [year, setYear] = useState(2024);
    const [sessionKey, setSessionKey] = useState<number | null>(null);
    const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
    const [currentLap, setCurrentLap] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [raceData, setRaceData] = useState<FullRaceData | null>(null);
    const [loadingData, setLoadingData] = useState(false);

    // Fetch race sessions for the year
    const { data: sessions } = useApi(
        () => api.getSessions(year, "Race"),
        [year],
    );

    // Fetch drivers for selected session
    const { data: drivers } = useApi(
        () => (sessionKey ? api.getDrivers(sessionKey) : Promise.resolve([])),
        [sessionKey],
    );

    // Fetch all data when session is selected
    useEffect(() => {
        if (!sessionKey) return;
        let cancelled = false;

        async function loadData() {
            setLoadingData(true);
            setRaceData(null);
            try {
                // Sequential fetches to avoid 429 rate-limiting from OpenF1
                const laps = await api.getLaps(sessionKey!);
                if (cancelled) return;
                const positions = await api.getPosition(sessionKey!);
                if (cancelled) return;
                const stints = await api.getStints(sessionKey!);
                if (cancelled) return;
                const weather = await api.getWeather(sessionKey!);
                if (cancelled) return;
                const intervals = await api.getIntervals(sessionKey!);
                if (!cancelled) {
                    setRaceData({
                        type: "full_race_data",
                        laps,
                        positions,
                        stints,
                        weather,
                        intervals,
                    });
                    setCurrentLap(1);
                    setIsPlaying(false);
                }
            } catch (err) {
                console.error("Failed to load race data:", err);
            } finally {
                if (!cancelled) setLoadingData(false);
            }
        }
        loadData();
        return () => {
            cancelled = true;
        };
    }, [sessionKey]);

    // Compute max lap
    const maxLap = useMemo(() => {
        if (!raceData) return 0;
        return Math.max(...raceData.laps.map((l) => l.lap_number ?? 0), 0);
    }, [raceData]);

    // Lap changes are driven by TrackMap animation via onLapChange callback
    const handleLapChange = useCallback((lap: number) => {
        setCurrentLap(lap);
    }, []);

    const handleFinish = useCallback(() => {
        setIsPlaying(false);
    }, []);

    // Filter data up to current lap for charts
    const currentWeather = useMemo(() => {
        if (!raceData?.weather.length) return null;
        return raceData.weather[
            Math.min(currentLap - 1, raceData.weather.length - 1)
        ];
    }, [raceData, currentLap]);

    const currentPositions = useMemo(() => {
        if (!raceData) return new Map<number, number>();

        const positionsByDriver = new Map<number, Position[]>();
        raceData.positions.forEach((p) => {
            const list = positionsByDriver.get(p.driver_number) ?? [];
            list.push(p);
            positionsByDriver.set(p.driver_number, list);
        });

        positionsByDriver.forEach((list) =>
            list.sort((a, b) => a.date.localeCompare(b.date)),
        );

        const lapsByDriver = new Map<number, Lap[]>();
        raceData.laps.forEach((lap) => {
            if (lap.lap_number <= currentLap) {
                const list = lapsByDriver.get(lap.driver_number) ?? [];
                list.push(lap);
                lapsByDriver.set(lap.driver_number, list);
            }
        });

        const map = new Map<number, number>();
        lapsByDriver.forEach((lapList, driverNumber) => {
            lapList.sort((a, b) => b.lap_number - a.lap_number);
            const lap = lapList[0];
            const driverPositions = positionsByDriver.get(driverNumber) ?? [];
            const beforeList = driverPositions.filter(
                (p) => p.date <= lap.date_start,
            );
            const sample =
                beforeList.length > 0
                    ? beforeList[beforeList.length - 1]
                    : driverPositions[driverPositions.length - 1];
            if (sample) map.set(driverNumber, sample.position);
        });

        return map;
    }, [raceData, currentLap]);

    // Unique driver list (deduplicated)
    const uniqueDrivers = useMemo(() => {
        if (!drivers) return [];
        const seen = new Set<number>();
        return drivers.filter((d) => {
            if (seen.has(d.driver_number)) return false;
            seen.add(d.driver_number);
            return true;
        });
    }, [drivers]);

    const sortedDrivers = useMemo(() => {
        return [...uniqueDrivers].sort((a, b) => {
            const posA = currentPositions.get(a.driver_number) ?? Infinity;
            const posB = currentPositions.get(b.driver_number) ?? Infinity;
            return posA - posB || a.name_acronym.localeCompare(b.name_acronym);
        });
    }, [uniqueDrivers, currentPositions]);

    return (
        <div className="space-y-6">
            {/* Header controls */}
            <div className="flex flex-wrap items-center gap-4">
                <h1 className="text-2xl font-bold">Race Replay</h1>

                <select
                    value={year}
                    onChange={(e) => {
                        setYear(Number(e.target.value));
                        setSessionKey(null);
                    }}
                    className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
                >
                    {[2025, 2024, 2023].map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>

                <select
                    value={sessionKey ?? ""}
                    onChange={(e) => setSessionKey(Number(e.target.value))}
                    className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm min-w-[200px]"
                >
                    <option value="">Select Race...</option>
                    {sessions?.map((s) => (
                        <option key={s.session_key} value={s.session_key}>
                            {s.circuit_short_name} — {s.country_name}
                        </option>
                    ))}
                </select>

                {uniqueDrivers.length > 0 && (
                    <select
                        value={selectedDriver ?? ""}
                        onChange={(e) =>
                            setSelectedDriver(
                                e.target.value ? Number(e.target.value) : null,
                            )
                        }
                        className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">All Drivers</option>
                        {sortedDrivers.map((d) => (
                            <option
                                key={d.driver_number}
                                value={d.driver_number}
                            >
                                {d.name_acronym} — {d.team_name}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {/* Replay controls */}
            {raceData && (
                <ReplayControls
                    currentLap={currentLap}
                    maxLap={maxLap}
                    isPlaying={isPlaying}
                    speed={speed}
                    onPlayPause={() => setIsPlaying(!isPlaying)}
                    onLapChange={setCurrentLap}
                    onSpeedChange={setSpeed}
                    onReset={() => {
                        setCurrentLap(1);
                        setIsPlaying(false);
                    }}
                />
            )}

            {/* Charts grid */}
            {raceData ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <PositionChart
                        laps={raceData.laps}
                        positions={raceData.positions}
                        drivers={uniqueDrivers}
                        highlightDriver={selectedDriver}
                        currentLap={currentLap}
                        maxLap={maxLap}
                    />
                    <RaceEventsFeed
                        laps={raceData.laps}
                        positions={raceData.positions}
                        stints={raceData.stints}
                        drivers={uniqueDrivers}
                        currentLap={currentLap}
                        maxLap={maxLap}
                        highlightDriver={selectedDriver}
                    />
                    <div className="lg:col-span-2">
                        <TrackMap
                            sessionKey={sessionKey!}
                            drivers={uniqueDrivers}
                            laps={raceData.laps}
                            positions={raceData.positions}
                            stints={raceData.stints}
                            intervals={raceData.intervals}
                            currentLap={currentLap}
                            maxLap={maxLap}
                            speed={speed}
                            isPlaying={isPlaying}
                            highlightDriver={selectedDriver}
                            onLapChange={handleLapChange}
                            onFinish={handleFinish}
                        />
                    </div>
                    <GapChart
                        intervals={raceData.intervals}
                        laps={raceData.laps}
                        drivers={uniqueDrivers}
                        highlightDriver={selectedDriver}
                        currentLap={currentLap}
                        maxLap={maxLap}
                    />
                    <LapTimesChart
                        laps={raceData.laps}
                        drivers={uniqueDrivers}
                        highlightDriver={selectedDriver}
                        currentLap={currentLap}
                        maxLap={maxLap}
                    />
                    <TireStrategy
                        stints={raceData.stints}
                        drivers={uniqueDrivers}
                        laps={raceData.laps}
                        maxLap={maxLap}
                        currentLap={currentLap}
                    />
                    <WeatherPanel
                        weather={currentWeather}
                        allWeather={raceData.weather}
                        currentLap={currentLap}
                        maxLap={maxLap}
                    />
                </div>
            ) : loadingData ? (
                <div className="text-center text-f1-muted py-20">
                    <div className="inline-block w-8 h-8 border-4 border-f1-border border-t-f1-red rounded-full animate-spin mb-4" />
                    <p className="text-lg">Loading race data...</p>
                    <p className="text-sm mt-1">
                        Fetching laps, positions, tires, weather & intervals
                    </p>
                </div>
            ) : (
                <div className="text-center text-f1-muted py-20">
                    <p className="text-lg">
                        Select a year and race to begin replay
                    </p>
                </div>
            )}
        </div>
    );
}
