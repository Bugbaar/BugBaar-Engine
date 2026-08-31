import { Document, DocumentChunk, TextChunkerConfig } from '../ingestion/document-types.js';
import { ITextChunker, TextChunker } from '../ingestion/text-chunker.js';
import { EmbeddingProvider } from '../embeddings/embedding-provider.js';
import { VectorStore, VectorRecord, ScoredChunk } from '../retrieval/vector-store.js';
import { IRetriever, Retriever, RetrievalOptions } from '../retrieval/retriever.js';
import { ContextRanker } from '../retrieval/context-ranker.js';
import {
  PromptInjectionDetector,
  PromptInjectionResult,
  RuleBasedInjectionDetector,
} from '../safety/prompt-injection.js';

/**
 * Optional generation provider interface to decouple LLM generation from the core pipeline.
 */
export interface GenerationProvider {
  /**
   * Generates a response given a query and formatted retrieved context.
   */
  generate(query: string, context: string): Promise<string>;
}

/**
 * Configuration options for initializing a RagPipeline instance.
 */
export interface RagPipelineConfig {
  /** Embedding provider implementation */
  embeddingProvider: EmbeddingProvider;
  /** Vector store implementation */
  vectorStore: VectorStore;
  /** Custom text chunker or configuration (defaults to character chunker with size 500, overlap 50) */
  chunker?: ITextChunker | TextChunkerConfig;
  /** Custom retriever or defaults to standard Retriever */
  retriever?: IRetriever;
  /** Optional custom context ranker */
  ranker?: ContextRanker;
  /** Optional custom prompt injection safety detector */
  safetyDetector?: PromptInjectionDetector;
  /** Optional generation provider */
  generationProvider?: GenerationProvider;
}

/**
 * Options when querying the RAG pipeline.
 */
export interface RagQueryOptions extends RetrievalOptions {
  /**
   * Whether to block retrieval if prompt injection is detected.
   * Default: true
   */
  blockOnUnsafe?: boolean;
}

/**
 * Structured output returned from a pipeline context retrieval.
 */
export interface RagContextResult {
  /** Original user query */
  query: string;
  /** Retrieved scored chunks */
  chunks: ScoredChunk[];
  /** Combined formatted context string ready for LLM prompt insertion */
  formattedContext: string;
  /** Safety evaluation result for the query */
  safety: PromptInjectionResult;
}

/**
 * Complete result of querying the RAG pipeline, including optional generated response.
 */
export interface RagQueryResult extends RagContextResult {
  /** Generated answer text if a generation provider is configured */
  response?: string;
}

/**
 * Production-oriented, modular RAG (Retrieval-Augmented Generation) Pipeline.
 * Orchestrates document chunking, embeddings, vector indexing, safety inspection,
 * retrieval, and context assembly.
 */
export class RagPipeline {
  readonly chunker: ITextChunker;
  readonly embeddingProvider: EmbeddingProvider;
  readonly vectorStore: VectorStore;
  readonly retriever: IRetriever;
  readonly safetyDetector: PromptInjectionDetector;
  readonly generationProvider?: GenerationProvider;

  constructor(config: RagPipelineConfig) {
    this.embeddingProvider = config.embeddingProvider;
    this.vectorStore = config.vectorStore;

    // Resolve chunker
    if (config.chunker) {
      if ('chunkDocument' in config.chunker) {
        this.chunker = config.chunker;
      } else {
        this.chunker = new TextChunker(config.chunker);
      }
    } else {
      this.chunker = new TextChunker({ chunkSize: 500, chunkOverlap: 50 });
    }

    // Resolve safety detector
    this.safetyDetector = config.safetyDetector ?? new RuleBasedInjectionDetector();

    // Resolve retriever
    this.retriever =
      config.retriever ??
      new Retriever(this.embeddingProvider, this.vectorStore, config.ranker);

    this.generationProvider = config.generationProvider;
  }

  /**
   * Ingests a single document by chunking it, generating embeddings, and storing them in the vector store.
   *
   * @param document - Input document to index
   * @returns Array of created document chunks
   */
  public async ingestDocument(document: Document): Promise<DocumentChunk[]> {
    const chunks = this.chunker.chunkDocument(document);
    if (chunks.length === 0) {
      return [];
    }

    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await this.embeddingProvider.embedDocuments(chunkTexts);

    const records: VectorRecord[] = chunks.map((chunk, index) => {
      const vector = embeddings[index];
      if (!vector) {
        throw new Error(`Failed to generate embedding for chunk ${chunk.id}`);
      }
      return {
        id: chunk.id,
        chunk,
        vector,
      };
    });

    await this.vectorStore.addVectors(records);
    return chunks;
  }

  /**
   * Batch ingests multiple documents.
   *
   * @param documents - Array of documents to index
   * @returns Array of all created chunks
   */
  public async ingestDocuments(documents: Document[]): Promise<DocumentChunk[]> {
    const allChunks: DocumentChunk[] = [];
    for (const doc of documents) {
      const chunks = await this.ingestDocument(doc);
      allChunks.push(...chunks);
    }
    return allChunks;
  }

  /**
   * Evaluates query safety, embeds query, searches vector store, and formats context.
   *
   * @param query - Search query text
   * @param options - Query and safety options
   * @returns Structured context result
   */
  public async retrieveContext(
    query: string,
    options?: RagQueryOptions
  ): Promise<RagContextResult> {
    const blockOnUnsafe = options?.blockOnUnsafe ?? true;

    // 1. Safety check
    const safety = await this.safetyDetector.check(query);

    if (!safety.isSafe && blockOnUnsafe) {
      return {
        query,
        chunks: [],
        formattedContext: '',
        safety,
      };
    }

    // 2. Retrieval & Ranking
    const chunks = await this.retriever.retrieve(query, options);

    // 3. Format context string
    const formattedContext = this.formatContext(chunks);

    return {
      query,
      chunks,
      formattedContext,
      safety,
    };
  }

  /**
   * Queries the RAG pipeline and optionally invokes generation if a generation provider is configured.
   */
  public async query(
    query: string,
    options?: RagQueryOptions
  ): Promise<RagQueryResult> {
    const contextResult = await this.retrieveContext(query, options);

    let response: string | undefined;
    if (this.generationProvider && contextResult.safety.isSafe) {
      response = await this.generationProvider.generate(
        query,
        contextResult.formattedContext
      );
    }

    return {
      ...contextResult,
      response,
    };
  }

  /**
   * Removes all indexed chunks belonging to a document ID.
   */
  public async deleteDocument(documentId: string): Promise<number> {
    return this.vectorStore.deleteDocument(documentId);
  }

  /**
   * Clears the underlying vector store.
   */
  public async clear(): Promise<void> {
    await this.vectorStore.clear();
  }

  /**
   * Helper function to format retrieved chunks into a standardized context block for prompt templates.
   */
  public formatContext(chunks: ScoredChunk[]): string {
    if (chunks.length === 0) {
      return '';
    }

    return chunks
      .map((item, idx) => {
        const sourceInfo = item.chunk.source
          ? ` (Source: ${item.chunk.source})`
          : item.chunk.documentName
          ? ` (Doc: ${item.chunk.documentName})`
          : '';
        return `[Context ${idx + 1}${sourceInfo}]\n${item.chunk.content}`;
      })
      .join('\n\n');
  }
}
