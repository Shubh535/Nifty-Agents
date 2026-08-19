# 🧠 TradingAgents — Complete Deep Dive for Resume

> Everything you need to understand, explain, and extend this project confidently in interviews.

---

## 📌 What Is This Project?

**TradingAgents** is a multi-agent LLM framework that simulates a full Wall Street trading desk using AI.  
Instead of one LLM making all decisions, it orchestrates **a team of specialized AI agents** — each with a specific role — that debate, analyze, and ultimately reach a **BUY / HOLD / SELL** decision for any stock or crypto asset.

**Core idea**: Real investment firms don't have one analyst. They have market analysts, news desks, risk managers, portfolio managers, etc. This system models that.

---

## 🏗️ High-Level Architecture

```
                     ┌───────────────────────────────────────────┐
                     │            TradingAgentsGraph              │
                     │  (d:\TradingAgents\tradingagents\graph\)  │
                     └───────────────────────┬───────────────────┘
                                             │
              ┌──────────────────────────────▼─────────────────────────────┐
              │                    PHASE 1: ANALYSIS                        │
              │  Market Analyst → Social Analyst → News Analyst → Fundamentals │
              └──────────────────────────────┬─────────────────────────────┘
                                             │
              ┌──────────────────────────────▼─────────────────────────────┐
              │                  PHASE 2: RESEARCH DEBATE                   │
              │              Bull Researcher ↔ Bear Researcher              │
              │                   → Research Manager (judge)                │
              └──────────────────────────────┬─────────────────────────────┘
                                             │
              ┌──────────────────────────────▼─────────────────────────────┐
              │                    PHASE 3: TRADER                          │
              │              Translates plan → BUY/HOLD/SELL                │
              └──────────────────────────────┬─────────────────────────────┘
                                             │
              ┌──────────────────────────────▼─────────────────────────────┐
              │                 PHASE 4: RISK DEBATE                        │
              │  Aggressive ↔ Conservative ↔ Neutral Risk Analysts         │
              │                → Portfolio Manager (final decision)         │
              └──────────────────────────────┬─────────────────────────────┘
                                             │
              ┌──────────────────────────────▼─────────────────────────────┐
              │              PHASE 5: REFLECTION & MEMORY                   │
              │  Stores decision → Later fetches real return → Reflects     │
              └────────────────────────────────────────────────────────────┘
```

---

## 📂 Folder-by-Folder Breakdown

### `tradingagents/` — Core Package

| File/Folder | Purpose |
|---|---|
| `graph/` | **Main orchestrator** — builds the LangGraph state machine |
| `agents/` | All AI agents (analysts, researchers, risk, trader) |
| `dataflows/` | Data fetching layer (yfinance, Alpha Vantage, FRED, Reddit, etc.) |
| `llm_clients/` | LLM abstraction — supports OpenAI, Anthropic, Gemini, Ollama, etc. |
| `default_config.py` | Central configuration with env-var override system |
| `reporting.py` | Saves markdown report trees to disk |

---

## 🤖 The Agent Roster (agents/)

### Analysts (Phase 1) — Tool-Calling Agents

These agents **call real data APIs** via LangChain tool-calling, then write a detailed report.

#### 1. Market Analyst — `analysts/market_analyst.py`
- **Role**: Technical analysis
- **Tools available**: `get_stock_data`, `get_indicators`, `get_verified_market_snapshot`
- **How it works**: Chooses up to 8 technical indicators (RSI, MACD, Bollinger Bands, SMA, EMA, ATR, VWMA) that are most relevant, fetches data, then writes a detailed trend report with a summary markdown table
- **Key concept**: It uses LangChain's `bind_tools()` — the LLM itself decides when and which tool to call

#### 2. Sentiment Analyst — `analysts/sentiment_analyst.py`
- **Role**: Social media & sentiment analysis
- **Data sources**: Reddit, StockTwits, news feeds
- **Output**: A `SentimentReport` Pydantic schema with `overall_band` (Bullish/Bearish/etc.), `overall_score` (0–10), `confidence` level, and full narrative

#### 3. News Analyst — `analysts/news_analyst.py`
- **Role**: News, macro events, insider transactions
- **Tools**: `get_news`, `get_global_news`, `get_insider_transactions`, `get_macro_indicators`, `get_prediction_markets`
- **Data includes**: FRED macro data, Polymarket prediction markets

#### 4. Fundamentals Analyst — `analysts/fundamentals_analyst.py`
- **Role**: Financial statement analysis
- **Tools**: `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement`
- **Covers**: P/E, revenue, debt levels, cash flow, etc.

---

### Researchers (Phase 2) — Debate Agents

These agents **read the analyst reports** and argue for/against the investment — no tools, pure reasoning.

#### 5. Bull Researcher — `researchers/bull_researcher.py`
- **Role**: Build the strongest possible BUY case
- **Reads**: All 4 analyst reports + bear's previous argument
- **Argues**: Growth potential, competitive advantages, positive indicators
- **Responds directly** to the bear's counterpoints

#### 6. Bear Researcher — `researchers/bear_researcher.py`
- **Role**: Build the strongest possible SELL/AVOID case
- **Counterpart** to the bull — challenges optimistic assumptions

#### 7. Research Manager — `managers/research_manager.py`
- **Role**: **Judge** of the bull vs. bear debate
- **Output**: `ResearchPlan` Pydantic schema — a `recommendation` (Buy/Overweight/Hold/Underweight/Sell), `rationale`, and `strategic_actions`
- **Uses**: The `deep_think_llm` (more powerful model) for this judgment

---

### Trader (Phase 3)

#### 8. Trader — `trader/trader.py`
- **Role**: Converts the research plan into an executable proposal
- **Output**: `TraderProposal` Pydantic schema — `action` (Buy/Hold/Sell), `reasoning`, `entry_price`, `stop_loss`, `position_sizing`

---

### Risk Management (Phase 4) — Three-Way Debate

These agents critique the **trader's plan** from different risk philosophies.

#### 9. Aggressive Debator — `risk_mgmt/aggressive_debator.py`
- **Philosophy**: High-risk, high-reward — champions bold moves, challenges over-caution

#### 10. Conservative Debator — `risk_mgmt/conservative_debator.py`
- **Philosophy**: Capital preservation — highlights downside risks, demands safety margins

#### 11. Neutral Debator — `risk_mgmt/neutral_debator.py`
- **Philosophy**: Balanced — provides objective middle-ground analysis

#### 12. Portfolio Manager — `managers/portfolio_manager.py`
- **Role**: **Final decision maker** — judges the 3-way risk debate
- **Output**: `PortfolioDecision` schema — `rating`, `executive_summary`, `investment_thesis`, `price_target`, `time_horizon`
- **Uses**: The `deep_think_llm`

---

## 🔄 The LangGraph State Machine (graph/)

This is the most technically impressive part of the project.

### `graph/trading_graph.py` — `TradingAgentsGraph` class

The main orchestrator. Key concepts:

```python
ta = TradingAgentsGraph(
    selected_analysts=("market", "social", "news", "fundamentals"),
    config=config
)
state, decision = ta.propagate("NVDA", "2024-05-10")
```

**How it flows internally:**
1. `propagate()` calls `_run_graph()`
2. `_run_graph()` creates the initial `AgentState` and calls `graph.invoke()`
3. LangGraph executes nodes in order, passing state between them
4. After completion, stores the decision and triggers reflection

### `graph/setup.py` — `GraphSetup.setup_graph()`

Builds the actual `StateGraph` (LangGraph):

```python
workflow = StateGraph(AgentState)
# Add all agent nodes
# Add edges: START → Analyst1 → Analyst2 → ... → Bull/Bear → Research Manager → Trader → Risk Analysts → Portfolio Manager → END
```

**Key pattern**: Analyst nodes have a **tool-call loop** — if the LLM calls a tool, execution goes to the ToolNode and back; if it returns a report, execution moves to the next analyst.

### `graph/conditional_logic.py` — Routing Logic

Controls the debate loops:
- `should_continue_debate()` — routes between Bull, Bear, and Research Manager based on round count
- `should_continue_risk_analysis()` — routes between Aggressive, Conservative, Neutral, and Portfolio Manager

### `graph/reflection.py` — Memory System

After each run:
1. Decision is stored with a "pending" status
2. On the **next run** for the same ticker, it fetches the actual return from yfinance
3. Calculates **alpha** (return - benchmark return, e.g., vs SPY)
4. The LLM writes a 2-4 sentence reflection on whether the call was right and why
5. This reflection is injected into future runs as context — **the system learns from its mistakes**

---

## 📡 Data Layer (dataflows/)

### Data Sources

| Source | File | What it provides |
|---|---|---|
| **Yahoo Finance** | `y_finance.py` | Stock prices, OHLCV, fundamentals, news |
| **Alpha Vantage** | `alpha_vantage*.py` | Alternative stock data + technical indicators |
| **FRED** | `fred.py` | Macroeconomic indicators (interest rates, GDP, inflation) |
| **Reddit** | `reddit.py` | r/wallstreetbets, r/stocks social sentiment |
| **StockTwits** | `stocktwits.py` | Real-time trader sentiment |
| **Polymarket** | `polymarket.py` | Prediction market probabilities on future events |

### Vendor Routing System

The config allows you to switch data vendors per tool type:
```python
"data_vendors": {
    "core_stock_apis": "yfinance",       # or "alpha_vantage"
    "macro_data": "fred",
    "prediction_markets": "polymarket",
}
```

This is a **Strategy Pattern** — the same interface, different backends.

### `dataflows/interface.py` — Unified API

All agents call abstract functions like `get_stock_data()`, `get_news()` etc. The interface routes these to the right vendor based on config. This decouples agents from data sources.

---

## ⚙️ LLM Client System (llm_clients/)

### Design Pattern: Factory + Abstract Base

```
base_client.py          ← Abstract base with get_llm() method
├── openai_client.py    ← OpenAI, xAI, DeepSeek, Ollama, OpenRouter, etc.
├── anthropic_client.py ← Claude models
├── google_client.py    ← Gemini models
├── azure_client.py     ← Azure OpenAI
└── bedrock_client.py   ← AWS Bedrock
```

`factory.py` → `create_llm_client(provider, model)` returns the right client.

### Two LLM Tiers

Every run uses **two LLMs simultaneously**:
- `quick_think_llm` — Faster/cheaper model (analysts, researchers, risk debators)
- `deep_think_llm` — Smarter/slower model (Research Manager, Portfolio Manager — the judges)

This is a cost-optimization pattern: don't use the expensive model for everything.

### Supported Providers (model_catalog.py)

| Provider | Examples |
|---|---|
| OpenAI | GPT-5.5, GPT-5.4-mini |
| Anthropic | Claude Fable 5, Claude Sonnet 5 |
| Google | Gemini 3.5 Flash, Gemini 3.1 Pro |
| xAI | Grok 4.3 |
| DeepSeek | DeepSeek V4 Pro/Flash |
| Qwen | Qwen 3.7 Max |
| Ollama | Local models (Qwen3, GPT-OSS) |
| AWS Bedrock | Any Bedrock model |
| Azure OpenAI | Any deployed model |

---

## 🏛️ Pydantic Schemas (agents/schemas.py)

Structured output is used for the three **decision-making** agents. Instead of parsing free-form LLM text, the LLM is forced to output a validated JSON structure.

| Schema | Used By | Key Fields |
|---|---|---|
| `ResearchPlan` | Research Manager | `recommendation`, `rationale`, `strategic_actions` |
| `TraderProposal` | Trader | `action`, `reasoning`, `entry_price`, `stop_loss`, `position_sizing` |
| `PortfolioDecision` | Portfolio Manager | `rating`, `executive_summary`, `investment_thesis`, `price_target`, `time_horizon` |
| `SentimentReport` | Sentiment Analyst | `overall_band`, `overall_score`, `confidence`, `narrative` |

**Key design decision**: Field descriptions in Pydantic schemas become the model's output instructions — elegant self-documenting API.

---

## ⚙️ Configuration System (default_config.py)

### The Smart Env-Var Override System

All config keys can be overridden by environment variables without changing code:
```bash
TRADINGAGENTS_LLM_PROVIDER=anthropic
TRADINGAGENTS_DEEP_THINK_LLM=claude-opus-4-8
TRADINGAGENTS_MAX_DEBATE_ROUNDS=3
TRADINGAGENTS_CHECKPOINT_ENABLED=true
```

The `_coerce()` function auto-converts env strings to the right Python type (bool, int, float, str).

### Key Config Knobs

| Config Key | Default | What it does |
|---|---|---|
| `max_debate_rounds` | 1 | How many Bull/Bear rounds before Research Manager judges |
| `max_risk_discuss_rounds` | 1 | How many rounds of Aggressive/Conservative/Neutral debate |
| `checkpoint_enabled` | False | If True, saves state after each LangGraph node (crash recovery) |
| `output_language` | "English" | Final report language (supports multi-language) |
| `benchmark_ticker` | None (auto) | What to compare returns against (SPY for US, Nifty for India, etc.) |

---

## 🖥️ CLI Interface (cli/)

The project ships with a full interactive CLI built with **Typer** + **Rich**:

```bash
tradingagents run    # Interactive: pick stock, date, analyst, LLM provider
tradingagents run --ticker AAPL --date 2024-01-15
```

The CLI (`cli/main.py`) handles:
- Interactive provider/model selection via `questionary`
- Progress display with `rich`
- Writing reports to disk as markdown files
- Showing stats (token usage, cost) via `stats_handler.py`

---

## 🧩 Key Design Patterns (For Interviews)

### 1. Multi-Agent Architecture (LangGraph StateGraph)
Each agent is a **node** in a directed graph. State is passed between nodes. Conditional edges implement the debate loops.

### 2. Tool-Calling Pattern (ReAct-style)
Analysts use LangChain's `bind_tools()`. The LLM reasons about which tool to call, the ToolNode executes it, and the result flows back. This is the **ReAct** (Reason + Act) pattern.

### 3. Shared State (AgentState TypedDict)
All agents read from and write to a single shared `AgentState` dict. LangGraph merges node outputs back into state — this is how reports from analyst 1 reach analyst 2.

### 4. Deferred Reflection (Temporal Memory)
Decisions are logged immediately; outcomes are measured later (after the stock actually moves); reflection is generated on the next run. This implements a **feedback loop** across time.

### 5. Factory + Strategy Pattern (LLM Clients + Data Vendors)
Both the LLM layer and data layer use factory functions to return the right implementation based on config — cleanly separating **what** from **how**.

### 6. Structured Output over Free-Form (Pydantic schemas)
Decision agents use provider-native structured output (JSON schema for OpenAI, tool-use for Anthropic) rather than regex parsing. This is more reliable and self-documenting.

---

## 📋 What to Say in Interviews

### "What did you build?"
> "I studied and worked with TradingAgents, a multi-agent LLM system that simulates a real trading desk. It uses LangGraph to orchestrate 12+ specialized AI agents — market analysts, bull/bear researchers, risk debators, and a portfolio manager — each with a distinct role, debating through multiple rounds before reaching a final BUY/HOLD/SELL decision."

### "What was the hardest technical concept?"
> "Understanding LangGraph's state machine model — how each agent node reads from a shared `AgentState`, produces partial updates, and how conditional edges implement the debate loops. Also grasping how tool-calling works: the analyst LLM doesn't call APIs directly; it emits a structured tool-call message, LangGraph's ToolNode executes the actual Python function, and the result is appended back to the message history for the LLM to continue reasoning."

### "What would you improve or extend?"
Pick one of these:
- **Add backtesting**: Run the system on historical dates, compare its decisions to actual returns over time
- **Add a new analyst**: e.g., Options Flow Analyst using options chain data
- **Add streaming UI**: Real-time dashboard showing each agent's output as it streams
- **Multi-asset portfolio**: Run on multiple tickers simultaneously, then have the Portfolio Manager allocate across all

---

## 🚀 Quick Start to Run It

1. **Create your `.env`** (copy from `.env.example`):
```bash
OPENAI_API_KEY=sk-...
```

2. **Run the main example**:
```bash
.venv\Scripts\python.exe main.py
```

3. **Run the interactive CLI**:
```bash
.venv\Scripts\python.exe -m cli.main run
```

4. **What you need API keys for**:
   - An LLM provider (OpenAI / Anthropic / Google / etc.) — **required**
   - FRED API key — optional (macro indicators)
   - Alpha Vantage API key — optional (yfinance works without keys)
   - Reddit API credentials — optional (social sentiment)

---

## 🗺️ Concept Map: Technologies Used

| Technology | Where Used | What It Does |
|---|---|---|
| **LangGraph** | `graph/` | State machine orchestrating all agents |
| **LangChain** | All agents | Tool-calling, prompt templates, LLM abstractions |
| **Pydantic** | `agents/schemas.py` | Structured output validation |
| **yfinance** | `dataflows/y_finance.py` | Free stock/crypto data |
| **pandas** | Throughout | Data manipulation |
| **Typer** | `cli/main.py` | CLI framework |
| **Rich** | `cli/` | Beautiful terminal output |
| **questionary** | `cli/main.py` | Interactive terminal prompts |
| **stockstats** | `dataflows/stockstats_utils.py` | Technical indicator calculations |
| **Redis** | `tradingagents/__init__.py` | Optional caching |
| **backtrader** | Dependency | Backtesting engine (available for extension) |
| **python-dotenv** | Config loading | `.env` file support |

