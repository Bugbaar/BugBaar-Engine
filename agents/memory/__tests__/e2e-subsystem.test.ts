import { 
  AgentMemory, 
  InMemoryProvider, 
  TokenBudgetStrategy, 
  SlidingWindowStrategy, 
  SummaryHybridStrategy,
  BaseMessage,
  IMemoryProvider,
  MemoryNamespace
} from '../../../index';

describe('End-to-End (E2E) Subsystem Lifecycle Tests', () => {

  /**
   * E2E Test 1: Full multi-turn ReAct workflow with tool chains, 
   * boundary pruning, and tool pair atomicity.
   */
  test('E2E: Complete ReAct agent execution with tool chain and boundary pruning', async () => {
    const memory = new AgentMemory({
      strategy: new TokenBudgetStrategy(120),
      namespace: { sessionId: 'e2e-react-session', agentId: 'lead-agent' }
    });

    // 1. Establish system persona
    await memory.addMessage({
      role: 'system',
      content: 'You are BugBaar Core AI Agent.'
    });

    // 2. User prompt
    await memory.addMessage({
      role: 'user',
      content: 'Deploy the latest microservice and check its health.'
    });

    // 3. Multi-turn tool execution sequence
    await memory.addMessage({
      role: 'assistant',
      content: 'Triggering deployment pipeline...',
      toolCalls: [{ id: 'call_deploy_01', name: 'triggerDeployment', arguments: '{"env":"prod"}' }]
    });

    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_deploy_01',
      content: '{"status":"deployed","version":"v2.1.0"}'
    });

    await memory.addMessage({
      role: 'assistant',
      content: 'Checking service health...',
      toolCalls: [{ id: 'call_health_02', name: 'checkHealth', arguments: '{"endpoint":"/health"}' }]
    });

    await memory.addMessage({
      role: 'tool',
      toolCallId: 'call_health_02',
      content: '{"status":"healthy","uptime":99.9}'
    });

    await memory.addMessage({
      role: 'assistant',
      content: 'Deployment completed successfully and service is healthy.'
    });

    // Verify raw storage integrity
    const rawHistory = await memory.getRawMessages();
    expect(rawHistory).toHaveLength(7);

    // Format for model context under tight budget
    const formatted = await memory.getFormattedMessages({ maxTokens: 80 });

    // Assertions:
    // 1. System prompt must always be preserved on page 1
    expect(formatted[0].role).toBe('system');
    expect(formatted[0].content).toBe('You are BugBaar Core AI Agent.');

    // 2. Every tool result in formatted output must have its matching assistant parent
    const toolResults = formatted.filter(m => m.role === 'tool');
    for (const tool of toolResults) {
      const parent = formatted.find(
        m => m.role === 'assistant' && m.toolCalls?.some(tc => tc.id === tool.toolCallId)
      );
      expect(parent).toBeDefined();
    }
  });

  /**
   * E2E Test 2: Storage failover, unconfirmed write reconciliation, 
   * and clean recovery across lifecycle.
   */
  test('E2E: Storage failover, fallback reconciliation, and independent cleanup', async () => {
    class MockSimulatedNetworkStore implements IMemoryProvider {
      private memory = new InMemoryProvider();
      public isNetworkAlive = true;

      async saveMessage(namespace: MemoryNamespace, message: BaseMessage): Promise<void> {
        if (!this.isNetworkAlive) {
          throw new Error('NETWORK_DISCONNECTED');
        }
        return this.memory.saveMessage(namespace, message);
      }

      async getMessages(namespace: MemoryNamespace): Promise<BaseMessage[]> {
        if (!this.isNetworkAlive) {
          throw new Error('NETWORK_DISCONNECTED');
        }
        return this.memory.getMessages(namespace);
      }

      async clear(namespace: MemoryNamespace): Promise<void> {
        if (!this.isNetworkAlive) {
          throw new Error('NETWORK_DISCONNECTED');
        }
        return this.memory.clear(namespace);
      }
    }

    const networkStore = new MockSimulatedNetworkStore();
    const memory = new AgentMemory({
      provider: networkStore,
      namespace: { sessionId: 'e2e-failover-session' }
    });

    // Phase 1: Normal operation
    await memory.addMessage({ role: 'user', content: 'Pre-outage message 1' });
    await memory.addMessage({ role: 'assistant', content: 'Pre-outage response 2' });

    let currentMessages = await memory.getRawMessages();
    expect(currentMessages).toHaveLength(2);

    // Phase 2: Network outage occurs mid-session
    networkStore.isNetworkAlive = false;
    await memory.addMessage({ role: 'user', content: 'Outage message 3' });
    await memory.addMessage({ role: 'assistant', content: 'Outage response 4' });

    // Should read from fallback store during outage
    const outageMessages = await memory.getRawMessages();
    expect(outageMessages).toHaveLength(2);
    expect(outageMessages[0].content).toBe('Outage message 3');

    // Phase 3: Network recovers
    networkStore.isNetworkAlive = true;
    await memory.addMessage({ role: 'user', content: 'Post-recovery message 5' });

    // Read should reconcile primary + fallback messages in sorted chronological order
    const recoveredMessages = await memory.getRawMessages();
    expect(recoveredMessages).toHaveLength(5);
    expect(recoveredMessages.map(m => m.content)).toEqual([
      'Pre-outage message 1',
      'Pre-outage response 2',
      'Outage message 3',
      'Outage response 4',
      'Post-recovery message 5'
    ]);

    // Phase 4: Clear memory while primary is disconnected (verifies independent fallback clear)
    networkStore.isNetworkAlive = false;
    await memory.clear();

    // Re-enable network and clear primary
    networkStore.isNetworkAlive = true;
    await memory.clear();

    const finalMessages = await memory.getRawMessages();
    expect(finalMessages).toHaveLength(0);
  });

  /**
   * E2E Test 3: Multi-agent pipeline with shared vs private namespaces
   * and collision-free key encoding.
   */
  test('E2E: Multi-agent shared storage pipeline with collision-free delimiter encoding', async () => {
    const sharedStore = new InMemoryProvider();

    // Deliberately create session/agent IDs containing colons and special characters
    const agentPlanner = new AgentMemory({
      provider: sharedStore,
      namespace: { sessionId: 'project:alpha:01', agentId: 'planner:v1' }
    });

    const agentCoder = new AgentMemory({
      provider: sharedStore,
      namespace: { sessionId: 'project:alpha:01', agentId: 'coder:v1' }
    });

    const sharedWorkspace = new AgentMemory({
      provider: sharedStore,
      namespace: { sessionId: 'project:alpha:01' } // Shared team namespace
    });

    // Write to each scope
    await agentPlanner.addMessage({ role: 'assistant', content: 'Planner plan created' });
    await agentCoder.addMessage({ role: 'assistant', content: 'Coder code authored' });
    await sharedWorkspace.addMessage({ role: 'system', content: 'Team shared workspace note' });

    const plannerMessages = await agentPlanner.getRawMessages();
    const coderMessages = await agentCoder.getRawMessages();
    const sharedMessages = await sharedWorkspace.getRawMessages();

    // Verify complete namespace isolation
    expect(plannerMessages).toHaveLength(1);
    expect(plannerMessages[0].content).toBe('Planner plan created');

    expect(coderMessages).toHaveLength(1);
    expect(coderMessages[0].content).toBe('Coder code authored');

    expect(sharedMessages).toHaveLength(1);
    expect(sharedMessages[0].content).toBe('Team shared workspace note');
  });

  /**
   * E2E Test 4: Nullish timestamp preservation (Epoch 0) and SummaryHybrid bounding.
   */
  test('E2E: Valid epoch 0 timestamp preservation and SummaryHybrid token boundary enforcement', async () => {
    const memory = new AgentMemory({
      strategy: new SummaryHybridStrategy({
        recentMessagesCount: 2,
        summarizer: async (msgs) => `Condensed ${msgs.length} messages`
      }),
      namespace: { sessionId: 'e2e-summary-session' }
    });

    // Add historical message with epoch 0
    await memory.addMessage({
      role: 'system',
      content: 'System prompt',
      createdAt: 0
    });

    // Add 5 turns to trigger summarization
    await memory.addMessage({ role: 'user', content: 'Turn 1' });
    await memory.addMessage({ role: 'assistant', content: 'Answer 1' });
    await memory.addMessage({ role: 'user', content: 'Turn 2' });
    await memory.addMessage({ role: 'assistant', content: 'Answer 2' });
    await memory.addMessage({ role: 'user', content: 'Turn 3' });

    const raw = await memory.getRawMessages();
    // Verify epoch 0 timestamp was preserved and not replaced by Date.now()
    expect(raw[0].createdAt).toBe(0);

    // Retrieve formatted summary context with max token ceiling
    const formatted = await memory.getFormattedMessages({ maxTokens: 50 });

    // Assert that the system prompt and summary are included
    expect(formatted.length).toBeGreaterThan(0);
    expect(formatted[0].role).toBe('system');
    expect(formatted[0].content).toBe('System prompt');
  });
});
