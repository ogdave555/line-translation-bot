/**
 * LINE Translation Bot - Main Entry Point
 * 
 * A LINE bot that automatically translates English to Thai and vice versa.
 * 
 * Features:
 * - Personalized translation based on user profiles
 * - Conversation memory for context
 * - Profanity preservation (not filtering)
 * - Fallback to OpenRouter if Gemini fails
 * - Skips non-text messages (images, videos, URLs, emojis)
 */

import { getConfig } from './config.js';
import { initMemory } from './memory.js';

// Load configuration
const config = getConfig();
console.log('✅ LINE Translation Bot configuration loaded');

// Initialize memory
initMemory();
console.log('✅ Memory system initialized');

// Export bot creation function for Vercel
export { createBot } from './bot.js';
export { translate, translateWithMemory } from './translator.js';
export { getConfig } from './config.js';

// For local development testing
if (import.meta.url.replace('file://', '') === import.meta.dirname + '/index.ts' || 
    import.meta.url === 'node:process') {
  console.log(`
========================================
🚀 LINE Translation Bot
========================================
Configuration:
- Channel Access Token: ${config.channelAccessToken ? '✓ Set' : '✗ Missing'}
- Channel Secret: ${config.channelSecret ? '✓ Set' : '✗ Missing'}
- Gemini API Key: ${config.geminiApiKey ? '✓ Set' : '✗ Missing'}
- OpenRouter API Key: ${config.openrouterApiKey ? '✓ Set' : '✗ Missing'}

For production deployment to Vercel:
1. Set environment variables: CHANNEL_ACCESS_TOKEN, CHANNEL_SECRET, GEMINI_API_KEY, OPENROUTER_API_KEY
2. Deploy to Vercel
3. Configure LINE webhook URL to: https://your-vercel-app.vercel.app/api/webhook

========================================
`);
}

export default {};