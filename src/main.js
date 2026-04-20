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
const relayMessagesEl = document.getElementById('relay-messages');
const promptInput = document.getElementById('prompt-input');
const sendBtn = document.getElementById('send-btn');
const addNodeBtn = document.getElementById('add-node-btn');
const addNodeModal = document.getElementById('add-node-modal');
const cancelNodeBtn = document.getElementById('cancel-node-btn');
const saveNodeBtn = document.getElementById('save-node-btn');

function init() {
  renderNodes();
  checkAllNodes();
  setInterval(checkAllNodes, 30000);

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

  sendBtn.addEventListener('click', sendManualRelay);

  // Socket Signal Handlers
  socket.on('signal_start', (data) => {
    addSignalCard(data);
    totalSignals++;
    totalSignalsEl.innerText = totalSignals;
    addRelayLog(`>> Incoming signal: [REF:${data.id}] Routing to ${data.node}`);
  });

  socket.on('signal_success', (data) => {
    updateSignalCard(data, 'SUCCESS');
    addRelayLog(`<< Signal successful: [REF:${data.id}] Latency: ${data.latency}ms`);
  });

  socket.on('signal_error', (data) => {
    updateSignalCard(data, 'ERROR');
    addRelayLog(`!! Signal Failure: [REF:${data.id}] Error: ${data.error}`);
  });
}

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

function addSignalCard(data) {
  const empty = document.querySelector('.empty-state');
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

function addRelayLog(text) {
  const log = document.createElement('div');
  log.className = 'msg system';
  log.innerText = text;
  relayMessagesEl.appendChild(log);
  relayMessagesEl.scrollTop = relayMessagesEl.scrollHeight;
}

async function sendManualRelay() {
  const text = promptInput.value.trim();
  if (!text) return;
  
  addRelayLog(`>> Manual Intervention: ${text}`);
  promptInput.value = '';

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'manual-override',
        messages: [{ role: 'user', content: text }]
      })
    });
    const data = await response.json();
    addRelayLog(`<< Response: ${data.choices[0].message.content}`);
  } catch (e) {
    addRelayLog(`!! Manual Intervention Failed: ${e.message}`);
  }
}

init();
