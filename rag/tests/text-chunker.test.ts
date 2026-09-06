import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TextChunker } from '../src/ingestion/text-chunker.js';
import { Document } from '../src/ingestion/document-types.js';

describe('TextChunker', () => {
  it('should validate chunking configuration', () => {
    // Zero or negative chunkSize
    assert.throws(
      () => new TextChunker({ chunkSize: 0, chunkOverlap: 0 }),
      /Invalid chunkSize/
    );
    assert.throws(
      () => new TextChunker({ chunkSize: -5, chunkOverlap: 0 }),
      /Invalid chunkSize/
    );

    // Negative chunkOverlap
    assert.throws(
      () => new TextChunker({ chunkSize: 100, chunkOverlap: -1 }),
      /Invalid chunkOverlap/
    );

    // Overlap >= chunkSize
    assert.throws(
      () => new TextChunker({ chunkSize: 50, chunkOverlap: 50 }),
      /chunkOverlap \(50\) must be strictly less than chunkSize \(50\)/
    );
    assert.throws(
      () => new TextChunker({ chunkSize: 50, chunkOverlap: 60 }),
      /chunkOverlap \(60\) must be strictly less than chunkSize \(50\)/
    );
  });

  it('should handle empty or whitespace-only documents gracefully', () => {
    const chunker = new TextChunker({ chunkSize: 50, chunkOverlap: 10 });

    const emptyDoc: Document = { id: 'doc1', content: '' };
    const wsDoc: Document = { id: 'doc2', content: '   \n\t  ' };

    assert.deepEqual(chunker.chunkDocument(emptyDoc), []);
    assert.deepEqual(chunker.chunkDocument(wsDoc), []);
    assert.deepEqual(chunker.chunkText(''), []);
    assert.deepEqual(chunker.chunkText('   '), []);
  });

  it('should segment text into deterministic chunks with character strategy', () => {
    const chunker = new TextChunker({
      chunkSize: 10,
      chunkOverlap: 3,
      strategy: 'character',
    });
    const text = 'abcdefghijklmno'; // length 15
    // step = 10 - 3 = 7
    // chunk 0: [0, 10] -> "abcdefghij"
    // chunk 1: [7, 15] -> "hijklmno"

    const chunks = chunker.chunkText(text, 'test_doc');
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.content, 'abcdefghij');
    assert.equal(chunks[0]?.chunkIndex, 0);
    assert.equal(chunks[0]?.documentId, 'test_doc');
    assert.equal(chunks[0]?.metadata.startCharIndex, 0);
    assert.equal(chunks[0]?.metadata.endCharIndex, 10);

    assert.equal(chunks[1]?.content, 'hijklmno');
    assert.equal(chunks[1]?.chunkIndex, 1);
    assert.equal(chunks[1]?.metadata.startCharIndex, 7);
    assert.equal(chunks[1]?.metadata.endCharIndex, 15);
  });

  it('should preserve document metadata across chunks', () => {
    const chunker = new TextChunker({ chunkSize: 20, chunkOverlap: 5 });
    const doc: Document = {
      id: 'doc_42',
      title: 'Architecture Guide',
      source: 'docs/architecture.md',
      content: 'BugBaar Engine is an open-source platform for building AI applications.',
      metadata: {
        pageNumber: 1,
        author: 'BugBaar Team',
      },
    };

    const chunks = chunker.chunkDocument(doc);
    assert.ok(chunks.length > 1);

    for (const chunk of chunks) {
      assert.equal(chunk.documentId, 'doc_42');
      assert.equal(chunk.documentName, 'Architecture Guide');
      assert.equal(chunk.source, 'docs/architecture.md');
      assert.equal(chunk.pageNumber, 1);
      assert.equal(chunk.metadata.author, 'BugBaar Team');
      assert.ok(chunk.id.startsWith('doc_42_chunk_'));
    }
  });

  it('should segment text into deterministic chunks with word strategy and accurate character offsets', () => {
    const chunker = new TextChunker({
      chunkSize: 4,
      chunkOverlap: 1,
      strategy: 'word',
    });
    const text = 'One two three four five six seven';
    // 7 words
    // step = 4 - 1 = 3
    // chunk 0: words 0..4: "One two three four"
    // chunk 1: words 3..7: "four five six seven"

    const chunks = chunker.chunkText(text, 'word_doc');
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.content, 'One two three four');
    assert.equal(chunks[0]?.metadata.startCharIndex, 0);
    assert.equal(chunks[0]?.metadata.endCharIndex, 18);

    assert.equal(chunks[1]?.content, 'four five six seven');
    assert.equal(chunks[1]?.metadata.startCharIndex, 14);
    assert.equal(chunks[1]?.metadata.endCharIndex, 33);
  });

  it('should handle word chunking with tabs, multiple newlines, and punctuation', () => {
    const chunker = new TextChunker({
      chunkSize: 3,
      chunkOverlap: 1,
      strategy: 'word',
    });
    const text = 'Heading:\n\n\tItem 1.\n\tItem 2!\n\tItem 3?';
    // Words: ["Heading:", "Item", "1.", "Item", "2!", "Item", "3?"] (7 words)
    const chunks = chunker.chunkText(text, 'formatted_doc');

    assert.ok(chunks.length >= 2);
    for (const chunk of chunks) {
      assert.ok(chunk.metadata.startCharIndex !== undefined);
      assert.ok(chunk.metadata.endCharIndex !== undefined);
      // Verify exact substring equality
      assert.equal(
        chunk.content,
        text.substring(chunk.metadata.startCharIndex!, chunk.metadata.endCharIndex!)
      );
    }
  });

  it('should handle unicode text and surrogate pairs in character chunking deterministically without splitting surrogates', () => {
    const chunker = new TextChunker({
      chunkSize: 6,
      chunkOverlap: 2,
      strategy: 'character',
    });
    // Multi-byte unicode characters & emojis
    const text = '🚀Bug🌟Baar✨';
    const chunks = chunker.chunkText(text, 'unicode_doc');

    assert.ok(chunks.length >= 2);
    // Deterministic reproduction
    const chunksSecondPass = chunker.chunkText(text, 'unicode_doc');
    assert.deepEqual(chunks, chunksSecondPass);

    // Regex matching any unpaired UTF-16 surrogate (lone high surrogate or lone low surrogate)
    const unpairedSurrogatePattern = /(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;

    for (const chunk of chunks) {
      // Verify no unpaired surrogates exist in the chunk content
      assert.equal(
        unpairedSurrogatePattern.test(chunk.content),
        false,
        `Chunk "${chunk.content}" contains an unpaired surrogate`
      );
      if (typeof (chunk.content as any).isWellFormed === 'function') {
        assert.equal((chunk.content as any).isWellFormed(), true);
      }
      // Accurate offsets in original JavaScript string
      assert.equal(
        chunk.content,
        text.substring(chunk.metadata.startCharIndex!, chunk.metadata.endCharIndex!)
      );
    }
  });

  it('should not split surrogate pairs across chunk boundaries where code-unit slicing would', () => {
    // "A" (1 code unit), "🚀" (2 code units: \uD83D\uDE80), "B" (1 code unit)
    // In raw code units, "A🚀B" is length 4. A 2-unit chunk would slice "A" + \uD83D (unpaired high surrogate).
    // In code points, "A🚀B" has 3 code points. With chunkSize: 2, chunkOverlap: 0:
    // Chunk 0: code points "A" and "🚀" -> content "A🚀", offsets [0, 3]
    // Chunk 1: code point "B" -> content "B", offsets [3, 4]
    const chunker = new TextChunker({
      chunkSize: 2,
      chunkOverlap: 0,
      strategy: 'character',
    });
    const text = 'A🚀B';
    const chunks = chunker.chunkText(text, 'boundary_doc');

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.content, 'A🚀');
    assert.equal(chunks[0]?.metadata.startCharIndex, 0);
    assert.equal(chunks[0]?.metadata.endCharIndex, 3);

    assert.equal(chunks[1]?.content, 'B');
    assert.equal(chunks[1]?.metadata.startCharIndex, 3);
    assert.equal(chunks[1]?.metadata.endCharIndex, 4);

    const unpairedSurrogatePattern = /(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/;
    for (const chunk of chunks) {
      assert.equal(unpairedSurrogatePattern.test(chunk.content), false);
      if (typeof (chunk.content as any).isWellFormed === 'function') {
        assert.equal((chunk.content as any).isWellFormed(), true);
      }
    }
  });

  it('should produce deterministic metadata on repeated chunking without injecting arbitrary timestamps', () => {
    const chunker = new TextChunker({ chunkSize: 30, chunkOverlap: 5 });

    const docWithoutCreatedAt: Document = {
      id: 'doc_determ',
      title: 'Deterministic Guide',
      source: 'docs/determ.md',
      content: 'This document does not provide a createdAt timestamp in its metadata.',
      metadata: {
        pageNumber: 1,
        category: 'architecture',
      },
    };

    const run1 = chunker.chunkDocument(docWithoutCreatedAt);
    const run2 = chunker.chunkDocument(docWithoutCreatedAt);

    assert.ok(run1.length > 1);
    assert.deepEqual(run1, run2);

    for (const chunk of run1) {
      assert.equal(chunk.metadata.createdAt, undefined);
      assert.equal(chunk.metadata.category, 'architecture');
      assert.equal(chunk.pageNumber, 1);
      assert.equal(chunk.documentName, 'Deterministic Guide');
    }

    const explicitDate = '2026-01-01T00:00:00.000Z';
    const docWithCreatedAt: Document = {
      id: 'doc_with_date',
      title: 'Dated Guide',
      content: 'Content with explicit createdAt timestamp provided by caller.',
      metadata: {
        createdAt: explicitDate,
      },
    };

    const chunksWithDate = chunker.chunkDocument(docWithCreatedAt);
    for (const chunk of chunksWithDate) {
      assert.equal(chunk.metadata.createdAt, explicitDate);
    }
  });
});
