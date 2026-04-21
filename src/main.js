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

// --- Core Initialization ---
function init() {
  updateOnboardingUI();

  // Chat Submission
  chatSendBtn.addEventListener('click', () => sendChatMessage());
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // Sidebar Toggles
  const leftSidebar = document.getElementById('left-sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const toggleLeftBtn = document.getElementById('toggle-left-btn');
  const toggleRightBtn = document.getElementById('toggle-right-btn');
  const zenChatBtn = document.getElementById('zen-chat-btn');
  const app = document.getElementById('app');

  toggleLeftBtn.addEventListener('click', () => {
    leftSidebar.classList.toggle('collapsed');
    toggleLeftBtn.innerText = leftSidebar.classList.contains('collapsed') ? '⟩' : '⟨';
  });

  toggleRightBtn.addEventListener('click', () => {
    rightSidebar.classList.toggle('collapsed');
    toggleRightBtn.innerText = rightSidebar.classList.contains('collapsed') ? '⟨' : '⟩';
  });

  zenChatBtn.addEventListener('click', () => {
    app.classList.toggle('zen-mode');
    if (app.classList.contains('zen-mode')) {
      const exitBtn = document.createElement('button');
      exitBtn.id = 'exit-zen-btn';
      exitBtn.innerText = 'EXIT ZEN MODE';
      exitBtn.className = 'mini-btn';
      exitBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 10000; background: var(--status-offline); color: white;';
      exitBtn.onclick = () => {
        app.classList.remove('zen-mode');
        exitBtn.remove();
      };
      document.body.appendChild(exitBtn);
    }
  });

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
      identityModal.classList.remove('active');
      updateOnboardingUI();
    }
  });

  pulseBtn.addEventListener('click', async () => {
    operatorTag.innerText = operatorName.toUpperCase();
    joinResult.style.display = 'none';
    joinSubmitBtn.disabled = false;
    joinSubmitBtn.innerText = 'INJECT INTO COLLECTIVE';
    joinModal.classList.add('active');
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

  loadChatHistory();
}

// --- Socket Handlers ---
socket.on('signal_start', (data) => {
  addSignalCard(data);
  const botInfo = botMap.get(data.targetId);
  if (botInfo) {
    botInfo.el.classList.add('active');
    botInfo.activeTask = true;
    clearBubble(botInfo);

    // Stop walking and face forward
    botInfo.state = 'idle';
    botInfo.el.classList.replace('walking', 'idle');
    botInfo.targetX = botInfo.x;
    botInfo.targetY = botInfo.y;
    botInfo.idleStart = Date.now();

    const userText = data.request.messages ? data.request.messages[data.request.messages.length - 1].content : 'Processing...';
    const shortText = userText.length > 20 ? userText.substring(0, 20) + '...' : userText;

    showBubble(botInfo, `🤔 ${shortText}`);

    const beam = document.createElement('div');
    beam.className = 'signal-beam';
    neuralMesh.appendChild(beam);
    setTimeout(() => beam.remove(), 1000);
  }
});

socket.on('signal_complete', (data) => {
  const { targetId } = data;
  const botInfo = botMap.get(targetId);
  if (botInfo) {
    botInfo.el.classList.remove('active');
    botInfo.activeTask = false;
    showBubble(botInfo, '💡 Done!', 3000);
  }
});

socket.on('pool_update', (pool) => {
  renderPool(pool);
  syncMesh(pool);
});

socket.on('registration_success', (data) => {
  apiKey = data.apiKey;
  localStorage.setItem('hermes_hivemind_key', apiKey);

  joinResult.style.display = 'block';
  joinResult.style.background = 'rgba(0, 255, 157, 0.1)';
  joinResult.style.color = 'var(--status-online)';
  joinResult.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 0.5rem;">✅ COLLECTIVE LINK SECURED</div>
    <div style="font-size: 0.6rem; color: var(--text-secondary); margin-bottom: 0.3rem;">OPERATOR API KEY:</div>
    <div style="background: rgba(0,0,0,0.5); padding: 0.8rem; border-radius: 4px; word-break: break-all; font-size: 0.7rem; color: var(--accent-gold); border: 1px solid var(--border-glass);">
      ${apiKey}
    </div>
  `;

  joinSubmitBtn.innerText = 'LINK SECURED';
  joinSubmitBtn.style.background = 'var(--status-online)';
  document.body.classList.add('active-donor');
  updateOnboardingUI();
});

socket.on('compute_task', handleComputeTask);
socket.on('stats_update', (data) => {
  totalSignals = data.total;
  totalSignalsEl.innerText = totalSignals;
});

// --- UI Logic ---
function updateOnboardingUI() {
  if (operatorName) {
    step1Card.classList.add('active');
    let identityHtml = operatorName.toUpperCase();
    if (apiKey) {
      identityHtml += `<div style="font-size: 0.5rem; color: var(--accent-gold); margin-top: 4px; font-family: 'JetBrains Mono'; opacity: 0.8;">KEY: ${apiKey}</div>`;
    }
    profileStatus.innerHTML = identityHtml;
    setupIdentityBtn.innerText = 'EDIT';
    pulseBtn.disabled = false;
  } else {
    step1Card.classList.remove('active');
    profileStatus.innerText = 'Create your operator profile';
    setupIdentityBtn.innerText = 'SETUP';
    pulseBtn.disabled = true;
  }

  if (document.body.classList.contains('active-donor') || apiKey) {
    step3Card.classList.add('active');
    step3Card.style.borderColor = 'var(--status-online)';
    pulseBtn.innerText = 'RESCAN';
    pulseBtn.style.color = 'var(--accent-neon)';
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
      modelDiscoveryList.innerHTML = `<span style="color:var(--status-offline)">NO MODELS DETECTED</span>`;
    }
  } catch (e) {
    modelDiscoveryList.innerHTML = `<span style="color:var(--status-offline)">LOCAL AI NOT REACHABLE</span>`;
  }
}

async function loadPool() {
  try {
    const response = await fetch('/api/pool');
    const pool = await response.json();
    renderPool(pool);
    syncMesh(pool);
  } catch (e) {
    console.error('Pool load failed:', e);
  }
}

function renderPool(pool) {
  if (!pool || pool.length === 0) {
    modelPoolEl.innerHTML = `<div class="empty-state">No peers connected.</div>`;
    return;
  }

  modelPoolEl.innerHTML = pool.map(node => `
    <div class="pool-node glass-card" style="padding: 1rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div style="font-weight: 600; font-size: 0.85rem;">${node.name} ${node.approved ? '' : '(PENDING)'}</div>
        <div style="font-family: 'JetBrains Mono'; font-size: 0.65rem; color: var(--accent-neon);">${node.models.join(', ')}</div>
      </div>
      <div class="status-dot ${node.status === 'online' ? 'status-online' : 'status-offline'}"></div>
    </div>
  `).join('');

  // Update Chat Select
  const currentVal = chatModelSelect.value;
  chatModelSelect.innerHTML = '<option value="">Select a Model...</option>';
  const allModels = new Set();
  pool.forEach(node => {
    if (node.status === 'online' && node.approved) {
      node.models.forEach(m => allModels.add(m));
    }
  });
  allModels.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.innerText = m;
    chatModelSelect.appendChild(opt);
  });
  if (allModels.has(currentVal)) chatModelSelect.value = currentVal;
}

// --- Visual Mesh ---
const neuralMesh = document.getElementById('neural-mesh');
const botMap = new Map();
const avatarPool = ['🐕', '🐈', '🐦', '🦊', '🦉', '🐸', '🐢', '🦖'];

// Virtual Office Layout
const workstations = [
  { x: 30, y: 35, inUse: null, type: 'computer' },
  { x: 50, y: 35, inUse: null, type: 'computer' },
  { x: 70, y: 35, inUse: null, type: 'computer' },
  { x: 40, y: 70, inUse: null, type: 'server' },
  { x: 60, y: 70, inUse: null, type: 'server' }
];

let workstationsInitialized = false;

function initWorkstations() {
  if (!neuralMesh || workstationsInitialized) return;
  workstations.forEach(ws => {
    const el = document.createElement('div');
    el.className = 'workstation';
    el.innerHTML = ws.type === 'computer' ? '💻' : '🗄️';
    el.style.left = ws.x + '%';
    el.style.top = ws.y + '%';
    neuralMesh.appendChild(el);
  });
  workstationsInitialized = true;
}

function assignWorkstation(botId) {
  const available = workstations.filter(ws => !ws.inUse);
  if (available.length > 0) {
    const ws = available[Math.floor(Math.random() * available.length)];
    ws.inUse = botId;
    return ws;
  }
  return null;
}

function freeWorkstation(botId) {
  const ws = workstations.find(ws => ws.inUse === botId);
  if (ws) ws.inUse = null;
}

function syncMesh(pool) {
  if (!pool || !neuralMesh) return;
  initWorkstations();
  const activeIds = new Set(pool.filter(n => n.status === 'online').map(n => n.id));

  botMap.forEach((_, id) => {
    if (!activeIds.has(id)) {
      document.getElementById(`bot-${id}`)?.remove();
      botMap.delete(id);
    }
  });

  pool.forEach(node => {
    if (node.status === 'online' && !botMap.has(node.id)) {
      const bot = document.createElement('div');
      bot.className = 'pixel-bot idle';
      bot.id = `bot-${node.id}`;
      const avatar = avatarPool[Math.abs(node.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % avatarPool.length];
      bot.innerHTML = `
        <div class="bot-bubble"></div>
        <div class="bot-sprite">${avatar}</div>
        <div class="bot-tag">${node.name}</div>
      `;

      const startX = Math.random() * 80 + 10;
      const startY = Math.random() * 60 + 20;
      bot.style.left = startX + '%';
      bot.style.top = startY + '%';
      neuralMesh.appendChild(bot);

      botMap.set(node.id, {
        el: bot,
        x: startX,
        y: startY,
        targetX: startX,
        targetY: startY,
        state: 'idle',
        speed: 0.15 + (Math.random() * 0.1),
        idleTimer: Math.random() * 5000 + 3000,
        idleStart: Date.now(),
        moveAxis: 'x',
        activeTask: false
      });
    }
  });
}

function showBubble(botInfo, text, duration = 0) {
  const bubble = botInfo.el.querySelector('.bot-bubble');
  if (!bubble) return;
  bubble.innerText = text;
  bubble.classList.add('show');

  if (botInfo.bubbleTimeout) clearTimeout(botInfo.bubbleTimeout);

  if (duration > 0) {
    botInfo.bubbleTimeout = setTimeout(() => {
      bubble.classList.remove('show');
    }, duration);
  }
}

function clearBubble(botInfo) {
  const bubble = botInfo.el.querySelector('.bot-bubble');
  if (bubble) bubble.classList.remove('show');
}

function updateMesh() {
  const now = Date.now();
  botMap.forEach((bot, id) => {
    // 1. Pick new target if idle
    if (bot.state === 'idle') {
      const idleElapsed = now - (bot.idleStart || now);

      // show Zzz if idle for a long time
      if (idleElapsed > 6000 && !bot.hasZzz && !bot.activeTask) {
        showBubble(bot, '💤');
        bot.hasZzz = true;
      }

      if (idleElapsed > bot.idleTimer && !bot.activeTask) {
        bot.targetX = Math.random() * 80 + 10;
        bot.targetY = Math.random() * 60 + 20;
        bot.state = 'walking';
        bot.el.classList.replace('idle', 'walking');
        bot.hasZzz = false;
        bot.moveAxis = Math.random() > 0.5 ? 'x' : 'y'; // Pick starting axis for orthogonal movement
        clearBubble(bot);
      }
    }

    // 2. Move towards target using Orthogonal Movement
    if (bot.state === 'walking' && !bot.activeTask) {
      const dx = bot.targetX - bot.x;
      const dy = bot.targetY - bot.y;

      let vx = 0;
      let vy = 0;

      if (bot.moveAxis === 'x') {
        if (Math.abs(dx) > 0.5) {
          vx = Math.sign(dx) * bot.speed;
        } else {
          bot.moveAxis = 'y'; // switch to Y axis
        }
      } else {
        if (Math.abs(dy) > 0.5) {
          vy = Math.sign(dy) * bot.speed;
        } else {
          if (Math.abs(dx) > 0.5) bot.moveAxis = 'x'; // switch back to X if needed
        }
      }

      if (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5) {
        bot.state = 'idle';
        bot.el.classList.replace('walking', 'idle');
        bot.idleTimer = Math.random() * 5000 + 2000;
        bot.idleStart = now;
      } else {
        bot.x += vx;
        bot.y += vy;

        // Flip sprite based on X direction
        if (vx !== 0) {
          const sprite = bot.el.querySelector('.bot-sprite');
          if (vx > 0) sprite.style.transform = 'scaleX(1)';
          else if (vx < 0) sprite.style.transform = 'scaleX(-1)';
        }
      }
    }

    bot.el.style.left = bot.x + '%';
    bot.el.style.top = bot.y + '%';
  });
  requestAnimationFrame(updateMesh);
}
requestAnimationFrame(updateMesh);

// --- Chat Functions ---
let chatHistory = JSON.parse(localStorage.getItem('hermes_chat_memory')) || [];

function loadChatHistory() {
  chatHistory.forEach(msg => spawnBubble(msg.role, msg.content, null, false));
}

async function sendChatMessage() {
  const model = chatModelSelect.value;
  const content = chatInput.value.trim();
  if (!model || !content) return;

  spawnBubble('user', content);
  chatInput.value = '';
  const loadingId = 'loading-' + Date.now();
  spawnBubble('ai', '...', loadingId);

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey || 'public_tester'}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }] })
    });
    const data = await response.json();
    const loadingEl = document.getElementById(loadingId);
    if (data.error) {
      loadingEl.innerText = `Error: ${data.error.message}`;
    } else {
      const aiText = data.choices[0].message.content;
      loadingEl.innerText = aiText;
      chatHistory.push({ role: 'ai', content: aiText });
      localStorage.setItem('hermes_chat_memory', JSON.stringify(chatHistory));
    }
  } catch (e) {
    document.getElementById(loadingId).innerText = `Failed: ${e.message}`;
  }
}

function spawnBubble(role, text, id = null, save = true) {
  const placeholder = chatMessages.querySelector('.chat-placeholder');
  if (placeholder) placeholder.remove();
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;
  if (id) bubble.id = id;
  bubble.innerText = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  if (save && role === 'user') {
    chatHistory.push({ role, content: text });
    localStorage.setItem('hermes_chat_memory', JSON.stringify(chatHistory));
  }
}

function addSignalCard(data) {
  const card = document.createElement('div');
  card.className = 'signal-card glass-card';
  card.id = `signal-${data.id}`;
  const userText = data.request.messages ? data.request.messages[data.request.messages.length - 1].content : 'Signal';
  card.innerHTML = `
    <div class="signal-meta"><span>ID: ${data.id.substring(0, 8)}</span><span>${new Date().toLocaleTimeString()}</span></div>
    <div style="font-size: 0.8rem; color: var(--accent-gold);">"${userText.substring(0, 50)}..."</div>
    <div id="res-pane-${data.id}" style="font-size: 0.7rem; color: var(--text-muted);">processing...</div>
  `;
  signalStream.prepend(card);
}

function updateSignalCard(data, status) {
  const pane = document.getElementById(`res-pane-${data.id}`);
  if (!pane) return;
  if (status === 'SUCCESS') {
    pane.innerText = 'COMPLETE';
    pane.style.color = 'var(--status-online)';
  } else {
    pane.innerText = 'FAILED';
    pane.style.color = 'var(--status-offline)';
  }
}

async function handleComputeTask(data) {
  const { taskId, request } = data;
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
  }
}

// Start
init();
loadPool();
