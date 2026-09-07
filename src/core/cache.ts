/**
 * Translation Cache — Reduces API calls by caching repeated phrases
 *
 * Two-tier caching:
 * 1. Exact match cache - full sentences cached after 3 identical repeats
 * 2. Sub-phrase cache - fragments cached after 3 uses across different sentences
 *
 * Both tiers require 3 occurrences before caching to avoid false positives.
 */

import { hasThaiText } from "./utils.js";

const CACHE_THRESHOLD = 3;  // Must see 3 times before caching
const MAX_CACHE_SIZE = 1000;  // LRU eviction limit
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // 7 days

interface CacheEntry {
  translation: string;
  count: number;
  lastUsed: number;
  sourceLang: 'en' | 'th';
  targetLang: 'en' | 'th';
}

interface PhraseUsage {
  count: number;
  lastSeen: number;
  sentences: Set<string>;  // Track which full sentences this phrase appeared in
}

/**
 * Normalize text for cache key (lowercase, trim, collapse whitespace)
 */
function normalizeKey(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract sub-phrases from text for phrase-level caching
 * Returns 2-4 word combinations that could be reused across sentences
 */
function extractPhrases(text: string): string[] {
  // Split by whitespace and filter
  const words = text.toLowerCase().trim().split(/\s+/).filter(w => w.length > 1);

  if (words.length < 2) return [];

  const phrases: string[] = [];

  // Extract 2-word phrases
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }

  // Extract 3-word phrases
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  // Extract 4-word phrases
  for (let i = 0; i < words.length - 3; i++) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]} ${words[i + 3]}`);
  }

  return phrases;
}

export class TranslationCache {
  private exactCache: Map<string, CacheEntry> = new Map();
  private phraseCache: Map<string, CacheEntry> = new Map();
  private phraseUsage: Map<string, PhraseUsage> = new Map();  // Track phrase occurrences

  constructor() {
    // Load from persistent storage if available
    this.load();
  }

  /**
   * Get cached translation for exact match
   */
  get(text: string, sourceLang: 'en' | 'th', targetLang: 'en' | 'th'): string | null {
    const key = normalizeKey(text);
    const entry = this.exactCache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.lastUsed > CACHE_TTL_MS) {
      this.exactCache.delete(key);
      return null;
    }

    // Check if languages match
    if (entry.sourceLang !== sourceLang || entry.targetLang !== targetLang) {
      return null;
    }

    // Update last used time
    entry.lastUsed = Date.now();

    return entry.translation;
  }

  /**
   * Get cached translation for a sub-phrase
   */
  getPhrase(phrase: string, sourceLang: 'en' | 'th', targetLang: 'en' | 'th'): string | null {
    const key = normalizeKey(phrase);
    const entry = this.phraseCache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.lastUsed > CACHE_TTL_MS) {
      this.phraseCache.delete(key);
      return null;
    }

    // Check if languages match
    if (entry.sourceLang !== sourceLang || entry.targetLang !== targetLang) {
      return null;
    }

    // Update last used time
    entry.lastUsed = Date.now();

    return entry.translation;
  }

  /**
   * Record usage of text and phrases for tracking
   * Returns true if the item should be cached (threshold reached)
   */
  recordUsage(text: string, sentenceKey: string): { exact: boolean; phrases: string[] } {
    const normalizedText = normalizeKey(text);
    const result = { exact: false, phrases: [] as string[] };

    // Track exact match
    let exactEntry = this.exactCache.get(normalizedText);
    if (!exactEntry) {
      exactEntry = {
        translation: '',
        count: 0,
        lastUsed: Date.now(),
        sourceLang: hasThaiText(text) ? 'th' : 'en',
        targetLang: hasThaiText(text) ? 'en' : 'th',
      };
      this.exactCache.set(normalizedText, exactEntry);
    }

    // Increment count on each usage
    exactEntry.count++;
    exactEntry.lastUsed = Date.now();

    // Check if threshold reached for exact match
    if (exactEntry.count === CACHE_THRESHOLD) {
      result.exact = true;
    }

    // Track phrase usage
    const phrases = extractPhrases(text);
    for (const phrase of phrases) {
      const phraseKey = normalizeKey(phrase);

      let usage = this.phraseUsage.get(phraseKey);
      if (!usage) {
        usage = {
          count: 0,
          lastSeen: Date.now(),
          sentences: new Set(),
        };
        this.phraseUsage.set(phraseKey, usage);
      }

      // Only count if this phrase appears in a different sentence
      if (!usage.sentences.has(sentenceKey)) {
        usage.count++;
        usage.sentences.add(sentenceKey);
      }
      usage.lastSeen = Date.now();

      // Check if threshold reached for phrase
      if (usage.count === CACHE_THRESHOLD) {
        result.phrases.push(phrase);
      }
    }

    // Evict oldest entries if cache is too large
    this.evictIfNeeded();

    return result;
  }

  /**
   * Store a cached translation for exact match
   */
  setExact(text: string, translation: string, sourceLang: 'en' | 'th', targetLang: 'en' | 'th'): void {
    const key = normalizeKey(text);

    this.exactCache.set(key, {
      translation,
      count: CACHE_THRESHOLD,  // Mark as having reached threshold
      lastUsed: Date.now(),
      sourceLang,
      targetLang,
    });

    this.save();
  }

  /**
   * Store a cached translation for a phrase
   */
  setPhrase(phrase: string, translation: string, sourceLang: 'en' | 'th', targetLang: 'en' | 'th'): void {
    const key = normalizeKey(phrase);

    this.phraseCache.set(key, {
      translation,
      count: CACHE_THRESHOLD,
      lastUsed: Date.now(),
      sourceLang,
      targetLang,
    });

    this.save();
  }

  /**
   * Check if any phrases in the text are already cached
   * Returns map of phrase -> cached translation
   */
  getCachedPhrases(text: string, sourceLang: 'en' | 'th', targetLang: 'en' | 'th'): Map<string, string> {
    const phrases = extractPhrases(text);
    const cached = new Map<string, string>();

    for (const phrase of phrases) {
      const cachedTranslation = this.getPhrase(phrase, sourceLang, targetLang);
      if (cachedTranslation) {
        cached.set(phrase, cachedTranslation);
      }
    }

    return cached;
  }

  /**
   * Evict oldest entries if cache exceeds max size (LRU)
   */
  private evictIfNeeded(): void {
    // Evict exact cache if too large
    if (this.exactCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(this.exactCache.entries())
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

      const toRemove = entries.slice(0, this.exactCache.size - MAX_CACHE_SIZE + 100);
      for (const [key] of toRemove) {
        this.exactCache.delete(key);
      }
    }

    // Evict phrase cache if too large
    if (this.phraseCache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(this.phraseCache.entries())
        .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

      const toRemove = entries.slice(0, this.phraseCache.size - MAX_CACHE_SIZE + 100);
      for (const [key] of toRemove) {
        this.phraseCache.delete(key);
      }
    }

    // Clean up phrase usage tracking for expired entries
    const now = Date.now();
    for (const [key, usage] of this.phraseUsage.entries()) {
      if (now - usage.lastSeen > CACHE_TTL_MS) {
        this.phraseUsage.delete(key);
      }
    }
  }

  /**
   * Save cache to persistent storage
   */
  private save(): void {
    try {
      const data = {
        exactCache: Array.from(this.exactCache.entries()),
        phraseCache: Array.from(this.phraseCache.entries()),
        phraseUsage: Array.from(this.phraseUsage.entries()).map(([k, v]) => [
          k,
          { ...v, sentences: Array.from(v.sentences) }
        ]),
        savedAt: Date.now(),
      };

      // Store in memory (Vercel serverless - data persists for duration of warm instance)
      // For file persistence, would need fs module but that's async
      // This in-memory cache survives across calls within the same warm instance
    } catch (e) {
      console.error('Failed to save translation cache:', e);
    }
  }

  /**
   * Load cache from persistent storage
   */
  private load(): void {
    // Vercel serverless: in-memory cache is sufficient
    // The cache resets on cold start but that's acceptable
    // For true persistence, would need async file read which complicates initialization
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(): { exactSize: number; phraseSize: number; phrasesTracked: number } {
    return {
      exactSize: this.exactCache.size,
      phraseSize: this.phraseCache.size,
      phrasesTracked: this.phraseUsage.size,
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.exactCache.clear();
    this.phraseCache.clear();
    this.phraseUsage.clear();
  }
}

// Singleton instance
let cacheInstance: TranslationCache | null = null;

export function getTranslationCache(): TranslationCache {
  if (!cacheInstance) {
    cacheInstance = new TranslationCache();
  }
  return cacheInstance;
}
