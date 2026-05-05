import { useMemo } from "react";
import type { Driver, Lap, Position, Stint } from "../../types";

interface Props {
  laps: Lap[];
  positions: Position[];
  stints: Stint[];
  drivers: Driver[];
  currentLap: number;
  maxLap: number;
  highlightDriver: number | null;
}

interface RaceEvent {
  lap: number;
  type: "overtake" | "pit" | "tyre" | "retirement" | "fastest_lap";
  driverNumber: number;
  description: string;
  detail?: string;
}

const EVENT_ICONS: Record<RaceEvent["type"], string> = {
  overtake: "⇅",
  pit: "🔧",
  tyre: "⊚",
  retirement: "⛔",
  fastest_lap: "⏱",
};

const EVENT_COLORS: Record<RaceEvent["type"], string> = {
  overtake: "#3b82f6",
  pit: "#eab308",
  tyre: "#8b5cf6",
  retirement: "#ef4444",
  fastest_lap: "#a855f7",
};

const TYRE_COLORS: Record<string, string> = {
  SOFT: "#ef4444",
  MEDIUM: "#eab308",
  HARD: "#f5f5f5",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
};

export default function RaceEventsFeed({
  laps,
  positions,
  stints,
  drivers,
  currentLap,
  maxLap: _maxLap,
  highlightDriver,
}: Props) {
  const driverMap = useMemo(() => {
    const m = new Map<number, Driver>();
    for (const d of drivers) m.set(d.driver_number, d);
    return m;
  }, [drivers]);

  const events = useMemo(() => {
    const result: RaceEvent[] = [];

    // ── Build position by driver by lap ──
    const posByDriverLap = new Map<string, number>();
    // Group laps by driver
    const lapsByDriver = new Map<number, Lap[]>();
    for (const l of laps) {
      const key = `${l.driver_number}_${l.lap_number}`;
      // For position: find latest position before this lap
      const list = lapsByDriver.get(l.driver_number) ?? [];
      list.push(l);
      lapsByDriver.set(l.driver_number, list);
    }

    // Sort positions by date per driver
    const sortedPositions = [...positions].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    // Build a map: for each lap, what was each driver's position?
    const driverNums = new Set(laps.map((l) => l.driver_number));
    for (const dn of driverNums) {
      const driverPos = sortedPositions.filter((p) => p.driver_number === dn);
      const driverLaps = (lapsByDriver.get(dn) ?? []).sort(
        (a, b) => a.lap_number - b.lap_number,
      );
      for (const lap of driverLaps) {
        const lapStart = lap.date_start;
        // Find latest position at or before lap start
        let best: Position | null = null;
        for (const p of driverPos) {
          if (p.date <= lapStart) best = p;
          else break;
        }
        if (best) {
          posByDriverLap.set(`${dn}_${lap.lap_number}`, best.position);
        }
      }
    }

    // ── Detect overtakes ──
    for (const dn of driverNums) {
      const driverLaps = (lapsByDriver.get(dn) ?? []).sort(
        (a, b) => a.lap_number - b.lap_number,
      );
      for (let i = 1; i < driverLaps.length; i++) {
        const prevLap = driverLaps[i - 1].lap_number;
        const curLap = driverLaps[i].lap_number;
        const prevPos = posByDriverLap.get(`${dn}_${prevLap}`);
        const curPos = posByDriverLap.get(`${dn}_${curLap}`);
        if (prevPos != null && curPos != null && curPos < prevPos) {
          const gained = prevPos - curPos;
          const drv = driverMap.get(dn);
          if (gained >= 1 && gained <= 5) {
            result.push({
              lap: curLap,
              type: "overtake",
              driverNumber: dn,
              description: `${drv?.name_acronym ?? dn} gains ${gained} position${gained > 1 ? "s" : ""}`,
              detail: `P${prevPos} → P${curPos}`,
            });
          }
        }
      }
    }

    // ── Detect pit stops & tyre changes ──
    const stintsByDriver = new Map<number, Stint[]>();
    for (const s of stints) {
      const list = stintsByDriver.get(s.driver_number) ?? [];
      list.push(s);
      stintsByDriver.set(s.driver_number, list);
    }

    for (const [dn, driverStints] of stintsByDriver) {
      const sorted = [...driverStints].sort(
        (a, b) => a.stint_number - b.stint_number,
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const cur = sorted[i];
        const drv = driverMap.get(dn);
        const name = drv?.name_acronym ?? String(dn);

        result.push({
          lap: cur.lap_start,
          type: "pit",
          driverNumber: dn,
          description: `${name} pit stop (stop ${i})`,
          detail: `Lap ${cur.lap_start}`,
        });

        if (prev.compound !== cur.compound) {
          result.push({
            lap: cur.lap_start,
            type: "tyre",
            driverNumber: dn,
            description: `${name}: ${prev.compound} → ${cur.compound}`,
            detail: `After ${prev.lap_end - prev.lap_start + 1} laps`,
          });
        }
      }
    }

    // ── Detect retirements (driver has laps but stops well before race end) ──
    const maxLapInData = Math.max(...laps.map((l) => l.lap_number), 0);
    for (const [dn, driverLaps] of lapsByDriver) {
      const lastLap = Math.max(...driverLaps.map((l) => l.lap_number));
      if (lastLap < maxLapInData - 2 && lastLap > 1) {
        const drv = driverMap.get(dn);
        result.push({
          lap: lastLap,
          type: "retirement",
          driverNumber: dn,
          description: `${drv?.name_acronym ?? dn} retired`,
          detail: `Last seen lap ${lastLap}`,
        });
      }
    }

    // ── Fastest laps per lap ──
    const lapTimesByLap = new Map<number, { dn: number; time: number }[]>();
    for (const l of laps) {
      if (l.lap_duration && l.lap_duration > 0) {
        const list = lapTimesByLap.get(l.lap_number) ?? [];
        list.push({ dn: l.driver_number, time: l.lap_duration });
        lapTimesByLap.set(l.lap_number, list);
      }
    }

    let overallFastest = Infinity;
    for (const [lapNum, times] of lapTimesByLap) {
      const best = times.reduce((a, b) => (a.time < b.time ? a : b));
      if (best.time < overallFastest) {
        overallFastest = best.time;
        const drv = driverMap.get(best.dn);
        const mins = Math.floor(best.time / 60);
        const secs = (best.time % 60).toFixed(3);
        result.push({
          lap: lapNum,
          type: "fastest_lap",
          driverNumber: best.dn,
          description: `${drv?.name_acronym ?? best.dn} sets fastest lap`,
          detail: `${mins}:${secs.padStart(6, "0")}`,
        });
      }
    }

    // Sort by lap descending so newest events appear first
    result.sort((a, b) => b.lap - a.lap || a.type.localeCompare(b.type));
    return result;
  }, [laps, positions, stints, driverMap]);

  // Filter to events at or before current lap
  const visibleEvents = useMemo(
    () => events.filter((e) => e.lap <= currentLap),
    [events, currentLap],
  );

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4 flex flex-col">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Race Events
      </h3>
      <div
        className="overflow-y-auto space-y-0.5 pr-1"
        style={{ height: 500 }}
      >
        {visibleEvents.length === 0 ? (
          <p className="text-f1-muted text-sm text-center py-8">
            No events yet — start the replay
          </p>
        ) : (
          visibleEvents.map((ev, i) => {
            const drv = driverMap.get(ev.driverNumber);
            const col = drv ? `#${drv.team_colour || "fff"}` : "#9ca3af";
            const isHl = highlightDriver === ev.driverNumber;
            const isDim = highlightDriver != null && !isHl;

            return (
              <div
                key={`${ev.lap}-${ev.type}-${ev.driverNumber}-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md transition-opacity"
                style={{
                  opacity: isDim ? 0.25 : 1,
                  background:
                    ev.lap === currentLap
                      ? "rgba(255,255,255,0.05)"
                      : "transparent",
                }}
              >
                {/* Lap badge */}
                <span className="text-[10px] font-mono text-white/40 w-6 text-right shrink-0">
                  L{ev.lap}
                </span>

                {/* Event icon */}
                <span
                  className="text-sm w-5 text-center shrink-0"
                  style={{ color: EVENT_COLORS[ev.type] }}
                >
                  {EVENT_ICONS[ev.type]}
                </span>

                {/* Team color bar */}
                <span
                  className="w-[3px] h-4 rounded-sm shrink-0"
                  style={{ background: col }}
                />

                {/* Description */}
                <span className="text-xs text-white/90 truncate flex-1">
                  {ev.type === "tyre" ? (
                    <TyreChangeLabel description={ev.description} />
                  ) : (
                    ev.description
                  )}
                </span>

                {/* Detail */}
                {ev.detail && (
                  <span className="text-[10px] text-white/40 font-mono shrink-0">
                    {ev.detail}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/** Renders tyre compound names with colors */
function TyreChangeLabel({ description }: { description: string }) {
  // Format: "VER: SOFT → MEDIUM"
  const match = description.match(/^(.+?):\s*(\w+)\s*→\s*(\w+)$/);
  if (!match) return <>{description}</>;
  const [, name, from, to] = match;
  return (
    <>
      {name}:{" "}
      <span style={{ color: TYRE_COLORS[from] ?? "#9ca3af" }}>{from}</span>
      {" → "}
      <span style={{ color: TYRE_COLORS[to] ?? "#9ca3af" }}>{to}</span>
    </>
  );
}
