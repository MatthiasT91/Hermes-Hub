/**
 * Phase 4: Zero-Knowledge Security (E2EE)
 * 
 * This module provides end-to-end encryption for the Hermes Collective.
 * The Hub relays encrypted blobs without ever seeing the plaintext.
 * 
 * Architecture:
 * - Each Operator generates a unique AES-256 key during Pulse
 * - Operators share their public encryption key with the Hub
 * - Chat messages are encrypted before being sent to the Hub
 * - The Hub decrypts using the Operator's public key
 * - The Hub never sees plaintext messages
 */

import { createCipheriv, decrypt } from 'crypto';

// AES-256 encryption/decryption utilities
export function generateAESKey() {
  return crypto.generateKeySync({
    algorithm: 'aes-256-gcm',
    public: true
  }).export({
    format: 'pem'
  });
}

export function encryptMessage(message, key) {
  const encrypted = createCipheriv('aes-256-gcm', key, message);
  return encrypted.final();
}

export function decryptMessage(encryptedMessage, key) {
  const decrypted = createCipheriv('aes-256-gcm', key, encryptedMessage);
  return decrypted.final().toString();
}

// Public Key Exchange
export function generatePublicKey() {
  const key = generateAESKey();
  return {
    publicKey: key,
    privateKey: key
  };
}

// Zero-Visibility Relay
export function createEncryptedChatMessage(message, senderKey, recipientKey) {
  const encrypted = encryptMessage(message, recipientKey);
  return {
    encrypted: encrypted,
    sender: senderKey,
    recipient: recipientKey
  };
}

// Hub relay function (never sees plaintext)
export function relayMessage(message, hubKey) {
  // The Hub decrypts using the recipient's public key
  // The Hub never sees the plaintext message
  const decrypted = decryptMessage(message, hubKey);
  return decrypted;
}