const transcript = document.getElementById('transcript');
const promptInput = document.getElementById('prompt');
const duration = document.getElementById('duration');
const metrics = document.getElementById('metrics');
const timerNode = document.getElementById('timer');
const brainOrb = document.getElementById('brainOrb');
const starBox = document.getElementById('starBox');
const semantic = document.getElementById('semantic');
const rewrite = document.getElementById('rewrite');
const followup = document.getElementById('followup');
const rankNode = document.getElementById('rank');

const timelineChart = new Chart(document.getElementById('timeline'), { type: 'line', data: { labels: [], datasets: [{ label: 'Segment Score', data: [], borderColor: '#2de3e9', tension: .35 }] } });
const waveChart = new Chart(document.getElementById('wave'), { type: 'line', data: { labels: [], datasets: [{ label: 'Voice Heat', data: [], borderColor: '#ff7af6', tension: .35 }] } });
const historyChart = new Chart(document.getElementById('historyChart'), { type: 'line', data: { labels: [], datasets: [{ label: 'Confidence Trend', data: [], borderColor: '#ffd36d', tension: .3 }] } });

const history = JSON.parse(localStorage.getItem('interviewos_v2_history') || '[]');
const starters = {
  'FAANG Recruiter': 'Tell me about a system you built end-to-end and one trade-off you made.',
  'Startup Founder': 'Describe how you shipped quickly with limited resources.',
  'HR Behavioral': 'Tell me about a conflict in a team and how you resolved it.',
  'Technical Panel': 'Explain a debugging challenge and your root-cause approach.',
};

function drawNeural() {
  const c = document.getElementById('neural');
  const g = c.getContext('2d');
  function resize() { c.width = innerWidth; c.height = innerHeight; }
  resize();
  addEventListener('resize', resize);
  const nodes = Array.from({ length: 55 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 }));
  (function draw() {
    g.clearRect(0, 0, c.width, c.height);
    nodes.forEach((n) => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > c.width) n.vx *= -1; if (n.y < 0 || n.y > c.height) n.vy *= -1; });
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        if (d < 120) {
          g.strokeStyle = `rgba(140,170,255,${(120 - d) / 280})`;
          g.beginPath(); g.moveTo(nodes[i].x, nodes[i].y); g.lineTo(nodes[j].x, nodes[j].y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.beginPath(); g.arc(nodes[i].x, nodes[i].y, 1.4, 0, Math.PI * 2); g.fill();
    }
    requestAnimationFrame(draw);
  })();
}

function analyzeText(text, sec) {
  const words = (text.toLowerCase().match(/[a-zA-Z']+/g) || []);
  const wc = Math.max(1, words.length);
  const fillerSet = ['um', 'uh', 'like', 'basically', 'actually', 'you', 'know'];
  const filler = words.filter((w) => fillerSet.includes(w)).length;
  const wpm = (wc / Math.max(1, sec)) * 60;
  const star = {
    s: /(situation|when|context)/i.test(text),
    t: /(task|responsibility|needed)/i.test(text),
    a: /(built|implemented|designed|optimized|debugged)/i.test(text),
    r: /(result|impact|reduced|improved|%|x)/i.test(text),
  };
  const starScore = Object.values(star).filter(Boolean).length * 25;
  const impactVerbs = (text.match(/(built|optimized|reduced|improved|scaled|shipped|designed)/gi) || []).length;
  const nums = (text.match(/\d+/g) || []).length;
  const leadership = (text.match(/(led|owned|drove|collaborated|mentored)/gi) || []).length;
  const structure = Math.max(35, Math.min(100, 45 + impactVerbs * 4 + nums * 4 + leadership * 3 + starScore * .2 - filler * 1.2));
  const confidence = Math.max(25, Math.min(100, structure - Math.abs(125 - wpm) * .25 - filler * .7));
  return { wc, filler, wpm: Number(wpm.toFixed(1)), structure: Number(structure.toFixed(1)), confidence: Number(confidence.toFixed(1)), star, impactVerbs, nums, leadership };
}

function render(out) {
  metrics.innerHTML = `
    <article class="metric"><small>WPM</small><strong>${out.wpm}</strong></article>
    <article class="metric"><small>Filler</small><strong>${out.filler}</strong></article>
    <article class="metric"><small>Structure</small><strong>${out.structure}</strong></article>
    <article class="metric"><small>Confidence</small><strong>${out.confidence}</strong></article>
  `;

  brainOrb.style.boxShadow = `0 0 ${20 + out.confidence / 2}px rgba(${out.confidence > 80 ? '45,227,233' : out.confidence < 50 ? '255,110,125' : '255,211,109'},.65)`;
  brainOrb.style.transform = `scale(${0.9 + out.confidence / 220})`;

  timelineChart.data.labels = ['Opening', 'Core', 'Closing'];
  timelineChart.data.datasets[0].data = [Math.max(35, out.structure - 8), out.structure, Math.min(100, out.structure + 5)];
  timelineChart.update();

  waveChart.data.labels = Array.from({ length: 12 }, (_, i) => i + 1);
  waveChart.data.datasets[0].data = Array.from({ length: 12 }, () => Math.max(10, Math.min(100, out.wpm + (Math.random() - .5) * 40)));
  waveChart.update();

  const miss = Object.entries(out.star).filter(([, v]) => !v).map(([k]) => k.toUpperCase());
  starBox.textContent = `STAR Detection -> ${miss.length ? `Missing: ${miss.join(', ')}` : 'Excellent STAR completeness.'}`;
  semantic.textContent = `Semantic Strength -> Impact verbs: ${out.impactVerbs}, Quantification: ${out.nums}, Leadership signals: ${out.leadership}.`;
  rewrite.textContent = `AI Rewrite Suggestion -> ${generateRewrite()}`;
  followup.textContent = `AI Follow-up -> ${generateFollowup(promptInput.value, transcript.value)}`;

  history.push({ t: new Date().toLocaleTimeString(), c: out.confidence });
  localStorage.setItem('interviewos_v2_history', JSON.stringify(history.slice(-20)));
  historyChart.data.labels = history.map((h) => h.t);
  historyChart.data.datasets[0].data = history.map((h) => h.c);
  historyChart.update();

  const rank = out.confidence > 88 ? 'Elite Signal' : out.confidence > 75 ? 'Gold Presenter' : out.confidence > 60 ? 'Silver Communicator' : 'Bronze Speaker';
  rankNode.textContent = `Performance Rank: ${rank}`;
}

function generateRewrite() {
  return 'I led the architecture redesign, reduced API latency by 30%, and improved issue resolution visibility across teams.';
}
function generateFollowup(prompt, text) {
  if (/platform|system|app/i.test(text)) return 'What trade-offs did you consider while choosing your architecture?';
  if (/team|collaborat/i.test(text)) return 'How did you align stakeholders when priorities conflicted?';
  return `How would you improve your answer to: "${prompt}" with one measurable impact?`;
}

document.getElementById('analyze').addEventListener('click', () => {
  const out = analyzeText(transcript.value, Number(duration.value));
  render(out);
});

document.getElementById('persona').addEventListener('change', (e) => {
  promptInput.value = starters[e.target.value] || promptInput.value;
});

let rec;
document.getElementById('micBtn').addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  if (!rec) {
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (ev) => {
      let text = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript + ' ';
      transcript.value += text;
    };
  }
  rec.start();
  document.getElementById('micBtn').textContent = 'Listening...';
});

document.getElementById('pressureBtn').addEventListener('click', () => {
  let t = 45;
  const id = setInterval(() => {
    timerNode.textContent = `Pressure Timer: ${t}s`;
    t -= 1;
    if (t < 0) { clearInterval(id); timerNode.textContent = 'Time up. Deliver concise closing.'; }
  }, 1000);
});

[...document.querySelectorAll('[data-mode]')].forEach((b) => b.addEventListener('click', () => {
  document.body.classList.remove('focus', 'cinematic', 'stress');
  if (b.dataset.mode !== 'cinematic') document.body.classList.add(b.dataset.mode);
}));

(function tilt(){
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `rotateY(${x * 6}deg) rotateX(${y * -6}deg)`;
    });
    card.addEventListener('mouseleave', () => card.style.transform = 'rotateY(0) rotateX(0)');
  });
})();

drawNeural();
transcript.value = 'I built a full-stack civic intelligence platform, optimized report clustering logic, and improved priority resolution visibility by introducing confidence scoring and map analytics.';
render(analyzeText(transcript.value, Number(duration.value)));
