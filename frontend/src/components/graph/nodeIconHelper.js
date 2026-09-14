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
  faServer,
  faUserSecret,
  faSitemap,
  faCrown
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
  computer: faDesktop,
  monitor: faDesktop,
  user: faUser,
  person: faUser,
  hacker: faUserSecret,
  actor: faUserSecret,
  attacker: faUserSecret,
  group: faUsers,
  ou: faSitemap,
  container: faSitemap,
  domain: faKey,
  dc: faKey,
  server: faServer,
  ip_external: faGlobe,
  wan: faGlobe,
  ip_private: faNetworkWired,
  lan: faNetworkWired,
  ad_attack: faBolt,
  attack: faBolt,
  critical: faSkull,
  firewall: faShieldHalved,
  gpo: faShieldHalved,
  crown: faCrown,
  default: faDesktop
};

export const KIND_COLORS = {
  user: '#22c55e',         // BloodHound vibrant green
  person: '#22c55e',
  machine: '#ef4444',      // BloodHound coral/salmon red
  computer: '#ef4444',
  monitor: '#ef4444',
  group: '#f59e0b',        // BloodHound golden yellow
  ou: '#f97316',           // BloodHound vibrant orange
  container: '#f97316',
  domain: '#3b82f6',       // BloodHound royal blue
  dc: '#3b82f6',
  server: '#3b82f6',
  hacker: '#dc2626',       // Threat actor crimson
  actor: '#dc2626',
  attacker: '#dc2626',
  ad_attack: '#ef4444',    // AD Attack red
  ip_external: '#64748b',  // Slate WAN
  wan: '#64748b',
  ip_private: '#0284c7',   // Sky LAN
  lan: '#0284c7',
  critical: '#ef4444',
  default: '#3b82f6'
};

export const KIND_SUBTITLES = {
  user: 'Active Directory | User',
  person: 'Active Directory | User',
  machine: 'Active Directory | Computer',
  computer: 'Active Directory | Computer',
  monitor: 'Active Directory | Computer',
  group: 'Active Directory | Group',
  ou: 'Active Directory | OU',
  container: 'Active Directory | OU',
  domain: 'Active Directory | Domain',
  dc: 'Active Directory | DC',
  server: 'Active Directory | Server',
  hacker: 'Threat Actor | Attacker',
  actor: 'Threat Actor | Attacker',
  attacker: 'Threat Actor | Attacker',
  ip_external: 'External Network | WAN',
  wan: 'External Network | WAN',
  ip_private: 'Internal Subnet | LAN',
  lan: 'Internal Subnet | LAN',
  default: 'Active Directory | Node'
};

const svgDataUriCache = new Map();

/**
 * Generate crisp vector SVG data URIs for Cytoscape node background images
 * Matches BloodHound CE: centered solid black icon inside square viewBox,
 * with optional top-right diamond badge for Crown Jewel / Tier-0 targets.
 */
export function getNodeSvgDataUri(iconType, isCrownJewel = false) {
  const cacheKey = `${iconType}|${isCrownJewel ? 'crown' : 'normal'}`;
  if (svgDataUriCache.has(cacheKey)) return svgDataUriCache.get(cacheKey);

  const iconDef = NODE_ICONS[iconType] || (iconType && NODE_ICONS[iconType.toLowerCase()]) || NODE_ICONS.machine;
  if (!iconDef || !iconDef.icon) return '';

  const [w, h, , , path] = iconDef.icon;
  const maxDim = Math.max(w, h);
  const ox = (maxDim - w) / 2;
  const oy = (maxDim - h) / 2;

  let svgContent = `<path fill="#000000" d="${path}" transform="translate(${ox}, ${oy})"/>`;

  // If Crown Jewel / Tier-0 / High-Value Target:
  // Add crisp diamond badge on top-right corner (matching BloodHound Reference Image 4)
  if (isCrownJewel) {
    const badgeSize = maxDim * 0.24;
    const bx = maxDim - badgeSize * 1.05;
    const by = badgeSize * 0.05;
    const half = badgeSize / 2;
    svgContent += `<polygon points="${bx + half},${by} ${bx + badgeSize},${by + half} ${bx + half},${by + badgeSize} ${bx},${by + half}" fill="#000000" stroke="#ffffff" stroke-width="${maxDim * 0.03}"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxDim} ${maxDim}">${svgContent}</svg>`;
  const uri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  svgDataUriCache.set(cacheKey, uri);
  return uri;
}

/**
 * Custom Canvas Node Renderer for BloodHound style:
 * 1. Clean circular body (white in light mode, dark slate in dark mode)
 * 2. High-contrast colored border ring
 * 3. Centered vector icon (always 100% visible!)
 * 4. Crisp, clean non-overlapping label underneath node
 */
export function drawBloodHoundNode(context, data) {
  if (typeof data.x !== 'number' || typeof data.y !== 'number' || isNaN(data.x) || isNaN(data.y)) return;

  const isLight = data.theme !== 'dark';
  const x = data.x;
  const y = data.y;
  const size = Math.max(data.size || 14, 7);
  const color = data.borderColor || data.color || '#3b82f6';
  const isSelected = data.selected;
  const isNeighbor = data.isNeighbor;
  const isDimmed = data.dimmed;

  context.save();

  // Dimmed background nodes during BloodHound focus selection (subtle dimming: clearly visible in original colors!)
  if (isDimmed) {
    context.globalAlpha = 0.45;
  } else {
    context.globalAlpha = 1.0;
  }

  // 1. Simple, clean selection / neighbor highlight ring (ONLY outer ring, NO solid fill!)
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
    context.lineWidth = 1.8;
    context.stroke();
  }

  // 2. Node circular body — Solid vibrant BloodHound color
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();

  // 3. Crisp black perimeter ring matching BloodHound
  context.beginPath();
  context.arc(x, y, size, 0, Math.PI * 2);
  context.strokeStyle = '#000000';
  context.lineWidth = isSelected ? 3.5 : (data.inChain ? 3.0 : 2.5);
  context.stroke();

  // 4. Centered FontAwesome Vector Icon — solid black
  const iconDef = NODE_ICONS[data.iconType] || (data.iconType && NODE_ICONS[data.iconType.toLowerCase()]) || NODE_ICONS.machine;
  const path = getPath2D(iconDef);

  if (path && iconDef.icon) {
    const [iconW, iconH] = [iconDef.icon[0], iconDef.icon[1]];
    const targetSize = size * 0.65;
    const scale = targetSize / Math.max(iconW, iconH);

    context.save();
    context.translate(x - (iconW * scale) / 2, y - (iconH * scale) / 2);
    context.scale(scale, scale);
    context.fillStyle = '#000000';
    context.fill(path);
    context.restore();
  } else {
    context.beginPath();
    context.arc(x, y, size * 0.45, 0, Math.PI * 2);
    context.fillStyle = '#000000';
    context.fill();
  }

  // 5. Crown Jewel Diamond Badge
  if (data.isCrownJewel && !isDimmed) {
    const bx = x + size * 0.65;
    const by = y - size * 0.65;
    const dSize = 6;
    context.beginPath();
    context.moveTo(bx, by - dSize);
    context.lineTo(bx + dSize, by);
    context.lineTo(bx, by + dSize);
    context.lineTo(bx - dSize, by);
    context.closePath();
    context.fillStyle = '#000000';
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    context.stroke();
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

  // 6. Node Label Pill UNDER Node (zoom-aware)
  if (data.label && !isDimmed) {
    const text = String(data.label).trim();
    if (!text) { context.restore(); return; }

    const fontSize =
      size >= 13 ? 10 :
      size >= 10.5 ? 9 :
      size >= 9 ? 8 : 7;

    context.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const metrics = context.measureText(text);
    const textWidth = metrics.width;
    const pillHeight = fontSize + 4;
    const pillWidth = textWidth + (size >= 12 ? 8 : 6);
    const pillY = y + size + (size >= 12 ? 5 : 3.5) + pillHeight / 2;

    const rx = 3;
    const px = x - pillWidth / 2;
    const py = pillY - pillHeight / 2;

    context.beginPath();
    if (context.roundRect) context.roundRect(px, py, pillWidth, pillHeight, rx);
    else context.rect(px, py, pillWidth, pillHeight);
    context.fillStyle = isLight ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.9)';
    context.fill();
    context.strokeStyle = isSelected
      ? (isLight ? '#0284c7' : '#38bdf8')
      : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.1)');
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
  if (typeof data.x !== 'number' || typeof data.y !== 'number' || isNaN(data.x) || isNaN(data.y)) return;

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
 * Draws high-contrast pill at the edge midpoint for clean relationship text (MemberOf, GenericAll, DCSync).
 */
export function drawBloodHoundEdgeLabel(context, edgeData, sourceData, targetData) {
  if (!edgeData.label || !sourceData || !targetData || edgeData.dimmed || edgeData.hideEdgeLabel) return;

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
