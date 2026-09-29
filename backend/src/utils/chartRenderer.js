const path = require('path');
const fs = require('fs');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const { Chart, registerables } = require('chart.js');
Chart.register(...registerables);

// Register bundled Inter fonts to guarantee labels render on any headless Linux or macOS server
try {
  const regPath = path.join(__dirname, '../assets/fonts/inter-regular.woff');
  const boldPath = path.join(__dirname, '../assets/fonts/inter-bold.woff');
  if (fs.existsSync(regPath)) {
    GlobalFonts.registerFromPath(regPath, 'Inter');
  }
  if (fs.existsSync(boldPath)) {
    GlobalFonts.registerFromPath(boldPath, 'InterBold');
  }
  GlobalFonts.loadSystemFonts();
} catch (fontErr) {
  console.warn('[ChartRenderer] Font registration warning:', fontErr.message);
}

// Ensure Chart.js defaults to Inter with fallbacks
Chart.defaults.font.family = "'Inter', 'InterBold', 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif";

// Curated SOC Palette
const PALETTE = {
  crit: '#ef4444',
  high: '#f97316',
  med: '#f59e0b',
  low: '#0ea5e9',
  info: '#64748b',
  purple: '#8b5cf6',
  indigo: '#6366f1',
  emerald: '#10b981',
  dark: '#0f172a',
  border: '#e2e8f0',
  grid: 'rgba(226, 232, 240, 0.8)'
};

/**
 * Custom Chart.js plugin to draw centered text inside a Doughnut chart.
 */
function createCenterTextPlugin(primaryText, subText) {
  return {
    id: `centerText_${Math.random()}`,
    beforeDraw(chart) {
      const { width, height } = chart;
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Primary value
      ctx.font = 'bold 32px Inter, Arial, sans-serif';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(primaryText, width / 2, height / 2 - 8);

      // Subtitle
      ctx.font = 'bold 12px Inter, Arial, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText(subText, width / 2, height / 2 + 18);
      ctx.restore();
    }
  };
}

/**
 * 1. Multi-Severity Velocity Timeline Chart (Option 1: Dual-Layer Area & Threat Pulse Curve)
 * Background: Smooth semi-transparent area curve for Total Event Baseline Volume.
 * Foreground: Dual-axis vibrant curved pulse lines with bold circular markers for Critical and High threats.
 */
async function generateTimelineChartBuffer(timeline) {
  const canvas = createCanvas(1080, 260);
  const ctx = canvas.getContext('2d');

  const safeTimeline = (timeline && timeline.length > 0) ? timeline : [
    { bucket: 'Period', total: 100, crit: 0, high: 2, med: 10, low: 88 }
  ];

  const labels = safeTimeline.map(t => t.bucket || '');
  const totalData = safeTimeline.map(t => t.total || 0);
  const highData = safeTimeline.map(t => t.high || 0);
  const critData = safeTimeline.map(t => t.crit || 0);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Baseline Volume',
          data: totalData,
          fill: true,
          backgroundColor: 'rgba(56, 189, 248, 0.16)',
          borderColor: '#38bdf8',
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 0,
          yAxisID: 'y'
        },
        {
          label: 'High Severity Alerts',
          data: highData,
          borderColor: '#f97316',
          borderWidth: 2.5,
          borderDash: [4, 4],
          tension: 0.35,
          pointRadius: 4,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#f97316',
          pointBorderWidth: 2,
          yAxisID: 'y1'
        },
        {
          label: 'Critical Threats (Attack Pulse)',
          data: critData,
          borderColor: '#ef4444',
          borderWidth: 3,
          tension: 0.35,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2.5,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: false,
      animation: false,
      layout: {
        padding: { top: 10, right: 20, bottom: 5, left: 15 }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12, weight: 'bold', family: 'Inter, Arial, sans-serif' },
            color: '#64748b',
            maxRotation: 0
          }
        },
        y: {
          position: 'left',
          beginAtZero: true,
          grid: {
            color: '#e2e8f0',
            lineWidth: 1
          },
          ticks: {
            font: { size: 11, family: 'Inter, Arial, sans-serif' },
            color: '#94a3b8'
          },
          title: {
            display: true,
            text: 'Baseline Event Volume',
            font: { size: 11, weight: 'bold', family: 'Inter, Arial, sans-serif' },
            color: '#64748b'
          }
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          grid: { display: false },
          ticks: {
            font: { size: 11, weight: 'bold', family: 'Inter, Arial, sans-serif' },
            color: '#ef4444',
            precision: 0
          },
          title: {
            display: true,
            text: 'Threat Attack Pulses',
            font: { size: 11, weight: 'bold', family: 'Inter, Arial, sans-serif' },
            color: '#ef4444'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            usePointStyle: true,
            boxWidth: 10,
            boxHeight: 10,
            font: { size: 12, weight: 'bold', family: 'Inter, Arial, sans-serif' },
            color: '#475569',
            padding: 16
          }
        }
      }
    }
  });

  const buffer = canvas.toBuffer('image/png');
  chart.destroy();
  return buffer;
}


/**
 * 2. Event Categories Doughnut Chart (High-Resolution vector circle)
 */
async function generateCategoryDoughnutBuffer(categories, totalCount) {
  const canvas = createCanvas(520, 520);
  const ctx = canvas.getContext('2d');

  const labels = categories.map(c => c.category);
  const data = categories.map(c => c.n);
  const colors = categories.map(c => c.color);

  const centerPlugin = createCenterTextPlugin(Number(totalCount).toLocaleString(), 'TOTAL EVENTS');

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: false,
      animation: false,
      cutout: '72%',
      layout: { padding: 15 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [centerPlugin]
  });

  const buffer = canvas.toBuffer('image/png');
  chart.destroy();
  return buffer;
}

/**
 * 3. MITRE ATT&CK Framework Kill-Chain Horizontal Bar Chart
 */
async function generateMitreChartBuffer(tacticList) {
  const canvas = createCanvas(750, 360);
  const ctx = canvas.getContext('2d');

  const safeList = (tacticList && tacticList.length > 0) ? tacticList.slice(0, 7) : [
    { tactic: 'Credential Access', count: 0 },
    { tactic: 'Defense Evasion', count: 0 },
    { tactic: 'Discovery', count: 0 },
    { tactic: 'Execution', count: 0 },
    { tactic: 'Lateral Movement', count: 0 },
    { tactic: 'Persistence', count: 0 }
  ];

  const labels = safeList.map(t => t.tactic);
  const data = safeList.map(t => t.count);

  // Gradient colors from high severity to info
  const barColors = [
    '#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981'
  ].slice(0, safeList.length);

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: barColors,
        borderRadius: 5,
        maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      layout: { padding: { top: 10, right: 25, bottom: 5, left: 10 } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#e2e8f0', lineWidth: 1 },
          ticks: { font: { size: 12, family: 'Inter, Arial, sans-serif' }, color: '#94a3b8' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 13, weight: 'bold', family: 'Inter, Arial, sans-serif' }, color: '#1e293b' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  const buffer = canvas.toBuffer('image/png');
  chart.destroy();
  return buffer;
}

/**
 * 4. Firewall Top Targeted Ports Horizontal Bar Chart
 */
async function generatePortsChartBuffer(portList) {
  const canvas = createCanvas(750, 360);
  const ctx = canvas.getContext('2d');

  const safeList = (portList && portList.length > 0) ? portList.slice(0, 5) : [
    { label: 'Port 3389 (RDP)', count: 0 },
    { label: 'Port 445 (SMB)', count: 0 },
    { label: 'Port 22 (SSH)', count: 0 },
    { label: 'Port 80 (HTTP)', count: 0 },
    { label: 'Port 53 (DNS)', count: 0 }
  ];

  const labels = safeList.map(p => p.label);
  const data = safeList.map(p => p.count);

  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: '#2563eb',
        borderRadius: 5,
        maxBarThickness: 24
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      layout: { padding: { top: 10, right: 25, bottom: 5, left: 10 } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#e2e8f0', lineWidth: 1 },
          ticks: { font: { size: 12, family: 'Inter, Arial, sans-serif' }, color: '#94a3b8' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 13, weight: 'bold', family: 'Inter, Arial, sans-serif' }, color: '#1e293b' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  const buffer = canvas.toBuffer('image/png');
  chart.destroy();
  return buffer;
}

/**
 * 5. Fleet OS Distribution Doughnut Chart
 */
async function generateFleetOsChartBuffer(osList, totalFleet) {
  const canvas = createCanvas(520, 520);
  const ctx = canvas.getContext('2d');

  const safeList = (osList && osList.length > 0) ? osList : [
    { os: 'Windows 11 / 10', count: totalFleet || 1, color: '#3b82f6' }
  ];

  const labels = safeList.map(o => o.os);
  const data = safeList.map(o => o.count);
  const colors = safeList.map(o => o.color || '#3b82f6');

  const centerPlugin = createCenterTextPlugin(String(totalFleet), 'ENDPOINTS');

  const chart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: false,
      animation: false,
      cutout: '72%',
      layout: { padding: 15 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      }
    },
    plugins: [centerPlugin]
  });

  const buffer = canvas.toBuffer('image/png');
  chart.destroy();
  return buffer;
}

module.exports = {
  generateTimelineChartBuffer,
  generateCategoryDoughnutBuffer,
  generateMitreChartBuffer,
  generatePortsChartBuffer,
  generateFleetOsChartBuffer
};
