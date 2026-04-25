import { useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import LapTimesChart from '../components/charts/LapTimesChart';
import TireStrategy from '../components/charts/TireStrategy';
import SpeedTrace from '../components/charts/SpeedTrace';
import SectorHeatmap from '../components/charts/SectorHeatmap';

export default function DriverAnalysis() {
  const [year, setYear] = useState(2024);
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [driverNumber, setDriverNumber] = useState<number | null>(null);

  const { data: sessions } = useApi(() => api.getSessions(year, 'Race'), [year]);

  const { data: drivers } = useApi(
    () => (sessionKey ? api.getDrivers(sessionKey) : Promise.resolve([])),
    [sessionKey]
  );

  const { data: laps } = useApi(
    () => (sessionKey ? api.getLaps(sessionKey) : Promise.resolve([])),
    [sessionKey]
  );

  const { data: stints } = useApi(
    () => (sessionKey ? api.getStints(sessionKey) : Promise.resolve([])),
    [sessionKey]
  );

  const uniqueDrivers = useMemo(() => {
    if (!drivers) return [];
    const seen = new Set<number>();
    return drivers.filter(d => {
      if (seen.has(d.driver_number)) return false;
      seen.add(d.driver_number);
      return true;
    });
  }, [drivers]);

  const selectedDriver = uniqueDrivers.find(d => d.driver_number === driverNumber) ?? null;
  const maxLap = useMemo(
    () => Math.max(...(laps?.map(l => l.lap_number) ?? [0]), 0),
    [laps]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Driver Analysis</h1>

        <select
          value={year}
          onChange={e => { setYear(Number(e.target.value)); setSessionKey(null); setDriverNumber(null); }}
          className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
        >
          {[2025, 2024, 2023].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={sessionKey ?? ''}
          onChange={e => { setSessionKey(Number(e.target.value)); setDriverNumber(null); }}
          className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">Select Race...</option>
          {sessions?.map(s => (
            <option key={s.session_key} value={s.session_key}>
              {s.circuit_short_name} — {s.country_name}
            </option>
          ))}
        </select>

        {uniqueDrivers.length > 0 && (
          <select
            value={driverNumber ?? ''}
            onChange={e => setDriverNumber(Number(e.target.value))}
            className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select Driver...</option>
            {uniqueDrivers.map(d => (
              <option key={d.driver_number} value={d.driver_number}>
                {d.name_acronym} — {d.full_name} ({d.team_name})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Driver info card */}
      {selectedDriver && (
        <div className="bg-f1-card rounded-xl border border-f1-border p-6 flex items-center gap-6">
          {selectedDriver.headshot_url && (
            <img
              src={selectedDriver.headshot_url}
              alt={selectedDriver.full_name}
              className="w-24 h-24 rounded-full object-cover border-2"
              style={{ borderColor: `#${selectedDriver.team_colour}` }}
            />
          )}
          <div>
            <h2 className="text-xl font-bold">{selectedDriver.full_name}</h2>
            <p className="text-f1-muted">
              #{selectedDriver.driver_number} — {selectedDriver.team_name}
            </p>
            <div
              className="mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `#${selectedDriver.team_colour}20`, color: `#${selectedDriver.team_colour}` }}
            >
              {selectedDriver.country_code}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {sessionKey && laps && laps.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LapTimesChart
            laps={driverNumber ? laps.filter(l => l.driver_number === driverNumber) : laps}
            drivers={uniqueDrivers}
            highlightDriver={driverNumber}
            currentLap={maxLap}
            maxLap={maxLap}
          />
          <SectorHeatmap
            laps={laps}
            drivers={uniqueDrivers}
            highlightDriver={driverNumber}
          />
          {stints && (
            <TireStrategy
              stints={driverNumber ? stints.filter(s => s.driver_number === driverNumber) : stints}
              drivers={uniqueDrivers}
              laps={laps}
              maxLap={maxLap}
              currentLap={maxLap}
            />
          )}
          {driverNumber && (
            <SpeedTrace
              sessionKey={sessionKey}
              driverNumber={driverNumber}
              driver={selectedDriver}
            />
          )}
        </div>
      )}

      {!sessionKey && (
        <div className="text-center text-f1-muted py-20">
          <p className="text-lg">Select a race and driver to analyze</p>
        </div>
      )}
    </div>
  );
}
