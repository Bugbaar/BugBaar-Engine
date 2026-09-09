import { BaseMessage } from '../interfaces/message.interface';
import { IContextStrategy, StrategyOptions } from '../interfaces/strategy.interface';
import { TokenBudgetStrategy } from './token-budget.strategy';

export type SummarizerFunction = (messagesToSummarize: BaseMessage[]) => Promise<string>;

export interface SummaryHybridOptions extends StrategyOptions {
  recentMessagesCount?: number;
  summarizer?: SummarizerFunction;
}

export class SummaryHybridStrategy implements IContextStrategy {
  private fallbackStrategy: TokenBudgetStrategy;
  private recentCount: number;
  private summarizer?: SummarizerFunction;

  constructor(options: SummaryHybridOptions = {}) {
    this.fallbackStrategy = new TokenBudgetStrategy(options.maxTokens || 4000);
    this.recentCount = options.recentMessagesCount || 5;
    this.summarizer = options.summarizer;
  }

  public async prune(messages: BaseMessage[], options: SummaryHybridOptions = {}): Promise<BaseMessage[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    const recentLimit = options.recentMessagesCount || this.recentCount;
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    // If total non-system messages are within recent limit, no summarization needed
    if (nonSystemMessages.length <= recentLimit) {
      return this.fallbackStrategy.prune(messages, options);
    }

    const olderMessages = nonSystemMessages.slice(0, nonSystemMessages.length - recentLimit);
    const recentMessages = nonSystemMessages.slice(nonSystemMessages.length - recentLimit);

    try {
      let summaryText = '';
      const customSummarizer = options.summarizer || this.summarizer;

      if (customSummarizer) {
        summaryText = await customSummarizer(olderMessages);
      } else {
        summaryText = `[Summary: ${olderMessages.length} prior messages condensed]`;
      }

      const summaryMessage: BaseMessage = {
        role: 'system',
        content: summaryText,
        metadata: { isSummary: true, originalMessageCount: olderMessages.length }
      };

      return this.fallbackStrategy.prune(
        [...systemMessages, summaryMessage, ...recentMessages],
        options
      );
    } catch (error) {
      console.warn('[SummaryHybridStrategy Warning] Summarizer execution failed. Falling back to TokenBudgetStrategy:', error);
      return this.fallbackStrategy.prune(messages, options);
    }
  }
}
