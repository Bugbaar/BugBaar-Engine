import { BaseMessage } from '../interfaces/message.interface';
import { IContextStrategy, StrategyOptions } from '../interfaces/strategy.interface';
import { TokenCounter } from '../utils/token-counter.util';

export class TokenBudgetStrategy implements IContextStrategy {
  private defaultMaxTokens: number;

  constructor(defaultMaxTokens: number = 4000) {
    this.defaultMaxTokens = defaultMaxTokens;
  }

  public async prune(messages: BaseMessage[], options: StrategyOptions = {}): Promise<BaseMessage[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    const tokenCeiling = options.maxTokens || this.defaultMaxTokens;
    const maxCount = options.maxMessages;
    const keepSystem = options.systemMessagePriority !== false;

    const systemMessages = keepSystem ? messages.filter(m => m.role === 'system') : [];
    let nonSystemMessages = keepSystem ? messages.filter(m => m.role !== 'system') : messages;

    // Apply maxMessages count constraint if explicitly provided
    if (maxCount !== undefined && nonSystemMessages.length > maxCount) {
      nonSystemMessages = nonSystemMessages.slice(-maxCount);
    }

    // Estimate system message token overhead
    const systemTokenCount = TokenCounter.estimateMessages(systemMessages);
    let availableTokenBudget = tokenCeiling - systemTokenCount;

    if (availableTokenBudget <= 0) {
      return systemMessages;
    }

    const resultNonSystem: BaseMessage[] = [];

    // Traverse non-system messages in reverse order (newest first)
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = TokenCounter.estimateMessage(msg);

      if (availableTokenBudget - msgTokens >= 0) {
        resultNonSystem.unshift(msg);
        availableTokenBudget -= msgTokens;
      } else {
        break;
      }
    }

    // Sanitize orphaned tool result messages (role: 'tool' without matching assistant tool_calls)
    const sanitizedList = this.sanitizeToolCallPairs(resultNonSystem);

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
