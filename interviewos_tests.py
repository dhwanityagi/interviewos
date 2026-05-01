import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app import app, analyze_transcript, count_fillers, score_star_structure, lexical_richness
import pytest

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c

def test_health(client):
    r = client.get('/')
    assert r.status_code == 200
    assert b'InterviewOS' in r.data

def test_quick_score(client):
    r = client.post('/quick-score', json={
        "transcript": "I worked on a backend system that improved API response time by 40 percent using caching.",
        "duration_seconds": 10
    })
    assert r.status_code == 200
    data = r.get_json()
    assert data['success'] == True
    assert 'nlp' in data
    assert 0 <= data['nlp']['scores']['confidence_score'] <= 100

def test_missing_transcript(client):
    r = client.post('/quick-score', json={})
    assert r.status_code == 400

def test_too_short_transcript(client):
    r = client.post('/analyze', json={"transcript": "hi"})
    assert r.status_code == 400

def test_filler_counter():
    text = "Um, I basically just like worked on it, you know"
    assert count_fillers(text) >= 4

def test_star_structure():
    text = "When I was at my internship I was responsible for building the API which resulted in 30% improvement"
    score, components = score_star_structure(text)
    assert score > 50

def test_lexical_richness():
    rich = "architected scalable distributed systems leveraging microservices patterns"
    poor = "did the thing did the thing did the thing"
    assert lexical_richness(rich) > lexical_richness(poor)

def test_analyze_transcript():
    result = analyze_transcript(
        "When I joined the team I was responsible for redesigning the database schema which resulted in 50 percent faster queries",
        duration_seconds=15,
        role="Software Engineer",
        mode="FAANG Recruiter"
    )
    assert result['word_count'] > 0
    assert result['scores']['confidence_score'] >= 0
