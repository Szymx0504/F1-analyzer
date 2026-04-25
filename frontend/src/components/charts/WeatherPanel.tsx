import { Thermometer, Droplets, Wind, CloudRain } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Weather } from '../../types';

interface Props {
  weather: Weather | null;
  allWeather: Weather[];
  currentLap: number;
  maxLap: number;
}

export default function WeatherPanel({ weather, allWeather, currentLap, maxLap }: Props) {
  // Build temperature timeline
  const tempData = allWeather.map((w, i) => ({
    idx: i + 1,
    air: w.air_temperature,
    track: w.track_temperature,
    humidity: w.humidity,
  }));

  return (
    <div className="bg-f1-card rounded-xl border border-f1-border p-4">
      <h3 className="text-sm font-semibold mb-3 text-f1-muted uppercase tracking-wide">
        Weather Conditions
      </h3>

      {weather ? (
        <>
          {/* Current stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Thermometer size={16} className="text-orange-400" />
              <div>
                <p className="text-xs text-f1-muted">Air Temp</p>
                <p className="text-sm font-semibold">{weather.air_temperature}°C</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Thermometer size={16} className="text-red-400" />
              <div>
                <p className="text-xs text-f1-muted">Track Temp</p>
                <p className="text-sm font-semibold">{weather.track_temperature}°C</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Droplets size={16} className="text-blue-400" />
              <div>
                <p className="text-xs text-f1-muted">Humidity</p>
                <p className="text-sm font-semibold">{weather.humidity}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Wind size={16} className="text-gray-400" />
              <div>
                <p className="text-xs text-f1-muted">Wind</p>
                <p className="text-sm font-semibold">{weather.wind_speed} km/h</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CloudRain size={16} className="text-blue-300" />
              <div>
                <p className="text-xs text-f1-muted">Rainfall</p>
                <p className="text-sm font-semibold">{weather.rainfall ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Temperature chart */}
          {tempData.length > 1 && (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={tempData}>
                <XAxis dataKey="idx" hide />
                <YAxis stroke="#9ca3af" tick={{ fontSize: 10 }} width={30} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="air" stroke="#fb923c" strokeWidth={1.5} dot={false} name="Air °C" isAnimationActive={false} />
                <Line type="monotone" dataKey="track" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Track °C" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </>
      ) : (
        <p className="text-f1-muted text-sm">No weather data available</p>
      )}
    </div>
  );
}
