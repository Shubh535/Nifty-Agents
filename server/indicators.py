"""
server/indicators.py
====================
Technical indicator computation using pandas_ta.
All functions return serialization-safe (NaN-free) dicts.
"""
import math

import pandas as pd
import yfinance as yf

# ─── Sector Map ──────────────────────────────────────────────────────────────

SECTOR_MAP = {
    # NSE sector indices
    "IT":          "^CNXIT",
    "BANK":        "^NSEBANK",
    "PHARMA":      "^CNXPHARMA",
    "AUTO":        "^CNXAUTO",
    "FMCG":        "^CNXFMCG",
    "ENERGY":      "^CNXENERGY",
    "METAL":       "^CNXMETAL",
    "REALTY":      "^CNXREALTY",
    "INFRA":       "^CNXINFRA",
    "MEDIA":       "^CNXMEDIA",
}

# Map company suffix hints to sector index
TICKER_SECTOR_HINTS = {
    "TCS":       "IT",
    "INFY":      "IT",
    "WIPRO":     "IT",
    "HCLTECH":   "IT",
    "TECHM":     "IT",
    "LTIM":      "IT",
    "HDFCBANK":  "BANK",
    "ICICIBANK": "BANK",
    "SBIN":      "BANK",
    "AXISBANK":  "BANK",
    "KOTAKBANK": "BANK",
    "RELIANCE":  "ENERGY",
    "ONGC":      "ENERGY",
    "BPCL":      "ENERGY",
    "SUNPHARMA": "PHARMA",
    "DRREDDY":   "PHARMA",
    "CIPLA":     "PHARMA",
    "MARUTI":    "AUTO",
    "TATAMOTORS":"AUTO",
    "BAJAJ-AUTO":"AUTO",
    "EICHERMOT": "AUTO",
    "HINDALCO":  "METAL",
    "JSWSTEEL":  "METAL",
    "TATASTEEL": "METAL",
}


def _get_sector_ticker(ticker: str) -> str | None:
    base = ticker.split(".")[0].upper()
    sector = TICKER_SECTOR_HINTS.get(base)
    return SECTOR_MAP.get(sector) if sector else "^NSEI"  # fallback: Nifty 50


def _safe(val) -> float | None:
    """Convert NaN/inf to None for JSON safety."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _fetch_df(ticker: str, period: str = "6mo") -> pd.DataFrame:
    df = yf.download(ticker, period=period, interval="1d", progress=False, auto_adjust=True)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
    df = df.reset_index()
    df = df.dropna(subset=["Open", "High", "Low", "Close"])
    return df


# ─── Indicators ───────────────────────────────────────────────────────────────

def compute_indicators(ticker: str, period: str = "6mo") -> dict:
    """
    Returns OHLCV + RSI + MACD + Bollinger Bands for the given ticker.
    All values are NaN-safe (None for missing).
    """
    df = _fetch_df(ticker, period)
    if df.empty:
        return {"error": "No data"}

    try:
        import pandas_ta as ta
    except ImportError:
        return {"error": "pandas_ta not installed"}

    close = df["Close"]

    # RSI (14)
    rsi = ta.rsi(close, length=14)

    # MACD (12, 26, 9)
    macd_df = ta.macd(close, fast=12, slow=26, signal=9)

    # Bollinger Bands (20, 2)
    bb_df = ta.bbands(close, length=20, std=2)

    candles = []
    for i, row in df.iterrows():
        date_str = row["Date"].strftime("%Y-%m-%d")

        # MACD columns
        macd_val = signal_val = hist_val = None
        if macd_df is not None and not macd_df.empty:
            cols = macd_df.columns.tolist()
            macd_col    = next((c for c in cols if c.startswith("MACD_12")), None)
            signal_col  = next((c for c in cols if c.startswith("MACDs_")), None)
            hist_col    = next((c for c in cols if c.startswith("MACDh_")), None)
            if macd_col:
                macd_val = _safe(macd_df[macd_col].iloc[i])
            if signal_col:
                signal_val = _safe(macd_df[signal_col].iloc[i])
            if hist_col:
                hist_val = _safe(macd_df[hist_col].iloc[i])

        # BB columns
        bb_upper = bb_mid = bb_lower = None
        if bb_df is not None and not bb_df.empty:
            cols = bb_df.columns.tolist()
            ub = next((c for c in cols if c.startswith("BBU_")), None)
            mb = next((c for c in cols if c.startswith("BBM_")), None)
            lb = next((c for c in cols if c.startswith("BBL_")), None)
            if ub:
                bb_upper = _safe(bb_df[ub].iloc[i])
            if mb:
                bb_mid = _safe(bb_df[mb].iloc[i])
            if lb:
                bb_lower = _safe(bb_df[lb].iloc[i])

        candles.append({
            "time":     date_str,
            "open":     _safe(row["Open"]),
            "high":     _safe(row["High"]),
            "low":      _safe(row["Low"]),
            "close":    _safe(row["Close"]),
            "volume":   int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0,
            "rsi":      _safe(rsi.iloc[i]) if rsi is not None else None,
            "macd":     macd_val,
            "macd_signal": signal_val,
            "macd_hist":   hist_val,
            "bb_upper": bb_upper,
            "bb_mid":   bb_mid,
            "bb_lower": bb_lower,
        })

    return {"ticker": ticker, "candles": candles}


def compute_sector_comparison(ticker: str, period: str = "3mo") -> dict:
    """
    Returns % return series for the stock and its sector index,
    normalised to 100 at start for easy comparison.
    """
    sector_ticker = _get_sector_ticker(ticker)

    stock_df  = _fetch_df(ticker, period)
    sector_df = _fetch_df(sector_ticker, period)

    if stock_df.empty or sector_df.empty:
        return {"error": "No data"}

    def normalise(df: pd.DataFrame) -> list[dict]:
        base = float(df["Close"].iloc[0])
        out = []
        for _, row in df.iterrows():
            out.append({
                "time":  row["Date"].strftime("%Y-%m-%d"),
                "value": round((float(row["Close"]) / base) * 100, 2),
            })
        return out

    return {
        "ticker":        ticker,
        "sector_ticker": sector_ticker,
        "stock":         normalise(stock_df),
        "sector":        normalise(sector_df),
    }


def get_batch_quotes(tickers: list[str]) -> list[dict]:
    """Fast quote for multiple tickers."""
    results = []
    for ticker in tickers:
        try:
            t = yf.Ticker(ticker)
            info = t.fast_info
            prev  = getattr(info, "previous_close", None)
            price = getattr(info, "last_price", None)
            chg   = round((price - prev) / prev * 100, 2) if (price and prev and prev != 0) else None
            results.append({
                "ticker":     ticker,
                "price":      _safe(price),
                "change_pct": chg,
                "currency":   getattr(info, "currency", "INR"),
            })
        except Exception as e:
            results.append({"ticker": ticker, "error": str(e)})
    return results
