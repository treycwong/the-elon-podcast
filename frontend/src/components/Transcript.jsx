import React, { useEffect, useRef } from "react";
import hostImg from "../assets/host.png";
import elonImg from "../assets/elon.png";

/**
 * Transcript — Renders the podcast dialogue as a modern chat UI.
 *
 * Props:
 *   transcript (Array)  — Array of { speaker: string, text: string } objects.
 *   activeTurn (number) — Index of the currently-speaking turn (-1 if idle).
 *
 * Design:
 *   - Host messages appear on the LEFT with an indigo accent & profile picture.
 *   - Elon messages appear on the RIGHT with an amber accent & profile picture.
 *   - The active (currently speaking) turn gets a glowing highlight ring.
 *   - Auto-scrolls to the active turn during playback.
 */
const Transcript = ({ transcript, activeTurn = -1 }) => {
  const activeRef = useRef(null);

  // Auto-scroll to the active turn when it changes
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeTurn]);

  if (!transcript || transcript.length === 0) return null;

  return (
    <div className="w-full mt-8">
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-6 text-center">
        Transcript
      </h3>

      <div className="flex flex-col gap-4">
        {transcript.map((turn, index) => {
          const isHost = turn.speaker === "Host";
          const isActive = index === activeTurn;

          return (
            <div
              key={index}
              ref={isActive ? activeRef : null}
              className={`flex items-start gap-3 transition-all duration-300 ${isHost ? "flex-row" : "flex-row-reverse"} ${isActive ? "scale-[1.02]" : "opacity-80 hover:opacity-100"}`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 overflow-hidden ${
                  isActive
                    ? isHost
                      ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-950"
                      : "ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950"
                    : ""
                }`}
              >
                {isHost ? (
                  <img
                    src={hostImg}
                    alt="Host"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={elonImg}
                    alt="Elon Musk"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Message bubble */}
              <div
                className={`max-w-[75%] flex flex-col gap-1 ${isHost ? "items-start" : "items-end"}`}
              >
                {/* Speaker label */}
                <span
                  className={`text-xs font-semibold tracking-wide ${
                    isHost ? "text-indigo-400" : "text-amber-400"
                  }`}
                >
                  {isHost ? "Host" : "Elon Musk"}
                </span>

                {/* Bubble */}
                <div
                  className={`px-5 py-3.5 rounded-2xl text-sm leading-relaxed backdrop-blur-md transition-all duration-300 ${
                    isHost
                      ? "bg-slate-800/70 border border-slate-700/50 text-slate-200 rounded-tl-sm"
                      : "bg-amber-950/30 border border-amber-800/30 text-amber-50 rounded-tr-sm"
                  } ${isActive ? (isHost ? "border-indigo-500/50 shadow-lg shadow-indigo-900/20" : "border-amber-500/50 shadow-lg shadow-amber-900/20") : ""}`}
                >
                  {turn.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Transcript;
