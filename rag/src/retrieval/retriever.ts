import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { VectorStore, ScoredChunk } from './vector-store.js';
import { ContextRanker, DefaultContextRanker } from './context-ranker.js';

/**
 * Options for query retrieval.
 */
export interface RetrievalOptions {
  /** Maximum number of chunks to retrieve (default: 5) */
  topK?: number;
  /** Minimum similarity score threshold (optional) */
  similarityThreshold?: number;
  /** Multiplier for candidate pool size fetched before deduplication/ranking (default: 2) */
  candidateMultiplier?: number;
  /** Optional custom ranker to override the retriever's default ranker */
  ranker?: ContextRanker;
}

/**
 * Interface defining query retrieval contract.
 */
export interface IRetriever {
  /**
   * Retrieves relevant chunks for a text query.
   *
   * @param query - Raw query text
   * @param options - Retrieval parameters (topK, threshold, etc.)
   * @returns Array of scored chunks
   */
  retrieve(query: string, options?: RetrievalOptions): Promise<ScoredChunk[]>;
}

function normalizePositiveInt(value: number | undefined, defaultValue: number): number {
  if (value === undefined || typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.max(1, Math.floor(value));
}

/**
 * Modular Retriever that coordinates embedding generation, vector similarity search, and context ranking.
 */
export class Retriever implements IRetriever {
  private embeddingProvider: EmbeddingProvider;
  private vectorStore: VectorStore;
  private defaultRanker: ContextRanker;

  /**
   * @param embeddingProvider - Embedding provider used to vectorize user queries
   * @param vectorStore - Vector store holding document chunks
   * @param ranker - Optional context ranker (defaults to DefaultContextRanker)
   */
  constructor(
    embeddingProvider: EmbeddingProvider,
    vectorStore: VectorStore,
    ranker?: ContextRanker
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.defaultRanker = ranker ?? new DefaultContextRanker();
  }

  /**
   * Retrieves relevant context chunks for a query string.
   */
  public async retrieve(
    query: string,
    options?: RetrievalOptions
  ): Promise<ScoredChunk[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const topK = normalizePositiveInt(options?.topK, 5);
    const similarityThreshold = options?.similarityThreshold;
    const candidateMultiplier = normalizePositiveInt(options?.candidateMultiplier, 2);
    const candidateLimit = topK * candidateMultiplier;
    const ranker = options?.ranker ?? this.defaultRanker;

    // 1. Embed query
    const queryVector = await this.embeddingProvider.embedQuery(query);

    // 2. Vector search - fetch wider candidate pool
    const retrievedChunks = await this.vectorStore.search(
      queryVector,
      candidateLimit,
      similarityThreshold
    );

    if (retrievedChunks.length === 0) {
      return [];
    }

    // 3. Context ranking / refinement (deduplication, tiebreak, final topK slice)
    const rankedChunks = await ranker.rank(retrievedChunks, query, {
      maxResults: topK,
      minScore: similarityThreshold,
    });

    return rankedChunks;
  }
}
