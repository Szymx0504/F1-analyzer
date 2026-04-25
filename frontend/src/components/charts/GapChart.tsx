import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Interval, Lap, Driver } from '../../types';

interface Props {
  intervals: Interval[];
  laps: Lap[];
  drivers: Driver[];
  highlightDriver: number | null;
  currentLap: number;
  maxLap: number;
}

export default function GapChart({ intervals, laps, drivers, highlightDriver, currentLap, maxLap }: Props) {
  const chartData = useMemo(() => {
    if (!intervals.length || !laps.length) return [];

    // Group intervals by approximate lap number using timestamps
    const lapNumbers = [...new Set(laps.map(l => l.lap_number))].sort((a, b) => a - b);
    const filteredLapNumbers = lapNumbers.filter(l => l <= currentLap);

    return filteredLapNumbers.map(lapNum => {
      const row: Record<string, number | string> = { lap: lapNum };
      const lapEntries = laps.filter(l => l.lap_number === lapNum);

      drivers.forEach(driver => {
        const lapEntry = lapEntries.find(l => l.driver_number === driver.driver_number);
        if (!lapEntry?.date_start) return;

        // Find closest interval to this lap's timestamp
        const driverIntervals = intervals.filter(i => i.driver_number === driver.driver_number);
        const closest = driverIntervals.reduce<Interval | null>((best, curr) => {
          if (!best) return curr;
          const bestDiff = Math.abs(new Date(best.date).getTime() - new Date(lapEntry.date_start).getTime());
          const currDiff = Math.abs(new Date(curr.date).getTime() - new Date(lapEntry.date_start).getTime());
          return currDiff < bestDiff ? curr : best;
        }, null);

        if (closest?.gap_to_leader != null && typeof closest.gap_to_leader === 'number') {
          row[driver.name_acronym] = Math.round(closest.gap_to_leader * 1000) / 1000;
        }
      });

      return row;
    });
  }, [intervals, laps, drivers, currentLap]);

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Gap to Leader
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="lap" stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => `${v}s`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f9fafb' }}
            formatter={(value: unknown, name: unknown) => [`+${Number(value).toFixed(3)}s`, String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {drivers.map(driver => (
            <Line
              key={driver.driver_number}
              type="monotone"
              dataKey={driver.name_acronym}
              stroke={`#${driver.team_colour || 'ffffff'}`}
              strokeWidth={highlightDriver === driver.driver_number ? 3 : 1}
              strokeOpacity={highlightDriver && highlightDriver !== driver.driver_number ? 0.2 : 1}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
