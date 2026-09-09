import { BaseMessage } from './message.interface.js';

export interface StrategyOptions {
  maxTokens?: number;
  maxMessages?: number;
  systemMessagePriority?: boolean;
}

export interface IContextStrategy {
  /**
   * Prunes and formats messages according to the specific context window strategy.
   * System messages are retained at the top if systemMessagePriority is enabled.
   */
  prune(messages: BaseMessage[], options?: StrategyOptions): Promise<BaseMessage[]>;
}
