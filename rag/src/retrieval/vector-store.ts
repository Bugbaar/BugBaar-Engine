import { DocumentChunk } from '../ingestion/document-types.js';

/**
 * Record stored within a vector store containing the document chunk and its embedding vector.
 */
export interface VectorRecord {
  /** Unique chunk ID */
  id: string;
  /** Complete chunk object with metadata */
  chunk: DocumentChunk;
  /** Dense embedding vector */
  vector: number[];
}

/**
 * Document chunk paired with its calculated similarity/relevance score.
 */
export interface ScoredChunk {
  /** The retrieved document chunk */
  chunk: DocumentChunk;
  /** Computed similarity score (e.g., cosine similarity [-1.0, 1.0] or [0.0, 1.0]) */
  score: number;
}

/**
 * Interface defining contract for vector storage and retrieval.
 */
export interface VectorStore {
  /** Expected dimensionality for vectors stored in this store (optional check) */
  readonly dimension?: number;

  /**
   * Adds or updates vector records in the store.
   *
   * @param records - Vector records containing chunks and their embedding vectors
   */
  addVectors(records: VectorRecord[]): Promise<void>;

  /**
   * Performs similarity search over stored vectors using the provided query vector.
   *
   * @param queryVector - Embedding vector representing the query
   * @param topK - Maximum number of top matching chunks to retrieve
   * @param minScore - Optional minimum similarity threshold
   * @returns Array of scored chunks sorted in descending order of similarity
   */
  search(queryVector: number[], topK: number, minScore?: number): Promise<ScoredChunk[]>;

  /**
   * Deletes all chunks associated with a specific document ID.
   *
   * @param documentId - Identifier of the document whose chunks should be deleted
   * @returns Number of chunks deleted
   */
  deleteDocument(documentId: string): Promise<number>;

  /**
   * Deletes a single chunk by its chunk ID.
   *
   * @param chunkId - Identifier of the chunk to remove
   * @returns True if the chunk was found and removed, false otherwise
   */
  deleteChunk(chunkId: string): Promise<boolean>;

  /**
   * Clears all stored vectors.
   */
  clear(): Promise<void>;

  /**
   * Returns the total count of vector records currently in the store.
   */
  count(): Promise<number>;
}

/**
 * Computes cosine similarity between two numeric vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between -1.0 and 1.0 (or 0 if zero vector)
 * @throws Error if vector dimensions do not match
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Dimension mismatch in cosine similarity: vector 'a' has dimension ${a.length} but vector 'b' has dimension ${b.length}.`
    );
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory vector store implementation designed for local development, testing, and embedded RAG pipelines.
 * Enforces strict vector dimension validation and calculates exact cosine similarity.
 */
export class InMemoryVectorStore implements VectorStore {
  private records: Map<string, VectorRecord> = new Map();
  readonly dimension?: number;

  /**
   * @param dimension - Optional expected vector dimension to enforce for all stored and searched vectors
   */
  constructor(dimension?: number) {
    if (dimension !== undefined) {
      if (!Number.isInteger(dimension) || dimension <= 0) {
        throw new Error(`Invalid vector store dimension: ${dimension}. Must be a positive integer.`);
      }
      this.dimension = dimension;
    }
  }

  /**
   * Adds or updates records in the vector store.
   * Validates vector dimensions against expected dimension or existing records.
   */
  public async addVectors(records: VectorRecord[]): Promise<void> {
    for (const record of records) {
      if (!record.id) {
        throw new Error('Vector record must have a non-empty id.');
      }
      if (!record.vector || !Array.isArray(record.vector)) {
        throw new Error(`Vector record ${record.id} must have a numeric vector array.`);
      }

      // Check configured dimension
      if (this.dimension !== undefined && record.vector.length !== this.dimension) {
        throw new Error(
          `Vector dimension mismatch for record ${record.id}: expected ${this.dimension}, got ${record.vector.length}.`
        );
      }

      this.records.set(record.id, record);
    }
  }

  /**
   * Searches for topK most similar chunks based on cosine similarity.
   */
  public async search(
    queryVector: number[],
    topK: number,
    minScore?: number
  ): Promise<ScoredChunk[]> {
    if (!Array.isArray(queryVector)) {
      throw new Error('queryVector must be an array of numbers.');
    }

    if (!Number.isInteger(topK) || topK <= 0) {
      throw new Error(`topK must be a positive integer, got: ${topK}`);
    }

    if (this.dimension !== undefined && queryVector.length !== this.dimension) {
      throw new Error(
        `Query vector dimension mismatch: expected ${this.dimension}, got ${queryVector.length}.`
      );
    }

    if (this.records.size === 0) {
      return [];
    }

    const scored: ScoredChunk[] = [];

    for (const record of this.records.values()) {
      if (record.vector.length !== queryVector.length) {
        throw new Error(
          `Vector dimension mismatch: stored vector has dimension ${record.vector.length}, query has dimension ${queryVector.length}.`
        );
      }

      const score = cosineSimilarity(queryVector, record.vector);

      if (minScore !== undefined && score < minScore) {
        continue;
      }

      scored.push({
        chunk: record.chunk,
        score,
      });
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  /**
   * Deletes all chunks belonging to a document ID.
   */
  public async deleteDocument(documentId: string): Promise<number> {
    let deletedCount = 0;
    for (const [id, record] of this.records.entries()) {
      if (record.chunk.documentId === documentId) {
        this.records.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  /**
   * Deletes a single chunk by chunk ID.
   */
  public async deleteChunk(chunkId: string): Promise<boolean> {
    return this.records.delete(chunkId);
  }

  /**
   * Clears all stored records.
   */
  public async clear(): Promise<void> {
    this.records.clear();
  }

  /**
   * Returns current count of stored vectors.
   */
  public async count(): Promise<number> {
    return this.records.size;
  }
}
