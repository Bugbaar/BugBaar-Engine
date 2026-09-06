/**
 * BugBaar RAG Engine Foundation Entry Point
 *
 * Provides a modular, provider-agnostic framework for document chunking,
 * vector storage, similarity search, prompt injection prevention, and context ranking.
 */

// Ingestion & Document Types
export {
  Document,
  DocumentChunk,
  DocumentMetadata,
  ChunkMetadata,
  TextChunkerConfig,
} from './ingestion/document-types.js';

export {
  ITextChunker,
  TextChunker,
} from './ingestion/text-chunker.js';

// Embeddings
export {
  EmbeddingProvider,
  DeterministicEmbeddingProvider,
} from './embeddings/embedding-provider.js';

// Retrieval & Vector Store
export {
  VectorStore,
  VectorRecord,
  ScoredChunk,
  InMemoryVectorStore,
  cosineSimilarity,
} from './retrieval/vector-store.js';

export {
  ContextRanker,
  ContextRankerOptions,
  DefaultContextRanker,
} from './retrieval/context-ranker.js';

export {
  IRetriever,
  Retriever,
  RetrievalOptions,
} from './retrieval/retriever.js';

// Safety & Prompt Injection
export {
  PromptInjectionDetector,
  PromptInjectionResult,
  RuleBasedInjectionDetector,
} from './safety/prompt-injection.js';

// Pipeline
export {
  RagPipeline,
  RagPipelineConfig,
  RagQueryOptions,
  RagContextResult,
  RagQueryResult,
  GenerationProvider,
} from './pipeline/rag-pipeline.js';

/**
 * Health check function verifying the RAG module is loaded.
 */
export function healthCheck(): string {
  return 'BugBaar RAG engine is ready';
}
