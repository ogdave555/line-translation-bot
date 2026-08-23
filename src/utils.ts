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
 * Escape special characters for logging
 */
export function escapeForLog(text: string): string {
  return text.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
}