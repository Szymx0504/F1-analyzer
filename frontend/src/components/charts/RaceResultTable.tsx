import { useMemo } from "react";
import type { Driver, SessionResultRow } from "../../types";

interface RaceResultTableProps {
    results: SessionResultRow[];
    drivers: Driver[];
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

function getSurname(driver: Driver | undefined): string {
    const name =
        driver?.full_name ?? driver?.broadcast_name ?? driver?.name_acronym;
    if (!name) return "Unknown";
    const parts = name.trim().split(" ");
    return parts[parts.length - 1] || name;
}

export default function RaceResultTable({
    results,
    drivers,
}: RaceResultTableProps) {
    const finalResults = useMemo(
        () =>
            results
                .filter((r) => r.position >= 1 && r.position <= 20)
                .sort((a, b) => a.position - b.position),
        [results],
    );

    const data = useMemo(
        () =>
            finalResults.map((row) => {
                const driver = drivers.find(
                    (d) => d.driver_number === row.driver_number,
                );
                return {
                    position: row.position,
                    driverNumber: row.driver_number,
                    surname: getSurname(driver),
                    teamName: driver?.team_name ?? "",
                    color: `#${driver?.team_colour || "ffffff"}`,
                    points: positionPoints(row.position),
                };
            }),
        [finalResults, drivers],
    );

    if (!data.length)
        return (
            <p className="text-f1-muted text-sm">
                No session result data available.
            </p>
        );

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[11px] font-mono border-collapse">
                <thead>
                    <tr>
                        <th className="sticky left-0 z-10 bg-f1-card text-left py-2 pr-3 pl-1 text-[10px] font-semibold text-f1-muted uppercase tracking-wider w-[40px]">
                            #
                        </th>
                        <th className="sticky left-8 z-10 bg-f1-card text-left py-2 pr-4 text-[10px] font-semibold text-f1-muted uppercase tracking-wider min-w-[140px]">
                            Driver
                        </th>
                        <th className="py-2 px-3 text-left text-[10px] font-semibold text-f1-muted uppercase tracking-wider min-w-[160px]">
                            Team
                        </th>
                        <th className="py-2 px-3 text-center text-[10px] font-semibold text-f1-muted uppercase tracking-wider min-w-[56px]">
                            Pos
                        </th>
                        <th className="py-2 px-3 text-right text-[10px] font-semibold text-white uppercase tracking-wider min-w-[56px]">
                            Pts
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {data.map((row, i) => (
                        <tr
                            key={row.driverNumber}
                            className="border-t border-f1-border hover:bg-f1-border/20 transition-colors"
                        >
                            <td className="sticky left-0 z-10 bg-f1-card py-2 pr-3 pl-1 text-f1-muted">
                                {i + 1}
                            </td>
                            <td className="sticky left-8 z-10 bg-f1-card py-2 pr-4">
                                <span
                                    className="font-bold"
                                    style={{ color: row.color }}
                                >
                                    #{row.driverNumber} {row.surname}
                                </span>
                            </td>
                            <td className="py-2 px-3 text-left text-f1-muted">
                                {row.teamName}
                            </td>
                            <td className="py-2 px-3 text-center font-bold text-white">
                                P{row.position}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white">
                                {row.points}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
