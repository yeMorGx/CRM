"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function clock(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function ChatAudioPlayer({ id, src, duration, activeId, onActivate }: {
  id: string; src: string; duration: number; activeId: string | null; onActivate: (id: string | null) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actualDuration, setActualDuration] = useState(duration);

  useEffect(() => {
    if (activeId !== id) {
      audioRef.current?.pause();
    }
  }, [activeId, id]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); onActivate(null); return; }
    onActivate(id);
    try { await audio.play(); setFailed(false); }
    catch { setFailed(true); onActivate(null); }
  }

  return <div className="workspace-chat-audio">
    <audio ref={audioRef} src={src} preload="metadata" onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setActualDuration(event.currentTarget.duration); }} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setCurrent(0); onActivate(null); }} onError={() => setFailed(true)} />
    <button type="button" onClick={() => void toggle()} aria-label={playing ? "Pausar áudio" : "Reproduzir áudio"} disabled={failed}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
    <input type="range" min={0} max={Math.max(actualDuration, 1)} step="0.1" value={current} aria-label="Progresso do áudio" onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); setCurrent(Number(event.target.value)); }} />
    <span>{failed ? "Áudio indisponível" : `${clock(current)} / ${clock(actualDuration)}`}</span>
  </div>;
}
