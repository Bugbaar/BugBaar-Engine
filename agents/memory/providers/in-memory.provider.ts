import { BaseMessage } from '../interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from '../interfaces/provider.interface';

/**
 * In-memory storage provider for agent message histories.
 * Provides zero-dependency, isolated storage using session and agent namespaces.
 */
export class InMemoryProvider implements IMemoryProvider {
  private store: Map<string, BaseMessage[]> = new Map();

  /**
   * Generates a collision-free key from a memory namespace.
   * @param namespace The session and optional agent namespace.
   * @returns Formatted storage key string.
   */
  private getStorageKey(namespace: MemoryNamespace): string {
    const safeSession = encodeURIComponent(namespace.sessionId);
    const safeAgent = namespace.agentId ? encodeURIComponent(namespace.agentId) : '__default__';
    return `session:${safeSession}|agent:${safeAgent}`;
  }

  /**
   * Persists a message to the in-memory store under the given namespace.
   * @param namespace The target memory namespace.
   * @param message The message payload to save.
   */
  public async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
    const key = this.getStorageKey(namespace);
    const existing = this.store.get(key) || [];

    const enrichedMessage: BaseMessage = {
      ...message,
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: message.createdAt ?? Date.now()
    };

    existing.push(enrichedMessage);
    this.store.set(key, existing);
  }

  /**
   * Retrieves all messages stored under the given namespace.
   * @param namespace The target memory namespace.
   * @returns Array of stored BaseMessage objects.
   */
  public async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
    const key = this.getStorageKey(namespace);
    const messages = this.store.get(key) || [];
    return [...messages];
  }

  /**
   * Clears all messages stored under the given namespace.
   * @param namespace The target memory namespace.
   */
  public async clear(namespace: MemoryNamespace): Promise<void> {
    const key = this.getStorageKey(namespace);
    this.store.delete(key);
  }

  /**
   * Deletes a specific message by its unique ID.
   * @param namespace The target memory namespace.
   * @param messageId The ID of the message to delete.
   * @returns True if a message was deleted, false otherwise.
   */
  public async deleteMessage(namespace: MemoryNamespace, messageId: string): Promise<boolean> {
    const key = this.getStorageKey(namespace);
    const messages = this.store.get(key);
    if (!messages) return false;

    const initialLength = messages.length;
    const filtered = messages.filter(m => m.id !== messageId);
    this.store.set(key, filtered);
    return filtered.length < initialLength;
  }
}
