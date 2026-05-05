import { useMemo } from "react";
import type { Driver, Position } from "../../types";

interface RaceResultTableProps {
    positions: Position[];
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

export default function RaceResultTable({
    positions,
    drivers,
}: RaceResultTableProps) {
    const finalPositions = useMemo(() => {
        const byDriver = new Map<number, Position>();
        positions.forEach((p) => {
            const existing = byDriver.get(p.driver_number);
            if (!existing || p.date > existing.date)
                byDriver.set(p.driver_number, p);
        });
        return Array.from(byDriver.values())
            .filter((p) => p.position >= 1 && p.position <= 20)
            .sort((a, b) => a.position - b.position);
    }, [positions]);

    const data = useMemo(
        () =>
            finalPositions.map((fp) => {
                const driver = drivers.find(
                    (d) => d.driver_number === fp.driver_number,
                );
                return {
                    position: fp.position,
                    driverNumber: fp.driver_number,
                    acronym: driver?.name_acronym ?? `#${fp.driver_number}`,
                    fullName: driver?.full_name ?? `Driver ${fp.driver_number}`,
                    points: positionPoints(fp.position),
                    color: `#${driver?.team_colour || "ffffff"}`,
                    teamName: (driver as any)?.team_name ?? "",
                };
            }),
        [finalPositions, drivers],
    );

    if (!data.length)
        return (
            <p className="text-f1-muted text-sm">No position data available.</p>
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
                                <div className="flex flex-col gap-0.5">
                                    <span
                                        className="font-bold"
                                        style={{ color: row.color }}
                                    >
                                        {row.acronym}
                                    </span>
                                    <span className="text-[10px] text-f1-muted truncate max-w-[100px]">
                                        {row.teamName}
                                    </span>
                                </div>
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
