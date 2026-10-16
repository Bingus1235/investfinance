import streamlit as st
import pandas as pd
import matplotlib.pyplot as plt
from fetch_data import data_fetch
from prepare_data import data_prepare

# set_page_config MUST be the first Streamlit command
st.set_page_config(layout="wide")
st.title("Stock Advisor")

@st.cache_data(ttl=900)
def load_stock_data(symbol):
    return data_fetch(symbol)


with st.form("stock_search"):
    entered_symbol = st.text_input(
        "Stock Symbol",
        value=st.session_state.get("stocksym", ""),
        max_chars=20,
    )
    submitted = st.form_submit_button("Get stock data")

if submitted:
    st.session_state["stocksym"] = entered_symbol.strip().upper()

stocksym = st.session_state.get("stocksym", "")
if submitted and not stocksym:
    st.warning("Enter a stock symbol.")

if stocksym:
    with st.spinner(f"Loading {stocksym} data..."):
        history, currentprice = load_stock_data(stocksym)

    if history.empty:
        st.error(f"No stock history found for {stocksym}. Check the symbol and try again.")
    else:
        _, targets = data_prepare(history)
        monthly_up = targets.tail(30).mean()
        if pd.isna(currentprice):
            currentprice = history["Close"].iloc[-1]

        one_year_ago = history.index.max() - pd.DateOffset(years=1)
        yearly_history = history.loc[history.index >= one_year_ago]

        col1, col2, col3 = st.columns(3)

        with col1:
            st.write(f"Current Price: {currentprice}")
            st.write(
                "Percentage of days the stock went up in a month: "
                f"{round(monthly_up * 100, 2)}%"
            )

        with col2:
            st.dataframe(yearly_history.iloc[::-1])

        with col3:
            fig, ax = plt.subplots(figsize=(12, 6))
            ax.plot(history.index, history["Close"])
            ax.set_title(f"{stocksym} Stock Prices")
            ax.set_xlabel("Date")
            ax.set_ylabel("Price")
            ax.tick_params(axis="x", labelrotation=45)
            ax.grid(True)
            fig.tight_layout()
            st.pyplot(fig)
            plt.close(fig)