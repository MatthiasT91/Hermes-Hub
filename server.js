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
import jwt from 'jsonwebtoken';

// Import user authentication modules
import { app as userAuthApp } from './routes/user-auth.js';
import { authenticateToken } from './middleware/auth.js';
import { getUserProfile, getUserApiKeys, addApiKey } from './models/user-profile.js';

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

// 🔐 SEPARATE TOKENS ARCHITECTURE
// 1. HERMES_AUTH_TOKEN - Admin-only access (from .env)
// 2. Node API Keys - Unique per registered node (generated on registration)

// 🌐 WebSockets Model Pool
const modelPool = new Map();
const pendingWebTasks = new Map();
let totalSignalsProcessed = 0;

// 🔑 API Key Registry - tracks all generated keys
const apiKeyRegistry = new Map();

// Handle Socket Connections
io.on('connection', (socket) => {
  socket.on('register_browser_node', (data) => {
    const { ownerKey, name, models } = data;

    // Generate a unique API key for this node if none provided
    const apiKey = ownerKey || uuidv4();
    const nodeId = `node-${Date.now()}-${apiKey.substring(0, 8)}`;

    console.log(`🔑 Generating API key for ${name}: ${apiKey}`);
    console.log(`📝 Node ID: ${nodeId}`);
    console.log(`🔐 Admin token: ${process.env.HERMES_AUTH_TOKEN.substring(0, 8)}... (separate)`);

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

    // 4. Register the API key
    apiKeyRegistry.set(apiKey, {
      nodeId,
      name,
      registeredAt: Date.now(),
      isActive: true
    });

    // 5. Save to disk if NEW node
    if (!existingNode) {
      state.nodes.push({
        id: apiKey,
        name: name || null,
        models: models || [],
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
      nodeId,
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
  // 🔐 1. JWT Authentication
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.warn(`🛑 Missing authorization header from ${req.ip}`);
    return res.status(401).json({ error: { message: "Unauthorized: Missing authorization header" } });
  }

  const token = authHeader.replace('Bearer ', '');

  // Verify JWT token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    console.warn(`🛑 Invalid JWT token from ${req.ip}:`, err.message);
    return res.status(401).json({ error: { message: "Unauthorized: Invalid or expired JWT token" } });
  }

  // 🔐 2. Verify API Key Against User Profile
  const apiKey = req.user.apiKey;
  const userId = req.user.userId;

  // Get user profile and verify API key exists
  const user = getUserProfile(userId);
  const userApiKeys = getUserApiKeys(userId);

  if (!userApiKeys[apiKey]) {
    console.warn(`🛑 Invalid API key for user ${userId} from ${req.ip}`);
    return res.status(403).json({ error: { message: "Forbidden: Invalid API key" } });
  }

  // Check if API key is active
  if (!userApiKeys[apiKey].isActive) {
    console.warn(`🛑 Inactive API key for user ${userId} from ${req.ip}`);
    return res.status(403).json({ error: { message: "Forbidden: API key has been deactivated" } });
  }

  // 🔐 3. Admin Override (using HERMES_AUTH_TOKEN from .env)
  const adminToken = process.env.HERMES_AUTH_TOKEN || '';
  const isAdmin = adminToken && req.user.adminToken === adminToken;

  if (isAdmin) {
    console.log(`👑 Admin request from ${req.ip}`);
  }

  // 4. Log successful authentication
  console.log(`✅ Authenticated: User ${userId}, API Key ${apiKey.substring(0, 8)}...`);

  // Continue with existing request processing...
  // 🔐 4. Verify API key against remote registry (optional - configurable)
  const VERIFY_API_KEYS = process.env.VERIFY_API_KEYS === 'true';
  const REMOTE_API_URL = process.env.REMOTE_API_URL || 'https://api.hermes.network/verify';

  if (VERIFY_API_KEYS) {
    try {
      const verifyResponse = await axios.post(
        REMOTE_API_URL,
        { apiKey, userId },
        { timeout: 2000 }
      );
      if (!verifyResponse.data.valid) {
        console.warn(`🛑 Remote verification failed for user ${userId}`);
        return res.status(403).json({ error: { message: "Forbidden: API key verification failed" } });
      }
    } catch (err) {
      // Silently fail - local verification still works
      console.log(`⚠️ Remote key verification unavailable: ${err.message}`);
    }
  }

  // 🔐 5. Log usage to analytics service (optional)
  const LOG_ANALYTICS = process.env.LOG_ANALYTICS === 'true';
  const ANALYTICS_URL = process.env.ANALYTICS_URL || 'https://analytics.hermes.network/log';

  if (LOG_ANALYTICS) {
    const analyticsData = {
      userId,
      apiKey: apiKey.substring(0, 8),
      timestamp: new Date().toISOString(),
      model: req.body.model,
      endpoint: '/v1/chat/completions'
    };

    axios.post(ANALYTICS_URL, analyticsData).catch(err => {
      // Silently fail - analytics not critical
      console.log(`⚠️ Analytics logging failed: ${err.message}`);
    });
  }

  // Continue with existing request processing...
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
    const state = getState();
    const allModels = [];
    const seenIds = new Set();
    const now = Math.floor(Date.now() / 1000);

    // 1. Read in-memory pool (online nodes)
    for (const [key, node] of modelPool) {
      const models = node.models || (node.model ? [node.model] : []);
      if (models && node.approved && node.status !== 'offline') {
        models.forEach(model => {
          let modelId = model;
          if (typeof model === 'object' && model !== null) {
            modelId = model.id || model.name;
            models.forEach(m => {
              if (m.id !== undefined) seenIds.add(m.id);
            });
          }
          if (modelId && !seenIds.has(modelId)) {
            seenIds.add(modelId);
            allModels.push({
              id: modelId,
              object: "model",
              created: now,
              owned_by: "user"
            });
          }
        });
      }
    }

    // 2. Read disk state for offline/pending nodes
    if (state.nodes && Array.isArray(state.nodes)) {
      state.nodes.forEach(node => {
        const models = node.models || (node.model ? [node.model] : []);
        if (models && node.approved !== false) {
          models.forEach(model => {
            let modelId = model;
            if (typeof model === 'object') {
              modelId = model.id || model.name;
            }
            if (modelId && !seenIds.has(modelId)) {
              seenIds.add(modelId);
              allModels.push({
                id: modelId,
                object: "model",
                created: now,
                owned_by: "user"
              });
            }
          });
        }
      });
    }

    if (allModels.length === 0) {
      allModels.push({
        id: "hermes-collective-awaiting-peers",
        object: "model",
        created: now,
        owned_by: "system"
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
app.get('/v1/modlees', getModelsHandler);
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

// 🛡️ Admin Middleware - Using centralized authenticateToken
app.use("/api/admin", authenticateToken);

// 🏛️ Admin API
app.get('/api/admin/pool', (req, res) => {
  res.json({
    pool: getPoolList(true),
    stats: {
      totalSignals: totalSignalsProcessed
    }
  });
});

app.post('/api/admin/approve', (req, res) => {
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

app.post('/api/admin/reject', (req, res) => {
  const { id } = req.body;
  const node = modelPool.get(id);
  if (!node) return res.status(404).json({ error: 'Node not found.' });
  const name = node.name;
  modelPool.delete(id);
  console.log(`❌ Admin rejected node: ${name}`);
  io.emit('pool_update', getPoolList());
  res.json({ success: true, message: `${name} removed.` });
});


// 🔑 Admin API - API Key Management
// Add new API key for a user (requires admin auth)
app.post('/api/admin/add-api-key', (req, res) => {
  const { userId, apiKey, metadata } = req.body;

  if (!userId || !apiKey) {
    return res.status(400).json({ error: 'userId and apiKey are required.' });
  }

  try {
    const result = addApiKey(userId, apiKey, metadata || {});

    if (result.error) {
      return res.status(404).json({ error: result.error });
    }

    console.log(`🔑 Admin added API key for user ${userId}: ${apiKey.substring(0, 8)}...`);
    res.json({ success: true, apiKey });
  } catch (err) {
    console.error('Error adding API key:', err);
    res.status(500).json({ error: 'Failed to add API key.' });
  }
});

// Revoke API key (requires admin auth)
app.post('/api/admin/revoke-api-key', (req, res) => {
  const { userId, apiKey } = req.body;

  if (!userId || !apiKey) {
    return res.status(400).json({ error: 'userId and apiKey are required.' });
  }

  // Check if API key exists in registry
  const keyInfo = apiKeyRegistry.get(apiKey);

  if (!keyInfo) {
    return res.status(404).json({ error: 'API key not found.' });
  }

  // Verify the key belongs to the specified user (optional security check)
  if (keyInfo.nodeId && !userId.includes(keyInfo.nodeId)) {
    return res.status(403).json({ error: 'Access denied: Cannot revoke key belonging to another user.' });
  }

  // Deactivate the API key
  keyInfo.isActive = false;
  keyInfo.revokedAt = Date.now();

  console.log(`🔒 API key revoked: ${apiKey.substring(0, 8)}... for user ${userId}`);

  res.json({
    success: true,
    message: 'API key has been revoked and will no longer work.',
    revokedKey: apiKey.substring(0, 8)
  });
});


// Regenerate API key for a node (requires admin auth)
app.post('/api/admin/regenerate-key', (req, res) => {
  const { nodeId } = req.body;

  // Find the node by its nodeId
  const matchingKeys = [];
  apiKeyRegistry.forEach((info, key) => {
    if (info.nodeId === nodeId) {
      matchingKeys.push({ key, ...info });
    }
  });

  if (matchingKeys.length === 0) {
    return res.status(404).json({ error: 'Node not found.' });
  }

  // Generate new API key
  const newApiKey = uuidv4();
  const newKeyInfo = {
    nodeId,
    name: matchingKeys[0].name,
    registeredAt: Date.now(),
    isActive: true
  };

  // Update registry
  apiKeyRegistry.set(newApiKey, newKeyInfo);

  // Update node metadata (but keep it online)
  matchingKeys.forEach(({ key }) => {
    const node = modelPool.get(key);
    if (node) {
      node.name += ' [REISSUED]';
    }
  });

  console.log(`🔑 New API key generated: ${newApiKey}`);

  res.json({
    success: true,
    message: 'New API key generated successfully.',
    oldKeys: matchingKeys.map(k => k.key),
    newKey: newApiKey
  });
});

// 🔐 Security Management
app.post('/api/security/generate', (req, res) => {
  try {
    const newToken = uuidv4();
    const envContent = fs.readFileSync('.env', 'utf8');

    // Replace or add HERMES_AUTH_TOKEN
    let newEnv;
    if (envContent.includes('HERMES_AUTH_TOKEN=***') || envContent.includes('HERMES_AUTH_TOKEN=')) {
      newEnv = envContent.replace(/HERMES_AUTH_TOKEN=[^]*/g, `HERMES_AUTH_TOKEN=${newToken}`);
    } else {
      newEnv = envContent + '\nHERMES_AUTH_TOKEN=' + newToken;
    }

    fs.writeFileSync('.env', newEnv);
    process.env.HERMES_AUTH_TOKEN = newToken; // Update in-memory for immediate effect

    console.log(`🔐 NEW ADMIN TOKEN GENERATED`);
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

// ✅ USER AUTHENTICATION ROUTES - Add these before starting server
app.use('/api/auth', userAuthApp);

httpServer.listen(PORT, () => {
  const domain = process.env.NETWORK_DOMAIN || 'http://localhost:' + PORT;
  console.log(`🏛️  Hermes Gateway Hub online at ${domain}`);
  console.log(`🧠  Local Agent Signal Base: ${domain}/v1`);
  console.log(`🛡️  Security Status: ${process.env.HERMES_AUTH_TOKEN ? 'TOKEN AUTH ENABLED' : 'WIDE OPEN (NOT RECOMMENDED)'}`);
  console.log(`🔑  Admin Token: ${process.env.HERMES_AUTH_TOKEN.substring(0, 8)}...`);
  console.log(`📊  API Key Registry: ${apiKeyRegistry.size} keys registered`);
  console.log(`👤  User Profiles: Stored in user_profiles.json`);
});
