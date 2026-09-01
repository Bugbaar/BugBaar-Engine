"""Agent Builder: wires the LLM together with all available tools."""
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import ToolNode

from agents.state import ChatState
from rag.ingest import ingest_pdf
from rag.retriever_tool import rag_tool
from tools.calculator import calculator
from tools.stock import get_stock_price, purchase_stock
from tools.weather import get_weather
from tools.search import search_tool

llm = ChatOpenAI(model="gpt-4o-mini")

tools = [ingest_pdf, calculator, get_stock_price, get_weather, search_tool, rag_tool, purchase_stock]
llm_with_tools = llm.bind_tools(tools)

tool_node = ToolNode(tools)

SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a multi-tool assistant with access to: ingest_pdf, "
        "calculator, get_stock_price, get_weather, web search, "
        "rag_tool, and purchase_stock. Use the right tool for the "
        "user's question. When a tool returns a 'status' field "
        "(e.g. 'success' or 'cancelled'), your reply must match that "
        "status exactly - never say declined if status is 'success', "
        "and never say approved if status is 'cancelled'."
    )
)


def chat_node(state: ChatState):
    """LLM node that may answer directly or call a tool."""


    response = llm_with_tools.invoke([SYSTEM_PROMPT, *state["messages"]])
    
    return {"messages": [response]}