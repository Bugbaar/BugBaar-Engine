# Multi-Tool LangGraph Agent (Agent Builder + Tool Integration + RAG Engine)

This contribution adds a backend AI agent built with **LangGraph** and **LangChain**, covering three modules from the BugBaar Engine roadmap in one working example:

- **Agent Builder** — a tool-calling agent orchestrated as a LangGraph state graph
- **Tool Integration** — five working tools wired into the agent
- **RAG Engine** — PDF ingestion and retrieval-augmented answering

## Features

- 🌦️ **Weather Tool** — current weather for any city (via wttr.in)
- 📈 **Stock Price Tool** — live stock price lookup
- 🛒 **Stock Purchase Tool** — human-in-the-loop approval flow using LangGraph `interrupt()` (the agent pauses and asks for explicit yes/no confirmation before "purchasing")
- 🧮 **Calculator Tool** — basic arithmetic evaluation
- 🔍 **Web Search Tool** — DuckDuckGo search integration
- 📄 **PDF RAG Tool** — ingest a PDF and answer questions grounded in its content, using FAISS + embeddings

## Project Structure

```
bugbaar-engine/
├── agents/
│   ├── state.py         # Shared conversation state (ChatState)
│   └── agent.py         # LLM setup, tool binding, chat node
├── tools/
│   ├── calculator.py
│   ├── stock.py          # get_stock_price + purchase_stock (interrupt-based)
│   ├── weather.py
│   └── search.py
├── rag/
│   ├── store.py          # shared embeddings/retriever accessors
│   ├── ingest.py         # ingest_pdf tool
│   └── retriever_tool.py # rag_tool
├── workflows/
│   └── graph.py          # StateGraph assembly + compiled workflow
├── api/
│   └── mainonly.py           # entry point / run loop
├── requirement.txt
└── .env.example
```

## Setup

1. Clone this repo and navigate into the project folder.
2. Create and activate a virtual environment:
   ```bash
   python -m venv agenv
   agenv\Scripts\activate      # Windows
   source agenv/bin/activate   # macOS/Linux
   ```
3. Install dependencies:
   ```bash
   pip install -r requirement.txt
   ```
4. Copy `.env.example` to `.env` and fill in your API keys:
   ```
   OPENAI_API_KEY=your_key_here
   ALPHA_VANTAGE_API_KEY=your_key_here
   ```

## Running the Agent

Run as a module from the project root (not as a direct file path), so relative imports resolve correctly:

```bash
python -m api.mainonly
```

You'll get an interactive chat loop. Example prompts to try:

- `What's the weather in Delhi?`
- `Calculate 45 * 12 + 8`
- `Search the web for latest LangGraph updates`
- `What's the stock price of AAPL?`
- `Buy 10 shares of AAPL` → agent will pause and ask for your approval before confirming the purchase
- `Ingest the PDF at /path/to/file.pdf` followed by `What does this document say about X?`

## Design Notes

- **Checkpointer:** Uses LangGraph's in-memory `MemorySaver` for simplicity in this example. It can be swapped for `SqliteSaver` or `PostgresSaver` with a one-line change for persistent memory across sessions.
- **Human-in-the-loop:** The `purchase_stock` tool demonstrates LangGraph's `interrupt()`/`Command(resume=...)` pattern — the graph pauses mid-execution, surfaces the pending action to the user, and resumes only after explicit approval.
- **RAG:** PDF ingestion and retrieval share a single retriever instance (`rag/store.py`) so the ingest and query tools stay in sync within a conversation thread.

## Status

Working example covering Agent Builder, Tool Integration, and RAG Engine modules as described in the project README. Feedback welcome.