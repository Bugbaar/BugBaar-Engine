import { BaseMessage } from './message.interface.js';

export interface MemoryNamespace {
  sessionId: string;
  agentId?: string;
}

export interface IMemoryProvider {
  /**
   * Save a new message into memory store
   */
  saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void>;

  /**
   * Get all raw messages for a given namespace
   */
  getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]>;

  /**
   * Clear all messages for a given namespace
   */
  clear(namespace: MemoryNamespace): Promise<void>;

  /**
   * Delete a specific message by ID (if supported)
   */
  deleteMessage?(namespace: MemoryNamespace, messageId: string): Promise<boolean>;
}
