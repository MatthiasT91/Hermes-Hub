import './style.css';
import { io } from 'socket.io-client';

// Initial State
let nodes = JSON.parse(localStorage.getItem('hermes_nodes')) || [
  { id: 'primary-core', name: 'Hermes Primary (Local)', url: 'http://localhost:11434/v1', status: 'offline', lastCheck: null }
];
let activeNodeId = 'primary-core';
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
    const url = document.getElementById('join-url-input').value.trim();
    if (!name || !url) return;

    joinSubmitBtn.innerText = 'SCANNING...';
    joinSubmitBtn.disabled = true;

    try {
      const response = await fetch('/api/pool/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url })
      });
      const data = await response.json();

      joinResult.style.display = 'block';
      if (data.success) {
        joinResult.style.background = 'rgba(0, 255, 157, 0.1)';
        joinResult.style.color = 'var(--status-online)';
        joinResult.innerHTML = `
          ✅ ${data.message}<br>
          🔑 Your API Key: <strong>${data.apiKey}</strong><br>
          🧠 Models: ${data.modelsDetected.join(', ') || 'None detected (is your model running?)'}
        `;
        navigator.clipboard.writeText(data.apiKey);
      } else {
        joinResult.style.background = 'rgba(255, 62, 62, 0.1)';
        joinResult.style.color = 'var(--status-offline)';
        joinResult.innerText = `❌ ${data.error}`;
      }
    } catch (e) {
      joinResult.style.display = 'block';
      joinResult.style.background = 'rgba(255, 62, 62, 0.1)';
      joinResult.style.color = 'var(--status-offline)';
      joinResult.innerText = `❌ Connection failed: ${e.message}`;
    }

    joinSubmitBtn.innerText = 'SCAN & JOIN';
    joinSubmitBtn.disabled = false;
  });

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
