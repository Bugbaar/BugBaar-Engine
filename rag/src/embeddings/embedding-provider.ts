/**
 * Interface defining the contract for embedding generation providers.
 * Decouples the RAG pipeline from specific model vendors (OpenAI, Ollama, HuggingFace, etc.).
 */
export interface EmbeddingProvider {
  /**
   * The fixed vector dimensionality produced by this embedding provider.
   */
  readonly dimension: number;

  /**
   * Name/identifier of the provider (e.g. 'deterministic-hash', 'openai-text-3-small', 'ollama-nomic')
   */
  readonly providerName: string;

  /**
   * Generates a vector embedding for a single query text.
   *
   * @param text - The query string to embed
   * @returns A promise resolving to a dense vector of numbers
   */
  embedQuery(text: string): Promise<number[]>;

  /**
   * Generates vector embeddings for an array of document/chunk texts.
   *
   * @param texts - Array of chunk strings to embed
   * @returns A promise resolving to an array of dense vectors
   */
  embedDocuments(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic, offline embedding provider for development, testing, and local benchmarking.
 * Generates reproducible normalized dense vectors using character n-gram hashing and term frequency.
 * Guarantees semantic sensitivity (similar strings produce higher cosine similarity than disjoint strings)
 * without requiring any external network requests or API keys.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number;
  readonly providerName: string = 'deterministic-hash';

  /**
   * @param dimension - Dimensionality of the output embedding vectors (defaults to 64)
   */
  constructor(dimension: number = 64) {
    if (!Number.isInteger(dimension) || dimension <= 0) {
      throw new Error(`Embedding dimension must be a positive integer, got: ${dimension}`);
    }
    this.dimension = dimension;
  }

  /**
   * Generates embedding vector for a single query text.
   */
  public async embedQuery(text: string): Promise<number[]> {
    return this.generateVector(text);
  }

  /**
   * Generates embedding vectors for a batch of document texts.
   */
  public async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.generateVector(text));
  }

  /**
   * Computes a normalized vector based on character n-grams and token frequencies.
   */
  private generateVector(text: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);
    const cleaned = text.toLowerCase().trim();

    if (cleaned.length === 0) {
      // Return zero-vector if empty
      return vector;
    }

    // Token-based features (words)
    const words = cleaned.split(/\s+/);
    for (const word of words) {
      const hash = this.fnv1aHash(word);
      const index = Math.abs(hash) % this.dimension;
      const sign = (hash & 1) === 0 ? 1 : -1;
      vector[index] += sign * 1.5;
    }

    // Character 3-gram features
    const n = 3;
    if (cleaned.length >= n) {
      for (let i = 0; i <= cleaned.length - n; i++) {
        const gram = cleaned.substring(i, i + n);
        const hash = this.fnv1aHash(gram);
        const index = Math.abs(hash) % this.dimension;
        const sign = (hash & 1) === 0 ? 1 : -1;
        vector[index] += sign * 1.0;
      }
    } else {
      const hash = this.fnv1aHash(cleaned);
      const index = Math.abs(hash) % this.dimension;
      vector[index] += 1.0;
    }

    // Normalize to unit length (L2 norm)
    return this.l2Normalize(vector);
  }

  /**
   * 32-bit FNV-1a hash algorithm for deterministic bucketing.
   */
  private fnv1aHash(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }

  /**
   * Normalizes a vector to unit length (Euclidean L2 norm).
   */
  private l2Normalize(v: number[]): number[] {
    let sumSq = 0;
    for (let i = 0; i < v.length; i++) {
      sumSq += v[i] * v[i];
    }

    const norm = Math.sqrt(sumSq);
    if (norm === 0) {
      return v;
    }

    return v.map((val) => val / norm);
  }
}
