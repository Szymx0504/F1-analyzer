import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Lap, Driver } from '../../types';

interface Props {
  laps: Lap[];
  drivers: Driver[];
  highlightDriver: number | null;
  currentLap: number;
  maxLap: number;
}

export default function LapTimesChart({ laps, drivers, highlightDriver, maxLap }: Props) {
  const chartData = useMemo(() => {
    const lapNumbers = [...new Set(laps.map(l => l.lap_number))].sort((a, b) => a - b);
    return lapNumbers.map(lapNum => {
      const row: Record<string, number> = { lap: lapNum };
      laps
        .filter(l => l.lap_number === lapNum && l.lap_duration !== null)
        .forEach(l => {
          const driver = drivers.find(d => d.driver_number === l.driver_number);
          if (driver && l.lap_duration) {
            row[driver.name_acronym] = Math.round(l.lap_duration * 1000) / 1000;
          }
        });
      return row;
    });
  }, [laps, drivers]);

  // Calculate Y domain (filter out pit laps)
  const yDomain = useMemo(() => {
    const times = laps
      .filter(l => l.lap_duration && !l.is_pit_out_lap && l.lap_duration < 200)
      .map(l => l.lap_duration!);
    if (!times.length) return [60, 120];
    return [Math.floor(Math.min(...times) - 2), Math.ceil(Math.max(...times) + 2)];
  }, [laps]);

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Lap Times
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="lap" stroke="#9ca3af" tick={{ fontSize: 12 }} />
          <YAxis domain={yDomain} stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={v => `${v}s`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f9fafb' }}
            formatter={(value: unknown, name: unknown) => [`${Number(value).toFixed(3)}s`, String(name)]}
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
