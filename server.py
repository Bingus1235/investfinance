from flask import Flask, render_template, request, jsonify
from fetch_data import data_fetch
from prepare_data import data_prepare
import pandas as pd
import numpy as np
import traceback
import math

app = Flask(__name__)

def safe_float(val):
    """Safely convert a value to float, returning None for NaN/None."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None

def safe_list(lst):
    """Convert a list of floats, replacing NaN with None for JSON."""
    return [None if (x is None or math.isnan(x)) else round(float(x), 4) for x in lst]

def compute_sma(series, window):
    """Simple Moving Average."""
    return series.rolling(window=window, min_periods=1).mean()

def compute_ema(series, span):
    """Exponential Moving Average."""
    return series.ewm(span=span, adjust=False).mean()

def compute_rsi(series, period=14):
    """Relative Strength Index."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = -delta.where(delta < 0, 0.0)
    avg_gain = gain.rolling(window=period, min_periods=1).mean()
    avg_loss = loss.rolling(window=period, min_periods=1).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def compute_macd(series, fast=12, slow=26, signal=9):
    """MACD line, Signal line, Histogram."""
    ema_fast = compute_ema(series, fast)
    ema_slow = compute_ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = compute_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def compute_bollinger(series, window=20, num_std=2):
    """Bollinger Bands: upper, middle (SMA), lower."""
    middle = series.rolling(window=window, min_periods=1).mean()
    std = series.rolling(window=window, min_periods=1).std()
    upper = middle + (std * num_std)
    lower = middle - (std * num_std)
    return upper, middle, lower

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stock/<symbol>')
def stock_data(symbol):
    period = request.args.get('period', '1y')
    try:
        history, currentprice = data_fetch(symbol, hist_period=period)
        
        if history.empty:
            return jsonify({"error": "No data found for symbol"}), 404
        
        # We need to process targets from prepare_data (targets are size len-1)
        features, targets = data_prepare(history)
        
        # Calculate monthly_up percentage (like in app.py)
        # Using tail(30) to get last 30 roughly equivalent to a month
        monthly_up_val = targets.tail(30).mean()
        monthly_up = float(monthly_up_val) * 100 if pd.notna(monthly_up_val) else 0.0
        
        if pd.isna(currentprice):
            currentprice = history['Close'].iloc[-1]

        # ── Tier 1: Core Financial Stats ──
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.info

        market_cap = safe_float(info.get('marketCap'))
        pe_ratio = safe_float(info.get('trailingPE'))
        forward_pe = safe_float(info.get('forwardPE'))
        high_52w = safe_float(info.get('fiftyTwoWeekHigh'))
        low_52w = safe_float(info.get('fiftyTwoWeekLow'))
        avg_volume = safe_float(info.get('averageVolume'))
        dividend_yield = safe_float(info.get('dividendYield'))
        if dividend_yield is not None:
            dividend_yield = round(dividend_yield * 100, 2)  # convert to percentage
        prev_close = safe_float(info.get('previousClose'))
        day_change = None
        day_change_pct = None
        if currentprice and prev_close:
            day_change = round(float(currentprice) - prev_close, 2)
            day_change_pct = round((day_change / prev_close) * 100, 2)

        # ── Tier 2: Technical Indicators ──
        closes = history['Close']
        
        sma_50 = compute_sma(closes, 50)
        sma_200 = compute_sma(closes, 200)
        rsi = compute_rsi(closes, 14)
        macd_line, signal_line, macd_histogram = compute_macd(closes)
        bb_upper, bb_middle, bb_lower = compute_bollinger(closes)

        # ── Tier 3: Company Context & Sentiment ──
        company_name = info.get('shortName') or info.get('longName') or symbol.upper()
        sector = info.get('sector', 'N/A')
        industry = info.get('industry', 'N/A')
        description = info.get('longBusinessSummary', '')

        # Analyst Recommendations
        recommendation = info.get('recommendationKey', 'N/A')  # e.g. 'buy', 'hold'
        recommendation_mean = safe_float(info.get('recommendationMean'))  # 1=Strong Buy, 5=Sell
        num_analysts = info.get('numberOfAnalystOpinions', None)

        # News
        news_items = []
        try:
            raw_news = ticker.news
            if raw_news:
                for item in raw_news[:5]:
                    content = item.get('content', {})
                    news_items.append({
                        "title": content.get('title', 'No Title'),
                        "publisher": content.get('provider', {}).get('displayName', 'Unknown'),
                        "link": content.get('canonicalUrl', {}).get('url', '#'),
                        "date": content.get('pubDate', '')
                    })
        except Exception:
            pass  # news is non-critical

        # Format history for chart
        dates = history.index.strftime('%Y-%m-%d').tolist()
        close_prices = closes.tolist()
        
        # Ensure json serializable (replace NaN with None)
        close_prices = safe_list(close_prices)
        
        return jsonify({
            "symbol": symbol.upper(),
            "company_name": company_name,
            "current_price": safe_float(currentprice),
            "monthly_up": round(monthly_up, 2),
            
            # Tier 1
            "market_cap": market_cap,
            "pe_ratio": pe_ratio,
            "forward_pe": forward_pe,
            "high_52w": high_52w,
            "low_52w": low_52w,
            "avg_volume": avg_volume,
            "dividend_yield": dividend_yield,
            "prev_close": prev_close,
            "day_change": day_change,
            "day_change_pct": day_change_pct,

            # Tier 3: Company Context
            "sector": sector,
            "industry": industry,
            "description": description,
            "recommendation": recommendation,
            "recommendation_mean": recommendation_mean,
            "num_analysts": num_analysts,
            "news": news_items,

            # Chart data
            "chart_data": {
                "dates": dates,
                "prices": close_prices,
                "sma_50": safe_list(sma_50.tolist()),
                "sma_200": safe_list(sma_200.tolist()),
                "bb_upper": safe_list(bb_upper.tolist()),
                "bb_lower": safe_list(bb_lower.tolist()),
            },

            # Technical indicators (separate charts)
            "rsi": safe_list(rsi.tolist()),
            "macd": {
                "line": safe_list(macd_line.tolist()),
                "signal": safe_list(signal_line.tolist()),
                "histogram": safe_list(macd_histogram.tolist()),
            }
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
