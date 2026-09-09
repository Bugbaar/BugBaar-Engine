import { BaseMessage } from '../interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from '../interfaces/provider.interface';
import { InMemoryProvider } from './in-memory.provider';

export interface RedisOptions {
  host?: string;
  port?: number;
  keyPrefix?: string;
  client?: any; // Generic duck-typing for ioredis / node-redis
}

/**
 * Distributed Redis storage provider for agent memory with automatic in-memory failover.
 */
export class RedisProvider implements IMemoryProvider {
  private fallbackProvider: InMemoryProvider;
  private client: any;
  private keyPrefix: string;
  private isConnected: boolean = false;

  constructor(options: RedisOptions = {}) {
    this.fallbackProvider = new InMemoryProvider();
    this.keyPrefix = options.keyPrefix || 'bugbaar:memory:';
    this.client = options.client || null;

    if (this.client) {
      this.isConnected = true;
    }
  }

  /**
   * Generates a prefixed, collision-free key for Redis storage.
   * @param namespace The memory namespace.
   * @returns Formatted Redis key.
   */
  private getStorageKey(namespace: MemoryNamespace): string {
    const safeSession = encodeURIComponent(namespace.sessionId);
    const safeAgent = namespace.agentId ? encodeURIComponent(namespace.agentId) : '__default__';
    return `${this.keyPrefix}session:${safeSession}|agent:${safeAgent}`;
  }

  /**
   * Saves a message to Redis, falling back to local memory if Redis is unavailable.
   * @param namespace The target memory namespace.
   * @param message The message payload.
   */
  public async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
    if (!this.isConnected || !this.client) {
      return this.fallbackProvider.saveMessage(namespace, message);
    }

    try {
      const key = this.getStorageKey(namespace);
      const enrichedMessage: BaseMessage = {
        ...message,
        id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        createdAt: message.createdAt ?? Date.now()
      };
      await this.client.rpush(key, JSON.stringify(enrichedMessage));
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis save failed. Falling back to InMemoryProvider:', error);
      await this.fallbackProvider.saveMessage(namespace, message);
    }
  }

  /**
   * Retrieves messages from Redis, reconciling any uncommitted fallback messages.
   * @param namespace The target memory namespace.
   * @returns Array of stored BaseMessage objects.
   */
  public async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
    if (!this.isConnected || !this.client) {
      return this.fallbackProvider.getMessages(namespace);
    }

    try {
      const key = this.getStorageKey(namespace);
      const rawMessages: string[] = await this.client.lrange(key, 0, -1);
      const redisMessages: BaseMessage[] = rawMessages.map(item => JSON.parse(item));
      const fallbackMessages = await this.fallbackProvider.getMessages(namespace);

      if (fallbackMessages.length === 0) {
        return redisMessages;
      }

      // Reconcile and deduplicate unconfirmed fallback messages
      const mergedMap = new Map<string, BaseMessage>();
      for (const msg of [...redisMessages, ...fallbackMessages]) {
        if (msg.id) mergedMap.set(msg.id, msg);
      }
      return Array.from(mergedMap.values()).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis get failed. Falling back to InMemoryProvider:', error);
      return this.fallbackProvider.getMessages(namespace);
    }
  }

  /**
   * Clears messages from Redis and the fallback memory store.
   * @param namespace The target memory namespace.
   */
  public async clear(namespace: MemoryNamespace): Promise<void> {
    try {
      if (this.isConnected && this.client) {
        const key = this.getStorageKey(namespace);
        await this.client.del(key);
      }
    } catch (error) {
      console.warn('[RedisProvider Warning] Redis clear failed:', error);
    } finally {
      await this.fallbackProvider.clear(namespace);
    }
  }
}
