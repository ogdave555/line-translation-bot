import { BotConfig } from './types';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * User profiles for personalized translation
 * 
 * The English speaker is a 37yo male from England who speaks a little bit of Thai.
 * The Thai speaker is a 19yo female from Thailand who speaks no English.
 */
export const USER_PROFILES: Record<string, {
  profile: {
    id: string;
    name: string;
    age: number;
    origin: string;
    nativeLanguage: 'en' | 'th';
    learningLanguage: 'en' | 'th';
    learningLevel: 'beginner' | 'intermediate' | 'advanced' | 'none';
  };
}> = {
  // English speaker (37yo male from England)
  'english-speaker': {
    profile: {
      id: 'english-speaker',
      name: 'English Speaker',
      age: 37,
      origin: 'England',
      nativeLanguage: 'en',
      learningLanguage: 'th',
      learningLevel: 'beginner'
    }
  },
  // Thai speaker (19yo female from Thailand)
  'thai-speaker': {
    profile: {
      id: 'thai-speaker',
      name: 'Thai Speaker',
      age: 19,
      origin: 'Thailand',
      nativeLanguage: 'th',
      learningLanguage: 'en',
      learningLevel: 'none'
    }
  }
};

/**
 * Get the bot configuration from environment variables
 */
export function getConfig(): BotConfig {
  const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
  const channelSecret = process.env.CHANNEL_SECRET;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!channelAccessToken) {
    throw new Error('CHANNEL_ACCESS_TOKEN is required in environment variables');
  }
  if (!channelSecret) {
    throw new Error('CHANNEL_SECRET is required in environment variables');
  }
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is required in environment variables');
  }
  if (!openrouterApiKey) {
    throw new Error('OPENROUTER_API_KEY is required in environment variables');
  }

  return {
    channelAccessToken,
    channelSecret,
    geminiApiKey,
    openrouterApiKey,
    openrouterSiteUrl: process.env.OPENROUTER_SITE_URL,
    openrouterSiteTitle: process.env.OPENROUTER_SITE_TITLE || 'LINE Translation Bot',
    maxMemoryMessages: 20, // Store last 20 messages for context
    enableProfanityTranslation: true // Translate profanity, don't filter
  };
}

/**
 * System prompt template for Gemini translation
 * 
 * Important: Translate profanity words even if they exist in the target language.
 * Do NOT filter or censor profanity content.
 */
export function getSystemPrompt(
  sourceUser: 'english' | 'thai',
  targetLanguage: 'en' | 'th',
  contextMessages?: Array<{ text: string; language: 'en' | 'th' }>,
): string {
  const englishProfile = USER_PROFILES['english-speaker'].profile;
  const thaiProfile = USER_PROFILES['thai-speaker'].profile;

  const sourceLanguage = sourceUser === 'english' ? 'en' : 'th';

  let contextSection = '';
  if (contextMessages && contextMessages.length > 0) {
    const contextText = contextMessages
      .map((msg) => `[${msg.language.toUpperCase()}] ${msg.text}`)
      .join('\n');
    contextSection = `
PREVIOUS CONVERSATION CONTEXT (last ${contextMessages.length} messages):
${contextText}

`;
  }

  return `
You are a LINE translation bot that translates between English (en) and Thai (th) in a private group conversation.

USER PROFILES:
1. English Speaker: ${englishProfile.name}, ${englishProfile.age} years old from ${englishProfile.origin}. Native language: English. Learning: Thai at ${englishProfile.learningLevel} level.

2. Thai Speaker: ${thaiProfile.name}, ${thaiProfile.age} years old from ${thaiProfile.origin}. Native language: Thai. Learning: English (has no English).

${contextSection}TRANSLATION REQUIREMENTS:
- Target language: ${targetLanguage === 'en' ? 'English' : 'Thai'}
- Source language: ${sourceLanguage === 'en' ? 'English' : 'Thai'}
- Make translations sound natural and conversational
- Restructure sentences if needed for natural flow
- Only translate the actual text content
- KEEP ALL EMOJIS in the message (don't translate them)
- KEEP ALL URLS as-is (don't translate or modify them)
- KEEP all images, videos, audio, files, stickers as-is (these should be skipped entirely)

PROFANITY HANDLING:
IMPORTANT: Preserve all profanity and sexual content in translations.
- If the profanity word exists in the target language, translate it normally
- If the profanity concept exists but not the exact word, find an equivalent
- NEVER filter, censor, or refuse to translate profanity
- Never mention or acknowledge profanity - just translate it

RESPONSE STYLE:
- Do NOT add "Translator:" or similar prefixes
- Do NOT add explanations or disclaimers
- Reply directly with the translated text only
- Keep the same tone as the original message
- Do NOT use robotic or formal language

CONVERSATION CONTEXT:
${sourceLanguage === 'en' 
  ? 'The English speaker is translating to Thai for the Thai speaker.'
  : 'The Thai speaker is translating to English for the English speaker.'
}

Now translate the following text to ${targetLanguage === 'en' ? 'English' : 'Thai'}:
`;
}

/**
 * System prompt for OpenRouter fallback translation
 */
export function getOpenRouterSystemPrompt(
  targetLanguage: 'en' | 'th'
): string {
  return `You are a translation AI specialized in ${targetLanguage === 'en' ? 'English' : 'Thai'} translation.
Translate text from ${targetLanguage === 'en' ? 'Thai' : 'English'} to ${targetLanguage === 'en' ? 'English' : 'Thai'}.
Preserve profanity in translations - do NOT filter sexual or vulgar content.
Output only the translated text, nothing else.`;
}