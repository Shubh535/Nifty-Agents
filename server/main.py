"""
NiftyAgents FastAPI Backend
===========================
Run with: uvicorn server.main:app --reload --port 8000
"""
import asyncio
import json
import sqlite3
import threading
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import date, datetime
from pathlib import Path

import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.signal_processing import SignalProcessor
from tradingagents.graph.trading_graph import TradingAgentsGraph

# ─── DB Setup ────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent / "niftyagents.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            ticker TEXT NOT NULL,
            analysis_date TEXT NOT NULL,
            analysts TEXT NOT NULL,
            signal TEXT,
            status TEXT DEFAULT 'running',
            report TEXT,
            created_at TEXT NOT NULL
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS portfolio (
            ticker TEXT PRIMARY KEY,
            added_at TEXT NOT NULL,
            last_signal TEXT,
            last_run_id TEXT
        )
    """)
    conn.commit()
    conn.close()


def db_conn():
    return sqlite3.connect(DB_PATH, check_same_thread=False)


# ─── In-Memory SSE Event Store ───────────────────────────────────────────────

# run_id -> asyncio.Queue of event dicts
_run_queues: dict[str, asyncio.Queue] = {}
_run_loops: dict[str, asyncio.AbstractEventLoop] = {}


def get_or_create_queue(run_id: str) -> asyncio.Queue:
    if run_id not in _run_queues:
        _run_queues[run_id] = asyncio.Queue()
    return _run_queues[run_id]


def push_event(run_id: str, event: dict):
    """Push an SSE event from a background thread into the asyncio queue."""
    loop = _run_loops.get(run_id)
    q = _run_queues.get(run_id)
    if loop and q:
        asyncio.run_coroutine_threadsafe(q.put(event), loop)


# ─── App Setup ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="NiftyAgents API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request/Response Models ──────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    ticker: str
    analysis_date: str = str(date.today())
    analysts: list[str] = ["market", "fundamentals", "news"]


class PortfolioRequest(BaseModel):
    ticker: str


# ─── Analysis Worker ──────────────────────────────────────────────────────────

AGENT_DISPLAY = {
    "market": "Market Analyst",
    "news": "News Analyst",
    "fundamentals": "Fundamentals Analyst",
    "social": "Sentiment Analyst",
}

FIXED_AGENTS = [
    "Bull Researcher", "Bear Researcher", "Research Manager",
    "Trader",
    "Aggressive Analyst", "Conservative Analyst", "Neutral Analyst",
    "Portfolio Manager",
]


def run_analysis_worker(run_id: str, ticker: str, analysis_date: str, analysts: list[str]):
    """Runs in a background thread. Streams events via push_event()."""

    def emit(event_type: str, data: dict):
        push_event(run_id, {"type": event_type, "data": data})

    try:
        config = DEFAULT_CONFIG.copy()

        # Emit initial agent list
        all_agents = [AGENT_DISPLAY[a] for a in analysts if a in AGENT_DISPLAY] + FIXED_AGENTS
        emit("agents_init", {"agents": all_agents})

        # Mark first analyst as in_progress
        if analysts:
            emit("agent_status", {"agent": AGENT_DISPLAY.get(analysts[0], analysts[0]), "status": "in_progress"})

        graph = TradingAgentsGraph(analysts, config=config, debug=False)

        # Use the same streaming approach as the CLI
        from tradingagents.graph.analyst_execution import build_analyst_execution_plan

        build_analyst_execution_plan(analysts)
        instrument_context = graph.resolve_instrument_context(ticker, "stock")
        init_state = graph.propagator.create_initial_state(
            ticker, analysis_date, asset_type="stock", instrument_context=instrument_context
        )
        args = graph.propagator.get_graph_args(callbacks=[])

        trace = []
        completed_analysts = set()
        for chunk in graph.graph.stream(init_state, **args):
            trace.append(chunk)

            # Analyst reports → mark completed
            for analyst_key, agent_name in AGENT_DISPLAY.items():
                report_key = f"{analyst_key}_report" if analyst_key != "social" else "sentiment_report"
                if chunk.get(report_key) and agent_name not in completed_analysts:
                    completed_analysts.add(agent_name)
                    emit("agent_status", {"agent": agent_name, "status": "completed"})
                    emit("report_section", {"section": report_key, "content": chunk[report_key]})

            # Research team
            if chunk.get("investment_debate_state"):
                debate = chunk["investment_debate_state"]
                if debate.get("bull_history"):
                    emit("agent_status", {"agent": "Bull Researcher", "status": "in_progress"})
                if debate.get("bear_history"):
                    emit("agent_status", {"agent": "Bear Researcher", "status": "in_progress"})
                if debate.get("judge_decision"):
                    emit("agent_status", {"agent": "Bull Researcher", "status": "completed"})
                    emit("agent_status", {"agent": "Bear Researcher", "status": "completed"})
                    emit("agent_status", {"agent": "Research Manager", "status": "completed"})
                    emit("agent_status", {"agent": "Trader", "status": "in_progress"})
                    emit("report_section", {"section": "investment_debate_state", "content": debate.get("judge_decision")})

            # Trader
            if chunk.get("trader_investment_plan"):
                emit("agent_status", {"agent": "Trader", "status": "completed"})
                emit("agent_status", {"agent": "Aggressive Analyst", "status": "in_progress"})
                emit("report_section", {"section": "trader_investment_plan", "content": chunk["trader_investment_plan"]})

            # Risk team
            if chunk.get("risk_debate_state"):
                risk = chunk["risk_debate_state"]
                if risk.get("judge_decision"):
                    emit("agent_status", {"agent": "Aggressive Analyst", "status": "completed"})
                    emit("agent_status", {"agent": "Conservative Analyst", "status": "completed"})
                    emit("agent_status", {"agent": "Neutral Analyst", "status": "completed"})
                    emit("agent_status", {"agent": "Portfolio Manager", "status": "in_progress"})
                    emit("report_section", {"section": "risk_debate_state", "content": risk.get("judge_decision")})

        # Merge trace to get final state
        final_state = {}
        for chunk in trace:
            final_state.update(chunk)

        # Extract signal
        signal_processor = SignalProcessor()
        pm_decision = final_state.get("risk_debate_state", {}).get("judge_decision", "")
        signal = signal_processor.process_signal(pm_decision) if pm_decision else "Hold"

        # Emit completion
        emit("agent_status", {"agent": "Portfolio Manager", "status": "completed"})
        emit("complete", {
            "signal": signal,
            "final_state": {
                "market_report": final_state.get("market_report", ""),
                "sentiment_report": final_state.get("sentiment_report", ""),
                "news_report": final_state.get("news_report", ""),
                "fundamentals_report": final_state.get("fundamentals_report", ""),
                "investment_debate_state": final_state.get("investment_debate_state", {}),
                "trader_investment_plan": final_state.get("trader_investment_plan", ""),
                "risk_debate_state": final_state.get("risk_debate_state", {}),
            }
        })

        # Save to DB
        conn = db_conn()
        conn.execute(
            "UPDATE runs SET signal=?, status=?, report=? WHERE id=?",
            (signal, "completed", json.dumps(final_state, default=str), run_id)
        )
        # Update portfolio last signal if tracked
        conn.execute(
            "UPDATE portfolio SET last_signal=?, last_run_id=? WHERE ticker=?",
            (signal, run_id, ticker)
        )
        conn.commit()
        conn.close()

    except Exception as e:
        push_event(run_id, {"type": "error", "data": {"message": str(e)}})
        conn = db_conn()
        conn.execute("UPDATE runs SET status=? WHERE id=?", ("error", run_id))
        conn.commit()
        conn.close()

    finally:
        push_event(run_id, {"type": "done", "data": {}})


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def start_analysis(req: AnalyzeRequest):
    run_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()

    # Save to DB
    conn = db_conn()
    conn.execute(
        "INSERT INTO runs (id, ticker, analysis_date, analysts, status, created_at) VALUES (?,?,?,?,?,?)",
        (run_id, req.ticker, req.analysis_date, json.dumps(req.analysts), "running", now)
    )
    conn.commit()
    conn.close()

    # Create queue and store current event loop for this run
    loop = asyncio.get_event_loop()
    _run_loops[run_id] = loop
    get_or_create_queue(run_id)

    # Start worker thread
    thread = threading.Thread(
        target=run_analysis_worker,
        args=(run_id, req.ticker, req.analysis_date, req.analysts),
        daemon=True,
    )
    thread.start()

    return {"run_id": run_id}


@app.get("/api/stream/{run_id}")
async def stream_events(run_id: str):
    """SSE endpoint — streams agent progress events."""
    q = get_or_create_queue(run_id)

    async def event_generator() -> AsyncGenerator[str, None]:
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=120.0)
                yield f"data: {json.dumps(event)}\n\n"
                if event["type"] in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield "data: {\"type\": \"ping\"}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/runs")
def list_runs():
    conn = db_conn()
    rows = conn.execute(
        "SELECT id, ticker, analysis_date, analysts, signal, status, created_at FROM runs ORDER BY created_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    return [
        {
            "id": r[0], "ticker": r[1], "analysis_date": r[2],
            "analysts": json.loads(r[3]), "signal": r[4],
            "status": r[5], "created_at": r[6],
        }
        for r in rows
    ]


@app.get("/api/runs/{run_id}")
def get_run(run_id: str):
    conn = db_conn()
    row = conn.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "id": row[0], "ticker": row[1], "analysis_date": row[2],
        "analysts": json.loads(row[3]), "signal": row[4],
        "status": row[5], "report": json.loads(row[6]) if row[6] else None,
        "created_at": row[7],
    }


@app.get("/api/chart/{ticker}")
def get_chart(ticker: str, period: str = "3mo"):
    """Returns OHLCV data for TradingView Lightweight Charts."""
    try:
        df = yf.download(ticker, period=period, interval="1d", progress=False)
        if df.empty:
            raise HTTPException(status_code=404, detail="No data found")

        import pandas as pd
        # Flatten MultiIndex columns (yfinance returns MultiIndex when downloading single ticker)
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.droplevel(1)

        df = df.reset_index()
        # Drop rows with any NaN in OHLC columns to avoid JSON serialization errors
        df = df.dropna(subset=["Open", "High", "Low", "Close"])

        candles = []
        for _, row in df.iterrows():
            candles.append({
                "time": row["Date"].strftime("%Y-%m-%d"),
                "open":  round(float(row["Open"]),  2),
                "high":  round(float(row["High"]),  2),
                "low":   round(float(row["Low"]),   2),
                "close": round(float(row["Close"]), 2),
            })
        return {"ticker": ticker, "candles": candles}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/portfolio")
def get_portfolio():
    conn = db_conn()
    rows = conn.execute("SELECT ticker, added_at, last_signal, last_run_id FROM portfolio").fetchall()
    conn.close()
    return [{"ticker": r[0], "added_at": r[1], "last_signal": r[2], "last_run_id": r[3]} for r in rows]


@app.post("/api/portfolio")
def add_to_portfolio(req: PortfolioRequest):
    conn = db_conn()
    conn.execute(
        "INSERT OR IGNORE INTO portfolio (ticker, added_at) VALUES (?,?)",
        (req.ticker.upper(), datetime.utcnow().isoformat())
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/api/portfolio/{ticker}")
def remove_from_portfolio(ticker: str):
    conn = db_conn()
    conn.execute("DELETE FROM portfolio WHERE ticker=?", (ticker.upper(),))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/quote/{ticker}")
def get_quote(ticker: str):
    """Live price quote for a ticker."""
    try:
        t = yf.Ticker(ticker)
        info = t.fast_info
        return {
            "ticker": ticker,
            "price": round(info.last_price, 2),
            "change_pct": round(info.three_month_change * 100, 2) if hasattr(info, "three_month_change") else None,
            "currency": info.currency,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
