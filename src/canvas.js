/**
 * Canvas utilities for the Neural Mesh Visualizer
 * 
 * This module provides functions for drawing pixel avatars, signal arcs,
 * and sprites on the canvas.
 */

// Create a canvas element
export function createCanvas(container) {
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  container.appendChild(canvas);
  return canvas;
}

// Draw a pixel avatar
export function drawPixelAvatar(ctx, avatar, position, status) {
  const size = 32;
  const x = position.x - size / 2;
  const y = position.y - size / 2;
  
  // Draw the avatar background
  ctx.fillStyle = status === 'online' ? '#00ff00' : '#0000ff';
  ctx.fillRect(x, y, size, size);
  
  // Draw the avatar icon
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(avatar, position.x, position.y);
}

// Draw a signal arc
export function drawSignalArc(ctx, signal) {
  const { start, end, progress, color } = signal;
  
  // Calculate the arc path
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const radius = Math.sqrt(
    Math.pow(end.x - start.x, 2) + 
    Math.pow(end.y - start.y, 2)
  ) / 2;
  
  // Draw the arc
  ctx.beginPath();
  ctx.arc(midX, midY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color || '#00ffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw the progress indicator
  const progressX = start.x + (end.x - start.x) * progress;
  const progressY = start.y + (end.y - start.y) * progress;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(progressX, progressY, 3, 0, Math.PI * 2);
  ctx.fill();
}

// Draw a sprite
export function drawSprite(ctx, sprite) {
  const { x, y, size, activity } = sprite;
  
  // Draw the sprite
  ctx.fillStyle = activity === 'thinking' ? '#ffff00' : '#ffffff';
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
  
  // Draw the activity indicator
  if (activity === 'thinking') {
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y);
  }
}

// Export the canvas utilities
export default { createCanvas, drawPixelAvatar, drawSignalArc, drawSprite };