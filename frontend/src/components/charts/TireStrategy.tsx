import { useMemo } from 'react';
// Recharts not used here — custom tire visualization
import type { Stint, Driver, Lap } from '../../types';

interface Props {
  stints: Stint[];
  drivers: Driver[];
  laps: Lap[];
  maxLap: number;
  currentLap: number;
}

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#ef4444',
  MEDIUM: '#eab308',
  HARD: '#f3f4f6',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
  UNKNOWN: '#6b7280',
};

export default function TireStrategy({ stints, drivers, laps, maxLap, currentLap }: Props) {
  // Derive current positions from laps at currentLap
  const positionMap = useMemo(() => {
    const map = new Map<number, number>();
    const currentLapData = laps
      .filter(l => l.lap_number === currentLap)
      .sort((a, b) => (a.lap_duration ?? Infinity) - (b.lap_duration ?? Infinity));
    currentLapData.forEach((l, idx) => map.set(l.driver_number, idx + 1));
    return map;
  }, [laps, currentLap]);

  const chartData = useMemo(() => {
    return drivers.map(driver => {
      const driverStints = stints
        .filter(s => s.driver_number === driver.driver_number)
        .sort((a, b) => a.stint_number - b.stint_number);

      const segments = driverStints.map(s => ({
        compound: s.compound || 'UNKNOWN',
        start: s.lap_start,
        end: Math.min(s.lap_end, currentLap),
        length: Math.max(0, Math.min(s.lap_end, currentLap) - s.lap_start + 1),
      })).filter(seg => seg.length > 0);

      return {
        driver: driver.name_acronym,
        driverNumber: driver.driver_number,
        teamColour: driver.team_colour,
        position: positionMap.get(driver.driver_number) ?? 99,
        segments,
      };
    })
    .filter(d => d.segments.length > 0)
    .sort((a, b) => a.position - b.position);
  }, [stints, drivers, currentLap, positionMap]);

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Tire Strategy
      </h3>

      {/* Legend */}
      <div className="flex gap-3 mb-3">
        {Object.entries(COMPOUND_COLORS).filter(([k]) => k !== 'UNKNOWN').map(([compound, color]) => (
          <div key={compound} className="flex items-center gap-1 text-xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
            <span className="text-f1-muted">{compound}</span>
          </div>
        ))}
      </div>

      {/* Strategy visualization */}
      <div className="space-y-1 max-h-[280px] overflow-y-auto">
        {chartData.map(row => (
          <div key={row.driverNumber} className="flex items-center gap-2">
            <span className="text-xs font-mono w-10 text-f1-muted">{row.driver}</span>
            <div className="flex-1 flex h-6 rounded overflow-hidden bg-f1-dark">
              {row.segments.map((seg, i) => (
                <div
                  key={i}
                  className="h-full flex items-center justify-center text-[9px] font-bold"
                  style={{
                    width: `${(seg.length / maxLap) * 100}%`,
                    backgroundColor: COMPOUND_COLORS[seg.compound] || COMPOUND_COLORS.UNKNOWN,
                    color: seg.compound === 'HARD' ? '#111827' : '#ffffff',
                    marginLeft: i === 0 ? `${(seg.start / maxLap) * 100}%` : 0,
                    borderRight: '2px solid #111827',
                    transition: 'width 0.4s ease-in-out, margin-left 0.4s ease-in-out',
                  }}
                >
                  {seg.length > 5 ? seg.compound[0] : ''}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
