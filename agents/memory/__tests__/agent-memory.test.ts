import { AgentMemory } from '../agent-memory';
import { InMemoryProvider } from '../providers/in-memory.provider';
import { SlidingWindowStrategy } from '../strategies/sliding-window.strategy';
import { TokenBudgetStrategy } from '../strategies/token-budget.strategy';
import { SummaryHybridStrategy } from '../strategies/summary-hybrid.strategy';
import { TokenCounter } from '../utils/token-counter.util';

describe('AgentMemory Subsystem Integration Tests', () => {
  let memory: AgentMemory;

  beforeEach(() => {
    memory = new AgentMemory({
      provider: new InMemoryProvider(),
      strategy: new TokenBudgetStrategy(100), // Small budget for testing truncation
      namespace: { sessionId: 'test-session', agentId: 'test-agent' }
    });
  });

  test('should store and retrieve system, user, and assistant messages', async () => {
    await memory.addMessage({ role: 'system', content: 'You are a helpful assistant.' });
    await memory.addMessage({ role: 'user', content: 'Hello, AI!' });
    await memory.addMessage({ role: 'assistant', content: 'Hello! How can I assist you today?' });

    const raw = await memory.getRawMessages();
    expect(raw).toHaveLength(3);
    expect(raw[0].role).toBe('system');
    expect(raw[1].content).toBe('Hello, AI!');
  });

  test('should support tool call and tool result messages', async () => {
    await memory.addMessage({
      role: 'assistant',
      content: 'Invoking tool...',
      toolCalls: [{ id: 'call_1', name: 'searchDB', arguments: '{"query":"placement"}' }]
    });

    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_1',
      content: '{"status":"success","results":[]}'
    });

    const raw = await memory.getRawMessages();
    expect(raw).toHaveLength(2);
    expect(raw[0].toolCalls).toBeDefined();
    expect(raw[0].toolCalls![0].name).toBe('searchDB');
    expect(raw[1].role).toBe('tool');
  });

  test('should sanitize orphaned tool result messages if assistant tool call was pruned', async () => {
    // Add older assistant tool call and tool result
    await memory.addMessage({
      role: 'assistant',
      content: 'Older call',
      toolCalls: [{ id: 'call_old', name: 'search', arguments: '{}' }]
    });
    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_old',
      content: 'Old result'
    });

    // Add large messages that consume the budget and push the assistant tool call out of context
    await memory.addMessage({ role: 'user', content: 'Very long user prompt '.repeat(4) });

    const formatted = await memory.getFormattedMessages({ maxTokens: 40 });
    const toolResults = formatted.filter(m => m.role === 'tool');
    expect(toolResults.some(t => t.toolCallId === 'call_old')).toBe(false);
    for (const tool of toolResults) {
      const parent = formatted.find(
        m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === tool.toolCallId)
      );
      expect(parent).toBeDefined();
    }
  });

  test('should enforce sliding window max message limits', async () => {
    const slidingMemory = new AgentMemory({
      strategy: new SlidingWindowStrategy(2),
      namespace: { sessionId: 'sliding-session' }
    });

    await slidingMemory.addMessage({ role: 'system', content: 'System instruction' });
    await slidingMemory.addMessage({ role: 'user', content: 'Message 1' });
    await slidingMemory.addMessage({ role: 'user', content: 'Message 2' });
    await slidingMemory.addMessage({ role: 'user', content: 'Message 3' });

    const formatted = await slidingMemory.getFormattedMessages();
    expect(formatted).toHaveLength(3);
    expect(formatted[0].role).toBe('system');
    expect(formatted[1].content).toBe('Message 2');
    expect(formatted[2].content).toBe('Message 3');
  });

  test('should support SummaryHybridStrategy lazy context condensation', async () => {
    const summaryMemory = new AgentMemory({
      strategy: new SummaryHybridStrategy({
        recentMessagesCount: 2,
        summarizer: async (msgs) => `Condensed ${msgs.length} messages into summary`
      }),
      namespace: { sessionId: 'summary-session' }
    });

    await summaryMemory.addMessage({ role: 'system', content: 'System prompt' });
    await summaryMemory.addMessage({ role: 'user', content: 'Q1' });
    await summaryMemory.addMessage({ role: 'assistant', content: 'A1' });
    await summaryMemory.addMessage({ role: 'user', content: 'Q2' });
    await summaryMemory.addMessage({ role: 'assistant', content: 'A2' });

    const formatted = await summaryMemory.getFormattedMessages();
    // System prompt + 1 Summary Message + 2 Recent messages = 4
    expect(formatted).toHaveLength(4);
    expect(formatted[0].content).toBe('System prompt');
    expect(formatted[1].content).toContain('Condensed 2 messages');
    expect(formatted[2].content).toBe('Q2');
    expect(formatted[3].content).toBe('A2');
  });

  test('should enforce token budget ceilings and retain system message', async () => {
    await memory.addMessage({ role: 'system', content: 'System instruction' });
    await memory.addMessage({ role: 'user', content: 'This is a long sentence meant to consume tokens '.repeat(3) });
    await memory.addMessage({ role: 'user', content: 'This is the most recent user prompt' });

    const formatted = await memory.getFormattedMessages({ maxTokens: 40 });
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted[0].role).toBe('system');

    const tokenCount = TokenCounter.estimateMessages(formatted);
    expect(tokenCount).toBeLessThanOrEqual(50);
  });

  test('should isolate contexts across different namespaces', async () => {
    const memAgentA = new AgentMemory({
      namespace: { sessionId: 'session-1', agentId: 'AgentA' }
    });

    const memAgentB = new AgentMemory({
      namespace: { sessionId: 'session-1', agentId: 'AgentB' }
    });

    await memAgentA.addMessage({ role: 'user', content: 'Secret for A' });
    await memAgentB.addMessage({ role: 'user', content: 'Secret for B' });

    const rawA = await memAgentA.getRawMessages();
    const rawB = await memAgentB.getRawMessages();

    expect(rawA).toHaveLength(1);
    expect(rawA[0].content).toBe('Secret for A');

    expect(rawB).toHaveLength(1);
    expect(rawB[0].content).toBe('Secret for B');
  });

  test('stress test: should handle 100 rapid messages cleanly', async () => {
    const stressMemory = new AgentMemory({
      strategy: new TokenBudgetStrategy(500),
      namespace: { sessionId: 'stress-session' }
    });

    for (let i = 1; i <= 100; i++) {
      await stressMemory.addMessage({ role: 'user', content: `Stress message #${i}` });
    }

    const raw = await stressMemory.getRawMessages();
    expect(raw).toHaveLength(100);

    const formatted = await stressMemory.getFormattedMessages();
    expect(formatted.length).toBeLessThan(100);
    expect(formatted.length).toBeGreaterThan(0);
  });

  test('should reject invalid or empty message inputs and omit them from storage', async () => {
    // @ts-ignore
    await memory.addMessage(null);
    // @ts-ignore
    await memory.addMessage({});
    // @ts-ignore
    await memory.addMessage({ role: 'invalid_role', content: 'test' });

    const stored = await memory.getRawMessages();
    expect(stored).toHaveLength(0);
  });
});
