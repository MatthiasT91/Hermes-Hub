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
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;
const DATA_PATH = path.join(__dirname, 'network_state.json');

// Initialize state
if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, JSON.stringify({ activeNodeId: 'primary-core', nodes: [] }));
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
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

httpServer.listen(PORT, () => {
  const domain = process.env.NETWORK_DOMAIN || 'http://localhost:' + PORT;
  console.log(`🏛️  Hermes Gateway Hub online at ${domain}`);
  console.log(`🧠  Local Agent Signal Base: ${domain}/v1`);
  console.log(`🛡️  Security Status: ${process.env.HERMES_AUTH_TOKEN ? 'TOKEN AUTH ENABLED' : 'WIDE OPEN (NOT RECOMMENDED)'}`);
});
