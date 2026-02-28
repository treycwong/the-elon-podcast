# AI Podcast Generator

A full-stack web application that generates short, realistic AI podcast interviews between an AI Host and Elon Musk on any topic. Powered by Chutes AI (DeepSeek-V3 for scripting + Kokoro TTS for audio).

## How It Works

1. **You enter a topic** (e.g., "Mars colonization timelines").
2. **DeepSeek-V3** writes a structured podcast script as a JSON dialogue array.
3. **Kokoro TTS** generates audio for each line — Host gets a female voice (`af_sky`), Elon gets a male voice (`am_adam`).
4. **The frontend** plays the full audio and displays a scrolling chat-style transcript.

## Tech Stack

| Layer    | Technology                               |
| -------- | ---------------------------------------- |
| Frontend | React + Vite + Tailwind CSS v4           |
| Backend  | Node.js + Express                        |
| LLM      | DeepSeek-V3 via Chutes (`llm.chutes.ai`) |
| TTS      | Kokoro via Chutes (OpenAI-compatible)    |

## Getting Started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # Add your CHUTES_API_KEY
npm run dev             # Starts on http://localhost:5001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev             # Starts on http://localhost:5173
```

### 3. Use

Open `http://localhost:5173`, type a topic, and click **Generate Podcast**.
