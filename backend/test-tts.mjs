// Quick end-to-end test — calls the running backend and checks audio is returned
import { writeFileSync } from "fs";

console.log("Testing POST http://localhost:5001/api/generate-podcast ...");

const r = await fetch("http://localhost:5001/api/generate-podcast", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ topic: "Mars colonization" }),
});

console.log("Status:", r.status);
const data = await r.json();

if (data.turns) {
  console.log("Turns received:", data.turns.length);
  data.turns.forEach((t, i) => {
    const hasAudio = !!t.audio;
    const audioSize = t.audio
      ? Math.round(atob(t.audio).length / 1024) + "KB"
      : "NONE";
    console.log(
      `  Turn ${i} (${t.speaker}): audio=${hasAudio} size=${audioSize} | "${t.text.substring(0, 60)}"`,
    );
  });

  // Save the first audio file for inspection
  if (data.turns[0]?.audio) {
    const buf = Buffer.from(data.turns[0].audio, "base64");
    writeFileSync("/tmp/podcast_turn0.wav", buf);
    console.log("\nSaved turn 0 audio to /tmp/podcast_turn0.wav");
  }
} else {
  console.log("Error:", data);
}
