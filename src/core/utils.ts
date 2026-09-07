/**
 * Utility functions for text processing
 */

/**
 * Detect if a string contains Thai text
 */
export function hasThaiText(text: string): boolean {
  // Thai Unicode range: U+0E00 to U+0E7F
  const thaiUnicodeRange = /[\u0E00-\u0E7F]/;
  return thaiUnicodeRange.test(text);
}

/**
 * Detect if a string contains English text (Latin characters)
 */
export function hasEnglishText(text: string): boolean {
  // Basic Latin letters (A-Z, a-z) minus Thai
  const latinChars = /[A-Za-z]/;
  return latinChars.test(text) && !isOnlyThai(text);
}

/**
 * Check if text is only Thai (no significant English)
 */
export function isOnlyThai(text: string): boolean {
  const thaiUnicodeRange = /[\u0E00-\u0E7F]/;
  const latinChars = /[A-Za-z]/;

  const hasThai = thaiUnicodeRange.test(text);
  const hasLatin = latinChars.test(text);

  return hasThai && !hasLatin;
}

/**
 * Check if text is only English (no Thai)
 */
export function isOnlyEnglish(text: string): boolean {
  return hasEnglishText(text) && !hasThaiText(text);
}

/**
 * Extract emojis from text
 */
export function extractEmojis(text: string): string[] {
  // Unicode emoji ranges
  const emojiRegex = /[\u2600-\u26FF\u2700-\u27BF]|[\uFE00-\uFE0F\u200D]|[^\x00-\x7F][^\x00-\x7F?]/g;
  const emojis: string[] = [];
  let match;

  while ((match = emojiRegex.exec(text)) !== null) {
    emojis.push(match[0]);
  }

  return emojis;
}

/**
 * Remove emojis from text
 */
export function removeEmojis(text: string): string {
  // Remove various emoji ranges including skin tone modifiers, ZWJ sequences
  const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}][\uFE0F\u200D]*/gu;
  return text.replace(emojiRegex, '');
}

/**
 * Remove URLs from text
 */
export function removeUrls(text: string): string {
  // Match http, https, ftp, and other common URL patterns
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+\.[^\s]+)|(ftp:\/\/[^\s]+)|[^\s]+@[^\s]+\.[^\s]+/gi;
  return text.replace(urlRegex, '').replace(/\s+/g, ' ').trim();
}

/**
 * Check if message should be skipped (image, video, sticker, etc.)
 */
export function shouldSkipMessage(message: { type?: string; text?: string }): boolean {
  if (!message.type) return false;

  const skipTypes = ['image', 'video', 'audio', 'file', 'sticker', 'animation', 'postback', 'follow', 'join', 'leave', 'message'];

  // Skip non-text message types
  if (message.type !== 'text') {
    return true;
  }

  // Skip if no text content
  if (!message.text || message.text.trim() === '') {
    return true;
  }

  return false;
}

/**
 * Clean text for translation (remove URLs but keep emojis)
 */
export function cleanTextForTranslation(text: string): string {
  let cleaned = text;

  // Remove URLs
  cleaned = removeUrls(cleaned);

  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * Detect language of text
 */
export function detectLanguage(text: string): 'en' | 'th' | 'mixed' {
  const hasThai = hasThaiText(text);
  const hasEnglish = hasEnglishText(text);

  if (hasThai && hasEnglish) return 'mixed';
  if (hasThai) return 'th';
  if (hasEnglish) return 'en';

  // Default to English for pure numbers/symbols
  return 'en';
}

/**
 * Extract pure text content (for sending to AI)
 * Filters out URLs, keeps emojis
 */
export function extractTextContent(text: string): string {
  // Remove URLs first
  let result = removeUrls(text);

  // Trim whitespace
  result = result.trim();

  return result;
}

/**
 * Check if message is a command or should be ignored
 */
export function isCommandMessage(text: string): boolean {
  const commands = ['/translate', '/help', '/reset', '@'];
  return commands.some(cmd => text.toLowerCase().startsWith(cmd));
}

/**
 * Detect a standalone Thai "hahaha" message.
 *
 * In Thai internet slang, laughter is written as a run of the Arabic
 * digit 5 (because 5 = "ha" in Thai), e.g. "55", "555", "5555".
 * A message that is ONLY such a run carries nothing to translate and
 * would just waste an API call — skip it.
 *
 * We match Arabic numerals only (Thais use 5, not ๕, for this).
 * A single "5" is not laughter, so we require at least two.
 */
export function isStandaloneThaiLaughter(text: string): boolean {
  return /^5{2,}$/.test(text.trim());
}

/**
 * Check if text contains only emojis (no meaningful text).
 * Used to skip emoji-only messages that waste API calls.
 */
export function isEmojiOnly(text: string): boolean {
  // Remove all emoji characters and whitespace, check if anything remains
  const stripped = text.replace(
    /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji}\uFE0F\u200D]/gu,
    ''
  ).replace(/[\s\n\r\t]/g, '');
  return stripped.length === 0 && text.replace(/[\s]/g, '').length > 0;
}

/**
 * Check if text is only a URL or link with no meaningful content.
 * Links don't need translation.
 */
export function isUrlOnly(text: string): boolean {
  const trimmed = text.trim();
  // Match various URL patterns
  const urlPatterns = [
    /^https?:\/\/[^\s]+$/i,
    /^www\.[^\s]+\.[^\s]+$/i,
    /^ftp:\/\/[^\s]+$/i,
    /^[^\s]+@[^\s]+\.[^\s]+$/i, // email
  ];
  if (urlPatterns.some((p) => p.test(trimmed))) return true;

  // Also check if after removing URLs there's nothing meaningful left
  const withoutUrls = trimmed
    .replace(/(https?:\/\/[^\s]+|www\.[^\s]+\.[^\s]+|ftp:\/\/[^\s]+|[^\s]+@[^\s]+\.[^\s]+)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutUrls.length === 0 && trimmed.length > 0;
}

/**
 * Check if text looks like a LINE system message.
 * System messages typically contain keywords like "joined", "left", "added", etc.
 */
export function isLineSystemMessage(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  const systemPatterns = [
    /^[\d:]+\s*(joined|left|added|removed|entered|invited)/,
    /^.*(has joined|has left|has been added|has been removed|entered the group|invited)/i,
    /^.*(joined using|invited by|link|qr code)/i,
  ];
  return systemPatterns.some((p) => p.test(trimmed));
}

/**
 * Check if text is a one-word response that doesn't need translation.
 * Includes: yes, yeah, no, ok, okay, sure, yup, yup, nope, lol, haha, etc.
 * These are universal or don't benefit from translation.
 */
export function isOneWordResponse(text: string): boolean {
  const trimmed = text.trim().toLowerCase();

  // Skip empty or whitespace-only
  if (!trimmed) return false;

  // Skip if contains Thai or has multiple words
  if (hasThaiText(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 1) return false;

  // Universal responses that don't need translation
  const universalResponses = [
    // English
    'yes', 'yeah', 'yup', 'yep', 'no', 'nope', 'ok', 'okay', 'sure',
    'lol', 'lmao', 'haha', 'hehe', 'wow', 'omg', 'wtf', 'ugh',
    'thanks', 'thank', 'thx', 'pls', 'please', 'hi', 'hey', 'yo',
    'bye', 'gtg', 'brb', 'afk', 'ok', 'k', 'kk', 'mmm', 'hmm',
    'ah', 'oh', 'uh', 'um', 'er', 'meh', 'ya', 'yea', 'aye', 'nay',
    // Thai romanization shortcuts
    '555', '5555', '55555', // Thai laughter (already caught elsewhere but doesn't hurt)
    'kh', 'kha', 'khrap', // Thai particles
  ];

  if (universalResponses.includes(trimmed)) return true;

  // Single letter responses
  if (/^[a-z]$/i.test(trimmed)) return true;

  return false;
}

/**
 * Escape special characters for logging
 */
export function escapeForLog(text: string): string {
  return text.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}
