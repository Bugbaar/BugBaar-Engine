import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Retriever } from '../src/retrieval/retriever.js';
import { InMemoryVectorStore, VectorRecord } from '../src/retrieval/vector-store.js';
import { DeterministicEmbeddingProvider } from '../src/embeddings/embedding-provider.js';
import { DocumentChunk } from '../src/ingestion/document-types.js';

describe('Retriever', () => {
  it('should retrieve relevant chunks based on semantic similarity', async () => {
    const embeddingProvider = new DeterministicEmbeddingProvider(64);
    const vectorStore = new InMemoryVectorStore(64);
    const retriever = new Retriever(embeddingProvider, vectorStore);

    const chunk1: DocumentChunk = {
      id: 'c1',
      documentId: 'doc_auth',
      documentName: 'Authentication Guide',
      source: 'auth.md',
      content: 'OAuth2 authentication and JWT token verification procedures.',
      chunkIndex: 0,
      metadata: {
        documentId: 'doc_auth',
        documentName: 'Authentication Guide',
        source: 'auth.md',
        chunkIndex: 0,
      },
    };

    const chunk2: DocumentChunk = {
      id: 'c2',
      documentId: 'doc_billing',
      documentName: 'Billing Reference',
      source: 'billing.md',
      content: 'Stripe webhook integration for recurring subscription invoices.',
      chunkIndex: 0,
      metadata: {
        documentId: 'doc_billing',
        documentName: 'Billing Reference',
        source: 'billing.md',
        chunkIndex: 0,
      },
    };

    const [v1, v2] = await embeddingProvider.embedDocuments([
      chunk1.content,
      chunk2.content,
    ]);

    const records: VectorRecord[] = [
      { id: chunk1.id, chunk: chunk1, vector: v1! },
      { id: chunk2.id, chunk: chunk2, vector: v2! },
    ];
    await vectorStore.addVectors(records);

    // Query for authentication
    const authResults = await retriever.retrieve('How to verify JWT tokens and OAuth?', {
      topK: 2,
    });

    assert.ok(authResults.length > 0);
    assert.equal(authResults[0]?.chunk.documentId, 'doc_auth');
    assert.equal(authResults[0]?.chunk.source, 'auth.md');
    assert.ok(authResults[0]!.score > 0);

    // Query for billing
    const billingResults = await retriever.retrieve('Stripe recurring subscription invoices', {
      topK: 1,
    });

    assert.equal(billingResults.length, 1);
    assert.equal(billingResults[0]?.chunk.documentId, 'doc_billing');
  });

  it('should handle empty queries and empty vector stores gracefully', async () => {
    const embeddingProvider = new DeterministicEmbeddingProvider(32);
    const vectorStore = new InMemoryVectorStore(32);
    const retriever = new Retriever(embeddingProvider, vectorStore);

    // Empty query
    assert.deepEqual(await retriever.retrieve(''), []);
    assert.deepEqual(await retriever.retrieve('   '), []);

    // Non-empty query against empty store
    assert.deepEqual(await retriever.retrieve('Hello world'), []);
  });

  it('should filter results by similarity threshold', async () => {
    const embeddingProvider = new DeterministicEmbeddingProvider(64);
    const vectorStore = new InMemoryVectorStore(64);
    const retriever = new Retriever(embeddingProvider, vectorStore);

    const chunk: DocumentChunk = {
      id: 'c1',
      documentId: 'doc1',
      content: 'Database indexing strategies in PostgreSQL.',
      chunkIndex: 0,
      metadata: { documentId: 'doc1', chunkIndex: 0 },
    };

    const [v] = await embeddingProvider.embedDocuments([chunk.content]);
    await vectorStore.addVectors([{ id: 'c1', chunk, vector: v! }]);

    // Query with extremely high threshold should filter out non-identical match
    const highThresholdResults = await retriever.retrieve(
      'Completely unrelated fruit cooking recipe',
      { similarityThreshold: 0.95 }
    );
    assert.equal(highThresholdResults.length, 0);
  });

  it('should fulfill topK requested results by over-fetching when duplicates are deduplicated', async () => {
    const embeddingProvider = new DeterministicEmbeddingProvider(32);
    const vectorStore = new InMemoryVectorStore(32);
    const retriever = new Retriever(embeddingProvider, vectorStore);

    // Insert 4 chunks: 2 identical duplicates with top similarity, plus 2 distinct chunks
    const chunkA1: DocumentChunk = {
      id: 'cA1',
      documentId: 'docA',
      content: 'Identical common content regarding BugBaar.',
      chunkIndex: 0,
      metadata: { documentId: 'docA', chunkIndex: 0 },
    };
    const chunkA2: DocumentChunk = {
      id: 'cA2',
      documentId: 'docB',
      content: 'Identical common content regarding BugBaar.', // duplicate content
      chunkIndex: 0,
      metadata: { documentId: 'docB', chunkIndex: 0 },
    };
    const chunkB: DocumentChunk = {
      id: 'cB',
      documentId: 'docC',
      content: 'Distinct secondary topic about BugBaar pipelines.',
      chunkIndex: 0,
      metadata: { documentId: 'docC', chunkIndex: 0 },
    };

    const [vA1, vA2, vB] = await embeddingProvider.embedDocuments([
      chunkA1.content,
      chunkA2.content,
      chunkB.content,
    ]);

    await vectorStore.addVectors([
      { id: chunkA1.id, chunk: chunkA1, vector: vA1! },
      { id: chunkA2.id, chunk: chunkA2, vector: vA2! },
      { id: chunkB.id, chunk: chunkB, vector: vB! },
    ]);

    // Request topK = 2.
    // If vectorStore only retrieved 2 items (both duplicates), deduplication would leave only 1.
    // With candidateMultiplier (e.g. 2), it fetches 4 candidates and successfully returns 2 unique chunks.
    const results = await retriever.retrieve('BugBaar pipelines', {
      topK: 2,
      candidateMultiplier: 2,
    });

    assert.equal(results.length, 2);
    assert.notEqual(results[0]?.chunk.content, results[1]?.chunk.content);
  });

  it('should normalize fractional, zero, negative, and NaN bounds without throwing errors', async () => {
    const embeddingProvider = new DeterministicEmbeddingProvider(32);
    const vectorStore = new InMemoryVectorStore(32);
    const retriever = new Retriever(embeddingProvider, vectorStore);

    const chunk1: DocumentChunk = {
      id: 'c1',
      documentId: 'doc1',
      content: 'Sample text chunk for normalization testing.',
      chunkIndex: 0,
      metadata: { documentId: 'doc1', chunkIndex: 0 },
    };
    const chunk2: DocumentChunk = {
      id: 'c2',
      documentId: 'doc2',
      content: 'Second text chunk for bounds validation.',
      chunkIndex: 0,
      metadata: { documentId: 'doc2', chunkIndex: 0 },
    };

    const [v1, v2] = await embeddingProvider.embedDocuments([chunk1.content, chunk2.content]);
    await vectorStore.addVectors([
      { id: 'c1', chunk: chunk1, vector: v1! },
      { id: 'c2', chunk: chunk2, vector: v2! },
    ]);

    // Fractional topK and candidateMultiplier
    const fracResults = await retriever.retrieve('test query', {
      topK: 1.8, // Should normalize to 1
      candidateMultiplier: 2.5, // Should normalize to 2
    });
    assert.equal(fracResults.length, 1);

    // Zero / negative topK should clamp to positive lower bound (1)
    const zeroResults = await retriever.retrieve('test query', {
      topK: 0,
    });
    assert.equal(zeroResults.length, 1);

    const negResults = await retriever.retrieve('test query', {
      topK: -5,
      candidateMultiplier: -2,
    });
    assert.equal(negResults.length, 1);

    // NaN / invalid inputs should fallback to defaults
    const nanResults = await retriever.retrieve('test query', {
      topK: Number.NaN,
      candidateMultiplier: Number.NaN,
    });
    assert.ok(nanResults.length > 0);
  });
});
