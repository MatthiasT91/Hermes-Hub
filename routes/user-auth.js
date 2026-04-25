import express from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "4824267e17c75f79cbac4ee731abe776713ba44baf702a737ae9b85eb144d4e8";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const USER_DATA_PATH = path.join(__dirname, '../user_profiles.json');

// Initialize user data file
if (!fs.existsSync(USER_DATA_PATH)) {
  fs.writeFileSync(USER_DATA_PATH, JSON.stringify({ users: {} }, null, 2));
}

// Helper: Get or create user data
function getUserData() {
  const data = JSON.parse(fs.readFileSync(USER_DATA_PATH, 'utf8'));
  return data;
}

// Helper: Save user data
function saveUserData(data) {
  fs.writeFileSync(USER_DATA_PATH, JSON.stringify(data, null, 2));
}

// User Registration Endpoint
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, apiModelKey } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  const data = getUserData();

  // Check if user already exists
  if (data.users[username]) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // Create user profile
  const userId = username.toLowerCase();
  const apiKey = apiModelKey || uuidv4(); // Generate unique API key if not provided

  data.users[userId] = {
    id: userId,
    username,
    email,
    passwordHash: password,
    createdAt: Date.now(),
    settings: {
      apiKeys: {
        [apiKey]: {
          createdAt: Date.now(),
          metadata: {},
          isActive: true
        }
      },
      models: [],
      preferences: {
        autoApprove: false,
        maxConcurrent: 1,
        notifications: true
      },
      usage: {
        totalRequests: 0,
        lastActive: null
      }
    },
    status: 'active'
  };

  saveUserData(data);

  console.log('New user registered: ' + username);

  // Generate JWT token
  const token = jwt.sign(
    { userId, username, apiKey },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    message: 'User registered successfully',
    token,
    apiKey: apiKey,
    user: data.users[userId]
  });
});

// User Login Endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const data = getUserData();
  const user = data.users[username.toLowerCase()];

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check password hash
  if (user.passwordHash !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate JWT token (include apiKey if user has one)
  const token = jwt.sign(
    {
      userId: user.id,
      username: user.username,
      apiKey: user.settings?.apiKeys ? Object.keys(user.settings.apiKeys)[0] : undefined
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
    }
  });
});

// Get User Profile
app.get('/api/auth/me', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const data = getUserData();
  const user = data.users[userId];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Don't expose password hash
  delete user.passwordHash;

  res.json({ success: true, user });
});

// Generate New API Key for User
app.post('/api/auth/api-key', (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const data = getUserData();
  const user = data.users[userId];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const newApiKey = uuidv4();

  // Add to user's API keys
  if (!user.settings.apiKeys) user.settings.apiKeys = {};
  user.settings.apiKeys[newApiKey] = {
    createdAt: Date.now(),
    isActive: true,
    lastUsed: null
  };

  saveUserData(data);

  res.json({
    success: true,
    apiKey: newApiKey,
    message: 'New API key generated successfully'
  });
});

export { app };
