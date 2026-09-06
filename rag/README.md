# 🧠 BugBaar RAG Engine

A production-oriented, modular, and provider-agnostic Retrieval-Augmented Generation (RAG) foundation built for the **BugBaar Engine** ecosystem in Node.js and TypeScript.

---

## 🏗️ Architecture Overview

The `rag/` module is organized into cohesive layers with clean separation of concerns:

```text
rag/
├── src/
│   ├── embeddings/
│   │   └── embedding-provider.ts     # EmbeddingProvider interface & DeterministicEmbeddingProvider
│   ├── ingestion/
│   │   ├── document-types.ts         # Document, DocumentChunk, Metadata types
│   │   └── text-chunker.ts           # Configurable deterministic TextChunker with validation
│   ├── retrieval/
│   │   ├── vector-store.ts           # VectorStore interface, cosine similarity, InMemoryVectorStore
│   │   ├── context-ranker.ts         # ContextRanker interface & DefaultContextRanker
│   │   └── retriever.ts              # Modular query retriever with topK & threshold filtering
│   ├── safety/
│   │   └── prompt-injection.ts       # PromptInjectionDetector & RuleBasedInjectionDetector
│   ├── pipeline/
│   │   └── rag-pipeline.ts           # RagPipeline orchestrator
│   └── index.ts                      # Public entry point exporting all core components
└── tests/                            # Fast, deterministic, offline unit & pipeline tests
```

---

## 🧩 Module Responsibilities

| Module | Purpose | Key Classes & Interfaces |
| :--- | :--- | :--- |
| **`ingestion`** | Document modeling, metadata preservation, and deterministic text chunking (character/word windows). | `Document`, `DocumentChunk`, `TextChunker`, `ITextChunker` |
| **`embeddings`** | Provider-agnostic abstraction for vector embedding generation. | `EmbeddingProvider`, `DeterministicEmbeddingProvider` |
| **`retrieval`** | Vector storage, cosine similarity search, chunk deduplication, and context ranking. | `VectorStore`, `InMemoryVectorStore`, `Retriever`, `ContextRanker` |
| **`safety`** | Guardrail scanning user input for jailbreaks, system prompt extractions, and adversarial prompt injections. | `PromptInjectionDetector`, `RuleBasedInjectionDetector` |
| **`pipeline`** | End-to-end orchestration uniting chunking, embedding, indexing, safety checks, and context retrieval. | `RagPipeline`, `GenerationProvider` |

---

## 🚀 Quick Usage Example

```typescript
import {
  RagPipeline,
  InMemoryVectorStore,
  DeterministicEmbeddingProvider,
  Document,
} from './rag/src/index.js';

// 1. Initialize modular components
const embeddingProvider = new DeterministicEmbeddingProvider(64);
const vectorStore = new InMemoryVectorStore(64);

const pipeline = new RagPipeline({
  embeddingProvider,
  vectorStore,
  chunker: { chunkSize: 250, chunkOverlap: 30 },
});

// 2. Ingest raw documents
const document: Document = {
  id: 'doc_getting_started',
  title: 'BugBaar Quickstart',
  source: 'docs/quickstart.md',
  content: `BugBaar Engine is an open-source platform for AI agent infrastructure.
            Developers can build autonomous workflows, vector search systems,
            and secure knowledge bases.`,
  metadata: { version: '0.1.0' },
};

await pipeline.ingestDocument(document);

// 3. Query relevant context safely
const result = await pipeline.retrieveContext(
  'What can developers build with BugBaar Engine?',
  { topK: 3 }
);

console.log('Query Safe:', result.safety.isSafe);
console.log('Top Retrieved Chunks:', result.chunks.length);
console.log('Formatted Context Block:\n', result.formattedContext);
```

---

## 📐 In-Memory Vector Store & Cosine Similarity

The `InMemoryVectorStore` stores vector records containing `DocumentChunk` and dense embedding arrays `number[]`.

### Vector Similarity Calculation
Similarity is calculated using exact Cosine Similarity:
$$\text{cosine\_similarity}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\|_2 \|\mathbf{v}\|_2} = \frac{\sum_{i=1}^n u_i v_i}{\sqrt{\sum_{i=1}^n u_i^2} \sqrt{\sum_{i=1}^n v_i^2}}$$

### Dimension Enforcement
If an expected dimension is passed during vector store initialization (`new InMemoryVectorStore(dim)`), the store will strictly validate:
- Inserted vector dimensions
- Query search vector dimensions
- Mismatches throw explicit descriptive errors.

---

## 🔌 Adding a Future Embedding Provider

To plug in a provider like **OpenAI** or **Ollama**, implement the `EmbeddingProvider` interface:

```typescript
import { EmbeddingProvider } from './rag/src/index.js';

interface OpenAIEmbeddingData {
  embedding: number[];
  index: number;
}

interface OpenAIEmbeddingResponse {
  data: OpenAIEmbeddingData[];
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number = 1536; // text-embedding-3-small
  readonly providerName: string = 'openai-text-embedding-3-small';

  constructor(private apiKey: string) {}

  async embedQuery(text: string): Promise<number[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
      }),
    });
    const json = (await response.json()) as OpenAIEmbeddingResponse;
    return json.data[0]!.embedding;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: 'text-embedding-3-small',
      }),
    });
    const json = (await response.json()) as OpenAIEmbeddingResponse;
    return json.data.map((item) => item.embedding);
  }
}
```

Then simply inject it into `RagPipeline`:
```typescript
const pipeline = new RagPipeline({
  embeddingProvider: new OpenAIEmbeddingProvider(process.env.OPENAI_API_KEY!),
  vectorStore: new InMemoryVectorStore(1536),
});
```

---

## 🛡️ Prompt Injection Detection

The `RuleBasedInjectionDetector` is a **basic heuristic rule-based guardrail** designed to catch obvious adversarial patterns before query execution. It is **not a comprehensive security solution**.

Scanned heuristic categories include:
- **Instruction Overrides**: e.g., `"ignore previous instructions"`, `"disregard all prior rules"`
- **System Prompt Extraction**: e.g., `"reveal system prompt"`, `"print base instructions"`
- **Jailbreaks & Persona Hijacking**: e.g., `"DAN mode"`, `"developer mode enabled"`
- **Delimiter Injection**: e.g., `<|im_start|>system`, `### System:`

It returns a structured `PromptInjectionResult` with `isSafe`, `riskScore`, and `flaggedPatterns`. Advanced semantic classifiers, LLM-as-a-judge guardrails, or external security services can be plugged in by implementing the `PromptInjectionDetector` interface.

---

## ⚠️ Current Limitations & 🔮 Future Extension Points

- **In-Memory Storage**: `InMemoryVectorStore` is ideal for unit tests, local development, and embedded workloads. Future work can implement `QdrantVectorStore` or `PgVectorStore` adhering to the same `VectorStore` interface.
- **Heuristic Safety**: `RuleBasedInjectionDetector` is a lightweight first line of defense; more advanced neural guardrails can be plugged in seamlessly.
- **Reranking**: `DefaultContextRanker` provides deterministic score ordering and content deduplication; cross-encoder models or BM25 hybrid ranking can be added by implementing `ContextRanker`.
