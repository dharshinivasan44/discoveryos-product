import os
import re
import csv
import json
from datetime import datetime, timedelta
from typing import Optional, List
from io import StringIO
from dotenv import load_dotenv 

from fastapi import FastAPI, UploadFile, File, Query, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import sqlalchemy as sa
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Float, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import google.generativeai as genai
import pandas as pd
load_dotenv()
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = "sqlite:///./feedback.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

class FeedbackItem(Base):
    __tablename__ = "feedback_items"
    id = Column(Integer, primary_key=True)
    raw_text = Column(String, unique=True)
    source = Column(String)
    segment = Column(String)
    customer_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

class Run(Base):
    __tablename__ = "runs"
    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    strategy = Column(String)

class PainPoint(Base):
    __tablename__ = "pain_points"
    id = Column(Integer, primary_key=True)
    feedback_id = Column(Integer, ForeignKey("feedback_items.id"))
    run_id = Column(Integer, ForeignKey("runs.id"))
    pain_point = Column(String)
    severity_signal = Column(String)

class Theme(Base):
    __tablename__ = "themes"
    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("runs.id"))
    theme = Column(String)
    frequency = Column(Integer)
    segments_affected = Column(JSON)
    segment_breakdown = Column(JSON)
    source_counts = Column(JSON)
    unique_customers = Column(Integer)
    sentiment = Column(String)
    goal_tag = Column(String)
    problem_statement = Column(String)
    hypothesis = Column(String)
    bet_size = Column(String)
    sample_quotes = Column(JSON)
    customer_impact = Column(Float)
    severity = Column(Float)
    business_impact = Column(Float)
    strategic_alignment = Column(Float)
    segment_value = Column(Float)
    priority_score = Column(Float)
    score_breakdown = Column(JSON)
    confidence_pct = Column(Float)
    velocity = Column(String)
    trend_flag = Column(String)
    reasons = Column(JSON)

Base.metadata.create_all(bind=engine)

def deduplicate_text(text):
    session = SessionLocal()
    existing = session.query(FeedbackItem).filter(FeedbackItem.raw_text == text).first()
    session.close()
    return existing is not None

def extract_pre_flags(text):
    keywords = ['churn', 'cancel', 'refund', 'urgent', 'switching to competitor']
    text_lower = text.lower()
    return [kw for kw in keywords if kw in text_lower]

def parse_json_response(response_text):
    text = response_text.strip()
    
    # Step 1: Extract JSON from markdown code fences if present
    match = re.search(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
    if match:
        text = match.group(1).strip()
    
    # Step 2: Try to extract JSON array or object from text with reasoning
    # Look for [ first (arrays are more common for Gemini responses)
    start_bracket = text.find("[")
    end_bracket = text.rfind("]")
    
    if start_bracket != -1 and end_bracket != -1 and end_bracket > start_bracket:
        text = text[start_bracket:end_bracket + 1]
    else:
        # Try to find JSON object if no array
        start_brace = text.find("{")
        end_brace = text.rfind("}")
        if start_brace != -1 and end_brace != -1 and end_brace > start_brace:
            text = text[start_brace:end_brace + 1]
    
    # Step 3: Clean up common markdown artifacts
    text = text.replace("\\n", "\n")
    
    # Step 4: Parse JSON
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print("========== JSON PARSE FAILED ==========")
        print(f"Raw response:\n{response_text}")
        print(f"Extracted JSON:\n{text}")
        print(f"Exception: {e}")
        print("======================================")
        raise e





@app.post("/ingest")
async def ingest(
    json_data: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    session = SessionLocal()
    inserted = 0
    
    items_to_insert = []
    
    if json_data:
        parsed = json.loads(json_data)
        if "items" in parsed:
            items_to_insert = parsed["items"]
    
    if file:
        content = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith(('.csv', '.xlsx', '.xls')):
            if filename.endswith('.csv'):
                df = pd.read_csv(StringIO(content.decode('utf-8')))
            else:
                df = pd.read_excel(content)
            items_to_insert.extend(df.to_dict('records'))
        
        elif filename.endswith(('.md', '.txt')):
            raw_text = content.decode('utf-8')
            items_to_insert.append({
                "raw_text": raw_text,
                "source": filename,
                "segment": "general",
                "customer_id": "unknown"
            })
        
        elif filename.endswith(('.vtt', '.srt')):
            raw_text = content.decode('utf-8')
            raw_text = re.sub(r'^\d+$', '', raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r'\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}', '', raw_text)
            raw_text = re.sub(r'\n\s*\n', '\n', raw_text).strip()
            items_to_insert.append({
                "raw_text": raw_text,
                "source": filename,
                "segment": "general",
                "customer_id": "unknown"
            })
        
        else:
            try:
                items_to_insert.extend(json.loads(content.decode('utf-8')))
            except:
                pass

    
    for item in items_to_insert:
        if not deduplicate_text(item.get("raw_text", "")):
            feedback = FeedbackItem(
                raw_text=item.get("raw_text", ""),
                source=item.get("source", ""),
                segment=item.get("segment", ""),
                customer_id=item.get("customer_id", "")
            )
            session.add(feedback)
            inserted += 1
    
    session.commit()
    session.close()
    return {"inserted": inserted}

@app.post("/process")
async def process(strategy: str):
    session = SessionLocal()
    
    run = Run(strategy=strategy)
    session.add(run)
    session.commit()
    run_id = run.id
    
    feedback_items = session.query(FeedbackItem).all()
    
    items_with_flags = []
    for item in feedback_items:
        pre_flags = extract_pre_flags(item.raw_text)
        items_with_flags.append({
            "id": item.id,
            "raw_text": item.raw_text,
            "pre_flags": pre_flags
        })
    
    prompt_call1 = f"""You are analyzing customer feedback to extract pain points. For each item, reason step by step:
1. What is the user trying to accomplish (their goal)?
2. What blocked them from achieving it?
3. How severe is this issue?

Examples:
- Input: "I can't find anything in search, it's useless" -> pain_point: "Search returns irrelevant results", severity_signal: "urgent"
- Input: "Would be nice if it had dark mode" -> pain_point: "Missing dark mode", severity_signal: "minor"

Feedback items with pre-flagged keywords:
{json.dumps(items_with_flags, indent=2)}

For each item, output JSON array with pain_point (string) and severity_signal (urgent/high/medium/minor).

STRICT OUTPUT INSTRUCTIONS:
- Return ONLY a valid JSON array.
- Do NOT explain your reasoning.
- Do NOT include chain-of-thought.
- Do NOT include markdown.
- Do NOT wrap the output in ```json.
- Do NOT include any text before or after the JSON.
"""
    
    model = genai.GenerativeModel("gemini-3.5-flash")
    response = model.generate_content(prompt_call1)
    
    print("========== GEMINI RESPONSE (Call 1) ==========")
    print(response.text)
    print("==============================================")
    
    try:
        pain_points_data = parse_json_response(response.text)
    except Exception as e:
        print(f"JSON parse error: {e}")
        pain_points_data = []
    
    print("Parsed JSON (Call 1):")
    print(pain_points_data)
    
    pain_points_list = []
    for i, item in enumerate(feedback_items):
        if i < len(pain_points_data):
            pp_data = pain_points_data[i]
            pp = PainPoint(
                feedback_id=item.id,
                run_id=run_id,
                pain_point=pp_data.get("pain_point", ""),
                severity_signal=pp_data.get("severity_signal", "medium")
            )
            session.add(pp)
            pain_points_list.append(pp_data)
    
    session.commit()
    
    prompt_call2 = f"""You are clustering customer pain points into themes. Think step by step about why points belong together, then cluster.

Pain points:
{json.dumps(pain_points_list, indent=2)}

For each theme, output JSON array with:
- theme (string): descriptive name
- frequency (int): count of items
- segments_affected (array): affected customer segments
- segment_breakdown (object): segment -> count
- source_counts (object): source -> count
- unique_customers (int): count of unique customers
- sentiment (string): positive/neutral/negative
- goal_tag (string): "Retention risk"/"Adoption blocker"/"Nice-to-have polish"
- problem_statement (string): concise problem
- hypothesis (string): why this matters
- bet_size (string): S/M/L
- sample_quotes (array): 2-3 direct quotes

STRICT OUTPUT INSTRUCTIONS:
- Return ONLY a valid JSON array.
- Do NOT explain your reasoning.
- Do NOT include chain-of-thought.
- Do NOT include markdown.
- Do NOT wrap the output in ```json.
- Do NOT include any text before or after the JSON.
"""
    
    response = model.generate_content(prompt_call2)
    
    print("========== GEMINI RESPONSE (Call 2) ==========")
    print(response.text)
    print("==============================================")
    
    try:
        themes_data = parse_json_response(response.text)
    except Exception as e:
        print(f"JSON parse error: {e}")
        themes_data = []
    
    print("Parsed JSON (Call 2):")
    print(themes_data)
    
    STRATEGY_WEIGHTS = {
        "Increase Revenue": {"Retention risk": 60, "Adoption blocker": 40, "Nice-to-have polish": 10},
        "Improve Retention": {"Retention risk": 100, "Adoption blocker": 30, "Nice-to-have polish": 5},
        "User Growth": {"Adoption blocker": 100, "Retention risk": 40, "Nice-to-have polish": 10},
        "Reduce Churn": {"Retention risk": 100, "Adoption blocker": 20, "Nice-to-have polish": 5},
        "Enterprise Expansion": {"Retention risk": 50, "Adoption blocker": 30, "Nice-to-have polish": 5}
    }
    
    SEGMENT_WEIGHTS = {
        "Increase Revenue": {"Enterprise": 0.5, "SMB": 0.3, "Free": 0.2},
        "Improve Retention": {"Enterprise": 0.4, "SMB": 0.4, "Free": 0.2},
        "User Growth": {"Enterprise": 0.2, "SMB": 0.3, "Free": 0.5},
        "Reduce Churn": {"Enterprise": 0.4, "SMB": 0.4, "Free": 0.2},
        "Enterprise Expansion": {"Enterprise": 0.6, "SMB": 0.3, "Free": 0.1}
    }
    
    max_frequency = max([t.get("frequency", 1) for t in themes_data] or [1])
    
    for theme_data in themes_data:
        frequency = theme_data.get("frequency", 1)
        segments_affected = theme_data.get("segments_affected", [])
        segment_breakdown = theme_data.get("segment_breakdown", {})
        source_counts = theme_data.get("source_counts", {})
        unique_customers = theme_data.get("unique_customers", 1)
        goal_tag = theme_data.get("goal_tag", "Adoption blocker")
        
        customer_impact = (frequency / max_frequency) * 100 if max_frequency > 0 else 0
        
        pre_flag_count = sum(1 for item in items_with_flags if any(flag in item['raw_text'].lower() for flag in ['churn', 'cancel', 'refund', 'urgent', 'switching']))
        if pre_flag_count > len(items_with_flags) * 0.5:
            severity = 100
        elif pre_flag_count > 0:
            severity = 60
        else:
            severity = 20
        
        top_segment = max(segment_breakdown.keys(), key=lambda k: segment_breakdown[k]) if segment_breakdown else "Unknown"
        business_impact = (segment_breakdown.get(top_segment, 0) / frequency * 100) if frequency > 0 else 0
        
        strategic_alignment = STRATEGY_WEIGHTS.get(strategy, {}).get(goal_tag, 50)
        
        segment_value = sum(
            segment_breakdown.get(seg, 0) / frequency * SEGMENT_WEIGHTS.get(strategy, {}).get(seg, 0.25)
            for seg in segment_breakdown.keys()

        ) * 100 if frequency > 0 else 0
        
        priority_score = (
            0.30 * customer_impact +
            0.25 * severity +
            0.20 * business_impact +
            0.15 * strategic_alignment +
            0.10 * segment_value
        )
        
        confidence_pct = min(
            100,
            len(source_counts) * 12 + len(segments_affected) * 8 + min(unique_customers, 10) * 5 + min(frequency, 10) * 3
        )
        
        now = datetime.utcnow()
        last_30 = now - timedelta(days=30)
        prior_30 = last_30 - timedelta(days=30)
        
        recent_count = session.query(FeedbackItem).filter(
            FeedbackItem.created_at >= last_30
        ).count()
        prior_count = session.query(FeedbackItem).filter(
            FeedbackItem.created_at >= prior_30,
            FeedbackItem.created_at < last_30
        ).count()
        
        velocity = None
        trend_flag = None
        if prior_count > 0 and recent_count / prior_count > 2.0:
            trend_flag = "Accelerating"
        
        reasons = [
            f"Affects {segment_breakdown.get(top_segment, 0)} {top_segment} customers",
            f"Mentioned in {source_counts.get('support_ticket', 0)} support tickets",
        ]
        if severity >= 80:
            reasons.append("High churn risk")
        reasons.append(f"Aligns with company goal: {goal_tag}")
        
        score_breakdown = {
            "customer_impact": {"value": customer_impact, "weight": 0.30},
            "severity": {"value": severity, "weight": 0.25},
            "business_impact": {"value": business_impact, "weight": 0.20},
            "strategic_alignment": {"value": strategic_alignment, "weight": 0.15},
            "segment_value": {"value": segment_value, "weight": 0.10},
            "total": priority_score
        }
        
        theme = Theme(
            run_id=run_id,
            theme=theme_data.get("theme", "Unknown"),
            frequency=frequency,
            segments_affected=segments_affected,
            segment_breakdown=segment_breakdown,
            source_counts=source_counts,
            unique_customers=unique_customers,
            sentiment=theme_data.get("sentiment", "neutral"),
            goal_tag=goal_tag,
            problem_statement=theme_data.get("problem_statement", ""),
            hypothesis=theme_data.get("hypothesis", ""),
            bet_size=theme_data.get("bet_size", "M"),
            sample_quotes=theme_data.get("sample_quotes", []),
            customer_impact=customer_impact,
            severity=severity,
            business_impact=business_impact,
            strategic_alignment=strategic_alignment,
            segment_value=segment_value,
            priority_score=priority_score,
            score_breakdown=score_breakdown,
            confidence_pct=confidence_pct,
            velocity=velocity,
            trend_flag=trend_flag,
            reasons=reasons
        )
        session.add(theme)
    
    session.commit()
    session.close()
    
    return {"run_id": run_id, "strategy": strategy, "themes_created": len(themes_data)}


@app.get("/report")
async def report(run_id: int):
    session = SessionLocal()
    
    themes = session.query(Theme).filter(Theme.run_id == run_id).order_by(Theme.priority_score.desc()).all()
    
    if not themes:
        session.close()
        raise HTTPException(status_code=404, detail=f"No report found for run_id {run_id}.")

    top_themes = themes[:5] if themes else []
    top_themes_text = json.dumps([{
        "theme": t.theme,
        "frequency": t.frequency,
        "priority_score": t.priority_score,
        "problem_statement": t.problem_statement
    } for t in top_themes], indent=2)
    
    model = genai.GenerativeModel("gemini-3.1-flash-lite")
    summary_response = model.generate_content(
        f"Summarize these themes in 3 sentences for a product team:\n{top_themes_text}"
    )
    summary = summary_response.text
    
    themes_data = []
    for theme in themes:
        customer_impact_stars = round(theme.customer_impact / 20)
        business_impact_stars = round(theme.business_impact / 20)
        severity_stars = round(theme.severity / 20)
        strategic_alignment_stars = round(theme.strategic_alignment / 20)
        
        themes_data.append({
            "theme": theme.theme,
            "frequency": theme.frequency,
            "priority_score": round(theme.priority_score, 2),
            "confidence_pct": round(theme.confidence_pct, 1),
            "customer_impact": customer_impact_stars,
            "business_impact": business_impact_stars,
            "severity": severity_stars,
            "strategic_alignment": strategic_alignment_stars,
            "problem_statement": theme.problem_statement,
            "hypothesis": theme.hypothesis,
            "reasons": theme.reasons,
            "sample_quotes": theme.sample_quotes
        })
    
    session.close()
    
    decision_boundary = "DiscoveryOS ranks likely problem areas with evidence. You decide the roadmap."
    
    return {
        "run_id": run_id,
        "summary": summary,
        "decision_boundary": decision_boundary,
        "themes": themes_data
    }

@app.post("/reprocess")
async def reprocess(run_id: int, strategy: str):
    session = SessionLocal()
    
    run = session.query(Run).filter(Run.id == run_id).first()
    if run:
        run.strategy = strategy
        session.commit()
    
    themes = session.query(Theme).filter(Theme.run_id == run_id).all()
    
    STRATEGY_WEIGHTS = {
        "Increase Revenue": {"Retention risk": 60, "Adoption blocker": 40, "Nice-to-have polish": 10},
        "Improve Retention": {"Retention risk": 100, "Adoption blocker": 30, "Nice-to-have polish": 5},
        "User Growth": {"Adoption blocker": 100, "Retention risk": 40, "Nice-to-have polish": 10},
        "Reduce Churn": {"Retention risk": 100, "Adoption blocker": 20, "Nice-to-have polish": 5},
        "Enterprise Expansion": {"Retention risk": 50, "Adoption blocker": 30, "Nice-to-have polish": 5}
    }
    
    SEGMENT_WEIGHTS = {
        "Increase Revenue": {"Enterprise": 0.5, "SMB": 0.3, "Free": 0.2},
        "Improve Retention": {"Enterprise": 0.4, "SMB": 0.4, "Free": 0.2},
        "User Growth": {"Enterprise": 0.2, "SMB": 0.3, "Free": 0.5},
        "Reduce Churn": {"Enterprise": 0.4, "SMB": 0.4, "Free": 0.2},
        "Enterprise Expansion": {"Enterprise": 0.6, "SMB": 0.3, "Free": 0.1}
    }
    
    for theme in themes:
        frequency = theme.frequency
        segment_breakdown = theme.segment_breakdown or {}
        segments_affected = theme.segments_affected or []
        unique_customers = theme.unique_customers
        goal_tag = theme.goal_tag
        
        max_frequency = max(max([t.frequency for t in themes] or [1]), 1)
        customer_impact = (frequency / max_frequency) * 100 if max_frequency > 0 else 0
        
        top_segment = max(segment_breakdown.keys(), key=lambda k: segment_breakdown[k]) if segment_breakdown else "Unknown"
        business_impact = (segment_breakdown.get(top_segment, 0) / frequency * 100) if frequency > 0 else 0
        
        strategic_alignment = STRATEGY_WEIGHTS.get(strategy, {}).get(goal_tag, 50)
        
        segment_value = sum(
            segment_breakdown.get(seg, 0) / frequency * SEGMENT_WEIGHTS.get(strategy, {}).get(seg, 0.25)
            for seg in segment_breakdown.keys()
        ) * 100 if frequency > 0 else 0
        
        priority_score = (
            0.30 * customer_impact +
            0.25 * theme.severity +
            0.20 * business_impact +
            0.15 * strategic_alignment +
            0.10 * segment_value
        )
        
        score_breakdown = {
            "customer_impact": {"value": customer_impact, "weight": 0.30},
            "severity": {"value": theme.severity, "weight": 0.25},
            "business_impact": {"value": business_impact, "weight": 0.20},
            "strategic_alignment": {"value": strategic_alignment, "weight": 0.15},
            "segment_value": {"value": segment_value, "weight": 0.10},
            "total": priority_score
        }
        
        theme.customer_impact = customer_impact
        theme.business_impact = business_impact
        theme.strategic_alignment = strategic_alignment
        theme.segment_value = segment_value
        theme.priority_score = priority_score
        theme.score_breakdown = score_breakdown
    
    session.commit()
    
    themes_sorted = sorted(themes, key=lambda t: t.priority_score, reverse=True)
    
    themes_data = []
    for theme in themes_sorted:
        customer_impact_stars = round(theme.customer_impact / 20)
        business_impact_stars = round(theme.business_impact / 20)
        severity_stars = round(theme.severity / 20)
        strategic_alignment_stars = round(theme.strategic_alignment / 20)
        
        themes_data.append({
            "theme": theme.theme,
            "frequency": theme.frequency,
            "priority_score": round(theme.priority_score, 2),
            "confidence_pct": round(theme.confidence_pct, 1),
            "customer_impact": customer_impact_stars,
            "business_impact": business_impact_stars,
            "severity": severity_stars,
            "strategic_alignment": strategic_alignment_stars,
            "problem_statement": theme.problem_statement,
            "hypothesis": theme.hypothesis
        })
    
    session.close()
    
    return {"run_id": run_id, "strategy": strategy, "themes": themes_data}

@app.get("/export")
async def export(run_id: int):
    session = SessionLocal()
    
    themes = session.query(Theme).filter(Theme.run_id == run_id).order_by(Theme.priority_score.desc()).all()
    
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "theme", "frequency", "priority_score", "confidence_pct", "reasons", "problem_statement", "hypothesis"
    ])
    
    for theme in themes:
        reasons_str = "; ".join(theme.reasons) if theme.reasons else ""
        writer.writerow([
            theme.theme,
            theme.frequency,
            round(theme.priority_score, 2),
            round(theme.confidence_pct, 1),
            reasons_str,
            theme.problem_statement,
            theme.hypothesis
        ])
    
    session.close()
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=themes_{run_id}.csv"}
    )

app.mount("/", StaticFiles(directory="static", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

