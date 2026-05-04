import { useMemo } from "react";
import type { Driver, Position } from "../../types";

interface Session {
    session_key: number;
    session_name: string;
    session_type: string;
    country_name: string;
    circuit_short_name: string;
    date_start: string;
    year: number;
}

interface GridEntry {
    driverNumber: number;
    acronym: string;
    fullName: string;
    teamName: string;
    color: string;
    positions: (number | null)[];
    totalPoints: number;
}

interface SeasonGridProps {
    raceSessions: Session[];
    allPositions: Map<number, Position[]>;
    allDrivers: Driver[];
    selectedSessionKey: number;
}

const POINTS_MAP: Record<number, number> = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
};

function positionPoints(pos: number): number {
    return POINTS_MAP[pos] ?? 0;
}

const RESULT_COLORS: Record<number, string> = {
    1: "#ffd700",
    2: "#c0c0c0",
    3: "#cd7f32",
};

function getResultBg(pos: number | null): string {
    if (pos === null) return "#111827";
    if (pos === 1) return "rgba(255,215,0,0.15)";
    if (pos === 2) return "rgba(192,192,192,0.12)";
    if (pos === 3) return "rgba(205,127,50,0.12)";
    if (pos <= 10) return "rgba(34,197,94,0.08)";
    return "rgba(255,255,255,0.03)";
}

function getResultTextColor(pos: number | null): string {
    if (pos === null) return "#374151";
    if (pos <= 3) return RESULT_COLORS[pos];
    if (pos <= 10) return "#86efac";
    return "#6b7280";
}

export default function SeasonGrid({
    raceSessions,
    allPositions,
    allDrivers,
    selectedSessionKey,
}: SeasonGridProps) {
    const visibleRaces = useMemo(() => {
        const idx = raceSessions.findIndex(
            (s) => s.session_key === selectedSessionKey,
        );
        return idx >= 0 ? raceSessions.slice(0, idx + 1) : raceSessions;
    }, [raceSessions, selectedSessionKey]);

    const driverGrid = useMemo((): GridEntry[] => {
        const driverMap = new Map<number, GridEntry>();

        allDrivers.forEach((d) => {
            if (!driverMap.has(d.driver_number)) {
                driverMap.set(d.driver_number, {
                    driverNumber: d.driver_number,
                    acronym: d.name_acronym,
                    fullName: d.full_name ?? d.name_acronym,
                    teamName: (d as any).team_name ?? "",
                    color: `#${d.team_colour || "ffffff"}`,
                    positions: Array(visibleRaces.length).fill(null),
                    totalPoints: 0,
                });
            }
        });

        visibleRaces.forEach((race, raceIdx) => {
            const posList = allPositions.get(race.session_key) ?? [];
            const byDriver = new Map<number, Position>();
            posList.forEach((p) => {
                const ex = byDriver.get(p.driver_number);
                if (!ex || p.date > ex.date) byDriver.set(p.driver_number, p);
            });
            byDriver.forEach((pos, driverNum) => {
                if (!driverMap.has(driverNum)) return;
                const entry = driverMap.get(driverNum)!;
                while (entry.positions.length <= raceIdx)
                    entry.positions.push(null);
                entry.positions[raceIdx] = pos.position;
                entry.totalPoints += positionPoints(pos.position);
            });
        });

        return Array.from(driverMap.values())
            .filter((d) => d.positions.some((p) => p !== null))
            .sort((a, b) => b.totalPoints - a.totalPoints);
    }, [allPositions, allDrivers, visibleRaces]);

    if (!visibleRaces.length || !driverGrid.length) {
        return <p className="text-f1-muted text-sm">No data available.</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table
                className="w-full text-[11px] font-mono border-collapse"
                style={{ minWidth: visibleRaces.length * 44 + 220 }}
            >
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-f1-card text-left py-2 pr-3 pl-1 text-[10px] font-semibold text-f1-muted uppercase tracking-wider w-[40px]">
                            #
                        </th>
                        <th className="sticky left-8 z-10 bg-f1-card text-left py-2 pr-4 text-[10px] font-semibold text-f1-muted uppercase tracking-wider min-w-[120px]">
                            Driver
                        </th>
                        {visibleRaces.map((r) => (
                            <th
                                key={r.session_key}
                                className="py-2 px-1 text-center text-[10px] font-semibold text-f1-muted uppercase tracking-wider min-w-[40px]"
                                title={`${r.country_name} — ${new Date(r.date_start).toLocaleDateString()}`}
                            >
                                <span className="block">
                                    {r.circuit_short_name}
                                </span>
                            </th>
                        ))}
                        <th className="py-2 px-3 text-right text-[10px] font-semibold text-white uppercase tracking-wider min-w-[56px]">
                            Pts
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {driverGrid.map((driver, i) => (
                        <tr
                            key={driver.driverNumber}
                            className="border-t border-[#1f2937] hover:bg-white/[0.03] transition-colors"
                        >
                            <td className="sticky left-0 z-10 bg-f1-card py-2 pr-3 pl-1 text-f1-muted">
                                {i + 1}
                            </td>
                            <td className="sticky left-8 z-10 bg-f1-card py-2 pr-4">
                                <div className="flex flex-col gap-0.5">
                                    <span
                                        className="font-bold"
                                        style={{ color: driver.color }}
                                    >
                                        {driver.acronym}
                                    </span>
                                    <span className="text-[10px] text-f1-muted truncate max-w-[100px]">
                                        {driver.teamName}
                                    </span>
                                </div>
                            </td>
                            {driver.positions.map((pos, raceIdx) => (
                                <td
                                    key={raceIdx}
                                    className="py-1 px-0.5 text-center"
                                    title={
                                        pos !== null
                                            ? `P${pos} — ${positionPoints(pos)} pts`
                                            : "DNS/DNF"
                                    }
                                >
                                    <span
                                        className="inline-flex items-center justify-center w-8 h-7 rounded text-[11px] font-bold"
                                        style={{
                                            backgroundColor: getResultBg(pos),
                                            color: getResultTextColor(pos),
                                        }}
                                    >
                                        {pos !== null ? pos : "–"}
                                    </span>
                                </td>
                            ))}
                            <td className="py-2 px-3 text-right font-bold text-white">
                                {driver.totalPoints}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
