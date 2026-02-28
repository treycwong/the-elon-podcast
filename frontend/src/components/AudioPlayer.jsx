import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  Download,
} from "lucide-react";

/**
 * AudioPlayer — Sequences per-turn Kokoro WAV audio from the backend.
 *
 * Chaining strategy:
 *   All sequencing is driven imperatively via refs inside the `ended` handler,
 *   bypassing React's async state/effect pipeline entirely. This guarantees that
 *   the next track starts the instant the current one finishes — no gaps.
 *
 * Props:
 *   turns          — Array of { speaker, text, audio } (audio = base64 WAV)
 *   onTurnChange   — Called with the index of the currently-playing turn
 */
const AudioPlayer = ({ turns, onTurnChange }) => {
  const audioRef = useRef(null);

  // Refs for values that need to be readable inside event handlers
  // without causing stale closures
  const blobUrlsRef = useRef([]);
  const currentTurnRef = useRef(0);
  const isPlayingRef = useRef(false);
  const onTurnChangeRef = useRef(onTurnChange);
  useEffect(() => {
    onTurnChangeRef.current = onTurnChange;
  }, [onTurnChange]);

  // React state (for rendering only — not for audio logic)
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // ── Decode all base64 WAVs into Blob URLs when turns arrive ──────────────
  useEffect(() => {
    if (!turns || turns.length === 0) return;

    // Stop whatever is currently playing
    audioRef.current?.pause();
    isPlayingRef.current = false;
    setIsPlaying(false);

    const urls = turns.map((turn) => {
      if (!turn.audio) return null;
      try {
        const bytes = Uint8Array.from(atob(turn.audio), (c) => c.charCodeAt(0));
        return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      } catch {
        return null;
      }
    });

    blobUrlsRef.current = urls;
    currentTurnRef.current = 0;
    setCurrentTurn(0);
    setCurrentTime(0);
    setDuration(0);

    // Load the first track so duration is available immediately
    if (audioRef.current && urls[0]) {
      audioRef.current.src = urls[0];
      audioRef.current.load();
    }

    return () => urls.forEach((url) => url && URL.revokeObjectURL(url));
  }, [turns]);

  // ── Wire up audio element events once ────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => setDuration(audio.duration || 0);

    // The key handler: when a turn ends, immediately load + play the next one
    const onEnded = () => {
      const next = currentTurnRef.current + 1;

      if (next >= blobUrlsRef.current.length) {
        // Finished the whole podcast
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }

      // Update refs first (synchronous) so the next handler sees correct state
      currentTurnRef.current = next;
      setCurrentTurn(next);
      if (onTurnChangeRef.current) onTurnChangeRef.current(next);
      setCurrentTime(0);

      const nextUrl = blobUrlsRef.current[next];
      if (nextUrl) {
        // Directly set src and play — no React effect cycle, no gaps
        audio.src = nextUrl;
        audio.load();
        audio.play().catch((err) => {
          console.error("Auto-advance play failed:", err);
          isPlayingRef.current = false;
          setIsPlaying(false);
        });
      } else {
        // This turn has no audio — skip it automatically
        onEnded();
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("ended", onEnded);
    };
  }, []); // Only once — refs keep values current

  // ── Transport controls ────────────────────────────────────────────────────
  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlayingRef.current) {
      audio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      // If we're at the end, restart from the beginning
      const turn = currentTurnRef.current;
      const url = blobUrlsRef.current[turn];
      if (!url) return;

      // Ensure the correct src is loaded
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
      }

      audio
        .play()
        .then(() => {
          isPlayingRef.current = true;
          setIsPlaying(true);
          if (onTurnChangeRef.current) onTurnChangeRef.current(turn);
        })
        .catch(console.error);
    }
  }, []);

  const goToTurn = useCallback((index) => {
    const audio = audioRef.current;
    if (!audio) return;
    const url = blobUrlsRef.current[index];
    if (!url) return;

    audio.pause();
    audio.src = url;
    audio.load();
    currentTurnRef.current = index;
    setCurrentTurn(index);
    setCurrentTime(0);
    if (onTurnChangeRef.current) onTurnChangeRef.current(index);

    if (isPlayingRef.current) {
      audio.play().catch(console.error);
    }
  }, []);

  const skipBack = useCallback(() => {
    const prev = currentTurnRef.current - 1;
    if (prev >= 0) goToTurn(prev);
  }, [goToTurn]);

  const skipForward = useCallback(() => {
    const next = currentTurnRef.current + 1;
    if (next < blobUrlsRef.current.length) goToTurn(next);
  }, [goToTurn]);

  const handleSeek = useCallback(
    (e) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      audio.currentTime = pct * duration;
      setCurrentTime(pct * duration);
    },
    [duration],
  );

  // ── Download all turns as a single concatenated WAV file ─────────────────
  const handleDownload = useCallback(() => {
    const hasTurns = turns && turns.some((t) => t.audio);
    if (!hasTurns) return;

    // Decode every base64 WAV turn into an ArrayBuffer
    const buffers = turns
      .filter((t) => t.audio)
      .map(
        (t) => Uint8Array.from(atob(t.audio), (c) => c.charCodeAt(0)).buffer,
      );

    // Read audio format from the first WAV header
    const firstView = new DataView(buffers[0]);
    const numChannels = firstView.getUint16(22, true);
    const sampleRate = firstView.getUint32(24, true);
    const bitsPerSample = firstView.getUint16(34, true);

    // Find the PCM data offset by scanning for the 'data' chunk tag
    const findPcmOffset = (buffer) => {
      const b = new Uint8Array(buffer);
      for (let i = 0; i < b.length - 4; i++) {
        if (
          b[i] === 100 &&
          b[i + 1] === 97 &&
          b[i + 2] === 116 &&
          b[i + 3] === 97
        ) {
          return i + 8; // skip 'data' (4 bytes) + chunk size (4 bytes)
        }
      }
      return 44; // standard WAV header fallback
    };

    // Strip each WAV header — keep only raw PCM samples
    const pcmChunks = buffers.map((buf) => buf.slice(findPcmOffset(buf)));
    const totalPcmLen = pcmChunks.reduce((s, c) => s + c.byteLength, 0);

    // Build a fresh WAV file with one 44-byte header over all the PCM data
    const out = new ArrayBuffer(44 + totalPcmLen);
    const outBytes = new Uint8Array(out);
    const outView = new DataView(out);
    const enc = new TextEncoder();

    outBytes.set(enc.encode("RIFF"), 0);
    outView.setUint32(4, 36 + totalPcmLen, true);
    outBytes.set(enc.encode("WAVE"), 8);
    outBytes.set(enc.encode("fmt "), 12);
    outView.setUint32(16, 16, true); // PCM fmt chunk size
    outView.setUint16(20, 1, true); // PCM format
    outView.setUint16(22, numChannels, true);
    outView.setUint32(24, sampleRate, true);
    outView.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true);
    outView.setUint16(32, (numChannels * bitsPerSample) / 8, true);
    outView.setUint16(34, bitsPerSample, true);
    outBytes.set(enc.encode("data"), 36);
    outView.setUint32(40, totalPcmLen, true);

    let writeOffset = 44;
    for (const chunk of pcmChunks) {
      outBytes.set(new Uint8Array(chunk), writeOffset);
      writeOffset += chunk.byteLength;
    }

    // Trigger browser save dialog
    const blob = new Blob([out], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "podcast.wav";
    a.click();
    URL.revokeObjectURL(url);
  }, [turns]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const fmtTime = (t) =>
    !t || isNaN(t)
      ? "0:00"
      : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  const turnProgress =
    turns.length > 1 ? (currentTurn / (turns.length - 1)) * 100 : 0;
  const withinTurnPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentSpeaker = turns[currentTurn]?.speaker || "";
  const hasAudio = !!blobUrlsRef.current[currentTurn];

  return (
    <div className="w-full bg-slate-800/60 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
      <audio ref={audioRef} preload="auto" />

      <div className="flex items-center gap-4">
        {/* Skip back */}
        <button
          onClick={skipBack}
          disabled={currentTurn === 0}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-30 text-slate-300 transition-all"
        >
          <SkipBack size={16} />
        </button>

        {/* Play / Pause */}
        <button
          onClick={togglePlayPause}
          disabled={!hasAudio}
          className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white shadow-lg shadow-indigo-900/30 transition-all active:scale-95"
        >
          {isPlaying ? (
            <Pause size={22} />
          ) : (
            <Play size={22} className="ml-0.5" />
          )}
        </button>

        {/* Skip forward */}
        <button
          onClick={skipForward}
          disabled={currentTurn >= turns.length - 1}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600/60 disabled:opacity-30 text-slate-300 transition-all"
        >
          <SkipForward size={16} />
        </button>

        {/* Progress */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Overall episode bar */}
          <div className="w-full h-1 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-600/40 rounded-full transition-all duration-500"
              style={{ width: `${turnProgress}%` }}
            />
          </div>

          {/* Per-turn scrub bar */}
          <div
            className="w-full h-2.5 bg-slate-700 rounded-full cursor-pointer group relative overflow-hidden"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all duration-100 relative"
              style={{ width: `${withinTurnPct}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Labels */}
          <div className="flex justify-between text-xs text-slate-400 font-mono">
            <span>{fmtTime(currentTime)}</span>
            <span
              className={
                currentSpeaker === "Elon" ? "text-amber-400" : "text-indigo-400"
              }
            >
              {currentSpeaker} · Turn {currentTurn + 1}/{turns.length}
            </span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <Volume2 size={18} className="text-slate-500 flex-shrink-0" />

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={!turns || !turns.some((t) => t.audio)}
          title="Download podcast as WAV"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-violet-600/80 disabled:opacity-30 text-slate-300 hover:text-white transition-all"
        >
          <Download size={16} />
        </button>
      </div>
    </div>
  );
};

export default AudioPlayer;
