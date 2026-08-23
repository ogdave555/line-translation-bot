/**
 * Conversation Memory Management
 * Stores recent messages for context in translations
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { detectLanguage } from './utils';

// Path to memory storage file
const MEMORY_FILE = join(dirname(import.meta.url), '..', 'data', 'memory.json');

// Maximum messages to store per conversation
const MAX_MESSAGES_PER_GROUP = 20;

// In-memory cache (faster access)
interface MessageEntry {
  userId: string;
  text: string;
  language: 'en' | 'th';
  timestamp: number;
}

interface MemoryData {
  [groupId: string]: MessageEntry[];
}

let memoryCache: MemoryData = {};

/**
 * Initialize memory from file if exists
 */
export function initMemory(): void {
  try {
    if (existsSync(MEMORY_FILE)) {
      const data = readFileSync(MEMORY_FILE, 'utf-8');
      memoryCache = JSON.parse(data);
    } else {
      memoryCache = {};
    }
  } catch (error) {
    console.error('Failed to load memory:', error);
    memoryCache = {};
  }
}

/**
 * Save memory to file
 */
export function saveMemory(): void {
  try {
    const dir = dirname(MEMORY_FILE);
    
    // Ensure data directory exists
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(MEMORY_FILE, JSON.stringify(memoryCache, null, 2));
  } catch (error) {
    console.error('Failed to save memory:', error);
  }
}

/**
 * Add a message to memory
 */
export function addToMemory(
  groupId: string,
  userId: string,
  text: string
): void {
  if (!memoryCache[groupId]) {
    memoryCache[groupId] = [];
  }

  const language = detectLanguage(text) as 'en' | 'th';
  
  const entry: MessageEntry = {
    userId,
    text,
    language,
    timestamp: Date.now()
  };

  memoryCache[groupId].push(entry);

  // Keep only the last MAX_MESSAGES_PER_GROUP messages
  if (memoryCache[groupId].length > MAX_MESSAGES_PER_GROUP) {
    memoryCache[groupId] = memoryCache[groupId].slice(-MAX_MESSAGES_PER_GROUP);
  }

  // Save to file asynchronously
  saveMemory();
}

/**
 * Get recent messages from memory for context
 */
export function getRecentMessages(
  groupId: string,
  count: number = 10
): Array<{ text: string; language: 'en' | 'th' }> {
  if (!memoryCache[groupId]) {
    return [];
  }

  const messages = memoryCache[groupId].slice(-count);
  
  return messages.map((msg) => ({
    text: msg.text,
    language: msg.language
  }));
}

/**
 * Clear memory for a specific group
 */
export function clearGroupMemory(groupId: string): void {
  delete memoryCache[groupId];
  saveMemory();
}

/**
 * Clear all memory
 */
export function clearAllMemory(): void {
  memoryCache = {};
  saveMemory();
}

/**
 * Get total message count per group
 */
export function getMessageCount(groupId: string): number {
  return memoryCache[groupId]?.length || 0;
}

/**
 * Check if memory has recent context
 */
export function hasRecentContext(groupId: string): boolean {
  const messages = memoryCache[groupId];
  if (!messages || messages.length === 0) {
    return false;
  }

  // Check if last message was within last 1 hour
  const lastMessage = messages[messages.length - 1];
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  return lastMessage.timestamp > oneHourAgo;
}

// Export type for use in other modules
export type { MemoryData, MessageEntry };