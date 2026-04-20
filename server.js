import express from 'express';
import axios from 'axios';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const DATA_PATH = path.join(__dirname, 'network_state.json');

// Initialize state
if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ activeNodeId: null, nodes: [] }));
}

function getState() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// 🛰️ The Signal Interceptor (Relay)
app.post('/v1/chat/completions', async (req, res) => {
  // 🛡️ Security Guard
  const authHeader = req.headers.authorization;
  const expectedToken = `Bearer ${process.env.HERMES_AUTH_TOKEN}`;

  if (process.env.HERMES_AUTH_TOKEN && authHeader !== expectedToken) {
    console.warn(`🛑 Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: { message: "Unauthorized: Invalid Hermes Auth Token." } });
  }

  const state = getState();
  const activeNode = state.nodes.find(n => n.id === state.activeNodeId);
  const signalId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

  // Emit 'Capture initiated'
  io.emit('signal_start', {
    id: signalId,
    timestamp: new Date().toISOString(),
    node: activeNode ? activeNode.name : 'NONE',
    request: req.body
  });

  if (!activeNode || activeNode.status === 'offline') {
    const errorMsg = "Relay Failed: No active brain or node offline.";
    io.emit('signal_error', { id: signalId, error: errorMsg });
    return res.status(503).json({ error: { message: errorMsg } });
  }

  try {
    const startTime = Date.now();
    const response = await axios.post(`${activeNode.url}/chat/completions`, req.body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 90000
    });

    const latency = Date.now() - startTime;

    // Emit 'Success/Intercepted'
    io.emit('signal_success', {
      id: signalId,
      latency,
      response: response.data
    });

    res.json(response.data);
  } catch (error) {
    console.error('❌ Signal Drop:', error.message);
    io.emit('signal_error', { id: signalId, error: error.message });
    res.status(500).json({ error: { message: `Relay failed: ${error.message}` } });
  }
});

// Admin endpoints
app.post('/api/select-node', (req, res) => {
  const { id, nodes } = req.body;
  fs.writeFileSync(DATA_PATH, JSON.stringify({ activeNodeId: id, nodes }));
  res.json({ success: true });
});

app.get('/api/state', (req, res) => {
  res.json(getState());
});

// 🌐 Model Pool (In-Memory Only — nothing saved to disk)
const modelPool = new Map(); // key: apiKey, value: { name, url, models, status, lastSeen }

// Auto-discover models from an endpoint
async function discoverModels(url) {
  try {
    const response = await axios.get(`${url}/models`, { timeout: 5000 });
    if (response.data && response.data.data) {
      return response.data.data.map(m => m.id);
    }
    return [];
  } catch (e) {
    return [];
  }
}

// Register a model endpoint to the pool
app.post('/api/pool/register', async (req, res) => {
  const { name, url } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL required.' });
  }

  const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  
  // Auto-discover what models are running
  const models = await discoverModels(cleanUrl);
  const apiKey = uuidv4();

  modelPool.set(apiKey, {
    name,
    url: cleanUrl,
    models,
    status: 'pending',
    approved: false,
    lastSeen: new Date().toISOString()
  });

  console.log(`🌐 New node requesting to join: ${name} (${models.length} models detected)`);
  io.emit('pool_update', getPoolList());

  res.json({ 
    success: true, 
    apiKey, 
    modelsDetected: models,
    message: `Welcome to the network, ${name}! ${models.length} model(s) detected.`
  });
});

// Get all models in the pool
app.get('/api/pool', (req, res) => {
  res.json(getPoolList());
});

// OpenAI-compatible /v1/models endpoint — shows all available models on the network
app.get('/v1/models', (req, res) => {
  const allModels = [];
  for (const [key, node] of modelPool) {
    for (const model of node.models) {
      allModels.push({
        id: model,
        object: 'model',
        owned_by: node.name,
        status: node.status
      });
    }
  }
  res.json({ object: 'list', data: allModels });
});

function getPoolList(includeAll = false) {
  const list = [];
  for (const [key, node] of modelPool) {
    if (!includeAll && !node.approved) continue; // Only show approved nodes publicly
    list.push({
      id: key,
      name: node.name,
      models: node.models,
      status: node.status,
      approved: node.approved,
      lastSeen: node.lastSeen
    });
  }
  return list;
}

// Ping all pool nodes every 30s
setInterval(async () => {
  for (const [key, node] of modelPool) {
    const models = await discoverModels(node.url);
    node.models = models.length > 0 ? models : node.models;
    node.status = models.length > 0 ? 'online' : 'offline';
    node.lastSeen = models.length > 0 ? new Date().toISOString() : node.lastSeen;
  }
  io.emit('pool_update', getPoolList());
}, 30000);

// 🛡️ Admin Middleware
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.HERMES_AUTH_TOKEN) {
    return res.status(403).json({ error: 'Admin access denied.' });
  }
  next();
}

// 🏛️ Admin API
app.get('/api/admin/pool', requireAdmin, (req, res) => {
  res.json(getPoolList(true)); // Show ALL nodes including pending
});

app.post('/api/admin/approve', requireAdmin, (req, res) => {
  const { id } = req.body;
  const node = modelPool.get(id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });
  node.approved = true;
  node.status = node.models.length > 0 ? 'online' : 'offline';
  console.log(`✅ Admin approved node: ${node.name}`);
  io.emit('pool_update', getPoolList());
  res.json({ success: true, message: `${node.name} approved.` });
});

app.post('/api/admin/reject', requireAdmin, (req, res) => {
  const { id } = req.body;
  const node = modelPool.get(id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });
  const name = node.name;
  modelPool.delete(id);
  console.log(`❌ Admin rejected node: ${name}`);
  io.emit('pool_update', getPoolList());
  res.json({ success: true, message: `${name} removed.` });
});


// 🔐 Security Management
app.post('/api/security/generate', (req, res) => {
  try {
    const newToken = uuidv4();
    const envContent = fs.readFileSync('.env', 'utf8');

    // Replace or add HERMES_AUTH_TOKEN
    let newEnv;
    if (envContent.includes('HERMES_AUTH_TOKEN=')) {
      newEnv = envContent.replace(/HERMES_AUTH_TOKEN=.*/, `HERMES_AUTH_TOKEN=${newToken}`);
    } else {
      newEnv = envContent + `\nHERMES_AUTH_TOKEN=${newToken}`;
    }

    fs.writeFileSync('.env', newEnv);
    process.env.HERMES_AUTH_TOKEN = newToken; // Update in-memory for immediate effect

    console.log(`🔐 NEW SECURITY KEY GENERATED VIA DASHBOARD`);
    res.json({ success: true, token: newToken });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));

// Admin Dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  const domain = process.env.NETWORK_DOMAIN || 'http://localhost:' + PORT;
  console.log(`🏛️  Hermes Gateway Hub online at ${domain}`);
  console.log(`🧠  Local Agent Signal Base: ${domain}/v1`);
  console.log(`🛡️  Security Status: ${process.env.HERMES_AUTH_TOKEN ? 'TOKEN AUTH ENABLED' : 'WIDE OPEN (NOT RECOMMENDED)'}`);
});
