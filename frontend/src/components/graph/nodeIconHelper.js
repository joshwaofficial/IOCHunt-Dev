import {
  faDesktop,
  faUser,
  faGlobe,
  faNetworkWired,
  faBolt,
  faSkull,
  faUsers,
  faShieldHalved
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
  ip_external: faGlobe,
  ip_private: faNetworkWired,
  ad_attack: faBolt,
  critical: faSkull,
  group: faUsers,
  firewall: faShieldHalved
};

export const KIND_COLORS = {
  machine: '#3b82f6',
  user: '#22c55e',
  actor: '#a855f7',
  ip_external: '#94a3b8',
  ip_private: '#84cc16',
  ad_attack: '#ef4444',
  group: '#eab308',
  default: '#3b82f6'
};

/**
 * Custom Canvas Node Renderer for BloodHound style:
 * 1. Dark circular body
 * 2. Colored border ring
 * 3. Centered FontAwesome vector icon
 * 4. High-contrast label pill that NEVER disappears on zoom out / minimize
 */
export function drawBloodHoundNode(context, data) {
  if (!data.x || !data.y) return;

  const x = data.x;
  const y = data.y;
  const size = Math.max(data.size || 14, 8);
  const color = data.borderColor || data.color || '#3b82f6';
  const isSelected = data.highlighted || data.selected;

  context.save();

  // 1. Selection / Highlight outer glow ring
  if (isSelected) {
    context.beginPath();
    context.arc(x, y, size + 5, 0, Math.PI * 2);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.stroke();
    context.shadowBlur = 0;
  }

  // 2. Node dark inner circular body
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = '#111526';
  context.fill();

  // 3. Colored border perimeter ring (BloodHound kind color)
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = isSelected ? 3 : 2.2;
  context.stroke();

  // 4. Centered FontAwesome Vector Icon
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    // Fit icon nicely inside node circle (approx 55% of diameter)
    const targetSize = size * 1.15;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = isSelected ? '#ffffff' : (data.iconColor || '#e2e8f0');
    context.fill(path);
    context.restore();
  }

  // 5. Node Label with High-Contrast Pill (NEVER vanishes on zoom out or minimize)
  if (data.label) {
    // Keep font size legible even when zoomed out (min 10px, max 14px)
    const fontSize = Math.max(10, Math.min(13, Math.round(size * 0.75)));
    context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const text = String(data.label);
    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 6;
    const pillWidth = textWidth + 12;
    const pillY = y + size + 7 + pillHeight / 2;

    // Draw dark rounded pill background
    const rx = 4;
    const px = x - pillWidth / 2;
    const py = pillY - pillHeight / 2;

    context.beginPath();
    if (context.roundRect) {
      context.roundRect(px, py, pillWidth, pillHeight, rx);
    } else {
      context.rect(px, py, pillWidth, pillHeight);
    }
    context.fillStyle = 'rgba(11, 15, 25, 0.92)';
    context.fill();
    context.strokeStyle = isSelected ? color : 'rgba(255, 255, 255, 0.12)';
    context.lineWidth = 1;
    context.stroke();

    // Draw text inside pill
    context.fillStyle = isSelected ? '#ffffff' : '#f1f5f9';
    context.fillText(text, x, pillY);

    // Optional secondary subLabel (e.g. OS, attack count, or status)
    if (data.subLabel) {
      const subFontSize = Math.max(9, fontSize - 2);
      context.font = `500 ${subFontSize}px ui-monospace, monospace`;
      context.fillStyle = color;
      context.fillText(data.subLabel, x, pillY + pillHeight - 1);
    }
  }

  context.restore();
}

/**
 * Custom Edge Label Renderer for BloodHound relationships:
 * Draws high-contrast pill at the edge midpoint so relationship text is always crisp & readable.
 */
export function drawBloodHoundEdgeLabel(context, edgeData, sourceData, targetData) {
  if (!edgeData.label || !sourceData || !targetData) return;

  const sx = sourceData.x;
  const sy = sourceData.y;
  const tx = targetData.x;
  const ty = targetData.y;

  // Midpoint
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  // Minimum readable font size regardless of zoom
  const fontSize = 10;
  context.save();
  context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const labelText = String(edgeData.label);
  const metrics = context.measureText(labelText);
  const textWidth = metrics.width;
  const pillHeight = fontSize + 6;
  const pillWidth = textWidth + 10;
  const edgeColor = edgeData.color || '#3b82f6';

  const rx = 4;
  const px = mx - pillWidth / 2;
  const py = my - pillHeight / 2;

  // Draw pill background to mask the edge line beneath
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(px, py, pillWidth, pillHeight, rx);
  } else {
    context.rect(px, py, pillWidth, pillHeight);
  }
  context.fillStyle = '#080c16';
  context.fill();
  context.strokeStyle = edgeColor;
  context.lineWidth = 1;
  context.stroke();

  // Draw protocol / relationship label text
  context.fillStyle = edgeColor;
  context.fillText(labelText, mx, my);

  context.restore();
}
