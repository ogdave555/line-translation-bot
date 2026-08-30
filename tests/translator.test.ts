import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Set env vars before dynamic import (ESM hoists imports)
process.env.CHANNEL_ACCESS_TOKEN = 'test-token';
process.env.CHANNEL_SECRET = 'test-secret';
process.env.OPENROUTER_API_KEY = 'test-key';

// Dynamic import ensures env vars are set before config.ts loads
const config = await import('../src/config');
const { containsExplicitContent, getSystemPrompt, getHermesSystemPrompt, MODELS, englishExplicit } = config;

describe('containsExplicitContent', () => {
  test('detects English profanity', () => {
    assert.equal(containsExplicitContent('what the fuck'), true);
    assert.equal(containsExplicitContent('this is shit'), true);
    assert.equal(containsExplicitContent('damn it'), true);
  });

  test('detects specific English terms', () => {
    assert.equal(containsExplicitContent('what a bitch'), true);
    assert.equal(containsExplicitContent('holy shit'), true);
    assert.equal(containsExplicitContent('dick joke'), true);
  });

  test('detects Thai explicit content', () => {
    assert.equal(containsExplicitContent('ควยไอสัส'), true);
    assert.equal(containsExplicitContent('เสียวมาก'), true);
  });

  test('returns false for clean English text', () => {
    assert.equal(containsExplicitContent('Hello, how are you?'), false);
    assert.equal(containsExplicitContent('The weather is nice today.'), false);
    assert.equal(containsExplicitContent('I love translation bots!'), false);
  });

  test('returns false for clean Thai text', () => {
    assert.equal(containsExplicitContent('สวัสดีครับ คุณเป็นอย่างไรบ้าง?'), false);
    assert.equal(containsExplicitContent('วันนี้อากาศดีนะ'), false);
  });

  test('handles empty and non-string input', () => {
    assert.equal(containsExplicitContent(''), false);
    assert.equal(containsExplicitContent(null as any), false);
  });
});

describe('getSystemPrompt', () => {
  test('includes user profiles for known users', () => {
    const prompt = getSystemPrompt('english', 'th', []);
    assert.ok(prompt.includes('English Speaker'));
    assert.ok(prompt.includes('37 years old from England'));
    assert.ok(prompt.includes('Thai Speaker'));
    assert.ok(prompt.includes('19 years old from Thailand'));
  });

  test('includes profanity handling instructions', () => {
    const prompt = getSystemPrompt('english', 'th', []);
    assert.ok(prompt.includes('NEVER filter, censor, or refuse to translate profanity'));
    assert.ok(prompt.includes('Do NOT use robotic or formal language'));
  });

  test('includes context messages when provided', () => {
    const context = [
      { text: 'Hello', language: 'en' as const },
      { text: 'สวัสดี', language: 'th' as const },
    ];
    const prompt = getSystemPrompt('english', 'th', context);
    assert.ok(prompt.includes('Hello'));
    assert.ok(prompt.includes('สวัสดี'));
  });
});

describe('getHermesSystemPrompt', () => {
  test('includes raw translation directives', () => {
    const prompt = getHermesSystemPrompt('en', 'th');
    assert.ok(prompt.includes('unfiltered'));
    assert.ok(prompt.includes('DO NOT filter, censor, or refuse any content'));
    assert.ok(prompt.includes('no disclaimers, and no safety warnings'));
  });

  test('includes tone preservation directive', () => {
    const prompt = getHermesSystemPrompt('en', 'th');
    assert.ok(prompt.includes('Preserve the tone'));
  });

  test('correctly sets source and target languages', () => {
    const en2th = getHermesSystemPrompt('en', 'th');
    assert.ok(en2th.includes('English to Thai'));

    const th2en = getHermesSystemPrompt('th', 'en');
    assert.ok(th2en.includes('Thai to English'));
  });
});

describe('MODELS', () => {
  test('has correct model IDs', () => {
    assert.equal(MODELS.PRIMARY, 'nousresearch/hermes-3-llama-3.1-405b');
    assert.equal(MODELS.CLAUDE, 'anthropic/claude-sonnet-5');
    assert.equal(MODELS.GEMINI, 'google/gemini-3.7-flash');
  });
});

describe('maskProfanity', () => {
  function maskProfanity(text: string): { maskedText: string; profanityTokens: string[] } {
    const tokens: string[] = [];
    const words = text.split(/(\s+)/);
    const maskedWords = words.map((word) => {
      if (englishExplicit.test(word)) {
        tokens.push(word);
        return `[PROFANITY:${tokens.length}]`;
      }
      return word;
    });
    return { maskedText: maskedWords.join(''), profanityTokens: tokens };
  }

  test('masks single profanity token', () => {
    const result = maskProfanity('what the fuck are you doing');
    assert.ok(result.maskedText.includes('[PROFANITY:1]'));
    assert.equal(result.profanityTokens.length, 1);
    assert.equal(result.profanityTokens[0], 'fuck');
  });

  test('masks multiple profanity tokens', () => {
    const result = maskProfanity('fuck and shit');
    assert.equal(result.profanityTokens.length, 2);
    assert.equal(result.profanityTokens[0], 'fuck');
    assert.equal(result.profanityTokens[1], 'shit');
  });

  test('returns clean text unchanged', () => {
    const result = maskProfanity('Hello world');
    assert.equal(result.maskedText, 'Hello world');
    assert.equal(result.profanityTokens.length, 0);
  });

  test('preserves spaces around masked tokens', () => {
    const result = maskProfanity('what the fuck are you');
    assert.ok(result.maskedText.includes('[PROFANITY:1]'));
    assert.ok(result.maskedText.includes('are you'));
  });
});
