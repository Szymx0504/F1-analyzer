import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useApi } from "../hooks/useApi";
import type {
    Driver,
    Position,
    SessionResultRow,
    DriverChampionshipEntry,
    ConstructorChampionshipEntry,
} from "../types";
import RaceResultTable from "../components/charts/RaceResultTable";
import DriverChampionshipTable from "../components/charts/DriverChampionshipTable";
import ConstructorChampionshipTable from "../components/charts/ConstructorChampionshipTable";
import SeasonGrid from "../components/charts/SeasonGrid";

interface Session {
    session_key: number;
    session_name: string;
    session_type: string;
    country_name: string;
    circuit_short_name: string;
    date_start: string;
    year: number;
}

function Card({
    title,
    children,
    className = "",
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`bg-f1-card rounded-xl border border-f1-border p-4 ${className}`}
        >
            <h3 className="text-sm font-semibold text-f1-muted uppercase tracking-wide mb-4">
                {title}
            </h3>
            {children}
        </div>
    );
}

export default function SeasonOverview() {
    const currentYear = new Date().getFullYear();
    const years = [2025, 2024, 2023].filter((y) => y <= currentYear);

    const [year, setYear] = useState<number>(years[0]);
    const [selectedSessionKey, setSelectedSessionKey] = useState<number | null>(
        null,
    );

    const { data: raceSessions, loading: sessionsLoading } = useApi<Session[]>(
        () => api.getSessions(year, "Race"),
        [year],
    );

    useEffect(() => {
        if (!raceSessions?.length) return;
        const today = new Date().toISOString();
        const past = raceSessions.filter((s) => s.date_start <= today);
        const target = past.length ? past[past.length - 1] : raceSessions[0];
        setSelectedSessionKey(target.session_key);
    }, [raceSessions]);

    const { data: selectedDrivers } = useApi<Driver[]>(
        () =>
            selectedSessionKey
                ? api.getDrivers(selectedSessionKey)
                : Promise.resolve([]),
        [selectedSessionKey],
    );

    const { data: selectedSessionResult } = useApi<SessionResultRow[]>(
        () =>
            selectedSessionKey
                ? api.getSessionResult(selectedSessionKey)
                : Promise.resolve([]),
        [selectedSessionKey],
    );

    const [allPositions, setAllPositions] = useState<Map<number, Position[]>>(
        new Map(),
    );
    const [allDrivers, setAllDrivers] = useState<Driver[]>([]);
    const { data: driverChampionship, loading: driverChampionshipLoading } =
        useApi<DriverChampionshipEntry[]>(
            () =>
                selectedSessionKey
                    ? api.getDriverChampionship(selectedSessionKey)
                    : Promise.resolve([]),
            [selectedSessionKey],
        );
    const {
        data: constructorChampionship,
        loading: constructorChampionshipLoading,
    } = useApi<ConstructorChampionshipEntry[]>(
        () =>
            selectedSessionKey
                ? api.getConstructorChampionship(selectedSessionKey)
                : Promise.resolve([]),
        [selectedSessionKey],
    );

    useEffect(() => {
        if (!raceSessions?.length || !selectedSessionKey) return;
        const today = new Date().toISOString();
        const idx = raceSessions.findIndex(
            (s) => s.session_key === selectedSessionKey,
        );
        const targetRaces = raceSessions
            .slice(0, idx + 1)
            .filter((s) => s.date_start <= today);

        let cancelled = false;
        const posMap = new Map<number, Position[]>();
        const driverSet = new Map<number, Driver>();

        Promise.all(
            targetRaces.map(async (race) => {
                const [pos, drv] = await Promise.all([
                    api.getPosition(race.session_key),
                    api.getDrivers(race.session_key),
                ]);
                posMap.set(race.session_key, pos ?? []);
                (drv ?? []).forEach((d: Driver) => {
                    if (!driverSet.has(d.driver_number))
                        driverSet.set(d.driver_number, d);
                });
            }),
        ).then(() => {
            if (cancelled) return;
            setAllPositions(new Map(posMap));
            setAllDrivers(Array.from(driverSet.values()));
        });

        return () => {
            cancelled = true;
        };
    }, [raceSessions, selectedSessionKey]);

    const selectedSession = raceSessions?.find(
        (s) => s.session_key === selectedSessionKey,
    );

    const uniqueSelectedDrivers = selectedDrivers
        ? selectedDrivers.filter(
              (d, i, arr) =>
                  arr.findIndex((x) => x.driver_number === d.driver_number) ===
                  i,
          )
        : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
                <h1 className="text-2xl font-bold">Season Overview</h1>

                <select
                    value={year}
                    onChange={(e) => {
                        setYear(Number(e.target.value));
                        setSelectedSessionKey(null);
                    }}
                    className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
                >
                    {years.map((y) => (
                        <option key={y} value={y}>
                            {y}
                        </option>
                    ))}
                </select>

                <select
                    value={selectedSessionKey ?? ""}
                    onChange={(e) =>
                        setSelectedSessionKey(Number(e.target.value))
                    }
                    className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm min-w-[220px]"
                    disabled={!raceSessions?.length}
                >
                    <option value="">Select Race…</option>
                    {raceSessions?.map((s) => (
                        <option key={s.session_key} value={s.session_key}>
                            {s.circuit_short_name} — {s.country_name}
                        </option>
                    ))}
                </select>

                {selectedSession && (
                    <span className="text-f1-muted text-sm">
                        {new Date(
                            selectedSession.date_start,
                        ).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                        })}
                    </span>
                )}
            </div>

            {sessionsLoading && (
                <p className="text-f1-muted text-sm">Loading sessions…</p>
            )}

            {selectedSessionKey && (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card
                            title={`Race Result — ${selectedSession?.circuit_short_name ?? ""}${selectedSession?.country_name ? ` · ${selectedSession.country_name}` : ""}`}
                        >
                            {selectedSessionResult &&
                            selectedSessionResult.length &&
                            uniqueSelectedDrivers.length ? (
                                <RaceResultTable
                                    results={selectedSessionResult}
                                    drivers={uniqueSelectedDrivers}
                                />
                            ) : (
                                <p className="text-f1-muted text-sm">
                                    Loading…
                                </p>
                            )}
                        </Card>

                        <Card
                            title={`Driver Championship — ${year} (after ${selectedSession?.circuit_short_name ?? "…"})`}
                        >
                            {driverChampionshipLoading ? (
                                <p className="text-f1-muted text-sm">
                                    Loading championship points…
                                </p>
                            ) : driverChampionship?.length ? (
                                <DriverChampionshipTable
                                    standings={driverChampionship}
                                    allDrivers={allDrivers}
                                />
                            ) : (
                                <p className="text-f1-muted text-sm">
                                    No championship data available.
                                </p>
                            )}
                        </Card>

                        <Card
                            title={`Constructor Championship — ${year} (after ${selectedSession?.circuit_short_name ?? "…"})`}
                        >
                            {constructorChampionshipLoading ? (
                                <p className="text-f1-muted text-sm">
                                    Loading championship points…
                                </p>
                            ) : constructorChampionship?.length ? (
                                <ConstructorChampionshipTable
                                    standings={constructorChampionship}
                                    allDrivers={allDrivers}
                                />
                            ) : (
                                <p className="text-f1-muted text-sm">
                                    No championship data available.
                                </p>
                            )}
                        </Card>
                    </div>

                    <Card
                        title={`Season Results Grid — ${year}`}
                        className="overflow-x-auto"
                    >
                        {allDrivers.length && allPositions.size ? (
                            <SeasonGrid
                                raceSessions={raceSessions ?? []}
                                allPositions={allPositions}
                                allDrivers={allDrivers}
                                selectedSessionKey={selectedSessionKey}
                            />
                        ) : (
                            <p className="text-f1-muted text-sm">
                                Loading race data…
                            </p>
                        )}
                    </Card>
                </>
            )}
        </div>
    );
}
