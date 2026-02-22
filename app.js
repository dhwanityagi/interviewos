const API = "http://127.0.0.1:5005/api";
const IS_LIVE_DEMO = !["localhost", "127.0.0.1"].includes(location.hostname);
const MOCK_KEY = "interviewos_recent";
const analyzeBtn = document.getElementById("analyze");
const metrics = document.getElementById("metrics");
const tip = document.getElementById("tip");
const recent = document.getElementById("recent");
const prompts = document.getElementById("quick-prompts");
const canvas = document.getElementById("timeline");
const ctx = canvas.getContext("2d");
const confidenceDial = document.getElementById("confidenceDial");
const confidenceValue = document.getElementById("confidenceValue");

function setupGridBackground(){const c=document.getElementById("bg-grid"),g=c.getContext("2d");function resize(){c.width=innerWidth;c.height=innerHeight}resize();window.addEventListener("resize",resize);(function draw(){g.clearRect(0,0,c.width,c.height);g.strokeStyle="rgba(255,255,255,.06)";for(let x=0;x<c.width;x+=36){g.beginPath();g.moveTo(x,0);g.lineTo(x,c.height);g.stroke()}for(let y=0;y<c.height;y+=36){g.beginPath();g.moveTo(0,y);g.lineTo(c.width,y);g.stroke()}requestAnimationFrame(draw)})()}
function applyTilt(){document.querySelectorAll("[data-tilt]").forEach((card)=>{card.addEventListener("mousemove",(e)=>{const r=card.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;card.style.transform=`rotateY(${x*8}deg) rotateX(${y*-8}deg)`});card.addEventListener("mouseleave",()=>{card.style.transform="rotateY(0) rotateX(0)"})})}
function metric(title,value,suffix=""){return `<article class="metric"><small>${title}</small><strong>${value}${suffix}</strong></article>`}
function getRecent(){try{return JSON.parse(localStorage.getItem(MOCK_KEY)||"[]")}catch{return[]}}
function setRecent(v){localStorage.setItem(MOCK_KEY,JSON.stringify(v.slice(-6)))}

function analyzeLocal({prompt,transcript,duration_sec}){const words=(transcript.toLowerCase().match(/[a-zA-Z']+/g)||[]);const wc=Math.max(words.length,1);const fillers=["um","uh","like","basically","actually","you","know"];const fillerCount=words.filter((w)=>fillers.includes(w)).length;const wpm=Number(((wc/Math.max(duration_sec,1))*60).toFixed(1));const fillerDensity=Number(((fillerCount/wc)*100).toFixed(2));const structure=Math.max(40,Math.min(100,62+(transcript.includes("result")?12:0)+(transcript.includes("because")?9:0)+(transcript.match(/\d/g)?.length?8:0)-fillerDensity*.5));const confidence=Number(Math.max(35,Math.min(100,structure-(Math.abs(125-wpm)*0.25)-fillerDensity*0.35)).toFixed(1));const out={word_count:wc,wpm,filler_density:fillerDensity,structure_score:Number(structure.toFixed(1)),confidence_score:confidence,tactical_tip:confidence<70?"Add one quantified impact and reduce filler words.":"Strong structure. Add sharper project context.",timeline:[{segment:"Opening",score:Number((structure-6).toFixed(1))},{segment:"Core Story",score:Number(structure.toFixed(1))},{segment:"Closing",score:Number((Math.min(100,structure+4)).toFixed(1))}]};const recent=getRecent();recent.unshift({prompt,confidence_score:confidence,created_at:new Date().toISOString()});setRecent(recent);return out}

async function jf(url,options={}){if(!IS_LIVE_DEMO){const res=await fetch(url,{headers:{"Content-Type":"application/json"},...options});if(!res.ok)throw new Error(await res.text());return res.json()}if(url.endsWith("/recent"))return getRecent();if(url.endsWith("/analyze"))return analyzeLocal(JSON.parse(options.body||"{}"));return {}}

function drawTimeline(points){ctx.clearRect(0,0,canvas.width,canvas.height);const labels=points.map((p)=>p.segment);const values=points.map((p)=>p.score);const max=100;const grad=ctx.createLinearGradient(0,0,canvas.width,0);grad.addColorStop(0,"#2de3e9");grad.addColorStop(1,"#ff7af6");ctx.strokeStyle=grad;ctx.fillStyle="#2de3e9";ctx.lineWidth=2.2;values.forEach((v,i)=>{const x=(i/Math.max(values.length-1,1))*(canvas.width-60)+30;const y=canvas.height-(v/max)*(canvas.height-50)-20;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();values.forEach((v,i)=>{const x=(i/Math.max(values.length-1,1))*(canvas.width-60)+30;const y=canvas.height-(v/max)*(canvas.height-50)-20;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.fillStyle="#bcaee2";ctx.font="12px Outfit";ctx.fillText(labels[i],x-28,canvas.height-8);ctx.fillStyle="#2de3e9"})}
function mountPromptButtons(){const samples=["Tell me about yourself.","Describe a failure and what you learned.","Why should we hire you?"];prompts.innerHTML=samples.map((s)=>`<button type='button'>${s}</button>`).join("");[...prompts.querySelectorAll("button")].forEach((b)=>b.addEventListener("click",()=>{document.getElementById("prompt").value=b.textContent}))}

async function loadRecent(){const rows=await jf(`${API}/recent`);recent.innerHTML=rows.map((r)=>`<article class="item"><small>${r.prompt}</small><br/><strong>Confidence ${r.confidence_score}</strong></article>`).join("")||"<small>No sessions yet.</small>"}
async function analyze(){const payload={prompt:document.getElementById("prompt").value,transcript:document.getElementById("transcript").value,duration_sec:Number(document.getElementById("duration").value)};const out=await jf(`${API}/analyze`,{method:"POST",body:JSON.stringify(payload)});metrics.innerHTML=[metric("WPM",out.wpm),metric("Filler",out.filler_density,"%"),metric("Structure",out.structure_score),metric("Confidence",out.confidence_score),metric("Word Count",out.word_count)].join("");tip.textContent=`Tactical Tip: ${out.tactical_tip}`;confidenceDial.style.setProperty("--value",out.confidence_score);confidenceValue.textContent=out.confidence_score;drawTimeline(out.timeline);await loadRecent()}

analyzeBtn.addEventListener("click",analyze);
setupGridBackground();applyTilt();mountPromptButtons();(async function init(){await analyze()})();
