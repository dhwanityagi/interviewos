const API = "http://127.0.0.1:5005/api";
const analyzeBtn = document.getElementById("analyze");
const metrics = document.getElementById("metrics");
const tip = document.getElementById("tip");
const recent = document.getElementById("recent");
const canvas = document.getElementById("timeline");
const ctx = canvas.getContext("2d");

function metric(title, value, suffix = "") {
  return `<article class="metric"><small>${title}</small><strong>${value}${suffix}</strong></article>`;
}

async function jf(url, options = {}) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function drawTimeline(points) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const labels = points.map((p) => p.segment);
  const values = points.map((p) => p.score);
  const max = 100;
  ctx.strokeStyle = "#ff7af6";
  ctx.fillStyle = "#2de3e9";
  ctx.lineWidth = 2;
  values.forEach((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * (canvas.width - 60) + 30;
    const y = canvas.height - (v / max) * (canvas.height - 50) - 20;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  values.forEach((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * (canvas.width - 60) + 30;
    const y = canvas.height - (v / max) * (canvas.height - 50) - 20;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bcaee2";
    ctx.font = "12px Outfit";
    ctx.fillText(labels[i], x - 24, canvas.height - 8);
    ctx.fillStyle = "#2de3e9";
  });
}

async function loadRecent() {
  const rows = await jf(`${API}/recent`);
  recent.innerHTML = rows
    .map((r) => `<article class="item"><small>${r.prompt}</small><br/><strong>Confidence ${r.confidence_score}</strong></article>`)
    .join("") || "<small>No sessions yet.</small>";
}

async function analyze() {
  const payload = {
    prompt: document.getElementById("prompt").value,
    transcript: document.getElementById("transcript").value,
    duration_sec: Number(document.getElementById("duration").value),
  };

  const out = await jf(`${API}/analyze`, { method: "POST", body: JSON.stringify(payload) });
  metrics.innerHTML = [
    metric("WPM", out.wpm),
    metric("Filler", out.filler_density, "%"),
    metric("Structure", out.structure_score),
    metric("Confidence", out.confidence_score),
    metric("Word Count", out.word_count),
  ].join("");
  tip.textContent = `Tactical Tip: ${out.tactical_tip}`;
  drawTimeline(out.timeline);
  await loadRecent();
}

analyzeBtn.addEventListener("click", analyze);

(async function init() {
  await analyze();
})();
