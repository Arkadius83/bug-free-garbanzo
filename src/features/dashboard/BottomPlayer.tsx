import { useRef, useState } from "react";

export function BottomPlayer() {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioRef = useRef<HTMLAudioElement>(null);

  const time = (v: number) => Number.isFinite(v) ? `${Math.floor(v / 60)}:${Math.floor(v % 60).toString().padStart(2, "0")}` : "0:00";

  return (
    <div className="bottom-player" role="region" aria-label="Music player">
      <div className="bottom-player-cover" />
      <div className="bottom-player-info">
        <span className="bottom-player-title">No track loaded</span>
        <span className="bottom-player-artist">—</span>
      </div>
      <div className="bottom-player-controls">
        <button aria-label="Previous track" disabled>⏮</button>
        <button
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => setPlaying(!playing)}
          className="bottom-player-play"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button aria-label="Next track" disabled>⏭</button>
      </div>
      <div className="bottom-player-progress">
        <span className="bottom-player-time">{time(current)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          onChange={(e) => {
            const v = Number(e.target.value);
            setCurrent(v);
          }}
          aria-label="Playback position"
          className="bottom-player-seek"
        />
        <span className="bottom-player-time">{time(duration)}</span>
      </div>
      <div className="bottom-player-volume">
        <span className="bottom-player-vol-icon">♪</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
          }}
          aria-label="Volume"
          className="bottom-player-vol-slider"
        />
      </div>
    </div>
  );
}
