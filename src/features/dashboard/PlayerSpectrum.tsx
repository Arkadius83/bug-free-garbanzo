import { useEffect, useRef } from "react";
import AudioMotionAnalyzer from "audiomotion-analyzer";

interface PlayerSpectrumProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onAnalyzerReady?: (ctx: AudioContext) => void;
}

export function PlayerSpectrum({ audioRef, onAnalyzerReady }: PlayerSpectrumProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const onReadyRef = useRef(onAnalyzerReady);
  onReadyRef.current = onAnalyzerReady;

  useEffect(() => {
    const container = containerRef.current;
    const audio = audioRef.current;
    if (!container || !audio) return;

    let analyzer: AudioMotionAnalyzer | null = null;

    try {
      analyzer = new AudioMotionAnalyzer(container, {
        source: audio,
        connectSpeakers: true,
        mode: 0,
        showScaleX: false,
        showScaleY: false,
        smoothing: 0.75,
        maxFPS: 30,
        fftSize: 2048,
        gradient: "classic",
      });

      analyzerRef.current = analyzer;
      const ctx = analyzer.audioCtx;
      const canvas = container.querySelector("canvas");
      console.log("[PlayerSpectrum] initialized", {
        ctxState: ctx.state,
        sampleRate: ctx.sampleRate,
        canvasExists: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        containerW: container.clientWidth,
        containerH: container.clientHeight,
      });
      onReadyRef.current?.(ctx);

      setTimeout(() => {
        try {
          const energy = analyzer?.getEnergy();
          const bars = analyzer?.getBars();
          const nonZeroBars = bars ? bars.filter((b) => b.value[0] > 0).length : 0;
          console.log("[PlayerSpectrum] signal diagnostic", {
            totalBars: bars?.length ?? 0,
            nonZeroBars,
            energy,
            ctxState: ctx.state,
            canvasW: canvas?.width,
            canvasH: canvas?.height,
          });
        } catch (e) { console.warn("[PlayerSpectrum] diagnostic failed", e); }
      }, 2000);
    } catch (err) {
      console.error("[PlayerSpectrum] init FAILED", err);
      analyzerRef.current = null;
      try { analyzer?.destroy(); } catch { /* safe cleanup */ }
    }

    return () => {
      try { analyzerRef.current?.destroy(); } catch { /* safe cleanup */ }
      analyzerRef.current = null;
    };
  }, [audioRef]);

  return <div className="player-spectrum" ref={containerRef} />;
}
