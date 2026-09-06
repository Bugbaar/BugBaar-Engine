from langchain_core.tools import tool

from rag.store import get_retriever


@tool
def rag_tool(query: str) -> dict:
    """Answer a question using the previously ingested PDF."""
    retriever = get_retriever()
    if retriever is None:
        return {"error": "No document ingested yet. Call ingest_pdf first."}
    docs = retriever.invoke(query)
    return {"context": [doc.page_content for doc in docs]}