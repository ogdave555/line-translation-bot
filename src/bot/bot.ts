/**
 * LINE Bot Event Handler
 * Handles incoming messages and triggers translation
 */

import { LineBotClient } from '@line/bot-sdk';
import { translateWithMemory } from '../translation/translator';
import { shouldSkipMessage, cleanTextForTranslation } from '../core/utils';
import type { LineEvent } from '../core/types';

/**
 * Bot event handler class
 */
export class Bot {
  private client: LineBotClient;
  
  constructor(channelAccessToken: string) {
    this.client = LineBotClient.fromChannelAccessToken({ channelAccessToken });
  }

  /**
   * Handle incoming LINE webhook event
   */
  async handleEvent(event: LineEvent): Promise<void> {
    // Only handle message events
    if (event.type !== 'message' || !event.message?.text) {
      return;
    }

    // Skip non-text messages
    if (shouldSkipMessage(event.message)) {
      return;
    }

    const text = event.message.text;
    const groupId = event.source.groupId;
    const userId = event.source.userId;

    if (!groupId || !userId) {
      console.warn('Message not in a group or missing user ID');
      return;
    }

    // Clean text (remove URLs, keep emojis)
    const cleanedText = cleanTextForTranslation(text);
    
    if (!cleanedText.trim()) {
      return;
    }

    // Perform translation with memory
    const result = await translateWithMemory(groupId, userId, cleanedText);
    
    if (!result.success) {
      console.error('Translation failed:', result.error);
      
      // Send error message to group
      if (event.replyToken) {
        await this.replyMessage(event.replyToken, 'Sorry, I had trouble translating that message.');
      }
      return;
    }

    // Send translated message as a reply
    if (event.replyToken && result.translatedText) {
      await this.replyMessage(event.replyToken, result.translatedText);
    }
  }

  /**
   * Reply to a message using LINE API
   */
  async replyMessage(replyToken: string, text: string): Promise<void> {
    try {
      await this.client.replyMessage({
        replyToken,
        messages: [
          {
            type: 'text' as const,
            text
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send reply:', error);
    }
  }

  /**
   * Send push message to a group (alternative to reply)
   */
  async pushMessage(to: string, text: string): Promise<void> {
    try {
      await this.client.pushMessage({
        to,
        messages: [
          {
            type: 'text' as const,
            text
          }
        ]
      });
    } catch (error) {
      console.error('Failed to push message:', error);
    }
  }
}

/**
 * Create bot instance from configuration
 */
export function createBot(channelAccessToken: string): Bot {
  return new Bot(channelAccessToken);
}