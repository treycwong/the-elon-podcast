import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Simple healthcheck route for Render
app.get("/", (req, res) => {
  res.send("🚀 The Elon Podcast API is running locally or on Render!");
});

// ─── Chutes LLM client — Qwen/Qwen3-32B for transcript generation ────────────
const chutesLLM = new OpenAI({
  baseURL: "https://llm.chutes.ai/v1",
  apiKey: process.env.CHUTES_API_KEY || "dummy_missing_key",
});

// ─── Kokoro TTS endpoint ────────────────────────────────────────────────────
// Verified working: POST { text, voice, speed } → audio/wav
const KOKORO_TTS_URL = "https://chutes-kokoro.chutes.ai/speak";

// Distinct Kokoro voices: female for Host, male for Elon
const VOICE_MAP = {
  Host: "af_bella",
  Elon: "am_liam",
};

// ─── Podcast scriptwriter system prompt ─────────────────────────────────────
const PODCAST_SYSTEM_PROMPT = [
  "You are a world-class podcast scriptwriter with deep expertise across technology, science, engineering, and entrepreneurship.",
  "Your scripts are renowned for being technically rigorous, intellectually stimulating, and compulsively listenable.",
  "",
  "Write a highly detailed, in-depth podcast interview on the user-provided TOPIC between:",
  '1. "Host" — A sharp, well-prepared interviewer who asks probing follow-up questions, references real data or events, and pushes the conversation deeper.',
  '2. "Elon" — Elon Musk. Write him with authentic precision: he thinks from first principles, uses specific numbers and engineering constraints, makes bold long-term predictions, and occasionally shows dry humour.',
  "",
  "Content requirements:",
  "- Draw on your full knowledge of the topic: cite real technologies, real timelines, real challenges, and real breakthroughs.",
  "- Elon's lines must include specific technical or factual claims — not vague platitudes. E.g., actual numbers, named programs, named companies, trade-offs, physics constraints.",
  "- The Host should challenge Elon with counterpoints, follow-up questions, and sceptical pushback.",
  "- The conversation must feel like a real, substantive interview — not a press release or puff piece.",
  "- Aim for 10-14 turns minimum. Start with the Host introducing the topic and welcoming Elon. End with the Host thanking Elon.",
  "",
  "Formatting rules (CRITICAL — do not break these):",
  '- Return a JSON object with one key "dialogue" whose value is an array of turn objects.',
  '- Each turn: { "speaker": "Host" | "Elon", "text": "the spoken line" }',
  "- Each spoken line should be 1-4 sentences — detailed enough to be substantive, short enough for natural TTS delivery.",
  "- Output ONLY the raw JSON object. No markdown fences, no commentary, no preamble.",
  "",
  'Example: {"dialogue":[{"speaker":"Host","text":"Welcome, Elon."},{"speaker":"Elon","text":"Good to be here."}]}',
].join("\n");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Find the first array of { speaker, text } objects at any nesting depth
function findDialogueArray(obj) {
  if (
    Array.isArray(obj) &&
    obj.length > 0 &&
    obj[0] &&
    typeof obj[0] === "object" &&
    ("speaker" in obj[0] || "text" in obj[0])
  ) {
    return obj;
  }
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const key of Object.keys(obj)) {
      const found = findDialogueArray(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

// Run an array of async tasks with max `concurrency` at a time
async function pMap(items, fn, concurrency = 3) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ─── Kokoro TTS per-turn audio generation (with retry) ──────────────────────
async function generateTurnAudio(turn, index) {
  const voice = VOICE_MAP[turn.speaker] || "af_bella";
  const speed = turn.speaker === "Elon" ? 0.95 : 1.0;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(
      `   [Kokoro] Turn ${index} | ${turn.speaker} | voice=${voice} | attempt ${attempt}/${MAX_RETRIES}`,
    );

    try {
      const response = await fetch(KOKORO_TTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CHUTES_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: turn.text, voice, speed }),
      });

      // Retry on transient server errors (cold start / rate limit)
      if (
        response.status === 502 ||
        response.status === 503 ||
        response.status === 429
      ) {
        console.warn(
          `   [Kokoro] Turn ${index}: HTTP ${response.status} (transient) — retrying in ${1.5 * attempt}s`,
        );
        if (attempt < MAX_RETRIES) await sleep(1500 * attempt);
        continue;
      }

      if (!response.ok) {
        const err = await response.text();
        console.error(
          `   [Kokoro] Turn ${index}: HTTP ${response.status} — ${err.substring(0, 80)}`,
        );
        return null; // Non-retryable
      }

      const ct = response.headers.get("content-type") || "";
      if (!ct.includes("audio")) {
        const body = await response.text();
        console.error(
          `   [Kokoro] Turn ${index}: unexpected content-type "${ct}" — ${body.substring(0, 80)}`,
        );
        return null;
      }

      const buf = await response.arrayBuffer();
      console.log(
        `   [Kokoro] Turn ${index} ✅ ${(buf.byteLength / 1024).toFixed(1)} KB (${ct.split("/")[1]})`,
      );
      return Buffer.from(buf).toString("base64");
    } catch (err) {
      console.error(`   [Kokoro] Turn ${index}: network error: ${err.message}`);
      if (attempt < MAX_RETRIES) await sleep(1500 * attempt);
    }
  }

  console.error(
    `   [Kokoro] Turn ${index}: all ${MAX_RETRIES} attempts failed`,
  );
  return null;
}

// ─── POST /api/generate-podcast ─────────────────────────────────────────────
//
// Steps:
//   1. DeepSeek-V3  → JSON dialogue transcript
//   2. Kokoro TTS   → base64 WAV per turn (3 concurrent, 3 retries each)
//   3. Response     → { turns: [{ speaker, text, audio }] }
//
app.post("/api/generate-podcast", async (req, res) => {
  try {
    const { topic } = req.body;

    if (!topic)
      return res.status(400).json({ error: "A podcast topic is required." });

    if (
      !process.env.CHUTES_API_KEY ||
      process.env.CHUTES_API_KEY === "your_api_key_here"
    ) {
      return res
        .status(500)
        .json({ error: "CHUTES_API_KEY is not configured in .env" });
    }

    console.log(`\n🎙️  Podcast: "${topic}"`);

    // ── STEP 1: Transcript via DeepSeek-V3 ──────────────────────────────────
    console.log("   Step 1/2: Transcript generation (Qwen/Qwen3-32B)...");
    const llmResponse = await chutesLLM.chat.completions.create(
      {
        model: "Qwen/Qwen3-32B",
        messages: [
          { role: "system", content: PODCAST_SYSTEM_PROMPT },
          { role: "user", content: `Topic: ${topic}` },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      },
      {
        // Disable Qwen3 chain-of-thought thinking mode — prevents <think> blocks
        // from breaking JSON.parse and cuts response time by 30–50%
        body: { enable_thinking: false },
      },
    );

    let rawContent = llmResponse.choices[0].message.content
      .trim()
      // Strip <think>...</think> blocks — Qwen3-32B may emit these even with
      // enable_thinking:false as a fallback safety net
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim()
      // Strip any leftover markdown code fences
      .replace(/^```json\n?/, "")
      .replace(/^```\n?/, "")
      .replace(/\n?```$/, "");

    const parsed = JSON.parse(rawContent);
    const transcript = findDialogueArray(parsed);

    if (!transcript || transcript.length === 0) {
      throw new Error("LLM did not return a valid dialogue array.");
    }
    console.log(`   ✅ Transcript: ${transcript.length} turns`);

    // ── STEP 2: Kokoro TTS (3 concurrent workers, 3 retries each) ───────────
    console.log(
      `   Step 2/2: Kokoro TTS (${transcript.length} turns, concurrency=3, retries=3)...`,
    );
    const audioResults = await pMap(transcript, generateTurnAudio, 3);

    const turns = transcript.map((turn, i) => ({
      speaker: turn.speaker,
      text: turn.text,
      audio: audioResults[i], // base64 WAV string, or null if all retries failed
    }));

    const ok = turns.filter((t) => t.audio).length;
    console.log(`   ✅ TTS done — ${ok}/${turns.length} turns have audio`);

    res.json({ turns });
  } catch (error) {
    console.error("❌ Podcast generation error:", error.message);
    res.status(500).json({
      error: "Failed to generate the podcast. Please try again.",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Podcast backend → http://localhost:${PORT}`);
  console.log(
    `   Chutes API Key : ${process.env.CHUTES_API_KEY ? "✅ Loaded" : "❌ Missing"}`,
  );
  console.log(`   Kokoro TTS URL : ${KOKORO_TTS_URL}`);
  console.log(
    `   Voice map      : Host=${VOICE_MAP.Host}  Elon=${VOICE_MAP.Elon}\n`,
  );
});
