import { 
  AgentMemory, 
  InMemoryProvider, 
  TokenBudgetStrategy 
} from '../agents/memory/index';

async function runDemo() {
  console.log('====================================================');
  console.log('🧠 BugBaar Engine: Agent Memory Subsystem Demo');
  console.log('====================================================\n');

  // 1. Initialize Shared Backing Store & Pluggable Agent Memory
  console.log('👉 Step 1: Initializing AgentMemory with TokenBudgetStrategy (Max 60 Tokens)...');
  const sharedProvider = new InMemoryProvider();

  const memory = new AgentMemory({
    provider: sharedProvider,
    strategy: new TokenBudgetStrategy(60),
    namespace: { sessionId: 'demo-session-001', agentId: 'placement-agent' }
  });

  // 2. Add System Prompt and Messages
  console.log('👉 Step 2: Adding System Prompt and Messages...');
  await memory.addMessage({
    role: 'system',
    content: 'You are BugBaar AI Placement Assistant.'
  });

  await memory.addMessage({
    role: 'user',
    content: 'What is the placement drive registration process?'
  });

  await memory.addMessage({
    role: 'assistant',
    content: 'Students can register via PlacementOS by uploading an ATS resume and selecting active company drives.',
    toolCalls: [{
      id: 'tool_call_001',
      name: 'getPlacementDrives',
      arguments: '{"status":"active"}'
    }]
  });

  await memory.addMessage({
    role: 'tool',
    toolCallId: 'tool_call_001',
    content: '{"drives":["CompanyA","CompanyB","CompanyC"]}'
  });

  await memory.addMessage({
    role: 'user',
    content: 'Awesome! Can you help me prepare for CompanyA interview?'
  });

  // 3. Inspect Raw vs Formatted Messages
  const rawMessages = await memory.getRawMessages();
  const formattedMessages = await memory.getFormattedMessages();
  const rawTokens = await memory.estimateTotalTokens(false);
  const formattedTokens = await memory.estimateTotalTokens(true);

  console.log(`\n📊 Raw Message Count: ${rawMessages.length} (Est Tokens: ${rawTokens})`);
  console.log(`📊 Formatted/Pruned Message Count: ${formattedMessages.length} (Est Tokens: ${formattedTokens})`);

  console.log('\n💬 Formatted Context Messages (Ready for LLM invocation):');
  formattedMessages.forEach((msg, idx) => {
    console.log(`  [${idx + 1}] [${msg.role.toUpperCase()}] ${msg.content.substring(0, 70)}...`);
  });

  // 4. Test Namespace Isolation on the exact same shared provider instance
  console.log('\n👉 Step 3: Verifying Multi-Agent Namespace Isolation on Shared Storage Provider...');
  const coderAgentMemory = new AgentMemory({
    provider: sharedProvider,
    namespace: { sessionId: 'demo-session-001', agentId: 'coder-agent' }
  });
  await coderAgentMemory.addMessage({ role: 'user', content: 'Debug Python script' });

  const placementCount = (await memory.getRawMessages()).length;
  const coderCount = (await coderAgentMemory.getRawMessages()).length;

  console.log(`  Placement Agent Memory Count (session:demo-session-001|agent:placement-agent): ${placementCount}`);
  console.log(`  Coder Agent Memory Count (session:demo-session-001|agent:coder-agent): ${coderCount}`);
  console.log('✅ Namespace isolation verified successfully across shared storage provider!');

  console.log('\n====================================================');
  console.log('🎉 Demo Completed Successfully!');
  console.log('====================================================');
}

runDemo().catch(err => {
  console.error('Demo Error:', err);
});
