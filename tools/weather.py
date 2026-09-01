import requests
from langchain_core.tools import tool


@tool
def get_weather(city: str) -> dict:
    """Fetch the current weather for a given city name."""
    url = f"https://wttr.in/{city}?format=j1"
    data = requests.get(url).json()
    current = data["current_condition"][0]
    return {
        "city": city,
        "temperature_C": current["temp_C"],
        "condition": current["weatherDesc"][0]["value"],
    }