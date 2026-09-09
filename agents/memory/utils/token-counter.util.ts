import { BaseMessage } from '../interfaces/message.interface.js';

export class TokenCounter {
  /**
   * Fast, lightweight token estimator (~3.8 characters per token for English text & JSON)
   */
  public static estimateString(text: string): number {
    if (!text) return 0;
    // Base estimation: ~4 chars = 1 token, plus minimum 1 token for non-empty text
    return Math.ceil(text.length / 3.8);
  }

  /**
   * Estimates token count for a complete BaseMessage, including metadata and tool calls
   */
  public static estimateMessage(message: BaseMessage): number {
    let tokens = 3; // Role formatting token overhead

    if (message.content) {
      tokens += this.estimateString(message.content);
    }

    if (message.name) {
      tokens += this.estimateString(message.name);
    }

    if (message.toolCalls && message.toolCalls.length > 0) {
      for (const call of message.toolCalls) {
        tokens += 4; // Function call structure overhead
        tokens += this.estimateString(call.name);
        tokens += this.estimateString(call.arguments);
      }
    }

    if (message.toolCallId) {
      tokens += this.estimateString(message.toolCallId);
    }

    return tokens;
  }

  /**
   * Estimates total tokens across an array of BaseMessages
   */
  public static estimateMessages(messages: BaseMessage[]): number {
    return messages.reduce((total, msg) => total + this.estimateMessage(msg), 0);
  }
}
