import { useMemo, useState, useCallback } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import type { Interval, Lap, Driver } from "../../types";

interface Props {
    intervals: Interval[];
    laps: Lap[];
    drivers: Driver[];
    highlightDriver: number | null;
    currentLap: number;
    maxLap: number;
}

const TooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const items = payload
        .filter((p: any) => p.value != null)
        .sort((a: any, b: any) => a.value - b.value)
        .slice(0, 20);
    if (!items.length) return null;
    return (
        <div
            className="rounded-lg border border-[#4b5563] bg-[#0a0e14] p-3 text-white shadow-2xl"
            style={{ minWidth: 160 }}
        >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                Lap {label}
            </div>
            <div className="space-y-[3px]">
                {items.map((item: any) => {
                    const isLeader = typeof item.value === "number" && item.value < 0.001;
                    return (
                        <div key={item.dataKey} className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                                <span
                                    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: item.stroke }}
                                />
                                <span className="text-[11px] font-bold tracking-wide">{item.dataKey}</span>
                            </div>
                            <span className="text-[11px] font-mono font-bold" style={{ color: item.stroke }}>
                                {isLeader ? "Interval" : `+${Number(item.value).toFixed(3)}s`}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Team-grouped legend ───────────────────────────────────────────────────────

interface TeamGroup {
    teamName: string;
    teamColour: string;
    drivers: Driver[];
}

function buildTeamGroups(sortedDrivers: Driver[]): TeamGroup[] {
    // Group by team_colour (stable key available on all Driver objects)
    const map = new Map<string, TeamGroup>();
    for (const driver of sortedDrivers) {
        const key = driver.team_colour || "ffffff";
        if (!map.has(key)) {
            map.set(key, {
                teamName: (driver as any).team_name ?? key,
                teamColour: key,
                drivers: [],
            });
        }
        map.get(key)!.drivers.push(driver);
    }
    return Array.from(map.values());
}

export default function GapChart({
    intervals,
    laps,
    drivers,
    currentLap,
    maxLap,
}: Props) {
    void maxLap;

    const [focusedDrivers, setFocusedDrivers] = useState<Set<number>>(new Set());
    const hasFocus = focusedDrivers.size > 0;

    const toggleDriver = useCallback((driverNumber: number) => {
        setFocusedDrivers((prev) => {
            const next = new Set(prev);
            if (next.has(driverNumber)) next.delete(driverNumber);
            else next.add(driverNumber);
            return next;
        });
    }, []);

    const clearFocus = useCallback(() => setFocusedDrivers(new Set()), []);

    const getStyle = (driver: Driver) => {
        const focused = focusedDrivers.has(driver.driver_number);
        if (!hasFocus) return { opacity: 1, strokeWidth: 1.5 };
        return focused ? { opacity: 1, strokeWidth: 3 } : { opacity: 0.07, strokeWidth: 1 };
    };

    const chartData = useMemo(() => {
        if (!intervals.length || !laps.length) return [];

        const lapNumbers = [...new Set(laps.map((l) => l.lap_number))].sort((a, b) => a - b);
        const filteredLapNumbers = lapNumbers.filter((l) => l <= currentLap);

        return filteredLapNumbers.map((lapNum) => {
            const row: Record<string, number | string> = { lap: lapNum };
            const lapEntries = laps.filter((l) => l.lap_number === lapNum);

            drivers.forEach((driver) => {
                const lapEntry = lapEntries.find((l) => l.driver_number === driver.driver_number);
                if (!lapEntry?.date_start) return;

                const driverIntervals = intervals.filter((i) => i.driver_number === driver.driver_number);
                const closest = driverIntervals.reduce<Interval | null>((best, curr) => {
                    if (!best) return curr;
                    const bestDiff = Math.abs(new Date(best.date).getTime() - new Date(lapEntry.date_start).getTime());
                    const currDiff = Math.abs(new Date(curr.date).getTime() - new Date(lapEntry.date_start).getTime());
                    return currDiff < bestDiff ? curr : best;
                }, null);

                if (closest?.gap_to_leader != null && typeof closest.gap_to_leader === "number") {
                    row[driver.name_acronym] = Math.round(closest.gap_to_leader * 1000) / 1000;
                }
            });

            return row;
        });
    }, [intervals, laps, drivers, currentLap]);

    // Sort legend by current gap (ascending) — this also determines team group order
    const sortedDrivers = useMemo(() => {
        if (!chartData.length) return drivers;
        const last = chartData[chartData.length - 1];
        return [...drivers].sort(
            (a, b) =>
                ((last[a.name_acronym] as number) ?? 999) -
                ((last[b.name_acronym] as number) ?? 999),
        );
    }, [drivers, chartData]);

    const teamGroups = useMemo(() => buildTeamGroups(sortedDrivers), [sortedDrivers]);

    return (
        <div className="bg-f1-card rounded-xl border border-f1-border p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-f1-muted uppercase tracking-wide">
                    Gap to Leader
                </h3>
                {hasFocus && (
                    <button
                        onClick={clearFocus}
                        className="text-[10px] text-f1-muted hover:text-white transition-colors px-2 py-0.5 rounded border border-f1-border hover:border-gray-500"
                    >
                        Clear focus
                    </button>
                )}
            </div>

            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                    <XAxis dataKey="lap" stroke="#6b7280" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}s`} />
                    <Tooltip
                        content={<TooltipContent />}
                        cursor={{ stroke: "#6b7280", strokeDasharray: "5 5" }}
                    />
                    {drivers.map((driver) => {
                        const color = `#${driver.team_colour || "ffffff"}`;
                        const style = getStyle(driver);
                        return (
                            <Line
                                key={driver.driver_number}
                                type="monotone"
                                dataKey={driver.name_acronym}
                                stroke={color}
                                strokeWidth={style.strokeWidth}
                                strokeOpacity={style.opacity}
                                dot={false}
                                activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
                                connectNulls
                                isAnimationActive={false}
                            />
                        );
                    })}
                </LineChart>
            </ResponsiveContainer>

            {/* Team-grouped driver legend — one column per team */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                {teamGroups.map((group) => {
                    const teamColor = `#${group.teamColour}`;
                    return (
                        <div key={group.teamColour} className="flex flex-col gap-1">
                            {/* Team name */}
                            <span
                                className="text-[10px] font-semibold uppercase tracking-wide"
                                style={{ color: teamColor, opacity: 0.85 }}
                            >
                                {group.teamName}
                            </span>
                            {/* Driver buttons stacked vertically */}
                            {group.drivers.map((driver) => {
                                const color = `#${driver.team_colour || "ffffff"}`;
                                const focused = focusedDrivers.has(driver.driver_number);
                                const dimmed = hasFocus && !focused;
                                return (
                                    <button
                                        key={driver.driver_number}
                                        onClick={() => toggleDriver(driver.driver_number)}
                                        className="flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold transition-all"
                                        style={{
                                            fontSize: 11,
                                            border: `1.5px solid ${focused ? color : "#2d3748"}`,
                                            backgroundColor: focused ? `${color}20` : "transparent",
                                            color: dimmed ? "#374151" : color,
                                            opacity: dimmed ? 0.5 : 1,
                                            transition: "all 0.15s ease",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span
                                            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: dimmed ? "#374151" : color }}
                                        />
                                        {driver.full_name?.split(" ").slice(-1)[0] ?? driver.name_acronym}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
