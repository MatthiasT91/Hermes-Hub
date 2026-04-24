import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || "4824267e17c75f79cbac4ee731abe776713ba44ba6702a737ae9b85eb144d4e8";

// Verify JWT token
export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.apiKey = decoded.apiKey;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Verify API Key
export function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    return res.status(401).json({ error: 'API Key required' });
  }

  // Verify API key exists in user_profiles.json
  try {
    const userProfilesPath = path.join(__dirname, '../../user_profiles.json');
    const userProfiles = JSON.parse(fs.readFileSync(userProfilesPath, 'utf8'));
    let user = null;
    
    // Search through all users to find which one has this API key
    for (const userId of Object.keys(userProfiles.users)) {
      const u = userProfiles.users[userId];
      if (u.settings && u.settings.apiKeys && u.settings.apiKeys[apiKey]) {
        user = u;
        break;
      }
    }

    if (!user) {
      return res.status(403).json({ error: 'Invalid API Key' });
    }

    req.userId = user.id;
    req.username = user.username;
    req.apiKey = apiKey;
    req.isApiUser = true;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify API key' });
  }
}

// Optional: Admin-only middleware
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export default { authenticateToken, authenticateApiKey, requireAdmin };
