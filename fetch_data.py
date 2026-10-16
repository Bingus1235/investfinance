import yfinance as yf
import sys

sys.setrecursionlimit(2000)

def data_fetch(tickersymbol, hist_period="10y"):
  """
  Fetches historical price data and current price for a given stock ticker symbol.
  
  Args:
      tickersymbol (str): The stock ticker symbol (e.g., 'AAPL', 'MSFT').
      hist_period (str): The period to fetch (e.g., '10y', '1y', '3mo').
      
  Returns:
      tuple: A tuple containing the historical data (DataFrame) and the current price.
  """
  ticker= yf.Ticker(tickersymbol)
  
  tickerhistory = ticker.history(period=hist_period)
  tickercurrentprice = ticker.info.get('currentPrice')
  
  return tickerhistory, tickercurrentprice
  