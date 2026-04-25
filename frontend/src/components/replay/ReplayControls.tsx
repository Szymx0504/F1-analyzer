import { Play, Pause, RotateCcw } from 'lucide-react';

interface Props {
  currentLap: number;
  maxLap: number;
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onLapChange: (lap: number) => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

const SPEEDS = [0.5, 1, 2, 5, 10];

export default function ReplayControls({
  currentLap, maxLap, isPlaying, speed,
  onPlayPause, onLapChange, onSpeedChange, onReset,
}: Props) {
  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4 flex flex-wrap items-center gap-4">
      {/* Play / Pause */}
      <button
        onClick={onPlayPause}
        className="bg-f1-red hover:bg-f1-red/80 text-white rounded-lg p-2 transition-colors"
      >
        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
      </button>

      {/* Reset */}
      <button
        onClick={onReset}
        className="bg-f1-border hover:bg-f1-muted/30 text-f1-text rounded-lg p-2 transition-colors"
      >
        <RotateCcw size={20} />
      </button>

      {/* Lap slider */}
      <div className="flex items-center gap-3 flex-1 min-w-[200px]">
        <span className="text-sm text-f1-muted whitespace-nowrap tabular-nums transition-all duration-300">Lap {currentLap}/{maxLap}</span>
        <input
          type="range"
          min={1}
          max={maxLap || 1}
          value={currentLap}
          onChange={e => onLapChange(Number(e.target.value))}
          className="flex-1 accent-f1-red"
        />
      </div>

      {/* Speed selector */}
      <div className="flex items-center gap-1">
        <span className="text-sm text-f1-muted mr-1">Speed:</span>
        {SPEEDS.map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              speed === s
                ? 'bg-f1-red text-white'
                : 'bg-f1-border/50 text-f1-muted hover:text-f1-text'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
