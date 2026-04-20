import './style.css';
import { io } from 'socket.io-client';

// Initial State
let nodes = [];
let totalSignals = 0;
const socket = io();

// Identity State
let operatorName = localStorage.getItem('hermes_operator_name') || '';
let apiKey = localStorage.getItem('hermes_hivemind_key') || '';

// DOM Elements
const nodeListEl = document.getElementById('node-list');
const signalStream = document.getElementById('signal-stream');
const totalSignalsEl = document.getElementById('total-signals');
const activeNodeDisplay = document.getElementById('active-node-display');
const modelPoolEl = document.getElementById('model-pool');

// Onboarding Elements
const setupIdentityBtn = document.getElementById('setup-identity-btn');
const identityModal = document.getElementById('identity-modal');
const idSaveBtn = document.getElementById('id-save-btn');
const idCancelBtn = document.getElementById('id-cancel-btn');
const idNameInput = document.getElementById('id-name-input');
const idResult = document.getElementById('id-result');
const profileStatus = document.getElementById('profile-status');
const step1Card = document.getElementById('step-1-card');
const step3Card = document.getElementById('step-3-card');
const pulseBtn = document.getElementById('pulse-btn');

// Pulse/Join Elements
const joinModal = document.getElementById('join-modal');
const joinCancelBtn = document.getElementById('join-cancel-btn');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const joinResult = document.getElementById('join-result');
const operatorTag = document.getElementById('operator-tag');
const modelDiscoveryList = document.getElementById('model-discovery-list');

// Chat Elements
const chatModelSelect = document.getElementById('chat-model-select');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

function init() {
  updateOnboardingUI();
  loadPool();

  // Chat Submission
  chatSendBtn.addEventListener('click', () => sendChatMessage());
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // If we already have an Identity, make sure the UI knows
  if (operatorName && apiKey) {
    console.log("Operator context restored. Ready to pulse.");
  }

  // Event Listeners
  setupIdentityBtn.addEventListener('click', () => {
    idResult.style.display = 'none';
    idNameInput.value = operatorName;
    identityModal.classList.add('active');
  });

  idCancelBtn.addEventListener('click', () => identityModal.classList.remove('active'));

  idSaveBtn.addEventListener('click', () => {
    const name = idNameInput.value.trim();
    if (name) {
      operatorName = name;
      localStorage.setItem('hermes_operator_name', name);
      
      // If we don't have a key, we'll get one on the first pulse or we can simulate it
      // But for better UX, let's just mark step 1 as complete
      identityModal.classList.remove('active');
      updateOnboardingUI();
    }
  });

  pulseBtn.addEventListener('click', async () => {
    operatorTag.innerText = operatorName.toUpperCase();
    joinResult.style.display = 'none';
    joinResult.innerText = '';
    joinSubmitBtn.disabled = false;
    joinSubmitBtn.innerText = 'INJECT INTO COLLECTIVE';
    joinModal.classList.add('active');
    
    // Auto-scan on modal open
    scanLocalModels();
  });

  joinCancelBtn.addEventListener('click', () => joinModal.classList.remove('active'));

  joinSubmitBtn.addEventListener('click', () => {
    if (discoveredModels.length > 0) {
      joinSubmitBtn.innerText = 'ESTABLISHING LINK...';
      joinSubmitBtn.disabled = true;
      socket.emit('register_browser_node', { 
        name: operatorName, 
        models: discoveredModels, 
        ownerKey: apiKey 
      });
    }
  });

  // Socket Signal Handlers
  socket.on('signal_start', addSignalCard);
  socket.on('signal_success', (data) => updateSignalCard(data, 'SUCCESS'));
  socket.on('signal_error', (data) => updateSignalCard(data, 'ERROR'));
  socket.on('pool_update', (pool) => renderPool(pool));

  socket.on('registration_success', (data) => {
    apiKey = data.apiKey;
    localStorage.setItem('hermes_collective_key', apiKey);
    
    joinResult.style.display = 'block';
    joinResult.style.background = 'rgba(0, 255, 157, 0.1)';
    joinResult.style.color = 'var(--status-online)';
    joinResult.innerHTML = `✅ CONNECTION SECURED<br>Identity: ${operatorName}<br>Key: ${apiKey.substring(0,8)}...`;
    
    document.body.classList.add('active-donor');
    updateOnboardingUI();
    
    setTimeout(() => joinModal.classList.remove('active'), 2000);
  });

  socket.on('compute_task', handleComputeTask);
}

// === Onboarding logic ===
function updateOnboardingUI() {
  if (operatorName) {
    step1Card.classList.add('active');
    profileStatus.innerText = operatorName.toUpperCase();
    setupIdentityBtn.innerText = 'EDIT';
    pulseBtn.disabled = false;
  } else {
    step1Card.classList.remove('active');
    profileStatus.innerText = 'Create your operator profile';
    setupIdentityBtn.innerText = 'SETUP';
    pulseBtn.disabled = true;
  }

  if (document.body.classList.contains('active-donor')) {
    step3Card.classList.add('active');
    pulseBtn.innerText = 'ONLINE';
    pulseBtn.style.color = 'var(--status-online)';
  } else {
    step3Card.classList.remove('active');
    pulseBtn.innerText = 'CONNECT';
    pulseBtn.style.color = 'var(--accent-gold)';
  }
}

let discoveredModels = [];
async function scanLocalModels() {
  modelDiscoveryList.innerText = 'Scanning localhost:11434...';
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    const data = await response.json();
    discoveredModels = data.models ? data.models.map(m => m.name || m.id) : [];
    
    if (discoveredModels.length > 0) {
      modelDiscoveryList.innerHTML = `<span style="color:var(--status-online)">FOUND ${discoveredModels.length} MODELS:</span><br>` + discoveredModels.join(', ');
    } else {
      modelDiscoveryList.innerHTML = `<span style="color:var(--status-offline)">NO MODELS DETECTED</span><br>Start Ollama with OLLAMA_ORIGINS="*"`;
    }
  } catch (e) {
    modelDiscoveryList.innerHTML = `<span style="color:var(--status-offline)">LOCAL AI NOT REACHABLE</span><br>Ensure Ollama is running on port 11434.`;
    discoveredModels = [];
  }
}

// === Pool Functions ===
async function loadPool() {
  try {
    const response = await fetch('/api/pool');
    const pool = await response.json();
    renderPool(pool);
  } catch (e) {
    console.error('Failed to load pool:', e);
  }
}

function renderPool(pool) {
  // Update Center Pool
  if (!pool || pool.length === 0) {
    modelPoolEl.innerHTML = `<div class="empty-state" style="padding: 2rem;">No peers connected.</div>`;
    nodeListEl.innerHTML = `<div style="font-size: 0.6rem; color: var(--text-muted); padding: 1rem;">No peers online.</div>`;
    return;
  }

  modelPoolEl.innerHTML = pool.map(node => `
    <div class="pool-node glass-card" style="padding: 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600; font-size: 0.85rem;">${node.name} ${node.approved ? '' : '(PENDING)'}</div>
        <div style="font-family: 'JetBrains Mono'; font-size: 0.65rem; color: var(--accent-neon);">${node.models.join(', ') || 'No models'}</div>
      </div>
      <div class="status-dot ${node.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    </div>
  `).join('');

  // Update Sidebar Peer List
  nodeListEl.innerHTML = pool.map(node => `
    <div class="node-row">
      <div class="node-name">${node.name}</div>
      <div class="status-dot ${node.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    </div>
  `).join('');

  // Sync Chat Model Selector
  const currentVal = chatModelSelect.value;
  chatModelSelect.innerHTML = '<option value="">Select a Model...</option>';
  const allModels = new Set();
  pool.forEach(node => {
    if (node.status === 'online' && node.approved) {
      node.models.forEach(m => allModels.add(m));
    }
  });
  
  allModels.forEach(model => {
    const opt = document.createElement('option');
    opt.value = model;
    opt.innerText = model;
    chatModelSelect.appendChild(opt);
  });
  if (allModels.has(currentVal)) chatModelSelect.value = currentVal;
}

// === Signal Functions ===
function addSignalCard(data) {
  const empty = signalStream.querySelector('.empty-state');
  if (empty) empty.remove();

  const card = document.createElement('div');
  card.id = `signal-${data.id}`;
  card.className = 'signal-card glass-card';

  const userText = data.request.messages ? data.request.messages[data.request.messages.length - 1].content : 'Binary Stream';

  card.innerHTML = `
    <div class="signal-meta">
       <span>ID: ${data.id}</span>
       <span>SOURCE: AGENT</span>
       <span>TIME: ${new Date().toLocaleTimeString()}</span>
    </div>
    <div style="font-size: 0.85rem; margin-bottom: 1rem; color: var(--accent-gold);">"${userText}"</div>
    <div class="data-grid">
       <div class="pane"><label>REQUEST</label><pre>${JSON.stringify(data.request, null, 1).substring(0, 100)}...</pre></div>
       <div class="pane" id="res-pane-${data.id}"><label>RESPONSE</label><pre style="color: var(--text-muted);">awaiting signal...</pre></div>
    </div>
  `;
  signalStream.prepend(card);
  totalSignals++;
  totalSignalsEl.innerText = totalSignals;
}

function updateSignalCard(data, status) {
  const pane = document.getElementById(`res-pane-${data.id}`);
  if (!pane) return;

  if (status === 'SUCCESS') {
    const text = data.response.choices ? data.response.choices[0].message.content : 'Signal Received';
    pane.innerHTML = `<label>COMPLETE (${data.latency}ms)</label><pre>${text.substring(0, 300)}...</pre>`;
  } else {
    pane.innerHTML = `<label style="color: red;">DROPPED</label><pre style="color: red;">${data.error}</pre>`;
  }
}

async function handleComputeTask(data) {
  const { taskId, request } = data;
  const uiIndicator = document.createElement('div');
  uiIndicator.className = 'processing-task-indicator glass';
  uiIndicator.innerHTML = `<span>⚡</span> Processing Network Task...`;
  document.body.appendChild(uiIndicator);

  try {
    const response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    const responseData = await response.json();
    socket.emit('task_result', { taskId, response: responseData });
  } catch (error) {
    socket.emit('task_result', { taskId, error: error.message });
  } finally {
    setTimeout(() => uiIndicator.remove(), 1000);
  }
}

init();

// === Chat Functions ===
async function sendChatMessage() {
  const model = chatModelSelect.value;
  const content = chatInput.value.trim();
  if (!model || !content) return;

  // Add User Bubble
  appendBubble('user', content);
  chatInput.value = '';

  // Add Loading Bubble
  const loadingId = 'loading-' + Date.now();
  appendBubble('ai', '...', loadingId);

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey || 'public_tester'}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: content }]
      })
    });

    const data = await response.json();
    const loadingEl = document.getElementById(loadingId);
    
    if (data.error) {
      loadingEl.innerText = `Error: ${data.error.message}`;
      loadingEl.style.color = 'var(--status-offline)';
    } else {
      loadingEl.innerText = data.choices[0].message.content;
    }
  } catch (e) {
    const loadingEl = document.getElementById(loadingId);
    loadingEl.innerText = `Transmission Failed: ${e.message}`;
  }
}

function appendBubble(role, text, id = null) {
  const placeholder = chatMessages.querySelector('.chat-placeholder');
  if (placeholder) placeholder.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  if (id) bubble.id = id;
  bubble.innerText = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
