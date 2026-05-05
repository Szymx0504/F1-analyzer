import { useEffect, useRef, useState, useMemo } from "react";
import { api } from "../../lib/api";
import type {
    Driver,
    Interval,
    Lap,
    Position,
    Stint,
    TrackMapData,
} from "../../types";

interface Props {
    sessionKey: number;
    drivers: Driver[];
    laps: Lap[];
    positions: Position[];
    stints: Stint[];
    intervals: Interval[];
    currentLap: number;
    speed: number;
    isPlaying: boolean;
    highlightDriver: number | null;
}

// ── Types & constants ────────────────────────────────────────────────────────

interface Sample {
    x: number;
    y: number;
    time: number;
}
interface ArcSample {
    d: number;
    time: number;
}
interface TrackSeg {
    x: number;
    y: number;
    d: number;
}
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
type Pt = { x: number; y: number };

const W = 600;
const H = 500;
const PAD = 30;
const SNAP_PTS = 200; // outline points used for snap (perf)

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeBounds(pts: Pt[]): Bounds {
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
    for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
}

function toCanvas(x: number, y: number, b: Bounds) {
    const rx = b.maxX - b.minX || 1;
    const ry = b.maxY - b.minY || 1;
    const scale = Math.min((W - PAD * 2) / rx, (H - PAD * 2) / ry);
    return {
        px: W / 2 + (x - (b.minX + b.maxX) / 2) * scale,
        py: H / 2 - (y - (b.minY + b.maxY) / 2) * scale,
    };
}

/** Binary-search + linear interpolation between two surrounding samples */
function interpolate(samples: Sample[], time: number): Pt | null {
    const n = samples.length;
    if (!n) return null;
    if (time <= samples[0].time) return samples[0];
    if (time >= samples[n - 1].time) return samples[n - 1];
    let lo = 0,
        hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].time <= time) lo = mid;
        else hi = mid;
    }
    const a = samples[lo],
        b = samples[hi];
    const t = (time - a.time) / (b.time - a.time || 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Downsample an array to ~target points, keeping first & last */
function downsample(arr: Pt[], target: number): Pt[] {
    if (arr.length <= target) return arr;
    const step = (arr.length - 1) / (target - 1);
    const out: Pt[] = [];
    for (let i = 0; i < target; i++) out.push(arr[Math.round(i * step)]);
    return out;
}

/** Build a track path with cumulative arc-length at each vertex */
function buildTrackPath(pts: Pt[]): { segs: TrackSeg[]; totalLen: number } {
    const segs: TrackSeg[] = [{ x: pts[0].x, y: pts[0].y, d: 0 }];
    for (let i = 1; i < pts.length; i++) {
        const dx = pts[i].x - pts[i - 1].x,
            dy = pts[i].y - pts[i - 1].y;
        segs.push({
            x: pts[i].x,
            y: pts[i].y,
            d: segs[i - 1].d + Math.sqrt(dx * dx + dy * dy),
        });
    }
    const lx = pts[pts.length - 1],
        fx = pts[0];
    const cdx = fx.x - lx.x,
        cdy = fx.y - lx.y;
    const totalLen = segs[segs.length - 1].d + Math.sqrt(cdx * cdx + cdy * cdy);
    return { segs, totalLen };
}

/** Project a point onto the track and return its arc-length parameter */
function projectToArc(pt: Pt, segs: TrackSeg[], totalLen: number): number {
    let bestD2 = Infinity,
        bestArc = 0;
    const n = segs.length;
    for (let i = 0; i < n; i++) {
        const a = segs[i];
        const b =
            i < n - 1
                ? segs[i + 1]
                : { x: segs[0].x, y: segs[0].y, d: totalLen };
        const abx = b.x - a.x,
            aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        if (len2 < 1) continue;
        const t = Math.max(
            0,
            Math.min(1, ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / len2),
        );
        const px = a.x + t * abx,
            py = a.y + t * aby;
        const dx = pt.x - px,
            dy = pt.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
            bestD2 = d2;
            bestArc = a.d + t * (b.d - a.d);
        }
    }
    return bestArc;
}

/** Map an arc-length back to (x,y) on the track */
function arcToPos(d: number, segs: TrackSeg[], totalLen: number): Pt {
    d = ((d % totalLen) + totalLen) % totalLen;
    let lo = 0,
        hi = segs.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (segs[mid].d <= d) lo = mid;
        else hi = mid;
    }
    const a = segs[lo];
    const b =
        lo < segs.length - 1
            ? segs[lo + 1]
            : { x: segs[0].x, y: segs[0].y, d: totalLen };
    const segLen = b.d - a.d;
    const t = segLen > 0 ? (d - a.d) / segLen : 0;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Convert driver samples to unwrapped arc-length samples */
function toArcSamples(
    samples: Sample[],
    segs: TrackSeg[],
    totalLen: number,
): ArcSample[] {
    if (!samples.length || !segs.length) return [];
    const result: ArcSample[] = [];
    let offset = 0,
        prevRaw = -1;
    for (const s of samples) {
        const raw = projectToArc(s, segs, totalLen);
        if (prevRaw >= 0) {
            const diff = raw - prevRaw;
            if (diff < -totalLen * 0.3) offset += totalLen;
            else if (diff > totalLen * 0.7) offset -= totalLen;
        }
        result.push({ d: raw + offset, time: s.time });
        prevRaw = raw;
    }
    return result;
}

/** Binary-search + lerp in arc-length domain */
function interpolateArc(samples: ArcSample[], time: number): number | null {
    const n = samples.length;
    if (!n) return null;
    if (time <= samples[0].time) return samples[0].d;
    if (time >= samples[n - 1].time) return samples[n - 1].d;
    let lo = 0,
        hi = n - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (samples[mid].time <= time) lo = mid;
        else hi = mid;
    }
    const a = samples[lo],
        b = samples[hi];
    const t = (time - a.time) / (b.time - a.time || 1);
    return a.d + (b.d - a.d) * t;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TrackMap({
    sessionKey,
    drivers,
    laps,
    positions,
    stints,
    intervals,
    currentLap,
    speed,
    isPlaying,
    highlightDriver,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [trackData, setTrackData] = useState<TrackMapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const rafRef = useRef(0);

    // Wall-clock anchored timing — immune to main-thread blocking
    const anchorRef = useRef({ wall: 0, race: 0 });
    const rateRef = useRef(0); // race-ms per wall-ms

    // ── Fetch once per session ───────────────────────────────────────────────

    useEffect(() => {
        if (!sessionKey) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setTrackData(null);
        api.getTrackMap(sessionKey)
            .then((d) => {
                if (!cancelled) setTrackData(d);
            })
            .catch((e) => {
                if (!cancelled) setError(e.message ?? "Failed to load");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [sessionKey]);

    // ── Memos ─────────────────────────────────────────────────────────────────

    const parsed = useMemo(() => {
        if (!trackData) return new Map<number, Sample[]>();
        const m = new Map<number, Sample[]>();
        for (const [dn, pts] of Object.entries(trackData.drivers))
            m.set(
                Number(dn),
                pts.map((p) => ({
                    x: p.x,
                    y: p.y,
                    time: new Date(p.date).getTime(),
                })),
            );
        return m;
    }, [trackData]);

    const bounds = useMemo(() => {
        const allPts: Pt[] = [];
        if (trackData?.outline.length) allPts.push(...trackData.outline);
        // Include a few driver samples so bounds work even without outline
        for (const samples of parsed.values()) {
            if (samples.length) {
                allPts.push(
                    samples[0],
                    samples[Math.floor(samples.length / 2)],
                    samples[samples.length - 1],
                );
            }
        }
        if (!allPts.length) return null;
        return computeBounds(allPts);
    }, [trackData, parsed]);

    const outlinePath = useMemo(() => {
        if (!trackData?.outline.length || !bounds) return null;
        const path = new Path2D();
        let first = true;
        for (const pt of trackData.outline) {
            const { px, py } = toCanvas(pt.x, pt.y, bounds);
            if (first) {
                path.moveTo(px, py);
                first = false;
            } else path.lineTo(px, py);
        }
        path.closePath();
        return path;
    }, [trackData, bounds]);

    // Downsampled outline for arc-length path (200 pts)
    const snapOutline = useMemo(() => {
        if (!trackData?.outline.length) return [];
        return downsample(trackData.outline, SNAP_PTS);
    }, [trackData]);

    // Arc-length parameterised track path
    const trackPath = useMemo(() => {
        if (snapOutline.length < 3) return null;
        return buildTrackPath(snapOutline);
    }, [snapOutline]);

    // Pre-project every driver's samples to arc-length (done once, O(drivers×samples×outlinePts))
    const arcSamples = useMemo(() => {
        if (!trackPath) return new Map<number, ArcSample[]>();
        const m = new Map<number, ArcSample[]>();
        for (const [dn, samples] of parsed)
            m.set(
                dn,
                toArcSamples(samples, trackPath.segs, trackPath.totalLen),
            );
        return m;
    }, [parsed, trackPath]);

    const lapRanges = useMemo(() => {
        const starts = new Map<number, number[]>();
        for (const l of laps) {
            const t = new Date(l.date_start).getTime();
            starts.set(l.lap_number, [...(starts.get(l.lap_number) ?? []), t]);
        }
        const nums = [...starts.keys()].sort((a, b) => a - b);
        const ranges = new Map<number, { start: number; end: number }>();
        for (let i = 0; i < nums.length; i++) {
            const s = Math.min(...starts.get(nums[i])!);
            const e =
                i < nums.length - 1
                    ? Math.min(...starts.get(nums[i + 1])!)
                    : s + 100_000;
            ranges.set(nums[i], { start: s, end: e });
        }
        return ranges;
    }, [laps]);

    // Average lap duration (for speed → race-time conversion)
    const avgLapDur = useMemo(() => {
        if (!lapRanges.size) return 90_000;
        let sum = 0;
        for (const r of lapRanges.values()) sum += r.end - r.start;
        return sum / lapRanges.size;
    }, [lapRanges]);

    const retiredAt = useMemo(() => {
        const map = new Map<number, number>();
        for (const [dn, samples] of parsed) {
            if (samples.length < 10) continue;
            let lastMovingIdx = 0;
            for (let i = 1; i < samples.length; i++) {
                const dx = samples[i].x - samples[i - 1].x;
                const dy = samples[i].y - samples[i - 1].y;
                if (dx * dx + dy * dy > 2500) lastMovingIdx = i;
            }
            if (samples.length - lastMovingIdx > 10) {
                const staticMs =
                    samples[samples.length - 1].time -
                    samples[lastMovingIdx].time;
                if (staticMs > 180_000)
                    map.set(dn, samples[lastMovingIdx].time + 5_000);
            }
        }
        return map;
    }, [parsed]);

    // ── Position tower data ────────────────────────────────────────────────

    interface Standing {
        driver: Driver;
        position: number;
        status: string;
        gap: string;
        interval: string;
        tyre: string;
        tyreAge: number;
        pits: number;
    }

    const standings = useMemo((): Standing[] => {
        // Positions: latest per driver at/before current lap time
        const driverPos = new Map<number, number>();
        const currentLapData = laps.filter((l) => l.lap_number === currentLap);
        if (currentLapData.length) {
            const lapTime = new Date(currentLapData[0].date_start).getTime();
            const latestPerDriver = new Map<number, Position>();
            for (const p of positions) {
                const pTime = new Date(p.date).getTime();
                if (pTime <= lapTime + 120_000) {
                    const prev = latestPerDriver.get(p.driver_number);
                    if (!prev || new Date(prev.date).getTime() < pTime)
                        latestPerDriver.set(p.driver_number, p);
                }
            }
            for (const [dn, p] of latestPerDriver)
                driverPos.set(dn, p.position);
        } else {
            for (const p of positions)
                driverPos.set(p.driver_number, p.position);
        }

        // Intervals: latest gap_to_leader and interval per driver at current lap
        const driverGap = new Map<number, number | null>();
        const driverInt = new Map<number, number | null>();
        if (currentLapData.length) {
            const lapTime = new Date(currentLapData[0].date_start).getTime();
            for (const iv of intervals) {
                const iTime = new Date(iv.date).getTime();
                if (iTime <= lapTime + 120_000) {
                    driverGap.set(iv.driver_number, iv.gap_to_leader);
                    driverInt.set(iv.driver_number, iv.interval);
                }
            }
        }

        // Tyre compound + age from stints
        const driverTyre = new Map<number, { compound: string; age: number }>();
        for (const st of stints) {
            if (currentLap >= st.lap_start && currentLap <= st.lap_end) {
                driverTyre.set(st.driver_number, {
                    compound: st.compound,
                    age: st.tyre_age_at_start + (currentLap - st.lap_start),
                });
            }
        }

        // Pit stop count
        const driverPits = new Map<number, number>();
        for (const st of stints) {
            if (st.stint_number > 1 && st.lap_start <= currentLap) {
                driverPits.set(
                    st.driver_number,
                    (driverPits.get(st.driver_number) ?? 0) + 1,
                );
            }
        }

        // Pit-out detection
        const pitOut = new Set<number>();
        for (const l of laps) {
            if (l.lap_number === currentLap && l.is_pit_out_lap)
                pitOut.add(l.driver_number);
        }

        // Build
        const result: Standing[] = [];
        for (const drv of drivers) {
            const pos = driverPos.get(drv.driver_number) ?? 99;
            const retired = retiredAt.has(drv.driver_number);
            const gap = driverGap.get(drv.driver_number);
            const intv = driverInt.get(drv.driver_number);
            const tyre = driverTyre.get(drv.driver_number);

            let status = "ON TRACK";
            if (retired) status = "OUT";
            else if (pitOut.has(drv.driver_number)) status = "PIT";

            const fmtGap = gap != null ? `+${gap.toFixed(1)}s` : "";
            const fmtInt = intv != null ? `+${intv.toFixed(1)}s` : "";

            result.push({
                driver: drv,
                position: pos,
                status,
                gap: pos === 1 ? "LEADER" : fmtGap,
                interval: pos === 1 ? "" : fmtInt,
                tyre: tyre?.compound ?? "",
                tyreAge: tyre?.age ?? 0,
                pits: driverPits.get(drv.driver_number) ?? 0,
            });
        }
        result.sort((a, b) => a.position - b.position);
        return result;
    }, [positions, laps, stints, intervals, drivers, currentLap, retiredAt]);

    // ── Sync race time when currentLap / speed / playing changes ────────────

    useEffect(() => {
        const range = lapRanges.get(currentLap);
        if (!range) return;

        const now = performance.now();
        const prev = anchorRef.current;

        // Where is raceTime right now?
        const curRace =
            prev.wall > 0 ? prev.race + (now - prev.wall) * rateRef.current : 0;

        // Update rate: 0 when paused → freezes in place
        rateRef.current = isPlaying ? (avgLapDur * speed) / 1000 : 0;

        // Jump on first load or slider scrub (gap > 2 laps), else re-anchor smoothly
        const gap = Math.abs(curRace - range.start);
        anchorRef.current = {
            wall: now,
            race: curRace === 0 || gap > avgLapDur * 2 ? range.start : curRace,
        };
    }, [currentLap, speed, isPlaying, lapRanges, avgLapDur]);

    // ── Persistent rAF loop ──────────────────────────────────────────────────

    useEffect(() => {
        if (!bounds || !parsed.size) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;

        const tp = trackPath; // captured for closure
        const arcS = arcSamples;
        let running = true;

        // Re-anchor wall clock to now so elapsed starts at 0
        // (prevents time skip if data loaded after sync effect)
        anchorRef.current = { ...anchorRef.current, wall: performance.now() };

        function tick(now: number) {
            if (!running) return;

            // Compute race time directly from wall clock — no accumulation drift
            const { wall, race } = anchorRef.current;
            const raceTime =
                wall > 0 ? race + (now - wall) * rateRef.current : 0;

            ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx!.clearRect(0, 0, W, H);

            // Track outline (if available)
            if (outlinePath) {
                ctx!.strokeStyle = "#374151";
                ctx!.lineWidth = 6;
                ctx!.lineCap = "round";
                ctx!.lineJoin = "round";
                ctx!.stroke(outlinePath);
                ctx!.strokeStyle = "#4b5563";
                ctx!.lineWidth = 2;
                ctx!.stroke(outlinePath);
            }

            // Drivers
            for (const drv of drivers) {
                const samples = parsed.get(drv.driver_number);
                if (!samples?.length) continue;

                const retire = retiredAt.get(drv.driver_number);
                if (retire && raceTime > retire) continue;

                // Arc-length interpolation (follows track curves) with fallback
                let pos: Pt | null = null;
                const arc = arcS.get(drv.driver_number);
                if (arc?.length && tp) {
                    const d = interpolateArc(arc, raceTime);
                    if (d !== null) pos = arcToPos(d, tp.segs, tp.totalLen);
                }
                if (!pos) {
                    pos = interpolate(samples, raceTime);
                    if (!pos) continue;
                }

                const { px, py } = toCanvas(pos.x, pos.y, bounds!);
                const col = `#${drv.team_colour || "fff"}`;
                const hl = highlightDriver === drv.driver_number;
                const dim = highlightDriver != null && !hl;
                const r = hl ? 7 : 5;

                ctx!.globalAlpha = dim ? 0.15 : 1;
                ctx!.beginPath();
                ctx!.arc(px, py, r, 0, Math.PI * 2);
                ctx!.fillStyle = col;
                ctx!.fill();

                if (hl) {
                    ctx!.strokeStyle = "#fff";
                    ctx!.lineWidth = 2;
                    ctx!.stroke();
                }
                if (!dim) {
                    ctx!.font = "bold 9px monospace";
                    ctx!.fillStyle = col;
                    ctx!.textAlign = "center";
                    ctx!.fillText(drv.name_acronym, px, py - r - 3);
                }
                ctx!.globalAlpha = 1;
            }

            rafRef.current = requestAnimationFrame(tick);
        }

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            running = false;
            cancelAnimationFrame(rafRef.current);
        };
    }, [
        bounds,
        outlinePath,
        drivers,
        parsed,
        highlightDriver,
        retiredAt,
        trackPath,
        arcSamples,
    ]);

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="bg-f1-card rounded-xl border border-f1-border p-4">
            <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
                Track Map
            </h3>
            {loading ? (
                <div
                    className="flex items-center justify-center text-f1-muted"
                    style={{ height: H }}
                >
                    <div className="text-center">
                        <div className="inline-block w-6 h-6 border-2 border-f1-border border-t-f1-red rounded-full animate-spin mb-2" />
                        <p className="text-sm">Loading track data...</p>
                    </div>
                </div>
            ) : error ? (
                <div
                    className="flex items-center justify-center text-f1-muted"
                    style={{ height: H }}
                >
                    <p className="text-sm text-f1-red">{error}</p>
                </div>
            ) : !trackData ? (
                <div
                    className="flex items-center justify-center text-f1-muted"
                    style={{ height: H }}
                >
                    <p className="text-sm">No track data available</p>
                </div>
            ) : (
                <div className="flex gap-3">
                    {/* Position Tower */}
                    <div
                        className="shrink-0 rounded-lg overflow-hidden text-xs bg-f1-card/60"
                        style={{ width: 200, height: H, overflowY: "auto" }}
                    >
                        <div className="bg-black/70 px-2 py-1.5 font-bold text-[10px] text-white/70 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                            <span>Lap {currentLap}</span>
                            <span className="text-white/40 normal-case">
                                Gap / Int
                            </span>
                        </div>
                        {standings.map((s) => {
                            const col = `#${s.driver.team_colour || "fff"}`;
                            const isHl =
                                highlightDriver === s.driver.driver_number;
                            const isDim = highlightDriver != null && !isHl;
                            const tyreColor: Record<string, string> = {
                                SOFT: "#ef4444",
                                MEDIUM: "#eab308",
                                HARD: "#f5f5f5",
                                INTERMEDIATE: "#22c55e",
                                WET: "#3b82f6",
                            };
                            return (
                                <div
                                    key={s.driver.driver_number}
                                    className="flex items-center gap-1 px-1.5 py-[3px] border-b border-white/5"
                                    style={{
                                        background: isHl
                                            ? "rgba(255,255,255,0.1)"
                                            : "transparent",
                                        opacity: isDim ? 0.3 : 1,
                                    }}
                                >
                                    {/* Position */}
                                    <span className="w-4 text-right font-mono text-white/50 text-[10px] shrink-0">
                                        {s.position}
                                    </span>
                                    {/* Team color */}
                                    <span
                                        className="w-[3px] h-3.5 rounded-sm shrink-0"
                                        style={{ background: col }}
                                    />
                                    {/* Name */}
                                    <span className="font-bold text-white text-[11px] tracking-wide w-8 shrink-0">
                                        {s.driver.name_acronym}
                                    </span>
                                    {/* Status badge */}
                                    {s.status !== "ON TRACK" && (
                                        <span
                                            className="text-[8px] font-bold px-1 rounded shrink-0"
                                            style={{
                                                background:
                                                    s.status === "PIT"
                                                        ? "#eab308"
                                                        : "#ef4444",
                                                color:
                                                    s.status === "PIT"
                                                        ? "#000"
                                                        : "#fff",
                                            }}
                                        >
                                            {s.status}
                                        </span>
                                    )}
                                    {/* Tyre */}
                                    {s.tyre && (
                                        <span
                                            className="text-[9px] font-bold shrink-0 w-3 text-center"
                                            style={{
                                                color:
                                                    tyreColor[s.tyre] ??
                                                    "#9ca3af",
                                            }}
                                            title={`${s.tyre} (${s.tyreAge} laps)`}
                                        >
                                            {s.tyre[0]}
                                        </span>
                                    )}
                                    {/* Pit count */}
                                    {s.pits > 0 && (
                                        <span className="text-[8px] text-white/30 shrink-0">
                                            {s.pits}×
                                        </span>
                                    )}
                                    {/* Gap / Interval */}
                                    <span
                                        className="ml-auto text-right text-[9px] font-mono shrink-0"
                                        style={{
                                            color:
                                                s.gap === "LEADER"
                                                    ? "#f5f5f5"
                                                    : "#9ca3af",
                                            minWidth: 42,
                                        }}
                                    >
                                        {s.gap === "LEADER" ? (
                                            <span className="text-[8px] font-bold text-emerald-400">
                                                LEADER
                                            </span>
                                        ) : (
                                            <span title={`Int: ${s.interval}`}>
                                                {s.gap}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {/* Track canvas */}
                    <div className="flex-1 flex justify-center">
                        <canvas
                            ref={canvasRef}
                            style={{ width: W, height: H }}
                            className="rounded-lg"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
