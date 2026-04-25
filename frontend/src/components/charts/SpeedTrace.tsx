import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import type { Driver } from '../../types';

interface Props {
  sessionKey: number;
  driverNumber: number | null;
  driver: Driver | null;
}

export default function SpeedTrace({ sessionKey, driverNumber, driver }: Props) {
  const [speedData, setSpeedData] = useState<{ idx: number; speed: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionKey || !driverNumber) {
      setSpeedData([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api.getCarData(sessionKey, driverNumber)
      .then(data => {
        if (cancelled) return;
        // Sample every Nth point to keep it performant
        const sampled = data
          .filter((_, i) => i % 10 === 0)
          .map((d, i) => ({ idx: i, speed: d.speed }));
        setSpeedData(sampled);
      })
      .catch(() => setSpeedData([]))
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sessionKey, driverNumber]);

  const color = driver ? `#${driver.team_colour}` : '#ef4444';

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Speed Trace {driver ? `— ${driver.name_acronym}` : ''}
      </h3>
      {loading ? (
        <div className="h-[300px] flex items-center justify-center text-f1-muted">Loading telemetry...</div>
      ) : speedData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-f1-muted">
          {driverNumber ? 'No telemetry data' : 'Select a driver'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={speedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="idx" hide />
            <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} domain={[0, 370]} tickFormatter={v => `${v}`} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={(value: unknown) => [`${value} km/h`, 'Speed']}
            />
            <Area
              type="monotone"
              dataKey="speed"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
