import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROFILE_PATH = path.join(__dirname, '../../user_profiles.json');

// Initialize if needed
if (!fs.existsSync(PROFILE_PATH)) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify({ users: {} }, null, 2));
}

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

function saveProfiles(data) {
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(data, null, 2));
}

// Get or create user profile
export function getUserProfile(userId) {
  const data = loadProfiles();
  
  if (!data.users[userId]) {
    data.users[userId] = {
      id: userId,
      username: userId,
      createdAt: Date.now(),
      settings: {
        models: [],
        preferences: {
          autoApprove: false,
          maxConcurrent: 1,
          notifications: true
        },
        usage: {
          totalRequests: 0,
          lastActive: null
        },
        apiKeys: {}
      },
      status: 'active'
    };
    saveProfiles(data);
  }
  
  return data.users[userId];
}

// Update user profile
export function updateUserProfile(userId, updates) {
  const data = loadProfiles();
  const profile = data.users[userId];
  
  if (!profile) {
    return { error: 'User not found' };
  }
  
  Object.assign(profile.settings, updates);
  saveProfiles(data);
  
  return { success: true, profile };
}

// Get user's API keys
export function getUserApiKeys(userId) {
  const profile = getUserProfile(userId);
  return profile.settings.apiKeys || {};
}

// Add API key to user
export function addApiKey(userId, apiKey, metadata = {}) {
  const profile = getUserProfile(userId);
  
  if (profile.settings.apiKeys) {
    profile.settings.apiKeys[apiKey] = {
      createdAt: Date.now(),
      metadata,
      isActive: true
    };
  } else {
    profile.settings.apiKeys = {
      [apiKey]: {
        createdAt: Date.now(),
        metadata,
        isActive: true
      }
    };
  }
  
  saveProfiles(data);
  return { success: true, apiKey };
}

// Remove API key
export function removeApiKey(userId, apiKey) {
  const profile = getUserProfile(userId);
  
  if (!profile.settings.apiKeys || !profile.settings.apiKeys[apiKey]) {
    return { error: 'API key not found' };
  }
  
  delete profile.settings.apiKeys[apiKey];
  saveProfiles(data);
  
  return { success: true };
}

// Get all profiles (for admin)
export function getAllProfiles() {
  return loadProfiles();
}

// Search users
export function searchUsers(query) {
  const data = loadProfiles();
  const results = [];
  
  Object.values(data.users).forEach(user => {
    if (
      user.username.toLowerCase().includes(query.toLowerCase()) ||
      user.email?.toLowerCase().includes(query.toLowerCase())
    ) {
      results.push(user);
    }
  });
  
  return results;
}

export default { getUserProfile, updateUserProfile, getUserApiKeys, addApiKey, removeApiKey, getAllProfiles, searchUsers };
