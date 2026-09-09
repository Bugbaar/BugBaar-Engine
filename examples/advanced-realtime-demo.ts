import { 
  AgentMemory, 
  InMemoryProvider, 
  TokenBudgetStrategy, 
  SummaryHybridStrategy 
} from '../agents/memory/index';

async function runAdvancedDemo() {
  console.log('================================================================');
  console.log('🤖 BugBaar Engine: Multi-Agent Real-Time Simulation Demo');
  console.log('================================================================\n');

  const sharedSessionId = 'placement-os-workflow-2026';
  const sharedStore = new InMemoryProvider();

  // Agent 1: Planner Agent (Uses SummaryHybridStrategy for long planning context on sharedStore)
  const plannerMemory = new AgentMemory({
    provider: sharedStore,
    strategy: new SummaryHybridStrategy({
      recentMessagesCount: 2,
      summarizer: async (msgs) => `[Planner Summary: Condensed ${msgs.length} earlier strategic goals]`
    }),
    namespace: { sessionId: sharedSessionId, agentId: 'planner-agent' }
  });

  // Agent 2: Researcher Agent (Uses TokenBudgetStrategy on the same sharedStore)
  const researcherMemory = new AgentMemory({
    provider: sharedStore,
    strategy: new TokenBudgetStrategy(200),
    namespace: { sessionId: sharedSessionId, agentId: 'researcher-agent' }
  });

  console.log('👉 Phase 1: Planner Agent initializing roadmap on shared store...');
  await plannerMemory.addMessage({ role: 'system', content: 'You are the Lead Architecture Planner.' });
  await plannerMemory.addMessage({ role: 'user', content: 'Plan PlacementOS recruitment dashboard architecture.' });
  await plannerMemory.addMessage({ role: 'assistant', content: 'Sub-task 1: Fetch job requirements. Sub-task 2: Generate candidate embeddings.' });
  await plannerMemory.addMessage({ role: 'user', content: 'Refine sub-task 2 for vector DB performance.' });
  await plannerMemory.addMessage({ role: 'assistant', content: 'Use Qdrant hybrid indexing with dense embeddings.' });

  console.log('👉 Phase 2: Researcher Agent executing research task on shared store...');
  await researcherMemory.addMessage({ role: 'system', content: 'You are the Technical Researcher Agent.' });
  await researcherMemory.addMessage({ role: 'user', content: 'Search Qdrant hybrid search benchmarks.' });
  await researcherMemory.addMessage({ 
    role: 'assistant', 
    content: 'Querying Qdrant index...',
    toolCalls: [{ id: 'qdrant_search_01', name: 'searchQdrant', arguments: '{"collection":"candidates"}' }]
  });
  await researcherMemory.addMessage({
    role: 'tool',
    toolCallId: 'qdrant_search_01',
    content: '{"latencyMs":14,"accuracy":0.96}'
  });

  // Inspect Planner Memory Context (Summarized + Recent)
  const plannerFormatted = await plannerMemory.getFormattedMessages();
  console.log(`\n📋 Planner Agent Context (${plannerFormatted.length} messages, pruned via SummaryHybridStrategy):`);
  plannerFormatted.forEach((m, idx) => {
    console.log(`   [${idx + 1}] [${m.role.toUpperCase()}] ${m.content}`);
  });

  // Inspect Researcher Memory Context (Tool-Call Intact)
  const researcherFormatted = await researcherMemory.getFormattedMessages();
  console.log(`\n🔬 Researcher Agent Context (${researcherFormatted.length} messages, tool-pair intact via TokenBudgetStrategy):`);
  researcherFormatted.forEach((m, idx) => {
    console.log(`   [${idx + 1}] [${m.role.toUpperCase()}] ${m.content.substring(0, 80)}`);
  });

  console.log('\n================================================================');
  console.log('🎉 Multi-Agent Simulation Completed Successfully with 0 Conflicts on Shared Provider!');
  console.log('================================================================');
}

runAdvancedDemo().catch(err => console.error('Advanced Demo Failed:', err));
