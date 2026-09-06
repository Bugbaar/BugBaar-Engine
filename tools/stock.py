import os
import requests
from langchain_core.tools import tool
from langgraph.types import interrupt

API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "demo")


@tool
def get_stock_price(symbol: str) -> dict:
    """Fetch the latest stock price for a given symbol (e.g. 'AAPL')."""
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={API_KEY}"
    return requests.get(url , timeout=10).json()


@tool
def purchase_stock(symbol: str, quantity: int) -> dict:
    """
    Simulate purchasing a given quantity of a stock symbol.

    HUMAN-IN-THE-LOOP:
    Before confirming the purchase, this tool will interrupt
    and wait for a human decision ("yes" / anything else).
    """
    if quantity <= 0:
        return {
            "status": "error",
            "message": "Quantity must be positive."}

    decision = interrupt({
        "type": "approval",
        "reason": f"Approve buying {quantity} shares of {symbol}?"})

    if isinstance(decision, str) and decision.lower() == "yes":
        return {
            "status": "success",
            "message": f"Purchased {quantity} shares of {symbol} was approved."}
    else:
        return {
            "status": "cancelled",
            "message": f"Purchase of {quantity} shares of {symbol} was declined by human."}