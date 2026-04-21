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
  const state = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  // Migration: Ensure all existing nodes have an approved status (default true for legacy)
  let changed = false;
  state.nodes.forEach(node => {
    if (node.approved === undefined) {
      node.approved = true;
      changed = true;
    }
  });
  if (changed) fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
  return state;
}

// 🌐 WebSockets Model Pool
const modelPool = new Map();
const pendingWebTasks = new Map();
let totalSignalsProcessed = 0;

// Handle Socket Connections
io.on('connection', (socket) => {
  socket.on('register_browser_node', (data) => {
    const { ownerKey, name, models } = data;
    const apiKey = ownerKey || uuidv4();

    // 1. Get or create node from persistent state
    const state = getState();
    let existingNode = state.nodes.find(n => n.id === apiKey);

    // 2. Auto-approve if ownerKey is provided
    const isApproved = existingNode ? existingNode.approved : (ownerKey ? true : false);

    // 3. Update In-Memory Pool
    modelPool.set(apiKey, {
      name: name || 'Anonymous Network Node',
      socketId: socket.id,
      models: models || [],
      status: 'online',
      approved: isApproved,
      lastUsedByOwner: Date.now(),
      lastSeen: new Date().toISOString()
    });

    // 4. Save to disk if NEW node
    if (!existingNode) {
      state.nodes.push({
        id: apiKey,
        name: name || null,
        models: models || [], // CRITICAL: Save the models list!
        approved: isApproved
      });
      fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
      console.log(`🌐 New node registered: ${apiKey} with ${models?.length || 0} models`);
    } else {
      // Update existing node
      existingNode.name = name;
      existingNode.models = models || [];
      existingNode.approved = isApproved;
      fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));
    }

    socket.emit('registration_success', {
      apiKey,
      message: 'Connected to The Hermes Collective.',
      approved: isApproved
    });

    console.log(`🌐 Browser Node linked: ${name} (${apiKey}) - ${isApproved ? 'APPROVED' : 'pending'}`);
    io.emit('pool_update', getPoolList());
  });

  socket.on('task_result', (data) => {
    const { taskId, response, error } = data;
    const resolver = pendingWebTasks.get(taskId);
    if (resolver) {
      clearTimeout(resolver.timer);
      if (error) {
        resolver.reject(new Error(error));
      } else {
        resolver.resolve(response);
      }
      pendingWebTasks.delete(taskId);
    }
  });

  socket.on('disconnect', () => {
    // Find node that owns this socket and mark offline
    for (const [key, node] of modelPool.entries()) {
      if (node.socketId === socket.id) {
        node.status = 'offline';
        io.emit('pool_update', getPoolList());
        break;
      }
    }
  });
});

// 🛰️ Phase 2: Intelligent Routing & Idle Logic
app.post('/v1/chat/completions', async (req, res) => {
  // 1. Authenticate Request
  const authHeader = req.headers.authorization;
  const rawToken = authHeader?.replace('Bearer ', '') || '';
  const isAdmin = process.env.HERMES_AUTH_TOKEN && rawToken === process.env.HERMES_AUTH_TOKEN;
  const isRegisteredNode = modelPool.has(rawToken);

  if (!isAdmin && !isRegisteredNode) {
    console.warn(`🛑 Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: { message: "Unauthorized: Invalid API Key. Please join the network to receive a key." } });
  }

  const requestedModel = req.body.model;
  if (!requestedModel) {
    return res.status(400).json({ error: { message: "Bad Request: No 'model' specified." } });
  }

  // 2. Find Target Node Hosting the Model
  let targetNode = null;
  let targetNodeKey = null;

  for (const [key, node] of modelPool) {
    if (node.approved && node.status !== 'offline' && node.models.includes(requestedModel)) {
      targetNode = node;
      targetNodeKey = key;
      break;
    }
  }

  if (!targetNode) {
    return res.status(404).json({ error: { message: `Relay Failed: No approved/online brain found hosting model '${requestedModel}'.` } });
  }

  // 3. Apply Idle Logic & Priority Architecture
  const isOwnerRequesting = rawToken === targetNodeKey;

  if (isOwnerRequesting) {
    // Owner is using their own brain. Mark as actively in-use to lock out borrowers.
    targetNode.lastUsedByOwner = Date.now();
  } else if (!isAdmin) {
    // Borrower is trying to use a brain. Check the 5-Minute Idle Lock.
    const idleTimeMillis = Date.now() - (targetNode.lastUsedByOwner || 0);
    const idleLockMillis = 5 * 60 * 1000; // 5 minutes

    if (idleTimeMillis < idleLockMillis) {
      const remainingSeconds = Math.ceil((idleLockMillis - idleTimeMillis) / 1000);
      return res.status(423).json({
        error: {
          message: `Access Denied: Owner is currently using this brain. Please try again after a 5-minute idle period. (Locked for ${remainingSeconds}s)`
        }
      });
    }
  }

  // 4. Proceed with WebSockets Compute Relay
  const taskId = uuidv4();

  // 7. Relay task to browser via socket (Using ID from pool for UI tracking)
  io.emit('signal_start', {
    id: taskId,
    targetId: targetNodeKey,
    nodeName: targetNode.name,
    request: req.body
  });

  try {
    const startTime = Date.now();

    // Create the Promise to wait for the browser to run the model
    const taskPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingWebTasks.delete(taskId);
        reject(new Error("Timeout: Browser node did not respond within 120 seconds."));
      }, 120000); // 2 minute maximum wait time
      pendingWebTasks.set(taskId, { resolve, reject, timer });
    });

    // Send the task to the specific browser running the model
    io.to(targetNode.socketId).emit('compute_task', {
      taskId,
      request: req.body
    });

    const responseData = await taskPromise;
    totalSignalsProcessed++;

    io.emit('signal_complete', { id: taskId, targetId: targetNodeKey });
    io.emit('stats_update', { total: totalSignalsProcessed });

    // 8. Log anonymously for Admin Dashboard
    io.emit('signal_intercept', {
      id: taskId,
      source: 'Agent',
      request: { model: req.body.model, messages: req.body.messages },
      response: responseData.choices[0].message.content,
      latency: Date.now() - startTime,
      timestamp: new Date().toLocaleTimeString()
    });

    res.json(responseData);
  } catch (error) {
    console.error('❌ Signal Drop:', error.message);
    io.emit('signal_error', { id: signalId, error: error.message });
    res.status(502).json({ error: { message: `Relay failed communicating with node ${targetNode.name}: ${error.message}` } });
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

// Deprecated: Old API pool registration is replaced by sockets
// app.post('/api/pool/register', ...)

// Get all models in the pool
app.get('/api/pool', (req, res) => {
  res.json(getPoolList());
});

// OpenAI-compatible /v1/models endpoint — shows all available models on the network
// OpenAI-compatible /v1/models endpoint
const getModelsHandler = (req, res) => {
  try {
    const state = getState(); // Read current state
    const allModels = [];

    if (state.nodes && Array.isArray(state.nodes)) {
      state.nodes.forEach(node => {
        // Check if the node has models registered
        if (node.models && node.models.length > 0) {
          node.models.forEach(model => {
            // Avoid duplicates (e.g. if multiple nodes offer the same model)
            if (!allModels.find(m => m.id === model.id)) {
              allModels.push({
                id: model.id,
                name: model.name || model.id,
                object: "model"
              });
            }
          });
        }
      });
    }

    console.log(`[Model API] Returning ${allModels.length} models.`);
    res.json({ object: "list", data: allModels });
  } catch (err) {
    console.error("Error generating model list:", err);
    res.status(500).json({ error: "Failed to fetch models" });
  }
};

app.get('/v1/models', getModelsHandler);
app.get('/v1/modlees', getModelsHandler); // Robust alias for typos
app.get('/models', getModelsHandler);

// Root /v1 endpoint for discovery
app.get('/v1', (req, res) => {
  res.json({
    status: "active",
    identity: "Hermes Gateway Hub",
    version: "2.0.0",
    capabilities: ["chat_completions", "model_listing", "socket_relay"]
  });
});

function getPoolList() {
  const list = [];
  for (const [key, node] of modelPool) {
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

// Note: The HTTP ping is removed HTTP heartbeat/ping -> Socket.io handles heartbeats natively

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
  res.json({
    pool: getPoolList(true),
    stats: {
      totalSignals: totalSignalsProcessed
    }
  });
});

app.post('/api/admin/approve', requireAdmin, (req, res) => {
  const { id } = req.body;
  const node = modelPool.get(id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });

  node.approved = true;

  // Persist to Disk
  const state = getState();
  const diskNode = state.nodes.find(n => n.id === id);
  if (diskNode) diskNode.approved = true;
  fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2));

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

// Admin Dashboard Route (Must be BEFORE static dist)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve static assets from both public and dist
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(__dirname)); // Fallback for src files if serving raw

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  const domain = process.env.NETWORK_DOMAIN || 'http://localhost:' + PORT;
  console.log(`🏛️  Hermes Gateway Hub online at ${domain}`);
  console.log(`🧠  Local Agent Signal Base: ${domain}/v1`);
  console.log(`🛡️  Security Status: ${process.env.HERMES_AUTH_TOKEN ? 'TOKEN AUTH ENABLED' : 'WIDE OPEN (NOT RECOMMENDED)'}`);
});
