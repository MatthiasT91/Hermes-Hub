/**
 * Phase 7: Neural Mesh Visualizer
 * 
 * This module implements the Neural Mesh Visualizer for the Hermes Collective.
 * It displays pixel avatars for each node, signal arcs between nodes,
 * and sprite activity when nodes are processing compute tasks.
 */

import { createCanvas, drawPixelAvatar, drawSignalArc, drawSprite } from './canvas.js';

// Create the mesh visualizer
export function createMeshVisualizer(containerElement) {
  const canvas = createCanvas(containerElement);
  const ctx = canvas.getContext('2d');
  
  // Initialize the mesh
  const mesh = {
    nodes: [],
    signals: [],
    sprites: []
  };
  
  // Add a node to the mesh
  mesh.addNode = function(nodeId, avatar, position) {
    mesh.nodes.push({
      id: nodeId,
      avatar: avatar,
      position: position,
      status: 'idle'
    });
  };
  
  // Remove a node from the mesh
  mesh.removeNode = function(nodeId) {
    mesh.nodes = mesh.nodes.filter(node => node.id !== nodeId);
  };
  
  // Add a signal to the mesh
  mesh.addSignal = function(signal) {
    mesh.signals.push(signal);
  };
  
  // Remove a signal from the mesh
  mesh.removeSignal = function(signalId) {
    mesh.signals = mesh.signals.filter(signal => signal.id !== signalId);
  };
  
  // Add a sprite to the mesh
  mesh.addSprite = function(sprite) {
    mesh.sprites.push(sprite);
  };
  
  // Remove a sprite from the mesh
  mesh.removeSprite = function(spriteId) {
    mesh.sprites = mesh.sprites.filter(sprite => sprite.id !== spriteId);
  };
  
  // Update the mesh
  mesh.update = function() {
    // Update node positions
    mesh.nodes.forEach(node => {
      node.position.x += Math.random() - 0.5;
      node.position.y += Math.random() - 0.5;
    });
    
    // Update signal positions
    mesh.signals.forEach(signal => {
      signal.progress += 0.01;
      if (signal.progress >= 1) {
        signal.done = true;
      }
    });
    
    // Update sprite activity
    mesh.sprites.forEach(sprite => {
      sprite.activity = Math.random() > 0.9 ? 'thinking' : 'idle';
    });
    
    // Draw the mesh
    drawMesh(ctx, mesh);
  };
  
  // Draw the mesh
  function drawMesh(ctx, mesh) {
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw nodes
    mesh.nodes.forEach(node => {
      drawPixelAvatar(ctx, node.avatar, node.position, node.status);
    });
    
    // Draw signals
    mesh.signals.forEach(signal => {
      drawSignalArc(ctx, signal);
    });
    
    // Draw sprites
    mesh.sprites.forEach(sprite => {
      drawSprite(ctx, sprite);
    });
  }
  
  return mesh;
}

// Export the mesh visualizer
export default createMeshVisualizer;