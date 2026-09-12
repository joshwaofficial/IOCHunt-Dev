import {
  faDesktop,
  faUser,
  faGlobe,
  faNetworkWired,
  faBolt,
  faSkull,
  faUsers,
  faShieldHalved,
  faKey,
  faServer
} from '@fortawesome/free-solid-svg-icons';

// Pre-parse and cache Path2D objects for 60fps canvas rendering
const path2DCache = new Map();

function getPath2D(iconDef) {
  if (!iconDef || !iconDef.icon || !iconDef.icon[4]) return null;
  const pathData = iconDef.icon[4];
  if (!path2DCache.has(pathData)) {
    if (typeof Path2D !== 'undefined') {
      path2DCache.set(pathData, new Path2D(pathData));
    } else {
      return null;
    }
  }
  return path2DCache.get(pathData);
}

export const NODE_ICONS = {
  machine: faDesktop,
  user: faUser,
  actor: faUser,
  group: faUsers,
  ip_external: faGlobe,
  ip_private: faNetworkWired,
  ad_attack: faBolt,
  critical: faSkull,
  firewall: faShieldHalved,
  dc: faKey,
  server: faServer
};

export const KIND_COLORS = {
  machine: '#ef4444',      // BloodHound computer: coral / red ring
  user: '#22c55e',         // BloodHound user: vibrant green ring
  group: '#eab308',        // BloodHound group: gold / amber ring
  actor: '#a855f7',        // Attacker / AD Actor: violet
  ad_attack: '#ef4444',    // AD Attack: crimson
  ip_external: '#94a3b8',  // External WAN: slate
  ip_private: '#3b82f6',   // Private IP: blue
  default: '#3b82f6'
};

/**
 * Custom Canvas Node Renderer for BloodHound style:
 * 1. Clean circular body (white in light mode, dark slate in dark mode)
 * 2. High-contrast colored border ring
 * 3. Centered vector icon (always 100% visible!)
 * 4. Crisp, clean non-overlapping label underneath node
 */
export function drawBloodHoundNode(context, data) {
  if (!data.x || !data.y) return;

  const isLight = data.theme !== 'dark';
  const x = data.x;
  const y = data.y;
  const size = Math.max(data.size || 15, 9);
  const color = data.borderColor || data.color || '#3b82f6';
  const isSelected = data.selected;
  const isNeighbor = data.isNeighbor;

  context.save();

  // 1. Selection / Neighbor Highlight Halo Ring
  if (isSelected) {
    context.beginPath();
    context.arc(x, y, size + 6, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.shadowColor = isLight ? 'rgba(37, 99, 235, 0.45)' : color;
    context.shadowBlur = isLight ? 8 : 14;
    context.stroke();
    context.shadowBlur = 0;
  } else if (isNeighbor) {
    context.beginPath();
    context.arc(x, y, size + 4, 0, Math.PI * 2);
    context.strokeStyle = isLight ? 'rgba(59, 130, 246, 0.6)' : 'rgba(96, 165, 250, 0.6)';
    context.lineWidth = 2;
    context.stroke();
  }

  // 2. Node circular body (Clean white in light mode, dark charcoal in dark mode)
  // NEVER fill with solid opaque color!
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = isLight ? '#ffffff' : '#0f172a';
  context.fill();

  // 3. Colored border perimeter ring
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = isSelected ? 3.2 : 2.5;
  context.stroke();

  // 4. Centered FontAwesome Vector Icon — ALWAYS VISIBLE!
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    const targetSize = size * 1.15;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = data.iconColor || color || (isLight ? '#1e293b' : '#f8fafc');
    context.fill(path);
    context.restore();
  }

  // 5. Group Member Count Badge
  if (data.entityType === 'group' && data.memberCount) {
    const badgeR = 6.5;
    const bx = x + size * 0.7;
    const by = y + size * 0.7;
    context.beginPath();
    context.arc(bx, by, badgeR, 0, Math.PI * 2);
    context.fillStyle = '#000000';
    context.fill();
    context.strokeStyle = '#eab308';
    context.lineWidth = 1.2;
    context.stroke();

    context.font = '700 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(data.memberCount), bx, by);
  }

  // 6. Node Label UNDER the node (Never on side!)
  if (data.label) {
    const fontSize = 10;
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const text = String(data.label);
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 4;
    const pillWidth = textWidth + 8;
    const pillY = y + size + 5 + pillHeight / 2;

    const rx = 3;
    const px = x - pillWidth / 2;
    const py = pillY - pillHeight / 2;

    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, pillWidth, pillHeight, rx);
    } else {
      context.rect(px, py, pillWidth, pillHeight);
    }
    context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(15, 23, 42, 0.88)';
    context.fill();
    context.strokeStyle = isSelected
      ? color
      : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)');
    context.lineWidth = isSelected ? 1.5 : 1;
    context.stroke();

    context.fillStyle = isLight ? '#0f172a' : '#f8fafc';
    context.fillText(text, x, pillY);

    if (data.subLabel && isSelected) {
      const subFontSize = 9;
      context.font = `600 ${subFontSize}px -apple-system, BlinkMacSystemFont, monospace`;
      context.fillStyle = isLight ? '#475569' : '#94a3b8';
      context.fillText(data.subLabel, x, pillY + pillHeight);
    }
  }

  context.restore();
}

/**
 * Custom Canvas Node Hover Renderer:
 * - NO solid color fill (interior stays clean white/dark)!
 * - Icon inside remains 100% visible!
 * - Highlights using a luminous outer halo ring.
 * - NO side-popup / tooltip box (label stays cleanly under the node).
 */
export function drawBloodHoundNodeHover(context, data) {
  if (!data.x || !data.y) return;

  const isLight = data.theme !== 'dark';
  const x = data.x;
  const y = data.y;
  const size = Math.max(data.size || 15, 9);
  const color = data.borderColor || data.color || '#3b82f6';

  context.save();

  // 1. Luminous outer halo ring highlight
  context.beginPath();
  context.arc(x, y, size + 7, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 2.8;
  context.shadowColor = isLight ? 'rgba(37, 99, 235, 0.45)' : color;
  context.shadowBlur = isLight ? 10 : 16;
  context.stroke();
  context.shadowBlur = 0;

  // 2. Node circular body — Clean white / dark slate (NEVER solid color fill!)
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = isLight ? '#ffffff' : '#0f172a';
  context.fill();

  // 3. Colored border perimeter ring
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 3.2;
  context.stroke();

  // 4. Centered FontAwesome Vector Icon — ALWAYS VISIBLE!
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    const targetSize = size * 1.15;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = data.iconColor || color || (isLight ? '#1e293b' : '#f8fafc');
    context.fill(path);
    context.restore();
  }

  // 5. Group Member Count Badge
  if (data.entityType === 'group' && data.memberCount) {
    const badgeR = 6.5;
    const bx = x + size * 0.7;
    const by = y + size * 0.7;
    context.beginPath();
    context.arc(bx, by, badgeR, 0, Math.PI * 2);
    context.fillStyle = '#000000';
    context.fill();
    context.strokeStyle = '#eab308';
    context.lineWidth = 1.2;
    context.stroke();

    context.font = '700 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(data.memberCount), bx, by);
  }

  // 6. Node Label UNDER the node (NO side popup box!)
  if (data.label) {
    const fontSize = 10;
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const text = String(data.label);
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 4;
    const pillWidth = textWidth + 8;
    const pillY = y + size + 5 + pillHeight / 2;

    const rx = 3;
    const px = x - pillWidth / 2;
    const py = pillY - pillHeight / 2;

    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, pillWidth, pillHeight, rx);
    } else {
      context.rect(px, py, pillWidth, pillHeight);
    }
    context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 23, 42, 0.95)';
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 1.6;
    context.stroke();

    context.fillStyle = isLight ? '#0f172a' : '#f8fafc';
    context.fillText(text, x, pillY);
  }

  context.restore();
}

/**
 * Custom Edge Label Renderer for BloodHound relationships:
 * Draws high-contrast pill at the edge midpoint for clean relationship text (MemberOf, GenericAll, DCSync).
 */
export function drawBloodHoundEdgeLabel(context, edgeData, sourceData, targetData) {
  if (!edgeData.label || !sourceData || !targetData) return;

  const isLight = edgeData.theme !== 'dark';
  const sx = sourceData.x;
  const sy = sourceData.y;
  const tx = targetData.x;
  const ty = targetData.y;

  // Midpoint with slight perpendicular normal offset to separate opposite-direction edges
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mx = (sx + tx) / 2 + nx * 7;
  const my = (sy + ty) / 2 + ny * 7;

  const fontSize = 9;
  context.save();
  context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const labelText = String(edgeData.label);
  const metrics = context.measureText(labelText);
  const textWidth = metrics.width;
  const pillHeight = fontSize + 4;
  const pillWidth = textWidth + 6;
  const edgeColor = edgeData.color || (isLight ? '#475569' : '#94a3b8');

  const rx = 3;
  const px = mx - pillWidth / 2;
  const py = my - pillHeight / 2;

  // Draw pill background to cleanly mask the edge line underneath
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(px, py, pillWidth, pillHeight, rx);
  } else {
    context.rect(px, py, pillWidth, pillHeight);
  }
  context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 23, 42, 0.92)';
  context.fill();
  context.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
  context.lineWidth = 1;
  context.stroke();

  // Draw protocol / relationship label text
  context.fillStyle = edgeColor;
  context.fillText(labelText, mx, my);

  context.restore();
}
