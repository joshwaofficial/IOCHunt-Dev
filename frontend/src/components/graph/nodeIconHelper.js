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
 * BloodHound Level of Detail (LOD) Zoom Fading
 * When zoomed out, labels fade out to 0 opacity to eliminate clutter.
 * When zoomed in, labels smoothly fade in.
 */
export const STARTING_ZOOM_FADE_RATIO = 0.4;
export const ENDING_ZOOM_FADE_RATIO = 0.3;

export function calculateLabelOpacity(inverseSqrtZoomRatio = 1) {
  if (inverseSqrtZoomRatio >= STARTING_ZOOM_FADE_RATIO) return 1;
  if (inverseSqrtZoomRatio < STARTING_ZOOM_FADE_RATIO && inverseSqrtZoomRatio > ENDING_ZOOM_FADE_RATIO) {
    return (inverseSqrtZoomRatio - ENDING_ZOOM_FADE_RATIO) / (STARTING_ZOOM_FADE_RATIO - ENDING_ZOOM_FADE_RATIO);
  }
  return 0; // Completely hide when zoomed out!
}

export function truncateText(text, maxLen = 14) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

export function blendHexColors(hex, targetHex, amount) {
  if (!hex || !targetHex) return hex || '#ffffff';
  const parse = (h) => {
    const c = String(h).trim().replace('#', '');
    return [
      parseInt(c.slice(0, 2), 16) || 0,
      parseInt(c.slice(2, 4), 16) || 0,
      parseInt(c.slice(4, 6), 16) || 0
    ];
  };
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(targetHex);
  const r = Math.round(r1 + (r2 - r1) * amount);
  const g = Math.round(g1 + (g2 - g1) * amount);
  const b = Math.round(b1 + (b2 - b1) * amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Custom Canvas Node Renderer for BloodHound style:
 * 1. Clean circular body (white in light mode, dark slate in dark mode)
 * 2. High-contrast colored border ring
 * 3. Centered vector icon
 * 4. Crisp non-overlapping label with BloodHound zoom fading and truncation
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
  const isDimmed = data.dimmed;

  context.save();

  // Dimmed background nodes during BloodHound focus selection
  if (isDimmed) {
    context.globalAlpha = isLight ? 0.25 : 0.35;
  } else {
    context.globalAlpha = 1.0;
  }

  // 1. Selection / neighbor highlight ring
  if (isSelected) {
    context.beginPath();
    context.arc(x, y, size + 5, 0, Math.PI * 2);
    context.strokeStyle = isLight ? '#0284c7' : '#38bdf8';
    context.lineWidth = 3.0;
    context.stroke();
  } else if (isNeighbor || data.inChain) {
    context.beginPath();
    context.arc(x, y, size + 3.2, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = 2.0;
    context.stroke();
  }

  // 2. Node circular body — Pure clean white / dark slate
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = isLight ? '#ffffff' : '#0f172a';
  context.fill();

  // 3. Colored border perimeter ring
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = isSelected ? 3.2 : (data.inChain ? 2.8 : 2.4);
  context.stroke();

  // 4. Centered FontAwesome Vector Icon
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    const targetSize = size * 0.70;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = data.iconColor || color || (isLight ? '#1e293b' : '#f8fafc');
    context.fill(path);
    context.restore();
  } else {
    context.beginPath();
    context.arc(x, y, size * 0.45, 0, Math.PI * 2);
    context.fillStyle = data.iconColor || color;
    context.fill();
  }

  // 5. Group Member Count Badge
  if (data.entityType === 'group' && data.memberCount && !isDimmed) {
    const badgeR = 6;
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

  // 6. Node Label UNDER the node with BloodHound Zoom LOD & Truncation
  const inverseSqrtZoomRatio = data.inverseSqrtZoomRatio ?? 1;
  const zoomOpacity = calculateLabelOpacity(inverseSqrtZoomRatio);
  const showLabel = isSelected || data.hovered || (zoomOpacity > 0.02 && !isDimmed);

  if (data.label && showLabel) {
    const fontSize = size >= 13 ? 10 : (size >= 10.5 ? 9 : 8);
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Truncate label if unselected so neighbors never collide
    const isFullText = isSelected || data.hovered || data.inChain;
    const text = isFullText ? String(data.label) : truncateText(String(data.label), 14);

    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 4;
    const pillWidth = textWidth + 8;
    const pillY = y + size + 5 + pillHeight / 2;

    const rx = 3;
    const px = x - pillWidth / 2;
    const py = pillY - pillHeight / 2;

    context.save();
    // Fade label according to zoom level
    context.globalAlpha = (isDimmed ? 0.35 : 1.0) * (isSelected ? 1.0 : zoomOpacity);

    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, pillWidth, pillHeight, rx);
    } else {
      context.rect(px, py, pillWidth, pillHeight);
    }
    context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.94)';
    context.fill();
    context.strokeStyle = isSelected
      ? (isLight ? '#0284c7' : '#38bdf8')
      : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)');
    context.lineWidth = isSelected ? 1.8 : 1;
    context.stroke();

    context.fillStyle = isLight ? '#0f172a' : '#f8fafc';
    context.fillText(text, x, pillY);

    if (data.subLabel && isSelected) {
      const subFontSize = 9;
      context.font = `600 ${subFontSize}px -apple-system, BlinkMacSystemFont, monospace`;
      context.fillStyle = isLight ? '#475569' : '#94a3b8';
      context.fillText(data.subLabel, x, pillY + pillHeight);
    }

    context.restore();
  }

  context.restore();
}

/**
 * Custom Canvas Node Hover Renderer:
 * - NO solid color fill (interior stays clean white/dark)!
 * - Icon inside remains 100% visible!
 * - Clean outer ring indicator
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

  // 1. Clean outer hover ring (NO solid fill!)
  context.beginPath();
  context.arc(x, y, size + 4.5, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 2.2;
  context.stroke();

  // 2. Node circular body — Clean white / dark slate (NEVER solid color fill!)
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = isLight ? '#ffffff' : '#0f172a';
  context.fill();

  // 3. Colored border perimeter ring
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 2.5;
  context.stroke();

  // 4. Centered FontAwesome Vector Icon — 72% size with clean white margin
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    const targetSize = size * 0.70;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = data.iconColor || color || (isLight ? '#1e293b' : '#f8fafc');
    context.fill(path);
    context.restore();
  } else {
    context.beginPath();
    context.arc(x, y, size * 0.45, 0, Math.PI * 2);
    context.fillStyle = data.iconColor || color;
    context.fill();
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
    const fontSize = size >= 13 ? 10 : (size >= 10.5 ? 9 : 8);
    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const text = String(data.label);
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 4;
    const pillWidth = textWidth + (size >= 12 ? 8 : 6);
    const pillY = y + size + (size >= 12 ? 5 : 3.5) + pillHeight / 2;

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
 * Draws high-contrast pill along edge/curve for clean relationship text (MemberOf, GenericAll, DCSync).
 * Supports BloodHound zoom LOD fading, multi-edge curve midpoint positioning, and distance culling.
 */
export function drawBloodHoundEdgeLabel(context, edgeData, sourceData, targetData) {
  if (!edgeData.label || !sourceData || !targetData) return;

  // Zoom Level of Detail check
  const inverseSqrtZoomRatio = edgeData.inverseSqrtZoomRatio ?? 1;
  const zoomOpacity = calculateLabelOpacity(inverseSqrtZoomRatio);
  const isHighlighted = edgeData.selected || edgeData.inChain;

  if (zoomOpacity <= 0.05 && !isHighlighted) return;
  if (edgeData.dimmed && !isHighlighted) return;

  const sx = sourceData.x;
  const sy = sourceData.y;
  const tx = targetData.x;
  const ty = targetData.y;

  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.hypot(dx, dy) || 1;

  // Suppress labels on tiny edges where text would engulf nodes
  if (len < 65 && !isHighlighted) return;

  // Deduplicate multi-edges: only draw label for the primary edge or if highlighted
  if (edgeData.groupSize > 1 && edgeData.groupPosition > 0 && !isHighlighted) return;

  const isLight = edgeData.theme !== 'dark';

  // Compute position along curve if control point exists, else use midpoint
  let mx, my;
  if (edgeData.control) {
    mx = 0.25 * sx + 0.5 * edgeData.control.x + 0.25 * tx;
    my = 0.25 * sy + 0.5 * edgeData.control.y + 0.25 * ty;
  } else {
    const nx = -dy / len;
    const ny = dx / len;
    mx = (sx + tx) / 2 + nx * 8;
    my = (sy + ty) / 2 + ny * 8;
  }

  const fontSize = 9;
  context.save();
  context.globalAlpha = (edgeData.dimmed ? 0.3 : 1.0) * (isHighlighted ? 1.0 : zoomOpacity);
  context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  // Label text, with group count if multiple rights exist between nodes
  let labelText = String(edgeData.label);
  if (edgeData.groupSize > 1 && !isHighlighted) {
    labelText = `${labelText} (+${edgeData.groupSize - 1})`;
  }

  const metrics = context.measureText(labelText);
  const textWidth = metrics.width;
  const pillHeight = fontSize + 4;
  const pillWidth = textWidth + 8;
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
  context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 23, 42, 0.94)';
  context.fill();
  context.strokeStyle = isHighlighted
    ? (isLight ? '#0284c7' : '#38bdf8')
    : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)');
  context.lineWidth = isHighlighted ? 1.6 : 1;
  context.stroke();

  // Draw protocol / relationship label text
  context.fillStyle = isHighlighted ? (isLight ? '#0284c7' : '#38bdf8') : edgeColor;
  context.fillText(labelText, mx, my);

  context.restore();
}
