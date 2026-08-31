import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DefaultContextRanker } from '../src/retrieval/context-ranker.js';
import { ScoredChunk } from '../src/retrieval/vector-store.js';
import { DocumentChunk } from '../src/ingestion/document-types.js';

describe('DefaultContextRanker', () => {
  const createScoredChunk = (
    id: string,
    docId: string,
    chunkIndex: number,
    content: string,
    score: number
  ): ScoredChunk => {
    const chunk: DocumentChunk = {
      id,
      documentId: docId,
      content,
      chunkIndex,
      metadata: {
        documentId: docId,
        chunkIndex,
      },
    };
    return { chunk, score };
  };

  it('should deduplicate chunks with identical normalized content', async () => {
    const ranker = new DefaultContextRanker({ deduplicate: true });

    const chunks: ScoredChunk[] = [
      createScoredChunk('c1', 'docA', 0, 'BugBaar Engine is open source.', 0.95),
      createScoredChunk('c2', 'docB', 1, 'bugbaar engine is open source.  ', 0.85), // Duplicate content with lower score
      createScoredChunk('c3', 'docC', 0, 'Unique distinct chunk.', 0.80),
    ];

    const ranked = await ranker.rank(chunks, 'open source query');
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]?.chunk.id, 'c1');
    assert.equal(ranked[1]?.chunk.id, 'c3');
  });

  it('should deterministically break score ties using documentId and chunkIndex', async () => {
    const ranker = new DefaultContextRanker();

    const chunks: ScoredChunk[] = [
      createScoredChunk('c_z1', 'docZ', 1, 'Chunk Z1', 0.9),
      createScoredChunk('c_a0', 'docA', 0, 'Chunk A0', 0.9),
      createScoredChunk('c_a1', 'docA', 1, 'Chunk A1', 0.9),
      createScoredChunk('c_m0', 'docM', 0, 'Chunk M0', 0.9),
    ];

    const ranked = await ranker.rank(chunks, 'test');
    assert.equal(ranked.length, 4);
    assert.equal(ranked[0]?.chunk.id, 'c_a0'); // docA, chunk 0
    assert.equal(ranked[1]?.chunk.id, 'c_a1'); // docA, chunk 1
    assert.equal(ranked[2]?.chunk.id, 'c_m0'); // docM, chunk 0
    assert.equal(ranked[3]?.chunk.id, 'c_z1'); // docZ, chunk 1
  });

  it('should respect maxResults and minScore constraints', async () => {
    const ranker = new DefaultContextRanker();

    const chunks: ScoredChunk[] = [
      createScoredChunk('c1', 'docA', 0, 'Content 1', 0.9),
      createScoredChunk('c2', 'docB', 0, 'Content 2', 0.7),
      createScoredChunk('c3', 'docC', 0, 'Content 3', 0.4),
    ];

    const ranked = await ranker.rank(chunks, 'test', {
      minScore: 0.5,
      maxResults: 1,
    });

    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.chunk.id, 'c1');
  });
});
