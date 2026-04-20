import './style.css';
import { io } from 'socket.io-client';

// Initial State
let nodes = JSON.parse(localStorage.getItem('hermes_nodes')) || [];
nodes = nodes.filter(n => n.id !== 'primary-core'); // Force clean old ghost node from browser cache
localStorage.setItem('hermes_nodes', JSON.stringify(nodes));
let activeNodeId = nodes.length > 0 ? nodes[0].id : null;

let totalSignals = 0;

// Socket Connection
const socket = io();

// DOM Elements
const nodeListEl = document.getElementById('node-list');
const signalStream = document.getElementById('signal-stream');
const totalSignalsEl = document.getElementById('total-signals');
const activeNodeDisplay = document.getElementById('active-node-display');
const addNodeBtn = document.getElementById('add-node-btn');
const addNodeModal = document.getElementById('add-node-modal');
const cancelNodeBtn = document.getElementById('cancel-node-btn');
const saveNodeBtn = document.getElementById('save-node-btn');
const genAuthBtn = document.getElementById('gen-auth-btn');
const currentTokenDisplay = document.getElementById('current-token-display');
const modelPoolEl = document.getElementById('model-pool');

// Join Network Elements
const joinNetworkBtn = document.getElementById('join-network-btn');
const joinModal = document.getElementById('join-modal');
const joinCancelBtn = document.getElementById('join-cancel-btn');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const joinResult = document.getElementById('join-result');

function init() {
  renderNodes();
  checkAllNodes();
  setInterval(checkAllNodes, 30000);
  loadPool();

  // Sync with Backend on load
  syncWithBackend();

  // Event Listeners
  addNodeBtn.addEventListener('click', () => addNodeModal.classList.add('active'));
  cancelNodeBtn.addEventListener('click', () => addNodeModal.classList.remove('active'));

  saveNodeBtn.addEventListener('click', () => {
    const name = document.getElementById('node-name-input').value.trim();
    const url = document.getElementById('node-url-input').value.trim();
    if (name && url) {
      const newNode = {
        id: Date.now().toString(),
        name,
        url: url.endsWith('/') ? url.slice(0, -1) : url,
        status: 'offline',
        lastCheck: null
      };
      nodes.push(newNode);
      saveNodes();
      renderNodes();
      checkNodeStatus(newNode);
      addNodeModal.classList.remove('active');
    }
  });

  // Join Network
  joinNetworkBtn.addEventListener('click', () => {
    joinResult.style.display = 'none';
    joinModal.classList.add('active');
  });
  joinCancelBtn.addEventListener('click', () => joinModal.classList.remove('active'));

  joinSubmitBtn.addEventListener('click', async () => {
    const name = document.getElementById('join-name-input').value.trim();
    const ownerKey = document.getElementById('join-key-input').value.trim();
    if (!name) return;

    joinSubmitBtn.innerText = 'SCANNING LOCALHOST...';
    joinSubmitBtn.disabled = true;

    try {
      // Direct browser-to-localhost model discovery
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      const data = await response.json();
      
      const discoveredModels = data.models ? data.models.map(m => m.name) : [];
      
      if (discoveredModels.length === 0) {
        throw new Error("Local instance running, but no models found.");
      }

      // Found models! Send to Hub via WebSocket
      socket.emit('register_browser_node', { name, models: discoveredModels, ownerKey: ownerKey || localStorage.getItem('hermes_hivemind_key') });

      joinResult.style.display = 'block';
      joinResult.style.background = 'rgba(255, 170, 0, 0.1)';
      joinResult.style.color = 'var(--status-pending)';
      joinResult.innerText = `⏳ Pinging Hub with ${discoveredModels.length} models...`;

    } catch (e) {
      joinResult.style.display = 'block';
      joinResult.style.background = 'rgba(255, 62, 62, 0.1)';
      joinResult.style.color = 'var(--status-offline)';
      joinResult.innerHTML = `❌ Connection failed: ${e.message}<br><br><span style="color:#fff;">Hint: Did you open Ollama with <code>OLLAMA_ORIGINS="*"</code>?</span>`;
      joinSubmitBtn.innerText = 'CONNECT LOCAL NODE';
      joinSubmitBtn.disabled = false;
    }
  });

  // Handle successful registration from Hub
  socket.on('registration_success', (data) => {
    localStorage.setItem('hermes_hivemind_key', data.apiKey);
    joinResult.style.background = 'rgba(0, 255, 157, 0.1)';
    joinResult.style.color = 'var(--status-online)';
    joinResult.innerHTML = `
      ✅ ${data.message}<br>
      🔑 Your API Key: <strong id="copy-key" style="cursor:pointer; text-decoration: underline;">${data.apiKey}</strong><br><br>
      <i>Keep this tab open. If you close it, your node goes offline!</i>
    `;
    
    document.getElementById('copy-key').addEventListener('click', () => {
      navigator.clipboard.writeText(data.apiKey);
      alert('API Key Copied!');
    });

    joinSubmitBtn.innerText = 'CONNECTED AS DONOR';
    // Visual Polish for "Active Donor" layout
    document.body.classList.add('active-donor');
  });

  // Auto-Connect if we have a saved key
  const savedKey = localStorage.getItem('hermes_hivemind_key');
  if (savedKey) {
    console.log("Hivemind Key detected, ready for reconnect...");
    // If we want it fully auto, we'd need to save the name too
  }

  // Security
  genAuthBtn.addEventListener('click', async () => {
    if (confirm("Regenerate Universal Auth Token? This will lock out all agents until they are updated with the new key.")) {
      try {
        const response = await fetch('/api/security/generate', { method: 'POST' });
        const data = await response.json();
        if (data.success) {
          currentTokenDisplay.innerText = `NEW TOKEN: ${data.token}`;
          currentTokenDisplay.style.color = "var(--accent-neon)";
          navigator.clipboard.writeText(data.token);
          alert("Token Generated and Saved to .env! (Copied to Clipboard)");
        }
      } catch (e) {
        alert("Failed to generate token. Check server logs.");
      }
    }
  });

  // Socket Signal Handlers
  socket.on('signal_start', (data) => {
    addSignalCard(data);
    totalSignals++;
    totalSignalsEl.innerText = totalSignals;
  });

  socket.on('signal_success', (data) => {
    updateSignalCard(data, 'SUCCESS');
  });

  socket.on('signal_error', (data) => {
    updateSignalCard(data, 'ERROR');
  });

  // Handle Incoming Compute Tasks from Hub (The Browser Routing Magic)
  socket.on('compute_task', async (data) => {
    const { taskId, request } = data;
    
    // Add glowing animation for "Processing Network Task..."
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
      
      // Send result back to the Hub via websockets
      socket.emit('task_result', { taskId, response: responseData });
    } catch (error) {
      // Send error back to the Hub
      socket.emit('task_result', { taskId, error: error.message });
    } finally {
      // Clean up glowing animation
      setTimeout(() => uiIndicator.remove(), 1000);
    }
  });

  // Pool Updates (Real-time)
  socket.on('pool_update', (pool) => {
    renderPool(pool);
  });
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
  if (!pool || pool.length === 0) {
    modelPoolEl.innerHTML = `
      <div class="empty-state" style="height: auto; padding: 2rem;">
        <span>No models registered yet. Be the first to join!</span>
      </div>
    `;
    return;
  }

  modelPoolEl.innerHTML = pool.map(node => `
    <div class="pool-node glass-card" style="padding: 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600; font-size: 0.85rem;">${node.name}</div>
        <div style="font-family: 'JetBrains Mono'; font-size: 0.65rem; color: var(--accent-neon);">${node.models.join(', ') || 'No models'}</div>
      </div>
      <div class="status-dot ${node.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    </div>
  `).join('');
}

// === Node Functions ===
function saveNodes() {
  localStorage.setItem('hermes_nodes', JSON.stringify(nodes));
  syncWithBackend();
}

function syncWithBackend() {
  fetch('/api/select-node', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: activeNodeId, nodes })
  });
}

function renderNodes() {
  nodeListEl.innerHTML = '';
  nodes.forEach(node => {
    const card = document.createElement('div');
    card.className = `node-card glass-card ${activeNodeId === node.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="node-info">
        <div class="node-name">${node.name}</div>
        <div class="node-url">${node.url}</div>
      </div>
      <div class="status-dot ${node.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    `;
    card.addEventListener('click', () => selectNode(node));
    nodeListEl.appendChild(card);
  });
}

function selectNode(node) {
  activeNodeId = node.id;
  activeNodeDisplay.innerText = `LINKING: ${node.name.toUpperCase()}`;
  renderNodes();
  saveNodes();
}

async function checkNodeStatus(node) {
  try {
    const response = await fetch(`${node.url}/models`);
    node.status = response.ok ? 'online' : 'offline';
  } catch (e) {
    node.status = 'offline';
  }
  renderNodes();
}

function checkAllNodes() {
  nodes.forEach(checkNodeStatus);
}

// === Signal Functions ===
function addSignalCard(data) {
  const empty = document.querySelector('.empty-state');
  if (empty && empty.closest('.signal-stream')) empty.remove();

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
}

function updateSignalCard(data, status) {
  const pane = document.getElementById(`res-pane-${data.id}`);
  if (!pane) return;

  if (status === 'SUCCESS') {
    const text = data.response.choices ? data.response.choices[0].message.content : 'Signal Received';
    pane.innerHTML = `<label>COMPLETE (${data.latency}ms)</label><pre>${text.substring(0, 100)}...</pre>`;
  } else {
    pane.innerHTML = `<label style="color: red;">DROPPED</label><pre style="color: red;">${data.error}</pre>`;
  }
}

init();
