from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "interviewos.db"

app = Flask(__name__)
CORS(app)

FILLER_WORDS = {"um", "uh", "like", "basically", "actually", "you know"}
KEYWORDS = {"impact", "result", "scale", "debug", "designed", "optimized", "learned"}


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                transcript TEXT NOT NULL,
                duration_sec INTEGER NOT NULL,
                filler_density REAL NOT NULL,
                structure_score REAL NOT NULL,
                confidence_score REAL NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z']+", text.lower())


@app.before_request
def startup_once() -> None:
    init_db()


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "interviewos"})


@app.post("/api/analyze")
def analyze():
    data = request.get_json(force=True)
    prompt = (data.get("prompt") or "Introduce yourself").strip()
    transcript = (data.get("transcript") or "").strip()
    duration_sec = int(data.get("duration_sec") or 60)

    if len(transcript) < 20:
        return jsonify({"error": "Transcript too short"}), 400

    words = tokenize(transcript)
    wc = max(len(words), 1)
    filler_count = sum(1 for w in words if w in FILLER_WORDS)
    keyword_hits = sum(1 for w in words if w in KEYWORDS)

    wpm = round((wc / max(duration_sec, 1)) * 60, 1)
    filler_density = round((filler_count / wc) * 100, 2)

    has_story_flow = int("because" in words or "therefore" in words or "so" in words)
    has_outcome = int("result" in words or "impact" in words)
    has_numbers = int(bool(re.search(r"\d", transcript)))

    structure_score = round(min(100.0, 35 + keyword_hits * 3 + has_story_flow * 12 + has_outcome * 16 + has_numbers * 10), 1)

    pace_score = max(0.0, 100.0 - abs(125 - wpm) * 0.9)
    filler_penalty = filler_density * 1.8
    confidence_score = round(max(0.0, min(100.0, 0.55 * structure_score + 0.45 * pace_score - filler_penalty)), 1)

    now = datetime.utcnow().isoformat(timespec="seconds") + "Z"

    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO sessions(prompt, transcript, duration_sec, filler_density, structure_score, confidence_score, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (prompt, transcript, duration_sec, filler_density, structure_score, confidence_score, now),
        )
        conn.commit()

    tactical_tip = (
        "Add one quantified outcome and fewer filler words." if confidence_score < 70 else "Strong delivery. Add sharper project-specific impact."
    )

    timeline = [
        {"segment": "Opening", "score": round(max(40, structure_score - 8), 1)},
        {"segment": "Core Story", "score": structure_score},
        {"segment": "Closing", "score": round(min(100, structure_score + 5), 1)},
    ]

    return jsonify(
        {
            "word_count": wc,
            "wpm": wpm,
            "filler_density": filler_density,
            "structure_score": structure_score,
            "confidence_score": confidence_score,
            "tactical_tip": tactical_tip,
            "timeline": timeline,
        }
    )


@app.get("/api/recent")
def recent():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT prompt, confidence_score, created_at FROM sessions ORDER BY id DESC LIMIT 6"
        ).fetchall()

    return jsonify(
        [
            {
                "prompt": r["prompt"],
                "confidence_score": r["confidence_score"],
                "created_at": r["created_at"],
            }
            for r in rows
        ]
    )


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5005)
