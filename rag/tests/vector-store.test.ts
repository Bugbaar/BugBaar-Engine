import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryVectorStore,
  cosineSimilarity,
  VectorRecord,
} from '../src/retrieval/vector-store.js';
import { DocumentChunk } from '../src/ingestion/document-types.js';

describe('cosineSimilarity', () => {
  it('should calculate correct cosine similarity for known vectors', () => {
    // Identical
    assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);

    // Orthogonal
    assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);

    // Opposite
    assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);

    // Zero vector
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  });

  it('should throw error when vector dimensions mismatch', () => {
    assert.throws(
      () => cosineSimilarity([1, 2], [1, 2, 3]),
      /Dimension mismatch in cosine similarity/
    );
  });
});

describe('InMemoryVectorStore', () => {
  const createDummyChunk = (
    id: string,
    docId: string,
    content: string
  ): DocumentChunk => ({
    id,
    documentId: docId,
    content,
    chunkIndex: 0,
    metadata: {
      documentId: docId,
      chunkIndex: 0,
    },
  });

  it('should enforce dimension consistency if configured', async () => {
    const store = new InMemoryVectorStore(3);

    const validRecord: VectorRecord = {
      id: 'c1',
      chunk: createDummyChunk('c1', 'doc1', 'valid'),
      vector: [1, 0, 0],
    };
    await store.addVectors([validRecord]);
    assert.equal(await store.count(), 1);

    const invalidRecord: VectorRecord = {
      id: 'c2',
      chunk: createDummyChunk('c2', 'doc1', 'invalid'),
      vector: [1, 0], // dimension 2 instead of 3
    };

    await assert.rejects(
      () => store.addVectors([invalidRecord]),
      /Vector dimension mismatch for record c2: expected 3, got 2/
    );

    await assert.rejects(
      () => store.search([1, 0], 5),
      /Query vector dimension mismatch: expected 3, got 2/
    );
  });

  it('should retrieve topK and filter by similarity threshold', async () => {
    const store = new InMemoryVectorStore(3);

    const records: VectorRecord[] = [
      {
        id: 'c1',
        chunk: createDummyChunk('c1', 'doc1', 'Chunk A (close to x)'),
        vector: [1, 0, 0],
      },
      {
        id: 'c2',
        chunk: createDummyChunk('c2', 'doc2', 'Chunk B (diagonal)'),
        vector: [0.7071, 0.7071, 0],
      },
      {
        id: 'c3',
        chunk: createDummyChunk('c3', 'doc3', 'Chunk C (orthogonal y)'),
        vector: [0, 1, 0],
      },
    ];

    await store.addVectors(records);
    assert.equal(await store.count(), 3);

    // Search near [1, 0, 0] with topK = 2
    const results = await store.search([1, 0, 0], 2);
    assert.equal(results.length, 2);
    assert.equal(results[0]?.chunk.id, 'c1');
    assert.ok(Math.abs(results[0]!.score - 1.0) < 1e-4);
    assert.equal(results[1]?.chunk.id, 'c2');

    // Search with similarityThreshold >= 0.8
    const thresholdResults = await store.search([1, 0, 0], 10, 0.8);
    assert.equal(thresholdResults.length, 1);
    assert.equal(thresholdResults[0]?.chunk.id, 'c1');
  });

  it('should support document and chunk deletion', async () => {
    const store = new InMemoryVectorStore();

    await store.addVectors([
      {
        id: 'doc1_c0',
        chunk: createDummyChunk('doc1_c0', 'doc1', 'Content 1'),
        vector: [1, 0],
      },
      {
        id: 'doc1_c1',
        chunk: createDummyChunk('doc1_c1', 'doc1', 'Content 2'),
        vector: [0, 1],
      },
      {
        id: 'doc2_c0',
        chunk: createDummyChunk('doc2_c0', 'doc2', 'Content 3'),
        vector: [1, 1],
      },
    ]);

    assert.equal(await store.count(), 3);

    // Delete doc1 (2 chunks)
    const deletedCount = await store.deleteDocument('doc1');
    assert.equal(deletedCount, 2);
    assert.equal(await store.count(), 1);

    // Delete single chunk doc2_c0
    const deletedSingle = await store.deleteChunk('doc2_c0');
    assert.equal(deletedSingle, true);
    assert.equal(await store.count(), 0);
  });

  it('should enforce dimension established by first inserted vector when no dimension is configured', async () => {
    const store = new InMemoryVectorStore(); // no dimension configured
    assert.equal(store.dimension, undefined);

    await store.addVectors([
      {
        id: 'c1',
        chunk: createDummyChunk('c1', 'doc1', 'First record establishing dim 4'),
        vector: [1, 2, 3, 4],
      },
    ]);
    assert.equal(store.dimension, 4);

    // Reject second record with mismatched dimension (3 instead of 4)
    await assert.rejects(
      () =>
        store.addVectors([
          {
            id: 'c2',
            chunk: createDummyChunk('c2', 'doc1', 'Mismatched dim record'),
            vector: [1, 2, 3],
          },
        ]),
      /Vector dimension mismatch for record c2: expected 4, got 3/
    );

    // Reject within the same batch
    await assert.rejects(
      () => {
        const store2 = new InMemoryVectorStore();
        return store2.addVectors([
          {
            id: 'b1',
            chunk: createDummyChunk('b1', 'doc1', 'Batch 1'),
            vector: [1, 2],
          },
          {
            id: 'b2',
            chunk: createDummyChunk('b2', 'doc1', 'Batch 2'),
            vector: [1, 2, 3],
          },
        ]);
      },
      /Vector dimension mismatch for record b2: expected 2, got 3/
    );
  });

  it('should reject non-finite vector values such as NaN and Infinity before storing', async () => {
    const store = new InMemoryVectorStore(3);

    // Vector with NaN
    await assert.rejects(
      () =>
        store.addVectors([
          {
            id: 'nan_rec',
            chunk: createDummyChunk('nan_rec', 'doc1', 'NaN test'),
            vector: [1, Number.NaN, 0],
          },
        ]),
      /Vector record nan_rec contains non-finite value at index 1/
    );

    // Vector with Infinity
    await assert.rejects(
      () =>
        store.addVectors([
          {
            id: 'inf_rec',
            chunk: createDummyChunk('inf_rec', 'doc1', 'Infinity test'),
            vector: [Number.POSITIVE_INFINITY, 0, 0],
          },
        ]),
      /Vector record inf_rec contains non-finite value at index 0/
    );

    // Vector with -Infinity
    await assert.rejects(
      () =>
        store.addVectors([
          {
            id: 'neg_inf_rec',
            chunk: createDummyChunk('neg_inf_rec', 'doc1', '-Infinity test'),
            vector: [0, 0, Number.NEGATIVE_INFINITY],
          },
        ]),
      /Vector record neg_inf_rec contains non-finite value at index 2/
    );

    // Ensure store is still empty
    assert.equal(await store.count(), 0);
  });
});
