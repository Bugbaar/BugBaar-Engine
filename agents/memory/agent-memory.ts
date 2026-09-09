import { BaseMessage, MessageSchema } from './interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from './interfaces/provider.interface';
import { IContextStrategy, StrategyOptions } from './interfaces/strategy.interface';
import { InMemoryProvider } from './providers/in-memory.provider';
import { TokenBudgetStrategy } from './strategies/token-budget.strategy';
import { TokenCounter } from './utils/token-counter.util';

/**
 * Configuration options for initializing an AgentMemory instance.
 */
export interface AgentMemoryConfig {
  /** Pluggable storage provider. Defaults to InMemoryProvider. */
  provider?: IMemoryProvider;
  /** Context window pruning strategy. Defaults to TokenBudgetStrategy. */
  strategy?: IContextStrategy;
  /** Target session and optional agent namespace. */
  namespace?: MemoryNamespace;
  /** Default pruning options applied on retrieval. */
  defaultOptions?: StrategyOptions;
}

/**
 * Pluggable Agent Memory and Context Manager facade.
 * Orchestrates storage providers, context pruning strategies, namespace scoping,
 * and resilient 4-tier emergency fallback handling.
 */
export class AgentMemory {
  private provider: IMemoryProvider;
  private strategy: IContextStrategy;
  private namespace: MemoryNamespace;
  private defaultOptions: StrategyOptions;
  private fallbackMemory: InMemoryProvider;

  /**
   * Initializes a new AgentMemory instance with configurable provider, strategy, and namespace.
   * @param config Optional memory configuration.
   */
  constructor(config: AgentMemoryConfig = {}) {
    this.fallbackMemory = new InMemoryProvider();
    this.provider = config.provider || new InMemoryProvider();
    this.strategy = config.strategy || new TokenBudgetStrategy(4000);
    this.namespace = config.namespace || { sessionId: 'default-session', agentId: 'default-agent' };
    this.defaultOptions = config.defaultOptions || {};
  }

  /**
   * Safely adds a single message to memory with strict runtime Zod validation.
   * Falls back to internal storage if the primary provider write fails.
   * @param message The BaseMessage to add.
   */
  public async addMessage(message: BaseMessage): Promise<void> {
    try {
      if (!message) {
        console.warn('[AgentMemory] Skipping null or undefined message payload');
        return;
      }

      const parseResult = MessageSchema.safeParse(message);
      if (!parseResult.success) {
        console.warn('[AgentMemory] Invalid message schema:', parseResult.error.format());
        return;
      }

      await this.provider.saveMessage(this.namespace, parseResult.data as BaseMessage);
    } catch (error) {
      console.error('[AgentMemory] Provider write failed; routing to fallback store:', error);
      await this.fallbackMemory.saveMessage(this.namespace, message);
    }
  }

  /**
   * Safely adds an array of messages to memory in sequential order.
   * @param messages Array of BaseMessage objects.
   */
  public async addMessages(messages: BaseMessage[]): Promise<void> {
    if (!Array.isArray(messages)) return;
    for (const msg of messages) {
      await this.addMessage(msg);
    }
  }

  /**
   * Retrieves raw unpruned messages stored in memory, reconciling any fallback writes.
   * @returns Array of stored BaseMessage objects sorted chronologically.
   */
  public async getRawMessages(): Promise<BaseMessage[]> {
    try {
      const primaryMessages = await this.provider.getMessages(this.namespace);
      const fallbackMessages = await this.fallbackMemory.getMessages(this.namespace);

      if (fallbackMessages.length === 0) {
        return primaryMessages;
      }

      // Reconcile and merge unconfirmed fallback messages with primary data
      const mergedMap = new Map<string, BaseMessage>();
      for (const msg of [...primaryMessages, ...fallbackMessages]) {
        if (msg.id) mergedMap.set(msg.id, msg);
      }
      return Array.from(mergedMap.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    } catch (error) {
      console.error('[AgentMemory] Provider read failed; reading from fallback store:', error);
      return await this.fallbackMemory.getMessages(this.namespace);
    }
  }

  /**
   * Retrieves pruned and token-optimized messages formatted for LLM invocation.
   * Applies the configured pruning strategy and sanitizes tool-call pairs.
   * @param overrideOptions Optional runtime options to override default pruning constraints.
   * @returns Pruned and token-bounded BaseMessage array.
   */
  public async getFormattedMessages(overrideOptions: StrategyOptions = {}): Promise<BaseMessage[]> {
    try {
      const rawMessages = await this.getRawMessages();
      const options: StrategyOptions = {
        ...this.defaultOptions,
        ...overrideOptions
      };

      return await this.strategy.prune(rawMessages, options);
    } catch (error) {
      console.error('[AgentMemory] Strategy pruning failed; returning recent raw messages:', error);
      const raw = await this.getRawMessages();
      return raw.slice(-10); // Emergency fallback: return last 10 messages
    }
  }

  /**
   * Calculates the estimated token count of raw or pruned messages.
   * @param pruned Whether to estimate tokens on pruned messages (default: true).
   * @returns Estimated total token count.
   */
  public async estimateTotalTokens(pruned: boolean = true): Promise<number> {
    const messages = pruned ? await this.getFormattedMessages() : await this.getRawMessages();
    return TokenCounter.estimateMessages(messages);
  }

  /**
   * Clears memory state for the active namespace across both primary and fallback stores independently.
   */
  public async clear(): Promise<void> {
    try {
      await this.provider.clear(this.namespace);
    } catch (error) {
      console.error('[AgentMemory] Primary clear failed:', error);
    } finally {
      try {
        await this.fallbackMemory.clear(this.namespace);
      } catch (fallbackError) {
        console.error('[AgentMemory] Fallback clear failed:', fallbackError);
      }
    }
  }

  /**
   * Updates or switches the active namespace (sessionId / agentId).
   * @param namespace The new memory namespace.
   */
  public setNamespace(namespace: MemoryNamespace): void {
    if (namespace && namespace.sessionId) {
      this.namespace = { ...namespace };
    }
  }

  /**
   * Returns current active namespace.
   * @returns Current MemoryNamespace object.
   */
  public getNamespace(): MemoryNamespace {
    return { ...this.namespace };
  }
}
