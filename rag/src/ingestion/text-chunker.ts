import {
  Document,
  DocumentChunk,
  ChunkMetadata,
  TextChunkerConfig,
} from './document-types.js';

/**
 * Interface defining text chunking behavior.
 */
export interface ITextChunker {
  /**
   * Chunks a document into an array of DocumentChunk objects.
   *
   * @param document - Raw input document
   * @returns Array of segmented document chunks
   */
  chunkDocument(document: Document): DocumentChunk[];

  /**
   * Chunks raw text into an array of DocumentChunk objects.
   *
   * @param text - Raw text to split
   * @param documentId - Associated document ID (defaults to 'anonymous_doc')
   * @param baseMetadata - Optional additional metadata to attach to chunks
   * @returns Array of segmented document chunks
   */
  chunkText(
    text: string,
    documentId?: string,
    baseMetadata?: Partial<ChunkMetadata>
  ): DocumentChunk[];
}

/**
 * Production-ready configurable text chunker supporting character and word-window strategies.
 * Guarantees deterministic chunk boundaries, strict configuration validation, and metadata preservation.
 */
export class TextChunker implements ITextChunker {
  readonly chunkSize: number;
  readonly chunkOverlap: number;
  readonly strategy: 'character' | 'word';

  /**
   * Creates an instance of TextChunker.
   *
   * @param config - Chunking configuration options
   * @throws Error if configuration parameters are invalid
   */
  constructor(config: TextChunkerConfig) {
    this.validateConfig(config);
    this.chunkSize = config.chunkSize;
    this.chunkOverlap = config.chunkOverlap;
    this.strategy = config.strategy ?? 'character';
  }

  /**
   * Validates chunker configuration values.
   */
  private validateConfig(config: TextChunkerConfig): void {
    if (!Number.isInteger(config.chunkSize) || config.chunkSize <= 0) {
      throw new Error(
        `Invalid chunkSize: ${config.chunkSize}. chunkSize must be a positive integer.`
      );
    }

    if (!Number.isInteger(config.chunkOverlap) || config.chunkOverlap < 0) {
      throw new Error(
        `Invalid chunkOverlap: ${config.chunkOverlap}. chunkOverlap must be a non-negative integer.`
      );
    }

    if (config.chunkOverlap >= config.chunkSize) {
      throw new Error(
        `Invalid configuration: chunkOverlap (${config.chunkOverlap}) must be strictly less than chunkSize (${config.chunkSize}).`
      );
    }
  }

  /**
   * Chunks a complete Document into DocumentChunk items preserving all metadata.
   */
  public chunkDocument(document: Document): DocumentChunk[] {
    if (!document.content || document.content.trim().length === 0) {
      return [];
    }

    const baseMetadata: Partial<ChunkMetadata> = {
      documentId: document.id,
      documentName: document.title,
      source: document.source,
      pageNumber: document.metadata?.pageNumber,
      createdAt: document.metadata?.createdAt ?? new Date().toISOString(),
      ...(document.metadata ?? {}),
    };

    return this.chunkText(document.content, document.id, baseMetadata);
  }

  /**
   * Chunks raw text into DocumentChunk items.
   */
  public chunkText(
    text: string,
    documentId: string = 'anonymous_doc',
    baseMetadata: Partial<ChunkMetadata> = {}
  ): DocumentChunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    if (this.strategy === 'word') {
      return this.chunkByWords(text, documentId, baseMetadata);
    }

    return this.chunkByCharacters(text, documentId, baseMetadata);
  }

  /**
   * Character-based sliding window chunking.
   */
  private chunkByCharacters(
    text: string,
    documentId: string,
    baseMetadata: Partial<ChunkMetadata>
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const step = this.chunkSize - this.chunkOverlap;
    let chunkIndex = 0;

    for (let start = 0; start < text.length; start += step) {
      const end = Math.min(start + this.chunkSize, text.length);
      const chunkText = text.substring(start, end);

      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      const metadata: ChunkMetadata = {
        ...baseMetadata,
        documentId,
        chunkIndex,
        startCharIndex: start,
        endCharIndex: end,
      };

      chunks.push({
        id: chunkId,
        documentId,
        content: chunkText,
        chunkIndex,
        source: metadata.source,
        documentName: metadata.documentName ?? metadata.title,
        pageNumber: metadata.pageNumber,
        metadata,
      });

      chunkIndex++;

      // If we reached the end of the text, break
      if (end >= text.length) {
        break;
      }
    }

    return chunks;
  }

  /**
   * Word-based sliding window chunking.
   */
  private chunkByWords(
    text: string,
    documentId: string,
    baseMetadata: Partial<ChunkMetadata>
  ): DocumentChunk[] {
    // Match word tokens while tracking character indices in original text
    const wordMatches = [...text.matchAll(/\S+/g)];
    if (wordMatches.length === 0) {
      return [];
    }

    const chunks: DocumentChunk[] = [];
    const step = this.chunkSize - this.chunkOverlap;
    let chunkIndex = 0;

    for (let start = 0; start < wordMatches.length; start += step) {
      const end = Math.min(start + this.chunkSize, wordMatches.length);
      const firstWordMatch = wordMatches[start]!;
      const lastWordMatch = wordMatches[end - 1]!;

      const startCharIndex = firstWordMatch.index ?? 0;
      const endCharIndex = (firstWordMatch.index ?? 0) === 0 && lastWordMatch.index === undefined
        ? text.length
        : (lastWordMatch.index ?? 0) + lastWordMatch[0].length;

      const chunkText = text.substring(startCharIndex, endCharIndex);

      const chunkId = `${documentId}_chunk_${chunkIndex}`;
      const metadata: ChunkMetadata = {
        ...baseMetadata,
        documentId,
        chunkIndex,
        startCharIndex,
        endCharIndex,
      };

      chunks.push({
        id: chunkId,
        documentId,
        content: chunkText,
        chunkIndex,
        source: metadata.source,
        documentName: metadata.documentName ?? metadata.title,
        pageNumber: metadata.pageNumber,
        metadata,
      });

      chunkIndex++;

      if (end >= wordMatches.length) {
        break;
      }
    }

    return chunks;
  }
}
