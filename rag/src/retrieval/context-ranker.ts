import { ScoredChunk } from './vector-store.js';

/**
 * Configuration options for context ranking.
 */
export interface ContextRankerOptions {
  /** Whether to deduplicate retrieved chunks with identical text content (default: true) */
  deduplicate?: boolean;
  /** Maximum number of chunks to keep after ranking */
  maxResults?: number;
  /** Optional minimum score cutoff */
  minScore?: number;
}

/**
 * Interface defining contract for ranking and post-processing retrieved chunks.
 * Enables plugging in cross-encoders, BM25 hybrid fusion, or recency weighting.
 */
export interface ContextRanker {
  /**
   * Reranks and refines a list of retrieved scored chunks.
   *
   * @param chunks - Initial retrieved chunks
   * @param query - User query string
   * @param options - Additional ranking options
   * @returns Reranked array of scored chunks
   */
  rank(
    chunks: ScoredChunk[],
    query: string,
    options?: ContextRankerOptions
  ): Promise<ScoredChunk[]>;
}

/**
 * Default deterministic context ranker.
 * Provides deterministic score ordering with tiebreaking and content deduplication.
 */
export class DefaultContextRanker implements ContextRanker {
  private defaultOptions: ContextRankerOptions;

  constructor(defaultOptions: ContextRankerOptions = {}) {
    this.defaultOptions = {
      deduplicate: true,
      ...defaultOptions,
    };
  }

  /**
   * Ranks scored chunks deterministically.
   */
  public async rank(
    chunks: ScoredChunk[],
    _query: string,
    options?: ContextRankerOptions
  ): Promise<ScoredChunk[]> {
    const opts = { ...this.defaultOptions, ...options };

    if (chunks.length === 0) {
      return [];
    }

    let processed = [...chunks];

    // Filter by minScore if specified
    if (opts.minScore !== undefined) {
      processed = processed.filter((item) => item.score >= opts.minScore!);
    }

    // Deduplicate if enabled
    if (opts.deduplicate) {
      const seenContents = new Set<string>();
      const deduplicated: ScoredChunk[] = [];

      for (const item of processed) {
        const normalizedContent = item.chunk.content.trim().toLowerCase();
        if (!seenContents.has(normalizedContent)) {
          seenContents.add(normalizedContent);
          deduplicated.push(item);
        }
      }
      processed = deduplicated;
    }

    // Deterministic sort: score desc, then documentId asc, then chunkIndex asc
    processed.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-6) {
        return b.score - a.score;
      }
      if (a.chunk.documentId !== b.chunk.documentId) {
        return a.chunk.documentId.localeCompare(b.chunk.documentId);
      }
      return a.chunk.chunkIndex - b.chunk.chunkIndex;
    });

    if (opts.maxResults !== undefined && opts.maxResults > 0) {
      return processed.slice(0, opts.maxResults);
    }

    return processed;
  }
}
