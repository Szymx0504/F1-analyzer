import { useState, useMemo } from 'react';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
// types used implicitly via component props
import DriverStandings from '../components/tables/DriverStandings';
import SectorHeatmap from '../components/charts/SectorHeatmap';

export default function SeasonOverview() {
  const [year, setYear] = useState(2024);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);

  const { data: sessions, loading: sessionsLoading } = useApi(
    () => api.getSessions(year, 'Race'),
    [year]
  );

  const { data: drivers } = useApi(
    () => (selectedSession ? api.getDrivers(selectedSession) : Promise.resolve([])),
    [selectedSession]
  );

  const { data: laps } = useApi(
    () => (selectedSession ? api.getLaps(selectedSession) : Promise.resolve([])),
    [selectedSession]
  );

  // Unique drivers
  const uniqueDrivers = useMemo(() => {
    if (!drivers) return [];
    const seen = new Set<number>();
    return drivers.filter(d => {
      if (seen.has(d.driver_number)) return false;
      seen.add(d.driver_number);
      return true;
    });
  }, [drivers]);

  // Auto-select first session
  useMemo(() => {
    if (sessions?.length && !selectedSession) {
      setSelectedSession(sessions[sessions.length - 1].session_key);
    }
  }, [sessions, selectedSession]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">Season Overview</h1>

        <select
          value={year}
          onChange={e => { setYear(Number(e.target.value)); setSelectedSession(null); }}
          className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm"
        >
          {[2025, 2024, 2023].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <select
          value={selectedSession ?? ''}
          onChange={e => setSelectedSession(Number(e.target.value))}
          className="bg-f1-card border border-f1-border rounded-lg px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">Select Race...</option>
          {sessions?.map(s => (
            <option key={s.session_key} value={s.session_key}>
              {s.circuit_short_name} — {s.country_name}
            </option>
          ))}
        </select>
      </div>

      {/* Race calendar */}
      <div className="bg-f1-card rounded-xl border border-f1-border p-4">
        <h2 className="text-lg font-semibold mb-3">Race Calendar — {year}</h2>
        {sessionsLoading ? (
          <p className="text-f1-muted">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {sessions?.map(s => (
              <button
                key={s.session_key}
                onClick={() => setSelectedSession(s.session_key)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  selectedSession === s.session_key
                    ? 'border-f1-red bg-f1-red/10'
                    : 'border-f1-border hover:border-f1-muted'
                }`}
              >
                <p className="font-medium text-sm">{s.country_name}</p>
                <p className="text-xs text-f1-muted">{s.circuit_short_name}</p>
                <p className="text-xs text-f1-muted mt-1">
                  {new Date(s.date_start).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedSession && laps && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DriverStandings
            laps={laps}
            drivers={uniqueDrivers}
            selectedDriver={selectedDriver}
            onSelectDriver={setSelectedDriver}
          />
          <SectorHeatmap
            laps={laps}
            drivers={uniqueDrivers}
            highlightDriver={selectedDriver}
          />
        </div>
      )}
    </div>
  );
}
