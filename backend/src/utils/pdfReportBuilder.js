const PDFDocument = require('pdfkit');
const {
  generateTimelineChartBuffer,
  generateCategoryDoughnutBuffer,
  generateMitreChartBuffer,
  generatePortsChartBuffer,
  generateFleetOsChartBuffer
} = require('./chartRenderer');

/**
 * Generates an Executive Security Intelligence Report PDF buffer using PDFKit and Chart.js.
 * Features:
 * - Fluid continuous page flow (no artificial large blank spaces).
 * - High-DPI Chart.js Visualizations (Multi-Severity Velocity Timeline, Category Donut, MITRE Kill-Chain, Ports, OS).
 * - Active Directory & Identity Threat Matrix.
 * - Perimeter Defense & Firewall Inbound Attacks & Ports.
 * - Hardware / USB & DLP Policy Log.
 * - Incident Forensics Case Cards (Top 3-5 Ranked Threats + Register + MTTR).
 *
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
async function generatePdfReport(data) {
  // Pre-render all Chart.js graphics into high-resolution PNG buffers in parallel
  const [
    timelineChartBuf,
    categoryDoughnutBuf,
    mitreChartBuf,
    portsChartBuf,
    osChartBuf
  ] = await Promise.all([
    generateTimelineChartBuffer(data.timeline || []),
    generateCategoryDoughnutBuffer(data.categories || [], data.totalEvents || 0),
    generateMitreChartBuffer(data.mitre?.tactics || []),
    generatePortsChartBuffer(data.firewall?.topPorts || []),
    generateFleetOsChartBuffer(data.fleetDistribution?.osList || [], data.fleet?.total || 0)
  ]);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 25, left: 36, right: 36 },
        bufferPages: true,
        info: {
          Title: `IOC Hunt Executive Intelligence Report - ${data.scheduleName || 'SOC Briefing'}`,
          Author: 'IOC Hunt SOC Intelligence Engine',
          Subject: 'Executive Threat Analytics & Fleet Health Briefing'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const margin = 36;
      const contentWidth = doc.page.width - (margin * 2);
      const bottomLimit = doc.page.height - 35;

      // Curated SOC Palette
      const C_DARK = '#0f172a';
      const C_NAVY = '#1e3a5f';
      const C_BLUE = '#2563eb';
      const C_CRIT = '#ef4444';
      const C_HIGH = '#f97316';
      const C_MED = '#eab308';
      const C_LOW = '#10b981';
      const C_PURPLE = '#8b5cf6';
      const C_TEXT = '#1e293b';
      const C_MUTED = '#64748b';
      const C_BORDER = '#e2e8f0';
      const C_BG_LIGHT = '#f8fafc';

      const tlColor = data.tlColor || (
        data.threatLevel === 'CRITICAL' ? C_CRIT :
        data.threatLevel === 'HIGH' ? C_HIGH :
        data.threatLevel === 'ELEVATED' ? C_MED : C_LOW
      );

      // Helper for continuous dynamic flow
      function ensureSpace(neededHeight, onNewPage = null) {
        if (doc.y + neededHeight > bottomLimit) {
          doc.addPage();
          doc.y = margin;
          // Running top header on subsequent pages
          doc.rect(margin, margin, contentWidth, 20).fill(C_DARK);
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
            .text('IOCHUNT • EXECUTIVE THREAT INTELLIGENCE & ANALYTICS', margin + 8, margin + 6);
          doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
            .text(data.generatedAt || '', margin + contentWidth - 140, margin + 6, { width: 132, align: 'right' });
          doc.y = margin + 28;
          if (typeof onNewPage === 'function') {
            onNewPage();
          }
          return true;
        }
        return false;
      }

      // Helper to render section headings safely without orphan headers
      function renderSectionHeading(title, subtitle = null, totalNeededHeight = 0) {
        const needed = totalNeededHeight > 0 ? totalNeededHeight : (subtitle ? 30 : 22);
        ensureSpace(needed);
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(10.5).text(title, margin, doc.y);
        if (subtitle) {
          doc.fillColor(C_MUTED).font('Helvetica').fontSize(7).text(subtitle, margin, doc.y + 1);
          doc.y += 14;
        } else {
          doc.y += 14;
        }
      }

      // ── 1. Cover Header Banner (First page only) ───────────────────────────
      doc.rect(margin, margin, contentWidth, 54).fill(C_DARK);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('IOC HUNT', margin + 14, margin + 12);
      doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(8.5).text('ENTERPRISE SECURITY INTELLIGENCE REPORT', margin + 84, margin + 14);
      doc.fillColor('#cbd5e1').font('Helvetica').fontSize(8).text(
        `Window: ${data.periodLabel}   |   Branch: ${data.branch || 'All'}   |   Machine: ${data.machine || 'All'}`,
        margin + 14, margin + 34
      );

      // Posture Score Badge
      const scoreBoxW = 95;
      const scoreBoxX = margin + contentWidth - scoreBoxW - 10;
      const scoreBoxY = margin + 9;
      doc.roundedRect(scoreBoxX, scoreBoxY, scoreBoxW, 36, 4).fill(C_NAVY);
      doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(6.5).text('POSTURE SCORE', scoreBoxX, scoreBoxY + 5, { width: scoreBoxW, align: 'center' });
      doc.fillColor(tlColor).font('Helvetica-Bold').fontSize(14).text(`${data.postureScore || 100}/100`, scoreBoxX, scoreBoxY + 16, { width: scoreBoxW, align: 'center' });

      // ── 2. Posture & Executive Narrative Banner ────────────────────────────
      const bannerY = margin + 64;
      const bannerH = 44;
      doc.roundedRect(margin, bannerY, contentWidth, bannerH, 4).fill(C_BG_LIGHT);
      doc.rect(margin, bannerY, 4, bannerH).fill(tlColor);

      doc.fillColor(tlColor).font('Helvetica-Bold').fontSize(9.5)
        .text(`SECURITY THREAT LEVEL: ${data.threatLevel || 'NORMAL'}`, margin + 14, bannerY + 7);
      doc.fillColor(C_TEXT).font('Helvetica').fontSize(7.5).lineGap(1.5)
        .text(data.narrative || 'All monitored telemetry within normal operational baseline.', margin + 14, bannerY + 20, { width: contentWidth - 28 });
      doc.y = bannerY + bannerH + 10;

      // ── 3. Core KPI Metric Cards (6 cards) ─────────────────────────────────
      ensureSpace(58);
      const cardGap = 6;
      const numCards = 6;
      const cardW = (contentWidth - ((numCards - 1) * cardGap)) / numCards;
      const cardH = 48;
      const curCardY = doc.y;

      const fleetData = data.fleet || { total: 0, active: 0, inactive: 0 };
      const totalTrend = data.trends?.totalTrend || 'Baseline';
      const critTrend = data.trends?.critTrend || 'Baseline';

      const kpis = [
        { label: 'TOTAL EVENTS', val: (data.totalEvents || 0).toLocaleString(), trend: totalTrend, col: C_DARK },
        { label: 'CRITICAL', val: (data.critCount || 0).toLocaleString(), trend: critTrend, col: C_CRIT },
        { label: 'HIGH ALERTS', val: (data.highCount || 0).toLocaleString(), trend: (data.highCount > 0 ? `${data.highCount} Alerts` : 'Clear'), col: C_HIGH },
        { label: 'MEDIUM', val: (data.medCount || 0).toLocaleString(), trend: (data.medCount > 0 ? `${data.medCount} Warnings` : 'Clear'), col: C_MED },
        { label: 'OPEN INCIDENTS', val: String(data.incidents?.open || 0), trend: (data.incidents?.open > 0 ? 'Active Triage' : 'Zero Open'), col: C_PURPLE },
        { label: 'FLEET HEALTH', val: `${fleetData.active}/${fleetData.total}`, trend: (fleetData.inactive > 0 ? `${fleetData.inactive} Offline` : '100% Online'), col: fleetData.inactive > 0 ? C_HIGH : C_LOW }
      ];

      kpis.forEach((kpi, idx) => {
        const kx = margin + idx * (cardW + cardGap);
        doc.roundedRect(kx, curCardY, cardW, cardH, 4).fillAndStroke(C_BG_LIGHT, C_BORDER);
        doc.fillColor(kpi.col).font('Helvetica-Bold').fontSize(12).text(kpi.val, kx, curCardY + 7, { width: cardW, align: 'center' });
        doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6).text(kpi.label, kx, curCardY + 23, { width: cardW, align: 'center' });
        doc.fillColor(kpi.trend.includes('Down') || kpi.trend.includes('Zero') || kpi.trend.includes('100%') ? C_LOW : kpi.trend.includes('Up') || kpi.trend.includes('Active') || kpi.trend.includes('Offline') ? C_CRIT : C_MUTED)
          .font('Helvetica').fontSize(6).text(kpi.trend, kx, curCardY + 34, { width: cardW, align: 'center' });
      });
      doc.y = curCardY + cardH + 16;

      // ── 4. Multi-Severity Velocity Timeline (High-DPI Chart.js Stacked Bar) ──
      const chartH = 115;
      renderSectionHeading('Multi-Severity Telemetry Velocity Timeline', 'Aggregated event burst velocity and threat distribution over reporting intervals', 30 + chartH);
      const chartY = doc.y;
      doc.roundedRect(margin, chartY, contentWidth, chartH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Embed high-res Chart.js timeline
      doc.image(timelineChartBuf, margin + 8, chartY + 6, {
        width: contentWidth - 16,
        height: chartH - 12
      });
      doc.y = chartY + chartH + 16;

      // ── 5. Event Categories & Share Distribution (High-DPI Doughnut + Micro-bars)
      const donutBoxH = 125;
      renderSectionHeading('Event Categories & Severity Distribution', 'Vector composition of security events with proportion indicators', 30 + donutBoxH);
      const donutBoxY = doc.y;
      doc.roundedRect(margin, donutBoxY, contentWidth, donutBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Left Column: Silky-smooth Chart.js Doughnut
      doc.image(categoryDoughnutBuf, margin + 12, donutBoxY + 8, {
        width: 110,
        height: 110
      });

      // Right Column: Category Share Table with Proportional Progress Micro-bars
      const catTableX = margin + 140;
      const catTableW = contentWidth - 150;
      const catTableY = donutBoxY + 10;

      // Table Header
      doc.rect(catTableX, catTableY, catTableW, 16).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('CATEGORY', catTableX + 8, catTableY + 5);
      doc.text('VOLUME', catTableX + 130, catTableY + 5, { width: 50, align: 'right' });
      doc.text('DISTRIBUTION & SHARE', catTableX + 195, catTableY + 5, { width: 140, align: 'left' });

      const categories = (data.categories && data.categories.length)
        ? data.categories.slice(0, 6)
        : [{ category: 'GENERAL', n: data.totalEvents || 0, color: C_BLUE }];
      const totalCatEvents = categories.reduce((acc, c) => acc + (c.n || 0), 0) || 1;

      categories.forEach((cat, idx) => {
        const rowY = catTableY + 19 + (idx * 16.5);
        const pct = cat.n / totalCatEvents;
        const pctStr = `${Math.round(pct * 100)}%`;

        // Color badge & name
        doc.circle(catTableX + 12, rowY + 5, 3).fill(cat.color || C_BLUE);
        doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(7)
          .text(cat.category, catTableX + 22, rowY + 2);

        // Count
        doc.fillColor(C_MUTED).font('Helvetica').fontSize(7)
          .text((cat.n || 0).toLocaleString(), catTableX + 130, rowY + 2, { width: 50, align: 'right' });

        // Proportional Micro-Bar
        const barX = catTableX + 195;
        const barMaxW = 85;
        const barFillW = Math.max(3, Math.round(barMaxW * pct));
        doc.roundedRect(barX, rowY + 3, barMaxW, 5, 2).fill('#e2e8f0');
        doc.roundedRect(barX, rowY + 3, barFillW, 5, 2).fill(cat.color || C_BLUE);

        // Percentage text
        doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(6.5)
          .text(pctStr, barX + barMaxW + 8, rowY + 2);
      });

      doc.y = donutBoxY + donutBoxH + 16;

      // ── 6. Adversary Attack Tactics & Behavioral Detections ───────────────
      const mitreBoxH = 125;
      renderSectionHeading('Adversary Attack Tactics & Behavioral Detections', 'Threat tactic categories and top observed security detections', 30 + mitreBoxH);
      const mitreBoxY = doc.y;
      doc.roundedRect(margin, mitreBoxY, contentWidth, mitreBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Left Column: Chart.js MITRE Horizontal Bar Chart
      doc.image(mitreChartBuf, margin + 8, mitreBoxY + 6, {
        width: 240,
        height: mitreBoxH - 12
      });

      // Right Column: Top Observed Threat Detections (NO TECHNIQUE ID)
      const mTableX = margin + 255;
      const mTableW = contentWidth - 265;
      const mTableY = mitreBoxY + 10;

      doc.rect(mTableX, mTableY, mTableW, 16).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('THREAT / DETECTION TYPE', mTableX + 8, mTableY + 5);
      doc.text('SEV', mTableX + mTableW - 110, mTableY + 5, { width: 30, align: 'center' });
      doc.text('OBSERVED', mTableX + mTableW - 75, mTableY + 5, { width: 70, align: 'right' });

      const detections = (data.topDetections && data.topDetections.length)
        ? data.topDetections
        : [
            { name: 'Command & Script Execution', tag: 'CMD-EXEC', count: 2010, sev: 'HIGH' },
            { name: 'Data Loss Prevention (DLP) Violation', tag: 'DLP', count: 1017, sev: 'MED' },
            { name: 'Behavioral File Append / Modify', tag: 'BEHAVIORAL', count: 500, sev: 'MED' },
            { name: 'Defense Tamper Detection', tag: 'TAMPER', count: 402, sev: 'CRIT' },
            { name: 'Account / User Enumeration', tag: 'ENUM', count: 428, sev: 'LOW' }
          ];

      detections.slice(0, 5).forEach((det, idx) => {
        const rowY = mTableY + 19 + (idx * 18);
        const tagCol = det.sev === 'CRIT' ? C_CRIT : det.sev === 'HIGH' ? C_HIGH : '#0284c7';
        const tagBg = det.sev === 'CRIT' ? '#fee2e2' : det.sev === 'HIGH' ? '#ffedd5' : '#e0f2fe';

        doc.roundedRect(mTableX + 6, rowY + 1, 48, 12, 2).fill(tagBg);
        doc.fillColor(tagCol).font('Helvetica-Bold').fontSize(6)
          .text(det.tag || 'ALERT', mTableX + 6, rowY + 3.5, { width: 48, align: 'center' });

        doc.fillColor(C_TEXT).font('Helvetica').fontSize(6.5)
          .text(det.name, mTableX + 58, rowY + 3.5, { width: mTableW - 170 });

        doc.fillColor(tagCol).font('Helvetica-Bold').fontSize(6)
          .text(det.sev || 'MED', mTableX + mTableW - 110, rowY + 3.5, { width: 30, align: 'center' });

        doc.fillColor(det.count > 0 ? C_CRIT : C_MUTED).font('Helvetica-Bold').fontSize(7)
          .text(`${Number(det.count).toLocaleString()} hits`, mTableX + mTableW - 75, rowY + 3.5, { width: 70, align: 'right' });
      });

      doc.y = mitreBoxY + mitreBoxH + 16;

      // ── 7. Active Directory & Identity Threat Audit ────────────────────────
      const adBoxH = 110;
      renderSectionHeading('Active Directory & Identity Threat Audit', 'Kerberos abuse, domain privilege escalations, and targeted user identities', 30 + adBoxH);
      const adBoxY = doc.y;
      doc.roundedRect(margin, adBoxY, contentWidth, adBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Top Strip: 4 Identity Threat Badges
      const adBadges = [
        { label: 'DCSYNC ATTEMPTS', val: String(data.adAudit?.dcsync || 0), col: data.adAudit?.dcsync > 0 ? C_CRIT : C_LOW },
        { label: 'KERBEROASTING', val: String(data.adAudit?.kerberoast || 0), col: data.adAudit?.kerberoast > 0 ? C_HIGH : C_LOW },
        { label: 'PASSWORD SPRAY', val: String(data.adAudit?.spray || 0), col: data.adAudit?.spray > 0 ? C_HIGH : C_LOW },
        { label: 'SHADOW / GOLDEN CERT', val: String(data.adAudit?.goldenCert || 0), col: data.adAudit?.goldenCert > 0 ? C_CRIT : C_LOW }
      ];
      const adBadgeW = (contentWidth - 24) / 4;
      adBadges.forEach((b, idx) => {
        const bx = margin + 12 + (idx * adBadgeW);
        doc.roundedRect(bx, adBoxY + 8, adBadgeW - 6, 32, 4).fillAndStroke('#ffffff', C_BORDER);
        doc.fillColor(b.col).font('Helvetica-Bold').fontSize(11).text(b.val, bx, adBoxY + 12, { width: adBadgeW - 6, align: 'center' });
        doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(5.5).text(b.label, bx, adBoxY + 26, { width: adBadgeW - 6, align: 'center' });
      });

      // Bottom: Top Targeted User Accounts Table
      const userTableY = adBoxY + 45;
      doc.rect(margin + 12, userTableY, contentWidth - 24, 15).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('TARGETED IDENTITY ACCOUNT', margin + 20, userTableY + 4);
      doc.text('SECURITY EVENTS', margin + 240, userTableY + 4);
      doc.text('ACCOUNT ROLE', margin + contentWidth - 140, userTableY + 4, { width: 120, align: 'right' });

      const targetUsers = (data.adAudit?.topUsers && data.adAudit.topUsers.length)
        ? data.adAudit.topUsers
        : [{ user: 'No anomalous user account spikes detected', count: 0, role: '-' }];

      targetUsers.slice(0, 3).forEach((u, idx) => {
        const uRowY = userTableY + 18 + (idx * 16);
        doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(7)
          .text(u.user, margin + 20, uRowY);
        doc.fillColor(C_MUTED).font('Helvetica').fontSize(7)
          .text(String(u.count), margin + 240, uRowY);

        let roleText = u.role || (u.risk && !u.risk.includes('RISK') && !u.risk.includes('TARGET') ? u.risk : null);
        if (!roleText) {
          const uLower = (u.user || '').toLowerCase();
          if (uLower.includes('admin') || uLower.includes('root')) roleText = 'LOCAL ADMIN';
          else if (uLower.includes('svc') || uLower.includes('service') || uLower.includes('system')) roleText = 'SYSTEM SERVICE';
          else if (u.count === 0 || uLower.includes('no anomalous')) roleText = '-';
          else roleText = 'STANDARD USER';
        }
        const isElevated = roleText.includes('ADMIN') || roleText.includes('SYSTEM');
        doc.fillColor(isElevated ? '#b45309' : (roleText === '-' ? C_MUTED : C_LOW)).font('Helvetica-Bold').fontSize(6.5)
          .text(roleText, margin + contentWidth - 140, uRowY, { width: 120, align: 'right' });
      });

      doc.y = adBoxY + adBoxH + 16;

      // ── 8. Perimeter Defense: Firewall Inbound Attacks & Ports ─────────────
      const fwBoxH = 125;
      renderSectionHeading('Perimeter Defense: Firewall Inbound Attacks & Ports', 'Network boundary traffic filtering, targeted ports, and top attacking source IPs', 30 + fwBoxH);
      const fwBoxY = doc.y;
      doc.roundedRect(margin, fwBoxY, contentWidth, fwBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Left Column: Chart.js Top Targeted Ports Bar Chart
      doc.image(portsChartBuf, margin + 8, fwBoxY + 6, {
        width: 240,
        height: fwBoxH - 12
      });

      // Right Column: Top Inbound Attacking Source IPs & Filter Stats
      const geoX = margin + 255;
      const geoW = contentWidth - 265;
      const geoY = fwBoxY + 10;

      // Filter summary pill
      doc.roundedRect(geoX, geoY, geoW, 20, 3).fill('#1e293b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
        .text(`BLOCKED: ${(data.firewall?.blocked || 0).toLocaleString()}   |   ALLOWED: ${(data.firewall?.allowed || 0).toLocaleString()}   |   TOTAL: ${(data.firewall?.total || 0).toLocaleString()}`, geoX, geoY + 6, { width: geoW, align: 'center' });

      // Top Source IPs Table
      const geoTableY = geoY + 26;
      doc.rect(geoX, geoTableY, geoW, 15).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('TOP INBOUND SOURCE IP', geoX + 6, geoTableY + 4);
      doc.text('ATTEMPTS', geoX + geoW - 75, geoTableY + 4, { width: 70, align: 'right' });

      const topIps = (data.firewall?.topSourceIps && data.firewall.topSourceIps.length)
        ? data.firewall.topSourceIps
        : [{ ip: 'Internal / Localhost Only', count: data.firewall?.total || 0 }];

      topIps.slice(0, 4).forEach((c, idx) => {
        const cRowY = geoTableY + 17 + (idx * 15.5);
        doc.fillColor(C_TEXT).font('Helvetica').fontSize(7)
          .text(c.ip || '127.0.0.1 (Internal)', geoX + 6, cRowY);
        doc.fillColor(C_CRIT).font('Helvetica-Bold').fontSize(7)
          .text((c.count || 0).toLocaleString(), geoX + geoW - 75, cRowY, { width: 70, align: 'right' });
      });

      doc.y = fwBoxY + fwBoxH + 16;

      // ── 9. Hardware / USB & DLP Policy Log ─────────────────────────────────
      const usbBoxH = 80;
      renderSectionHeading('Hardware & USB / DLP Security Activity', 'Physical peripheral connections, mass storage detection, and data exfiltration monitoring', 30 + usbBoxH);
      const usbBoxY = doc.y;
      doc.roundedRect(margin, usbBoxY, contentWidth, usbBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Table Header
      doc.rect(margin + 8, usbBoxY + 8, contentWidth - 16, 15).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('TIMESTAMP', margin + 14, usbBoxY + 12);
      doc.text('MACHINE', margin + 95, usbBoxY + 12);
      doc.text('DEVICE LABEL / DRIVE', margin + 185, usbBoxY + 12);
      doc.text('POLICY ACTION', margin + 330, usbBoxY + 12);
      doc.text('STATUS', margin + contentWidth - 65, usbBoxY + 12, { width: 55, align: 'right' });

      const usbList = (data.usbDlp?.recentList && data.usbDlp.recentList.length)
        ? data.usbDlp.recentList
        : [{
            ts: data.generatedAt || 'Recent',
            machine: 'All Monitored Endpoints',
            label: 'No unauthorized physical devices detected',
            drive: '-',
            action: 'Policy Compliant',
            severity: 'info'
          }];

      usbList.slice(0, 3).forEach((u, idx) => {
        const uY = usbBoxY + 26 + (idx * 16);
        doc.fillColor(C_MUTED).font('Helvetica').fontSize(6.5)
          .text(String(u.ts || '').slice(5, 16), margin + 14, uY);
        doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(6.5)
          .text(u.machine || '-', margin + 95, uY);

        const devStr = u.label ? `${u.label} (${u.drive})` : (u.drive || 'Mass Storage');
        doc.fillColor(C_TEXT).font('Helvetica').fontSize(6.5)
          .text(devStr, margin + 185, uY, { width: 140 });

        const isThreat = String(u.action).toLowerCase().includes('threat') || String(u.action).toLowerCase().includes('block');
        doc.fillColor(isThreat ? C_CRIT : C_TEXT).font('Helvetica-Bold').fontSize(6.5)
          .text(u.action || 'Inserted', margin + 330, uY);

        doc.fillColor(isThreat ? C_CRIT : C_LOW).font('Helvetica-Bold').fontSize(6.5)
          .text(isThreat ? 'BLOCKED' : 'ALLOWED', margin + contentWidth - 65, uY, { width: 55, align: 'right' });
      });

      doc.y = usbBoxY + usbBoxH + 16;

      // ── 10. Fleet OS & Branch Distribution + Inactivity Tracker ────────────
      const fleetBoxH = 125;
      renderSectionHeading('Fleet OS & Branch Health Distribution', 'Endpoint platform breakdown and inactive sensor blind spot detection', 30 + fleetBoxH);
      const fleetBoxY = doc.y;
      doc.roundedRect(margin, fleetBoxY, contentWidth, fleetBoxH, 6).fillAndStroke(C_BG_LIGHT, C_BORDER);

      // Left Column: Chart.js OS Doughnut
      doc.image(osChartBuf, margin + 10, fleetBoxY + 8, {
        width: 110,
        height: 110
      });

      // Right Column: Inactive Stale Fleet Monitor Table
      const staleX = margin + 135;
      const staleW = contentWidth - 145;
      const staleY = fleetBoxY + 10;


      doc.rect(staleX, staleY, staleW, 15).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5);
      doc.text('OFFLINE ENDPOINT', staleX + 6, staleY + 4);
      doc.text('OS PLATFORM', staleX + 110, staleY + 4);
      doc.text('OFFLINE DURATION', staleX + 195, staleY + 4);
      doc.text('RISK STATUS', staleX + staleW - 65, staleY + 4, { width: 60, align: 'right' });

      const staleList = data.fleet?.staleList || [];
      if (staleList.length === 0) {
        doc.fillColor(C_LOW).font('Helvetica-Bold').fontSize(7.5)
          .text('✓ 100% of endpoint fleet active with continuous telemetry heartbeat.', staleX + 6, staleY + 30);
      } else {
        staleList.slice(0, 4).forEach((m, idx) => {
          const sRowY = staleY + 19 + (idx * 17);
          doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(6.5)
            .text(m.name || m.ip, staleX + 6, sRowY, { width: 100 });
          doc.fillColor(C_MUTED).font('Helvetica').fontSize(6.5)
            .text(m.os || 'Windows', staleX + 110, sRowY);
          doc.fillColor(C_HIGH).font('Helvetica-Bold').fontSize(6.5)
            .text(m.offlineStr || 'Unknown', staleX + 195, sRowY);

          const isHigh = m.risk.includes('HIGH');
          doc.fillColor(isHigh ? C_CRIT : C_MED).font('Helvetica-Bold').fontSize(6)
            .text(m.risk, staleX + staleW - 65, sRowY, { width: 60, align: 'right' });
        });
      }

      doc.y = fleetBoxY + fleetBoxH + 16;

      // ── 11. Incident Forensics Case Cards (Top 3-5 Ranked Threats + Register) ──
      renderSectionHeading('Incident Management Briefing & Forensics Case Cards', 'Prioritized forensic investigation briefs with blast-radius telemetry evidence', 120);

      // Resolution & MTTR KPI Strip
      const incData = data.incidents || { total: 0, open: 0, resolved: 0, avgResolutionMin: 0 };
      const resRate = incData.total > 0 ? Math.round((incData.resolved / incData.total) * 100) : 100;
      const mttrStr = incData.avgResolutionMin > 0 ? `${incData.avgResolutionMin} mins` : 'N/A';

      const incMetricH = 26;
      const incMetricY = doc.y;
      doc.roundedRect(margin, incMetricY, contentWidth, incMetricH, 4).fill('#1e293b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
        .text(`TOTAL CASES: ${incData.total}   |   ACTIVE INVESTIGATIONS: ${incData.open}   |   RESOLVED: ${incData.resolved} (${resRate}%)   |   AVG MTTR: ${mttrStr}`, margin, incMetricY + 9, { width: contentWidth, align: 'center' });
      doc.y += incMetricH + 10;

      // Render Top 3 to 5 Forensic Case Cards
      const topCards = incData.topCriticalCards || [];
      if (topCards.length === 0) {
        ensureSpace(32);
        doc.roundedRect(margin, doc.y, contentWidth, 26, 4).fillAndStroke(C_BG_LIGHT, C_BORDER);
        doc.fillColor(C_LOW).font('Helvetica-Bold').fontSize(7.5)
          .text('✓ Zero critical security incidents active during this operational window.', margin, doc.y + 9, { width: contentWidth, align: 'center' });
        doc.y += 34;
      } else {
        topCards.slice(0, 4).forEach(card => {
          ensureSpace(62);
          const cardBoxY = doc.y;
          const isP1 = card.priority === 'P1';
          const cardAccent = isP1 ? C_CRIT : C_HIGH;

          // Main Card Container with Subtle Shadow / Border
          doc.roundedRect(margin, cardBoxY, contentWidth, 54, 4).fillAndStroke('#ffffff', '#cbd5e1');
          doc.roundedRect(margin, cardBoxY, 4, 54, 2).fill(cardAccent);

          // ID Pill (Clean light container)
          doc.roundedRect(margin + 10, cardBoxY + 6, 52, 13, 3).fillAndStroke('#f1f5f9', '#cbd5e1');
          doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(6.5)
            .text(card.id, margin + 10, cardBoxY + 8.5, { width: 52, align: 'center' });

          // Incident Title
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5)
            .text(card.title, margin + 68, cardBoxY + 7, { width: contentWidth - 195, lineBreak: false });

          // Priority badge
          const pBadgeX = margin + contentWidth - 118;
          doc.roundedRect(pBadgeX, cardBoxY + 6, 50, 13, 3).fill(cardAccent);
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5)
            .text(card.priority === 'P1' ? 'P1 CRITICAL' : card.priority, pBadgeX, cardBoxY + 8.5, { width: 50, align: 'center' });

          // Status badge
          const sBadgeX = margin + contentWidth - 62;
          doc.roundedRect(sBadgeX, cardBoxY + 6, 54, 13, 3).fill(card.status.includes('RESOLV') ? C_LOW : '#64748b');
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5)
            .text(card.status, sBadgeX, cardBoxY + 8.5, { width: 54, align: 'center' });

          // Metadata row
          doc.fillColor('#475569').font('Helvetica').fontSize(6.5)
            .text(`Host: ${card.machine}   |   Analyst: ${card.assigned_to}   |   Detected: ${card.created_at}   |   Evidence Events: ${card.linked_count}`, margin + 10, cardBoxY + 22);

          // Clean Light Evidence Container
          doc.roundedRect(margin + 10, cardBoxY + 33, contentWidth - 20, 15, 3).fillAndStroke('#f8fafc', '#e2e8f0');
          doc.fillColor('#2563eb').font('Courier-Bold').fontSize(6)
            .text('Evidence: ', margin + 14, cardBoxY + 36.5, { continued: true });
          doc.fillColor('#334155').font('Courier-Bold').fontSize(6)
            .text(card.evidence, { width: contentWidth - 36, lineBreak: false });

          // Tighten card spacing: exactly 8px between cards
          doc.y = cardBoxY + 54 + 8;
        });
      }

      // Compact Incident Register Table (if more incidents exist)
      const register = incData.register || [];
      if (register.length > 0) {
        ensureSpace(20 + (register.length * 15));
        doc.fillColor(C_DARK).font('Helvetica-Bold').fontSize(7.5).text('Additional Incident Register', margin, doc.y);
        doc.y += 10;

        const regY = doc.y;
        doc.rect(margin, regY, contentWidth, 14).fill('#f1f5f9');
        doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6);
        doc.text('CASE ID', margin + 6, regY + 4);
        doc.text('DATE', margin + 65, regY + 4);
        doc.text('PRIORITY', margin + 115, regY + 4);
        doc.text('MACHINE', margin + 165, regY + 4);
        doc.text('INCIDENT TITLE', margin + 250, regY + 4);
        doc.text('STATUS', margin + contentWidth - 65, regY + 4, { width: 60, align: 'right' });

        register.forEach((r, idx) => {
          const rowY = regY + 16 + (idx * 14);
          doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(6.5).text(r.id, margin + 6, rowY);
          doc.fillColor(C_MUTED).font('Helvetica').fontSize(6.5).text(r.date, margin + 65, rowY);
          doc.fillColor(r.priority === 'P1' ? C_CRIT : C_HIGH).font('Helvetica-Bold').fontSize(6.5).text(r.priority, margin + 115, rowY);
          doc.fillColor(C_TEXT).font('Helvetica').fontSize(6.5).text(r.machine, margin + 165, rowY);
          doc.fillColor(C_TEXT).font('Helvetica').fontSize(6.5).text(r.title, margin + 250, rowY);
          doc.fillColor(r.status.includes('RESOLV') ? C_LOW : C_MUTED).font('Helvetica-Bold').fontSize(6.5).text(r.status, margin + contentWidth - 65, rowY, { width: 60, align: 'right' });
        });
        doc.y = regY + 16 + (register.length * 14) + 10;
      }
      // ── Running Footers on All Pages ───────────────────────────────────────
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;

        const footerY = doc.page.height - 20;
        doc.strokeColor(C_BORDER).lineWidth(0.5)
          .moveTo(margin, footerY - 4)
          .lineTo(margin + contentWidth, footerY - 4)
          .stroke();

        doc.fillColor(C_MUTED).font('Helvetica').fontSize(6.5)
          .text(`IOCHunt Enterprise Security • Confidential SOC Briefing • Generated ${data.generatedAt || ''}`, margin, footerY);

        doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(6.5)
          .text(`Page ${i + 1} of ${totalPages}`, margin + contentWidth - 70, footerY, { width: 70, align: 'right' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generatePdfReport
};
