from flask import Flask, request, jsonify
from flask_cors import CORS
import anthropic
import re
import time
import os

app = Flask(__name__)
CORS(app, origins=["*"])

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ── NLP scoring engine ──────────────────────────────────────────────────────

FILLER_WORDS = {
    "um", "uh", "like", "you know", "basically", "literally", "actually",
    "kind of", "sort of", "right", "so", "okay", "well", "i mean",
    "you see", "just", "anyway", "whatever", "honestly"
}

def count_fillers(text):
    text_lower = text.lower()
    count = 0
    for fw in FILLER_WORDS:
        pattern = r'\b' + re.escape(fw) + r'\b'
        count += len(re.findall(pattern, text_lower))
    return count

def compute_words_per_minute(text, duration_seconds):
    if duration_seconds <= 0:
        return 0
    words = len(text.split())
    return round((words / duration_seconds) * 60)

def score_star_structure(text):
    text_lower = text.lower()
    signals = {
        "situation": ["when", "at my", "while working", "in my", "during", "previously", "last year", "we were"],
        "task": ["responsible for", "my role", "i had to", "i needed to", "the goal was", "tasked with"],
        "action": ["i did", "i built", "i created", "i implemented", "i developed", "i designed", "i led", "i wrote", "i fixed"],
        "result": ["resulted in", "achieved", "improved", "reduced", "increased", "saved", "delivered", "%", "users", "impact"]
    }
    found = {}
    score = 0
    for component, keywords in signals.items():
        hits = sum(1 for kw in keywords if kw in text_lower)
        found[component] = hits > 0
        if hits > 0:
            score += 25
    return score, found

def lexical_richness(text):
    words = re.findall(r'\b[a-zA-Z]{4,}\b', text.lower())
    if not words:
        return 0
    unique = len(set(words))
    return round((unique / len(words)) * 100)

def topic_coherence(text):
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]
    if len(sentences) <= 1:
        return 80
    # Simple coherence: sentences that share at least one content word
    content_words_per_sentence = []
    for s in sentences:
        words = set(re.findall(r'\b[a-zA-Z]{4,}\b', s.lower()))
        content_words_per_sentence.append(words)
    coherent = 0
    total = len(sentences) - 1
    for i in range(total):
        overlap = content_words_per_sentence[i] & content_words_per_sentence[i + 1]
        if len(overlap) > 0:
            coherent += 1
    return round((coherent / max(total, 1)) * 100) if total > 0 else 80

def quantified_impact(text):
    patterns = [
        r'\d+\s*%', r'\$\s*\d+', r'₹\s*\d+', r'\d+\s*(users|clients|people|members)',
        r'\d+\s*(hours|days|weeks|months)', r'\d+x\b', r'\d+\s*(times|fold)',
        r'(increased|reduced|improved|saved|grew)\s*by'
    ]
    hits = sum(1 for p in patterns if re.search(p, text.lower()))
    return min(hits * 20, 100)

def analyze_transcript(text, duration_seconds=60, role="Software Engineer", mode="FAANG Recruiter"):
    start_time = time.time()
    words = text.split()
    word_count = len(words)

    filler_count = count_fillers(text)
    filler_density = round((filler_count / max(word_count, 1)) * 100, 1)
    filler_score = max(0, 100 - (filler_density * 8))

    wpm = compute_words_per_minute(text, duration_seconds)
    ideal_min, ideal_max = 120, 160
    if wpm < ideal_min:
        pace_score = max(0, 70 - (ideal_min - wpm) * 0.5)
    elif wpm > ideal_max:
        pace_score = max(0, 70 - (wpm - ideal_max) * 0.5)
    else:
        pace_score = 100

    star_score, star_components = score_star_structure(text)
    lex_score = lexical_richness(text)
    coherence = topic_coherence(text)
    impact_score = quantified_impact(text)

    confidence_score = round(
        filler_score * 0.20 +
        pace_score * 0.15 +
        star_score * 0.25 +
        lex_score * 0.15 +
        coherence * 0.15 +
        impact_score * 0.10
    )

    processing_ms = round((time.time() - start_time) * 1000)

    return {
        "word_count": word_count,
        "duration_seconds": duration_seconds,
        "words_per_minute": wpm,
        "filler_count": filler_count,
        "filler_density_pct": filler_density,
        "scores": {
            "filler_score": round(filler_score),
            "pace_score": round(pace_score),
            "star_score": star_score,
            "lexical_richness": lex_score,
            "topic_coherence": coherence,
            "quantified_impact": impact_score,
            "confidence_score": confidence_score
        },
        "star_components": star_components,
        "processing_ms": processing_ms,
        "role": role,
        "mode": mode
    }

# ── AI coaching via Claude ──────────────────────────────────────────────────

def get_ai_coaching(transcript, scores, role, mode):
    prompt = f"""You are an elite interview coach helping a candidate applying for a {role} position.
Interview mode: {mode}

Candidate's response:
\"\"\"{transcript}\"\"\"

NLP Analysis scores (0-100):
- Filler word score: {scores['filler_score']} (higher = fewer fillers)
- Speaking pace score: {scores['pace_score']}
- STAR structure score: {scores['star_score']}
- Lexical richness: {scores['lexical_richness']}
- Topic coherence: {scores['topic_coherence']}
- Quantified impact: {scores['quantified_impact']}
- Overall confidence score: {scores['confidence_score']}

Provide a JSON response with these exact keys:
{{
  "overall_verdict": "one sentence verdict on this response",
  "top_strength": "the single best thing about this response",
  "critical_fix": "the single most important thing to fix",
  "stronger_rewrite": "rewrite the opening 2-3 sentences of their response to be stronger",
  "coaching_tips": ["tip 1", "tip 2", "tip 3"],
  "interview_grade": "A/B/C/D/F"
}}

Return ONLY valid JSON, no markdown, no extra text."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}]
    )

    raw = message.content[0].text.strip()
    import json
    return json.loads(raw)

# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "InterviewOS API running", "version": "2.0"})

@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    if not data or "transcript" not in data:
        return jsonify({"error": "transcript field required"}), 400

    transcript = data["transcript"].strip()
    if len(transcript) < 20:
        return jsonify({"error": "transcript too short — speak at least a few sentences"}), 400

    duration = data.get("duration_seconds", 60)
    role = data.get("role", "Software Engineer")
    mode = data.get("mode", "FAANG Recruiter")

    try:
        nlp_result = analyze_transcript(transcript, duration, role, mode)
        ai_coaching = get_ai_coaching(transcript, nlp_result["scores"], role, mode)

        return jsonify({
            "success": True,
            "nlp": nlp_result,
            "coaching": ai_coaching
        })
    except anthropic.APIError as e:
        return jsonify({"error": f"AI service error: {str(e)}"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/quick-score", methods=["POST"])
def quick_score():
    """Lightweight endpoint — NLP only, no AI call, instant response."""
    data = request.get_json()
    if not data or "transcript" not in data:
        return jsonify({"error": "transcript field required"}), 400
    result = analyze_transcript(
        data["transcript"],
        data.get("duration_seconds", 60),
        data.get("role", "Software Engineer"),
        data.get("mode", "FAANG Recruiter")
    )
    return jsonify({"success": True, "nlp": result})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
