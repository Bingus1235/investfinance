import yfinance as yf
import time
import sys
import os
import streamlit
from fetch_data import data_fetch
from prepare_data import data_prepare

os.system('streamlit run app.py')
history, currentprice = data_fetch("AAPL")
print("\n\n\n\n\n\n\n\n\n\n\n\n\n")
#feature, targets = data_prepare(history)

