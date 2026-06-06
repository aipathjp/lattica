import { describe, it, expect, vi } from 'vitest';
import {
  cosineSimilarity,
  SemanticIndex,
  type Embedder,
} from './semantic-search.js';

/**
 * Deterministic mock embedder. Maps known texts to fixed 2D unit-ish vectors so
 * relative cosine similarities are predictable; unknown texts embed to the zero
 * vector.
 */
const VECTORS: Record<string, number[]> = {
  cat: [1, 0],
  kitten: [0.9, 0.1],
  dog: [0.2, 0.9],
  car: [0, 1],
  nothing: [0, 0],
};

const syncEmbedder: Embedder = (text) => VECTORS[text] ?? [0, 0];

const asyncEmbedder: Embedder = async (text) =>
  Promise.resolve(VECTORS[text] ?? [0, 0]);

describe('cosineSimilarity', () => {
  it('returns 1 for identical direction', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 when the first vector is a zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('returns 0 when the second vector is a zero vector', () => {
    expect(cosineSimilarity([1, 1], [0, 0])).toBe(0);
  });

  it('throws RangeError on length mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(RangeError);
  });
});

describe('SemanticIndex', () => {
  it('starts empty', () => {
    const index = new SemanticIndex(syncEmbedder);
    expect(index.size).toBe(0);
    expect(index.has('cat')).toBe(false);
  });

  it('adds entries and tracks size/has', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('a', 'cat');
    await index.add('b', 'dog');
    expect(index.size).toBe(2);
    expect(index.has('a')).toBe(true);
    expect(index.has('b')).toBe(true);
  });

  it('replaces the embedding when re-adding the same id', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('a', 'cat');
    await index.add('a', 'car');
    expect(index.size).toBe(1);
    const hits = await index.search('car');
    expect(hits[0]).toEqual({ id: 'a', score: expect.closeTo(1) });
  });

  it('remove returns true when an entry existed', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('a', 'cat');
    expect(index.remove('a')).toBe(true);
    expect(index.has('a')).toBe(false);
    expect(index.size).toBe(0);
  });

  it('remove returns false when no entry existed', () => {
    const index = new SemanticIndex(syncEmbedder);
    expect(index.remove('missing')).toBe(false);
  });

  it('clear drops all entries', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('a', 'cat');
    await index.add('b', 'dog');
    index.clear();
    expect(index.size).toBe(0);
  });

  it('search returns [] for an empty index', async () => {
    const index = new SemanticIndex(syncEmbedder);
    expect(await index.search('cat')).toEqual([]);
  });

  it('ranks hits by descending cosine similarity', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('cat', 'cat');
    await index.add('kitten', 'kitten');
    await index.add('car', 'car');
    const hits = await index.search('cat');
    expect(hits.map((h) => h.id)).toEqual(['cat', 'kitten', 'car']);
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
    expect(hits[1]!.score).toBeGreaterThan(hits[2]!.score);
  });

  it('truncates results to topK', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('cat', 'cat');
    await index.add('kitten', 'kitten');
    await index.add('car', 'car');
    const hits = await index.search('cat', 2);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.id)).toEqual(['cat', 'kitten']);
  });

  it('returns [] for a non-positive topK', async () => {
    const index = new SemanticIndex(syncEmbedder);
    await index.add('cat', 'cat');
    await index.add('car', 'car');
    expect(await index.search('cat', 0)).toEqual([]);
    expect(await index.search('cat', -1)).toEqual([]);
  });

  it('defaults topK to 10', async () => {
    const index = new SemanticIndex(syncEmbedder);
    for (let i = 0; i < 12; i++) {
      await index.add(`id${i}`, 'cat');
    }
    const hits = await index.search('cat');
    expect(hits).toHaveLength(10);
  });

  it('works with an async embedder', async () => {
    const spy = vi.fn(asyncEmbedder);
    const index = new SemanticIndex(spy);
    await index.add('cat', 'cat');
    await index.add('car', 'car');
    const hits = await index.search('kitten');
    expect(hits.map((h) => h.id)).toEqual(['cat', 'car']);
    expect(spy).toHaveBeenCalledWith('kitten');
  });
});
