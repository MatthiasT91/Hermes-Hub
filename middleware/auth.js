import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'hermes-secret-key-change-in-production';

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
  
  try {
    // Verify API key against JWT
    const decoded = jwt.verify(apiKey, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.apiKey = apiKey;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid API Key' });
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