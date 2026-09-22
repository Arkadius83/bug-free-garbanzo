import { useEffect, useRef, useState } from "react";

export function BottomPlayer({ source, playing, onTogglePlay }: { source?: string; playing: boolean; onTogglePlay: () => void }) {
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const time = (v: number) => Number.isFinite(v) ? `${Math.floor(v / 60)}:${Math.floor(v % 60).toString().padStart(2, "0")}` : "0:00";

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !source) return;
    if (playing) {
      console.log("[BottomPlayer] play()", {
        source,
        currentSrc: el.currentSrc,
        src: el.src,
        paused: el.paused,
        readyState: el.readyState,
        networkState: el.networkState,
        error: el.error,
        duration: el.duration,
        volume: el.volume,
        muted: el.muted,
      });
      const promise = el.play();
      if (promise) {
        promise.then(
          () => console.log("[BottomPlayer] play() resolved"),
          (err) => { console.error("[BottomPlayer] play() rejected", err); setError("Playback failed."); }
        );
      }
    } else {
      el.pause();
    }
  }, [playing, source]);

  useEffect(() => {
    setCurrent(0);
    setDuration(0);
    setError("");
  }, [source]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !source) return;
    console.log("[BottomPlayer] source changed, calling load()", { source, readyState: el.readyState });
    el.load();
  }, [source]);

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrent(audioRef.current.currentTime);
  };
  const handleLoadedMetadata = () => {
    console.log("[BottomPlayer] loadedmetadata", {
      duration: audioRef.current?.duration,
      readyState: audioRef.current?.readyState,
      networkState: audioRef.current?.networkState,
    });
    if (audioRef.current) setDuration(audioRef.current.duration);
  };
  const handleError = () => {
    const el = audioRef.current;
    console.error("[BottomPlayer] audio error", {
      currentSrc: el?.currentSrc,
      src: el?.src,
      error: el?.error,
      networkState: el?.networkState,
      readyState: el?.readyState,
    });
    setError("Preview unavailable.");
  };

  function togglePlay() {
    onTogglePlay();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setCurrent(v);
    if (audioRef.current) audioRef.current.currentTime = v;
  }

  return (
    <div className="bottom-player" role="region" aria-label="Music player">
      <audio
        ref={audioRef}
        src={source}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
      />
      <div className="bottom-player-cover" />
      <div className="bottom-player-info">
        <span className="bottom-player-title">No track loaded</span>
        <span className="bottom-player-artist">—</span>
      </div>
      <div className="bottom-player-controls">
        <button aria-label="Previous track" disabled>⏮</button>
        <button
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => void togglePlay()}
          className="bottom-player-play"
          disabled={!source}
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
          onChange={handleSeek}
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
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume"
          className="bottom-player-vol-slider"
        />
      </div>
      {error && <span className="bottom-player-error">{error}</span>}
    </div>
  );
}
