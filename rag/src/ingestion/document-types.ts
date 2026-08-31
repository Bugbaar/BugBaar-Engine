/**
 * Represents metadata attached to an ingested document.
 */
export interface DocumentMetadata {
  /** Source origin or file path of the document */
  source?: string;
  /** Document title or friendly name */
  title?: string;
  /** Page number if applicable */
  pageNumber?: number;
  /** Creation or ingestion timestamp (ISO 8601 string) */
  createdAt?: string;
  /** Arbitrary custom metadata properties */
  [key: string]: unknown;
}

/**
 * Raw document input model before chunking and embedding.
 */
export interface Document {
  /** Unique document identifier */
  id: string;
  /** Raw text content of the document */
  content: string;
  /** Title or human-readable name of the document */
  title?: string;
  /** Source URI, file path, or reference */
  source?: string;
  /** Structured metadata associated with the document */
  metadata?: DocumentMetadata;
}

/**
 * Metadata specifically attached to an individual chunk.
 */
export interface ChunkMetadata extends DocumentMetadata {
  /** Identifier of the parent document */
  documentId: string;
  /** Name/title of the parent document */
  documentName?: string;
  /** 0-indexed position of this chunk within the parent document */
  chunkIndex: number;
  /** Start character index in the parent document content */
  startCharIndex?: number;
  /** End character index in the parent document content */
  endCharIndex?: number;
}

/**
 * Represents a segmented chunk of text produced by a chunker.
 */
export interface DocumentChunk {
  /** Unique identifier for this chunk (e.g. `doc_123_chunk_0`) */
  id: string;
  /** Identifier of the parent document */
  documentId: string;
  /** Text content of this specific chunk */
  content: string;
  /** 0-indexed position of this chunk within the parent document */
  chunkIndex: number;
  /** Source identifier or origin URI */
  source?: string;
  /** Name/title of the parent document */
  documentName?: string;
  /** Page number if known */
  pageNumber?: number;
  /** Full chunk metadata including parent attributes */
  metadata: ChunkMetadata;
}

/**
 * Configuration options for text chunking.
 */
export interface TextChunkerConfig {
  /** Maximum number of characters or words per chunk */
  chunkSize: number;
  /** Number of characters or words to overlap between consecutive chunks */
  chunkOverlap: number;
  /** Strategy to split text ('character' or 'word', defaults to 'character') */
  strategy?: 'character' | 'word';
}
