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
import type { Lap, Driver, Position } from "../../types";

interface Props {
    laps: Lap[];
    positions: Position[];
    drivers: Driver[];
    highlightDriver: number | null; // kept for API compat, unused internally
    currentLap: number;
    maxLap: number;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

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
                {items.map((item: any) => (
                    <div
                        key={item.dataKey}
                        className="flex items-center justify-between gap-4"
                    >
                        <div className="flex items-center gap-1.5">
                            <span
                                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.stroke }}
                            />
                            <span className="text-[11px] font-bold tracking-wide">
                                {item.dataKey}
                            </span>
                        </div>
                        <span
                            className="text-[11px] font-mono font-bold"
                            style={{ color: item.stroke }}
                        >
                            P{item.value}
                        </span>
                    </div>
                ))}
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

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 320;
const MARGIN = { top: 8, right: 0, bottom: 5, left: 0 };
const DOMAIN_MIN = 1;
const DOMAIN_MAX = 20;
const LEFT_LABEL_W = 38; // px reserved for left acronym labels
const RIGHT_LABEL_W = 38; // px reserved for right acronym labels

// ── Utility: compute Y-pixel for a position value ─────────────────────────────

function posToY(
    pos: number,
    chartH: number,
    marginTop: number,
    marginBottom: number,
): number {
    const plotH = chartH - marginTop - marginBottom;
    // Y axis is reversed: pos=1 → top, pos=20 → bottom
    return marginTop + ((pos - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * plotH;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PositionChart({
    laps,
    positions,
    drivers,
    currentLap,
    maxLap,
}: Props) {
    void maxLap;

    // Multi-select focus state
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

    // ── Build chart data ──────────────────────────────────────────────────────

    const chartData = useMemo(() => {
        const positionsByDriver = new Map<number, Position[]>();
        positions.forEach((pos) => {
            const list = positionsByDriver.get(pos.driver_number) ?? [];
            list.push(pos);
            positionsByDriver.set(pos.driver_number, list);
        });
        positionsByDriver.forEach((list) =>
            list.sort((a, b) => a.date.localeCompare(b.date)),
        );

        const lapNumbers = [...new Set(laps.map((l) => l.lap_number))].sort(
            (a, b) => a - b,
        );
        return lapNumbers.map((lapNum) => {
            const row: Record<string, number | null> = { lap: lapNum };
            laps
                .filter((l) => l.lap_number === lapNum)
                .forEach((lap) => {
                    const driver = drivers.find(
                        (d) => d.driver_number === lap.driver_number,
                    );
                    if (!driver) return;
                    const driverPositions =
                        positionsByDriver.get(lap.driver_number) ?? [];
                    const beforeList = driverPositions.filter(
                        (p) => p.date <= lap.date_start,
                    );
                    const before = beforeList.length
                        ? beforeList[beforeList.length - 1]
                        : null;
                    const sample = before ?? driverPositions[0] ?? null;
                    row[driver.name_acronym] = sample?.position ?? null;
                });
            return row;
        });
    }, [laps, positions, drivers]);

    // ── Edge positions for side labels ────────────────────────────────────────

    const edgePositions = useMemo(() => {
        if (!chartData.length) return new Map<string, { leftPos: number | null; rightPos: number | null }>();
        const first = chartData[0];
        const last = chartData[chartData.length - 1];
        const map = new Map<string, { leftPos: number | null; rightPos: number | null }>();
        drivers.forEach((d) => {
            map.set(d.name_acronym, {
                leftPos: (first[d.name_acronym] as number) ?? null,
                rightPos: (last[d.name_acronym] as number) ?? null,
            });
        });
        return map;
    }, [chartData, drivers]);

    // ── Driver style helpers ──────────────────────────────────────────────────

    const getStyle = (driver: Driver) => {
        const focused = focusedDrivers.has(driver.driver_number);
        if (!hasFocus) return { opacity: 1, strokeWidth: 1.5 };
        return focused
            ? { opacity: 1, strokeWidth: 3 }
            : { opacity: 0.07, strokeWidth: 1 };
    };

    // Sort for legend: by starting position — determines team group order too
    const sortedDrivers = useMemo(() => {
        if (!chartData.length) return drivers;
        const first = chartData[0];
        return [...drivers].sort(
            (a, b) =>
                ((first[a.name_acronym] as number) ?? 99) -
                ((first[b.name_acronym] as number) ?? 99),
        );
    }, [drivers, chartData]);

    const teamGroups = useMemo(() => buildTeamGroups(sortedDrivers), [sortedDrivers]);

    return (
        <div className="bg-f1-card rounded-xl border border-f1-border p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-f1-muted uppercase tracking-wide">
                    Position Changes
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

            {/* Chart area with absolute-positioned side labels */}
            <div className="relative" style={{ height: CHART_HEIGHT }}>

                {/* LEFT labels */}
                <div
                    className="absolute top-0 left-0 bottom-[20px] pointer-events-none"
                    style={{ width: LEFT_LABEL_W }}
                >
                    {drivers.map((driver) => {
                        const edge = edgePositions.get(driver.name_acronym);
                        if (!edge?.leftPos) return null;
                        const y = posToY(
                            edge.leftPos,
                            CHART_HEIGHT - 20,
                            MARGIN.top,
                            MARGIN.bottom,
                        );
                        const style = getStyle(driver);
                        return (
                            <span
                                key={driver.driver_number}
                                className="absolute right-[2px] font-mono font-bold leading-none select-none"
                                style={{
                                    top: y,
                                    transform: "translateY(-50%)",
                                    fontSize: 11,
                                    color: `#${driver.team_colour || "ffffff"}`,
                                    opacity: style.opacity,
                                    transition: "opacity 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {driver.name_acronym}
                            </span>
                        );
                    })}
                </div>

                {/* RIGHT labels */}
                <div
                    className="absolute top-0 right-0 bottom-[20px] pointer-events-none"
                    style={{ width: RIGHT_LABEL_W }}
                >
                    {drivers.map((driver) => {
                        const edge = edgePositions.get(driver.name_acronym);
                        if (!edge?.rightPos) return null;
                        const y = posToY(
                            edge.rightPos,
                            CHART_HEIGHT - 20,
                            MARGIN.top,
                            MARGIN.bottom,
                        );
                        const style = getStyle(driver);
                        return (
                            <span
                                key={driver.driver_number}
                                className="absolute left-[2px] font-mono font-bold leading-none select-none"
                                style={{
                                    top: y,
                                    transform: "translateY(-50%)",
                                    fontSize: 11,
                                    color: `#${driver.team_colour || "ffffff"}`,
                                    opacity: style.opacity,
                                    transition: "opacity 0.2s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {driver.name_acronym}
                            </span>
                        );
                    })}
                </div>

                {/* Recharts — inset by label widths */}
                <div
                    className="absolute top-0 bottom-0"
                    style={{ left: LEFT_LABEL_W, right: RIGHT_LABEL_W }}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={MARGIN}>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                stroke="#2d3748"
                            />
                            <XAxis
                                dataKey="lap"
                                stroke="#6b7280"
                                tick={{ fontSize: 11 }}
                            />
                            <YAxis
                                reversed
                                domain={[DOMAIN_MIN, DOMAIN_MAX]}
                                stroke="#6b7280"
                                tick={{ fontSize: 11 }}
                                width={22}
                            />
                            <Tooltip
                                content={<TooltipContent />}
                                cursor={{
                                    stroke: "#6b7280",
                                    strokeDasharray: "5 5",
                                }}
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
                                        activeDot={{
                                            r: 4,
                                            fill: color,
                                            stroke: "#fff",
                                            strokeWidth: 1.5,
                                        }}
                                        connectNulls
                                        isAnimationActive={false}
                                    />
                                );
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

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
                                            backgroundColor: focused
                                                ? `${color}20`
                                                : "transparent",
                                            color: dimmed ? "#374151" : color,
                                            opacity: dimmed ? 0.5 : 1,
                                            transition: "all 0.15s ease",
                                            cursor: "pointer",
                                        }}
                                        title={`${focused ? "Unfocus" : "Focus"} ${driver.full_name?.split(" ").slice(-1)[0] ?? driver.name_acronym}`}
                                    >
                                        <span
                                            className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                                            style={{
                                                backgroundColor: dimmed ? "#374151" : color,
                                            }}
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
