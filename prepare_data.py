import yfinance as yf
import sys
import pandas as pd

sys.setrecursionlimit(2000)
pd.set_option('display.max_rows', 10000)
def data_prepare(history):

  history['Target'] = (history['Close'].shift(-1) > history['Close']).astype(int)

  features = history[['Open','High','Low', 'Close', 'Volume']].iloc[:-1]
  target = history['Target'].iloc[:-1]

  return features, target
  