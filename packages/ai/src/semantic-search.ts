/**
 * Semantic search over text snippets via an *injected* embedder.
 *
 * This module is provider-agnostic: it never imports an LLM/embeddings SDK.
 * The caller supplies an {@link Embedder} — a pure function mapping text to a
 * numeric vector — which may be backed by any real model in production and a
 * deterministic mock in tests. The {@link SemanticIndex} stores embeddings per
 * id and ranks them against a query embedding by cosine similarity.
 */

/** Maps a piece of text to its embedding vector. May be sync or async. */
export type Embedder = (text: string) => number[] | Promise<number[]>;

/**
 * Cosine similarity of two equal-length vectors.
 *
 * Returns `0` when either vector is the zero vector (no direction to compare).
 * Throws {@link RangeError} when the lengths differ.
 */
export function cosineSimilarity(
  a: readonly number[],
  b: readonly number[],
): number {
  if (a.length !== b.length) {
    throw new RangeError(
      `vector length mismatch: ${a.length} !== ${b.length}`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** A single ranked search result. */
export interface SearchHit {
  id: string;
  score: number;
}

/**
 * In-memory semantic index. Stores one embedding per id and answers nearest-
 * neighbour queries by cosine similarity.
 */
export class SemanticIndex {
  private readonly embedder: Embedder;
  private readonly vectors = new Map<string, number[]>();

  constructor(embedder: Embedder) {
    this.embedder = embedder;
  }

  /**
   * Embed `text` and store it under `id`. Re-adding the same id replaces the
   * previously stored embedding.
   */
  async add(id: string, text: string): Promise<void> {
    const vector = await this.embedder(text);
    this.vectors.set(id, vector);
  }

  /** Remove the entry for `id`. Returns `true` if an entry was removed. */
  remove(id: string): boolean {
    return this.vectors.delete(id);
  }

  /** Whether an entry exists for `id`. */
  has(id: string): boolean {
    return this.vectors.has(id);
  }

  /** Number of stored entries. */
  get size(): number {
    return this.vectors.size;
  }

  /**
   * Embed `query` and return up to `topK` hits ranked by descending cosine
   * similarity. An empty index yields `[]`.
   */
  async search(query: string, topK = 10): Promise<SearchHit[]> {
    const queryVector = await this.embedder(query);
    const hits: SearchHit[] = [];
    for (const [id, vector] of this.vectors) {
      hits.push({ id, score: cosineSimilarity(queryVector, vector) });
    }
    hits.sort((a, b) => b.score - a.score);
    // A non-positive topK yields no hits (avoids slice()'s negative-index behavior).
    return topK <= 0 ? [] : hits.slice(0, topK);
  }

  /** Drop all stored entries. */
  clear(): void {
    this.vectors.clear();
  }
}
