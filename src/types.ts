/**
 * Type definitions for LINE Translation Bot
 */

// User profiles for personalized translation
export interface UserProfile {
  id: string;
  name: string;
  age: number;
  origin: string;
  nativeLanguage: 'en' | 'th';
  learningLanguage: 'en' | 'th';
  learningLevel: 'beginner' | 'intermediate' | 'advanced' | 'none';
}

// Message types
export interface TranslatedMessage {
  original: string;
  translated: string;
  sourceLanguage: 'en' | 'th';
  targetLanguage: 'en' | 'th';
  userId: string;
  recipientId: string;
  timestamp: number;
}

// Cache for conversation memory (stores last N messages)
export interface MessageCache {
  [groupId: string]: Array<{
    userId: string;
    message: string;
    language: 'en' | 'th';
    timestamp: number;
  }>;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: 'en' | 'th';
  targetLanguage: 'en' | 'th';
  context?: Array<{ text: string; language: 'en' | 'th' }>;
  testProvider?: 'claude' | 'gemini' | 'hermes';
  bypassExplicitCheck?: boolean;
}

export interface TranslationResponse {
  success: boolean;
  translatedText: string;
  usedFallback: boolean;
  provider: 'claude' | 'gemini' | 'hermes';
  usedExplicit: boolean;
  error?: string;
}

// LINE API types (partial)
export interface LineEvent {
  replyToken?: string;
  type: string;
  timestamp: number;
  source: {
    type: string;
    userId?: string;
    groupId?: string;
  };
  message?: {
    type: string;
    id: string;
    text?: string;
  };
}

// Bot configuration
export interface BotConfig {
  channelAccessToken: string;
  channelSecret: string;
    openrouterApiKey: string;
  openrouterSiteUrl?: string;
  openrouterSiteTitle?: string;
  maxMemoryMessages: number;
  enableProfanityTranslation: boolean;
}