import { BaseMessage } from '../interfaces/message.interface';
import { IContextStrategy, StrategyOptions } from '../interfaces/strategy.interface';

export class SlidingWindowStrategy implements IContextStrategy {
  private defaultMaxMessages: number;

  constructor(defaultMaxMessages: number = 10) {
    this.defaultMaxMessages = defaultMaxMessages;
  }

  public async prune(messages: BaseMessage[], options: StrategyOptions = {}): Promise<BaseMessage[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    const maxCount = options.maxMessages !== undefined ? options.maxMessages : this.defaultMaxMessages;
    const keepSystem = options.systemMessagePriority !== false;

    // Extract system messages if systemMessagePriority is enabled
    const systemMessages = keepSystem ? messages.filter(m => m.role === 'system') : [];
    const nonSystemMessages = keepSystem ? messages.filter(m => m.role !== 'system') : messages;

    // Get the most recent N messages
    const recentMessages = nonSystemMessages.slice(-maxCount);

    // Sanitize orphaned tool result messages
    const sanitizedList = this.sanitizeToolCallPairs(recentMessages);

    return [...systemMessages, ...sanitizedList];
  }

  /**
   * Prevents API 400 errors by stripping tool result messages whose parent assistant tool call was pruned
   */
  private sanitizeToolCallPairs(messages: BaseMessage[]): BaseMessage[] {
    const validToolCallIds = new Set<string>();

    // Collect all tool call IDs present in assistant messages
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const call of msg.toolCalls) {
          validToolCallIds.add(call.id);
        }
      }
    }

    // Filter out tool messages whose toolCallId is not in validToolCallIds
    return messages.filter(msg => {
      if (msg.role === 'tool') {
        return msg.toolCallId ? validToolCallIds.has(msg.toolCallId) : false;
      }
      return true;
    });
  }
}
