import React, { useState } from "react";
import { Loader2, Mic, Send } from "lucide-react";
import AudioPlayer from "./components/AudioPlayer";
import Transcript from "./components/Transcript";

function App() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState(null); // [{ speaker, text, audio }]
  const [error, setError] = useState("");
  const [loadingPhase, setLoadingPhase] = useState("");
  const [activeTurn, setActiveTurn] = useState(-1);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setLoading(true);
    setError("");
    setTurns(null);
    setActiveTurn(-1);
    setLoadingPhase("Writing the script with Qwen3-32B...");

    let phaseTimer;
    try {
      // After ~5s switch the loading message to TTS phase
      phaseTimer = setTimeout(
        () => setLoadingPhase("Generating Kokoro voices..."),
        5000,
      );

      const rawUrl = import.meta.env.VITE_API_URL || "http://localhost:5001";
      const API_BASE_URL = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
      const response = await fetch(`${API_BASE_URL}/api/generate-podcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });

      clearTimeout(phaseTimer);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to generate podcast.");
      }

      const data = await response.json();
      setTurns(data.turns);
    } catch (err) {
      clearTimeout(phaseTimer);
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingPhase("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 relative overflow-x-hidden font-sans">
      {/* Ambient glows */}
      <div className="absolute top-[-15%] left-[-10%] w-[45%] h-[45%] bg-violet-600/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-amber-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="relative z-10 container mx-auto px-4 py-16 flex flex-col items-center">
        {/* Header */}
        <div className="text-center max-w-3xl mb-12">
          <div className="inline-flex items-center justify-center p-3.5 bg-violet-600/20 text-violet-400 rounded-2xl mb-6 shadow-[0_0_40px_rgba(139,92,246,0.15)]">
            <Mic size={32} />
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-5 bg-gradient-to-br from-white via-violet-100 to-amber-300 bg-clip-text text-transparent">
            The Elon Podcast
          </h1>
          <p className="text-lg md:text-xl text-slate-400 leading-relaxed">
            Enter any topic to generate a short, realistic podcast interview
            between an AI Host and Elon Musk — complete with Kokoro AI voices
            and a live transcript.
          </p>
        </div>

        {/* Input */}
        <div className="w-full max-w-3xl bg-slate-900/40 border border-slate-700/50 backdrop-blur-xl p-2 rounded-2xl shadow-2xl hover:border-slate-600/50 transition-all">
          <form
            onSubmit={handleGenerate}
            className="flex flex-col sm:flex-row gap-3 p-3"
          >
            <input
              type="text"
              className="flex-1 bg-slate-950/50 border border-slate-800 text-slate-100 px-5 py-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 placeholder-slate-500 transition-all text-base"
              placeholder="e.g. Mars colonization, neural interfaces, AI safety..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={!topic.trim() || loading}
              className="group flex items-center justify-center gap-3 bg-violet-600 hover:bg-violet-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-7 py-4 rounded-xl font-semibold transition-all shadow-lg shadow-violet-900/20 active:scale-95 whitespace-nowrap"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Generate Podcast</span>
                  <Send
                    size={18}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error */}
        {error && (
          <div className="max-w-3xl w-full mt-6 p-4 bg-red-900/30 border border-red-800/50 text-red-200 rounded-xl">
            <span className="font-semibold text-red-400">Error:</span> {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="w-full max-w-3xl mt-10 flex flex-col items-center gap-6 py-16">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-violet-900/40">
                <Mic size={32} className="text-white" />
              </div>
            </div>
            <p className="text-lg font-medium text-slate-300">{loadingPhase}</p>
            <div className="w-full space-y-4 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full animate-pulse ${i % 2 === 0 ? "bg-amber-800/40" : "bg-violet-800/40"}`}
                  />
                  <div
                    className={`flex-1 max-w-[65%] space-y-2 ${i % 2 === 0 ? "ml-auto" : ""}`}
                  >
                    <div
                      className={`h-3 rounded-full animate-pulse ${i % 2 === 0 ? "bg-amber-800/30 w-16" : "bg-violet-800/30 w-12"}`}
                    />
                    <div
                      className={`h-12 rounded-2xl animate-pulse ${i % 2 === 0 ? "bg-amber-800/20" : "bg-slate-800/50"}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result: Audio player + Transcript */}
        {turns && (
          <div className="w-full max-w-3xl mt-10 flex flex-col gap-6">
            <AudioPlayer turns={turns} onTurnChange={(i) => setActiveTurn(i)} />
            <Transcript
              transcript={turns.map((t) => ({
                speaker: t.speaker,
                text: t.text,
              }))}
              activeTurn={activeTurn}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
