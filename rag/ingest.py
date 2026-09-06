import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_core.tools import tool

from rag.store import embeddings, set_retriever


@tool
def ingest_pdf(file_path: str) -> dict:
    """Load a PDF from disk and index it so rag_tool can answer questions from it."""
    loader = PyPDFLoader(file_path)
    docs = loader.load()

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunks = splitter.split_documents(docs)

    vector_store = FAISS.from_documents(chunks, embeddings)
    set_retriever(vector_store.as_retriever(search_kwargs={"k": 4}))

    return {"filename": os.path.basename(file_path), "chunks": len(chunks)}