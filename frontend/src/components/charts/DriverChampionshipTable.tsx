import { useMemo } from "react";
import type { Driver, Position } from "../../types";

interface DriverChampionshipTableProps {
    allDrivers: Driver[];
    allPositions: Map<number, Position[]>;
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

export default function DriverChampionshipTable({
    allDrivers,
    allPositions,
}: DriverChampionshipTableProps) {
    const driverChampionship = useMemo(() => {
        if (!allDrivers.length || !allPositions.size) return [];
        const points = new Map<number, number>();
        allPositions.forEach((posList) => {
            const byDriver = new Map<number, Position>();
            posList.forEach((p) => {
                const ex = byDriver.get(p.driver_number);
                if (!ex || p.date > ex.date) byDriver.set(p.driver_number, p);
            });
            byDriver.forEach((pos, driverNum) => {
                if (pos.position >= 1 && pos.position <= 20) {
                    points.set(
                        driverNum,
                        (points.get(driverNum) ?? 0) +
                            positionPoints(pos.position),
                    );
                }
            });
        });
        return allDrivers
            .filter((d) => points.has(d.driver_number))
            .map((d) => ({
                driverNumber: d.driver_number,
                name: d.name_acronym,
                fullName: d.full_name ?? d.name_acronym,
                points: points.get(d.driver_number) ?? 0,
                color: `#${d.team_colour || "ffffff"}`,
                teamName: (d as any).team_name ?? "",
            }))
            .sort((a, b) => b.points - a.points);
    }, [allDrivers, allPositions]);

    if (!driverChampionship.length) {
        return (
            <p className="text-f1-muted text-sm">
                No championship data available.
            </p>
        );
    }

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
                        <th className="py-2 px-3 text-right text-[10px] font-semibold text-white uppercase tracking-wider min-w-[56px]">
                            Pts
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {driverChampionship.map((driver, i) => (
                        <tr
                            key={driver.driverNumber}
                            className="border-t border-f1-border hover:bg-f1-border/20 transition-colors"
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
                                        {driver.name}
                                    </span>
                                    <span className="text-[10px] text-f1-muted truncate max-w-[100px]">
                                        {driver.teamName}
                                    </span>
                                </div>
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white">
                                {driver.points}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
