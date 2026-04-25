# Interactive-Dashboard
Homework for lab4 data vizualization classes
https://docs.google.com/document/d/1ofDVrL2JtfMeKDEDlq6Qdw6wLFKivXSs8LwVSjqh5KQ/edit?usp=sharing

# F1 Analyzer

Interactive F1 race data dashboard — replay races lap-by-lap, analyze driver performance, and explore season stats.

Built with React + TypeScript + Vite + TailwindCSS (frontend) and FastAPI + OpenF1 API (backend).

## Prerequisites

- **Python** 3.10+
- **Node.js** 20+

## Setup & Run

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Runs on http://localhost:8000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on http://localhost:5173 (proxies API requests to backend)

## Features

- **Race Replay** — lap-by-lap replay with position, gap, lap times, tire strategy, weather & speed charts
- **Season Overview** — race calendar, driver standings, sector heatmap with cross-filtering
- **Driver Analysis** — deep-dive into individual driver performance
- **Live Data** — real-time race data via WebSocket streaming

## Data Source

[OpenF1 API](https://openf1.org) — free, open-source F1 data
