import { AgentMemory } from '../agent-memory';
import { BaseMessage } from '../interfaces/message.interface';
import { IMemoryProvider, MemoryNamespace } from '../interfaces/provider.interface';
import { InMemoryProvider } from '../providers/in-memory.provider';
import { SlidingWindowStrategy } from '../strategies/sliding-window.strategy';
import { TokenBudgetStrategy } from '../strategies/token-budget.strategy';
import { SummaryHybridStrategy } from '../strategies/summary-hybrid.strategy';

/**
 * Mock Failing Storage Provider to simulate network drops (Redis/Database downtime)
 */
class FailingStorageProvider implements IMemoryProvider {
  private fallback: InMemoryProvider = new InMemoryProvider();
  public shouldFail: boolean = true;

  async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
    if (this.shouldFail) {
      throw new Error('ECONNREFUSED: Redis connection lost');
    }
    return this.fallback.saveMessage(namespace, message);
  }

  async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
    if (this.shouldFail) {
      throw new Error('ETIMEDOUT: Redis read timeout');
    }
    return this.fallback.getMessages(namespace);
  }

  async clear(namespace: MemoryNamespace): Promise<void> {
    if (this.shouldFail) {
      throw new Error('ECONNREFUSED: Redis connection lost');
    }
    return this.fallback.clear(namespace);
  }
}

describe('Real-Time Agent Workflows & Fault Injection Scenarios', () => {

  test('Scenario 1: Multi-Step ReAct Tool Execution Chain', async () => {
    const memory = new AgentMemory({
      strategy: new TokenBudgetStrategy(150),
      namespace: { sessionId: 'react-session-001', agentId: 'react-agent' }
    });

    // Step 1: User prompt
    await memory.addMessage({ role: 'user', content: 'Fetch student data and calculate ATS score' });

    // Step 2: Assistant tool call 1
    await memory.addMessage({
      role: 'assistant',
      content: 'Fetching student record...',
      toolCalls: [{ id: 'call_step1', name: 'getStudent', arguments: '{"studentId":"S123"}' }]
    });

    // Step 3: Tool 1 output
    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_step1',
      content: '{"name":"Alex","skills":["Python","TypeScript","FastAPI"]}'
    });

    // Step 4: Assistant tool call 2
    await memory.addMessage({
      role: 'assistant',
      content: 'Calculating ATS score...',
      toolCalls: [{ id: 'call_step2', name: 'calculateATS', arguments: '{"targetRole":"AI Engineer"}' }]
    });

    // Step 5: Tool 2 output
    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_step2',
      content: '{"atsScore":92,"recommendation":"Strong Match"}'
    });

    // Step 6: Final Answer
    await memory.addMessage({
      role: 'assistant',
      content: 'Alex has a 92% ATS score for the AI Engineer role!'
    });

    const formatted = await memory.getFormattedMessages();
    expect(formatted.length).toBeGreaterThan(0);
    
    // Verify tool call pair integrity: all tool messages must have their corresponding assistant call present
    const toolMessages = formatted.filter(m => m.role === 'tool');
    expect(toolMessages.length).toBeGreaterThan(0);
    for (const tool of toolMessages) {
      const parent = formatted.find(
        m => m.role === 'assistant' && m.toolCalls?.some(c => c.id === tool.toolCallId)
      );
      expect(parent).toBeDefined();
    }
  });

  test('Scenario 2: Concurrent Multi-Agent Operations (Race Condition Test)', async () => {
    const sharedProvider = new InMemoryProvider();
    const agentCount = 10;
    const tasks: Promise<void>[] = [];

    for (let i = 1; i <= agentCount; i++) {
      const agentId = `agent-${i}`;
      const memory = new AgentMemory({
        provider: sharedProvider,
        namespace: { sessionId: 'shared-session-xyz', agentId }
      });

      tasks.push((async () => {
        await memory.addMessage({ role: 'user', content: `Task from ${agentId}` });
        await memory.addMessage({ role: 'assistant', content: `Result from ${agentId}` });
      })());
    }

    // Execute 10 agents concurrently
    await Promise.all(tasks);

    // Verify isolation per agent
    for (let i = 1; i <= agentCount; i++) {
      const agentId = `agent-${i}`;
      const memory = new AgentMemory({
        provider: sharedProvider,
        namespace: { sessionId: 'shared-session-xyz', agentId }
      });

      const messages = await memory.getRawMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe(`Task from ${agentId}`);
    }
  });

  test('Scenario 3: Storage Provider Fault Injection & Graceful Fallback', async () => {
    const failingProvider = new FailingStorageProvider();
    const memory = new AgentMemory({
      provider: failingProvider,
      namespace: { sessionId: 'fault-session', agentId: 'fault-agent' }
    });

    // Write during provider outage should be stored in fallback and retrievable
    await memory.addMessage({ role: 'user', content: 'Critical message during outage' });

    const messages = await memory.getRawMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Critical message during outage');
  });

  test('Scenario 4: Dynamic Runtime Strategy & Option Switching', async () => {
    const memory = new AgentMemory({
      strategy: new TokenBudgetStrategy(4000),
      namespace: { sessionId: 'dynamic-session' }
    });

    await memory.addMessage({ role: 'system', content: 'System instruction' });
    await memory.addMessage({ role: 'user', content: 'Prompt 1' });
    await memory.addMessage({ role: 'assistant', content: 'Response 1' });
    await memory.addMessage({ role: 'user', content: 'Prompt 2' });

    // 1. Initial retrieval under default 4000 token budget
    let formatted = await memory.getFormattedMessages();
    expect(formatted).toHaveLength(4);

    // 2. Dynamically constrain maxMessages on the fly
    formatted = await memory.getFormattedMessages({ maxMessages: 2 });
    expect(formatted).toHaveLength(3); // System prompt + 2 recent messages
  });

  test('Scenario 5: High-Payload & Unicode/Emoji Edge Cases', async () => {
    const memory = new AgentMemory();

    const largePayload = 'A'.repeat(20000); // 20KB string
    const unicodeText = '🚀 BugBaar AI Engine — 🤖 智能代理体系 — Special Characters: <>"\'&/\%';

    await memory.addMessage({ role: 'user', content: unicodeText });
    await memory.addMessage({ role: 'assistant', content: largePayload });

    const raw = await memory.getRawMessages();
    expect(raw).toHaveLength(2);
    expect(raw[0].content).toBe(unicodeText);

    // Verify token estimation on large payload
    const tokenEst = await memory.estimateTotalTokens(false);
    expect(tokenEst).toBeGreaterThan(5000);
  });
});
