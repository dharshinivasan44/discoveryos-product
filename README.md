# DiscoveryOS — AI Product Discovery Copilot

**Built for Agentic AI Hackathon** | Team: Dharshini S, Sandhiya S
**Stack:** FastAPI · SQLite · Pandas · Gemini 3.5 Flash / 3.1 Flash-Lite · Vanilla HTML/JS

---

## 🎯 The Problem

Product Managers collect feedback from **interviews, surveys, support tickets, and user calls** — but it lives in 4+ tools, in different formats, with no unified view.

**Result:** When roadmap planning starts, PMs rely on **memory and anecdotes** instead of evidence. High-impact problems get missed. Low-impact squeaky wheels get built.

> *"We did 30 customer interviews last quarter. Where are the insights?"*
> *"Sarah led those. She left in March. I think there's a Notion page?"*

---

## 💡 The Solution

DiscoveryOS is an AI pipeline that ingests scattered feedback, extracts pain points, clusters them into themes, scores them with a **transparent 5-factor formula**, and **adapts instantly when business strategy changes**.

---

## 🏗️ Planned Architecture
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   INGEST    │────▶│   EXTRACT   │────▶│  SYNTHESIZE │────▶│    SCORE    │
│  (Parse +   │     │  (Gemini    │     │  (Gemini    │     │  (Python    │
│   Dedup)    │     │  3.5 Flash) │     │  3.5 Flash) │     │   Math)     │
└─────────────┘     └─────────────┘     └─────────────┘     └──────┬──────┘
│
┌──────────────────────────────────────┘
▼
┌─────────────────┐
│ STRATEGY SELECT │◀── Click a strategy
│  (Instant Re-   │    → Re-rank in <1s
│   rank, 0 AI)   │    → No new API call
└─────────────────┘

| Stage | Model | Task |
|-------|-------|------|
| Extract | Gemini 3.5 Flash | Extract pain points + severity per feedback item |
| Synthesize | Gemini 3.5 Flash | Cluster pain points into themes |
| Summary | Gemini 3.1 Flash-Lite | Generate executive summary |
| Score | Python (no AI) | Deterministic 5-factor priority formula |

---

## 📦 Planned Inputs

| Source | Format |
|--------|--------|
| Interviews | `.txt`, `.md` |
| Surveys | `.csv`, `.json` |
| Support Tickets | `.csv`, `.json` |
| Call Transcripts | `.txt`, `.vtt`, `.srt` |

No live connections in this MVP — file upload only. Architecture is designed to support MCP-based integration with Slack, Zendesk, and Notion in a future version.

---

## 🧮 Scoring Formula

```python
priority_score = (
    0.30 * customer_impact +      # frequency normalized 0-100
    0.25 * severity +              # from rule-based churn/urgency flags
    0.20 * business_impact +       # % of mentions from top-value segment
    0.15 * strategic_alignment +   # weight per goal_tag, re-weighted by strategy
    0.10 * segment_value           # Enterprise/SMB/Free weighting
)
```

---

## 🚧 Status

Day 1 complete — problem research and architecture design.
Day 2 (build day) in progress.

- [ ] Multi-source ingestion
- [ ] AI extraction + synthesis pipeline
- [ ] Deterministic scoring
- [ ] Strategy selector
- [ ] Report UI
- [ ] CSV export

---

## 🛠️ Run Locally (once built)

```bash
pip install -r requirements.txt
# Add GEMINI_API_KEY to .env
python main.py
# Open http://localhost:8000
```

---

**Built by Dharshini S & Sandhiya S**
