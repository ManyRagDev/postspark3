import { expect, test, describe } from 'vitest';
import { hashString, mulberry32 } from './seed';

describe('seed operations', () => {
  test('hashstring-stable', () => {
    const hash1 = hashString("hello-world-123");
    const hash2 = hashString("hello-world-123");
    expect(hash1).toBe(hash2);
    expect(hash1).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hash1)).toBe(true);
  });

  test('hashstring-distinct', () => {
    const hash1 = hashString("post-1");
    const hash2 = hashString("post-2");
    expect(hash1).not.toBe(hash2);
  });

  test('mulberry32-fixed-sequence', () => {
    const rand = mulberry32(42);
    const seq = [rand(), rand(), rand(), rand()];
    
    // We recreate the same sequence to verify determinism
    const rand2 = mulberry32(42);
    const seq2 = [rand2(), rand2(), rand2(), rand2()];
    
    expect(seq).toEqual(seq2);
    
    // Confirm values are in [0, 1)
    seq.forEach(val => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });
});
