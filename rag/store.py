"""Shared vector store state for the RAG engine."""
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

# Holds the active FAISS retriever after a PDF is ingested.
_retriever = None


def set_retriever(retriever):
    global _retriever
    _retriever = retriever


def get_retriever():
    return _retriever