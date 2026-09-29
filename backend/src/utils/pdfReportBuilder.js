const PDFDocument = require('pdfkit');

/**
 * Generates an Executive Security Report PDF buffer using PDFKit.
 *
 * @param {Object} data
 * @param {string} data.scheduleName
 * @param {string} data.generatedAt
 * @param {string} data.periodLabel
 * @param {string} data.machine
 * @param {string} data.branch
 * @param {string} data.threatLevel
 * @param {string} data.tlColor
 * @param {number} data.totalEvents
 * @param {number} data.critCount
 * @param {number} data.highCount
 * @param {number} data.adCount
 * @param {number} data.activeMachinesCount
 * @param {Array}  data.byCategory  [{ category, n }]
 * @param {Array}  data.critEvents  [{ ts, machine, severity, category, message }]
 * @param {Array}  data.adEvents    [{ ts, machine, severity, message }]
 * @returns {Promise<Buffer>}
 */
function generatePdfReport(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 36,
        bufferPages: true,
        info: {
          Title: `IOC Hunt Executive Report - ${data.scheduleName}`,
          Author: 'IOC Hunt Security Intelligence Hub',
          Subject: 'Executive Security Threat Report'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const pageWidth = doc.page.width;
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2);

      // Colors
      const C_PRIMARY = '#0f172a';
      const C_ACCENT = '#2563eb';
      const C_TEXT = '#1e293b';
      const C_MUTED = '#64748b';
      const C_BORDER = '#e2e8f0';
      const C_SURFACE = '#f8fafc';

      // ── 1. HEADER ───────────────────────────────────────────────────────────
      doc.rect(margin, margin, contentWidth, 54)
        .fill(C_PRIMARY);

      doc.fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('IOC HUNT SECURITY REPORT', margin + 14, margin + 12);

      doc.fillColor('#94a3b8')
        .font('Helvetica')
        .fontSize(8.5)
        .text(`Generated: ${data.generatedAt}   |   Period: ${data.periodLabel}   |   Branch: ${data.branch || 'All'}   |   Machine: ${data.machine || 'All'}`, margin + 14, margin + 34);

      doc.y = margin + 64;

      // ── 2. THREAT LEVEL BANNER ──────────────────────────────────────────────
      const threatColor = data.tlColor || '#ef4444';
      const bannerY = doc.y;
      doc.rect(margin, bannerY, contentWidth, 38)
        .fill(C_SURFACE);
      doc.rect(margin, bannerY, 6, 38)
        .fill(threatColor);

      doc.fillColor(threatColor)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(`${data.threatLevel} THREAT LEVEL`, margin + 14, bannerY + 7);

      doc.fillColor(C_TEXT)
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          `${(data.totalEvents || 0).toLocaleString()} total events recorded. ${data.critCount || 0} critical, ${data.highCount || 0} high severity alerts.${data.adCount > 0 ? `  (${data.adCount} Active Directory indicators detected)` : ''}`,
          margin + 14, bannerY + 22
        );

      doc.y = bannerY + 46;

      // ── 3. SUMMARY KPI CARDS ────────────────────────────────────────────────
      const cardY = doc.y;
      const numCards = 5;
      const cardSpacing = 6;
      const cardWidth = (contentWidth - ((numCards - 1) * cardSpacing)) / numCards;
      const cardHeight = 44;

      const cards = [
        { label: 'Total Events', value: (data.totalEvents || 0).toLocaleString(), color: '#1e3a5f' },
        { label: 'Critical', value: (data.critCount || 0).toLocaleString(), color: '#ef4444' },
        { label: 'High', value: (data.highCount || 0).toLocaleString(), color: '#f97316' },
        { label: 'AD Indicators', value: (data.adCount || 0).toLocaleString(), color: '#a855f7' },
        { label: 'Active Machines', value: (data.activeMachinesCount || 0).toLocaleString(), color: '#4a5578' }
      ];

      cards.forEach((card, idx) => {
        const cx = margin + (idx * (cardWidth + cardSpacing));
        doc.roundedRect(cx, cardY, cardWidth, cardHeight, 4)
          .fillAndStroke(C_SURFACE, C_BORDER);

        doc.fillColor(card.color)
          .font('Helvetica-Bold')
          .fontSize(13)
          .text(String(card.value), cx, cardY + 8, { width: cardWidth, align: 'center' });

        doc.fillColor(C_MUTED)
          .font('Helvetica')
          .fontSize(7.5)
          .text(card.label.toUpperCase(), cx, cardY + 26, { width: cardWidth, align: 'center' });
      });

      doc.y = cardY + cardHeight + 14;

      // ── 4. TOP EVENT CATEGORIES ─────────────────────────────────────────────
      doc.fillColor(C_TEXT)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Top Event Categories', margin, doc.y);

      doc.y += 6;
      const catTableY = doc.y;
      const maxCat = data.byCategory && data.byCategory.length
        ? Math.max(...data.byCategory.map(r => parseInt(r.n || 0, 10)))
        : 1;

      // Table Header
      doc.rect(margin, catTableY, contentWidth, 18).fill('#f1f5f9');
      doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(8);
      doc.text('CATEGORY', margin + 8, catTableY + 5);
      doc.text('COUNT', margin + 180, catTableY + 5);
      doc.text('DISTRIBUTION', margin + 260, catTableY + 5);

      let curCatY = catTableY + 18;
      const categoriesToShow = (data.byCategory || []).slice(0, 7);

      categoriesToShow.forEach(r => {
        const count = parseInt(r.n || 0, 10);
        const pct = Math.round((count / (maxCat || 1)) * 100);

        doc.rect(margin, curCatY, contentWidth, 16)
          .fill(curCatY % 32 === 0 ? '#ffffff' : '#fafafa');

        doc.fillColor(C_TEXT).font('Helvetica-Bold').fontSize(8)
          .text(r.category || 'OTHER', margin + 8, curCatY + 4);

        doc.fillColor(C_TEXT).font('Helvetica').fontSize(8)
          .text(count.toLocaleString(), margin + 180, curCatY + 4);

        // Progress bar
        const barWidth = 200;
        doc.rect(margin + 260, curCatY + 5, barWidth, 6).fill('#e2e8f0');
        const fillW = Math.max(3, Math.round((barWidth * pct) / 100));
        doc.rect(margin + 260, curCatY + 5, fillW, 6).fill(C_ACCENT);

        curCatY += 16;
      });

      doc.y = curCatY + 14;

      // ── 5. TOP CRITICAL & HIGH EVENTS TABLE ──────────────────────────────────
      const checkPageBreak = (neededHeight) => {
        if (doc.y + neededHeight > doc.page.height - 40) {
          doc.addPage();
          doc.y = margin;
          return true;
        }
        return false;
      };

      checkPageBreak(50);

      doc.fillColor(C_TEXT)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('Priority Incident Alerts (Critical & High)', margin, doc.y);

      doc.y += 6;
      let evY = doc.y;

      const drawEventHeader = (y) => {
        doc.rect(margin, y, contentWidth, 18).fill('#f1f5f9');
        doc.fillColor(C_MUTED).font('Helvetica-Bold').fontSize(7.5);
        doc.text('TIME', margin + 6, y + 5);
        doc.text('MACHINE', margin + 95, y + 5);
        doc.text('SEV', margin + 195, y + 5);
        doc.text('CATEGORY', margin + 240, y + 5);
        doc.text('MESSAGE', margin + 310, y + 5);
      };

      drawEventHeader(evY);
      evY += 18;

      const eventsList = (data.critEvents || []).slice(0, 60);

      eventsList.forEach(e => {
        if (evY + 16 > doc.page.height - 40) {
          doc.addPage();
          evY = margin;
          drawEventHeader(evY);
          evY += 18;
        }

        const sev = (e.severity || 'low').toLowerCase();
        const sevColor = sev === 'critical' ? '#ef4444' : sev === 'high' ? '#f97316' : '#64748b';

        doc.rect(margin, evY, contentWidth, 16)
          .fill(evY % 32 === 0 ? '#ffffff' : '#f8fafc');

        doc.fillColor(C_MUTED).font('Helvetica').fontSize(7)
          .text((e.ts || '').toString().slice(0, 16), margin + 6, evY + 4);

        doc.fillColor(C_ACCENT).font('Helvetica-Bold').fontSize(7.5)
          .text((e.machine || '').slice(0, 18), margin + 95, evY + 4);

        doc.fillColor(sevColor).font('Helvetica-Bold').fontSize(7)
          .text(sev.toUpperCase(), margin + 195, evY + 4);

        doc.fillColor(C_TEXT).font('Helvetica').fontSize(7)
          .text((e.category || '').slice(0, 12), margin + 240, evY + 4);

        doc.fillColor(C_TEXT).font('Helvetica').fontSize(7)
          .text((e.message || '').replace(/\s+/g, ' ').slice(0, 52), margin + 310, evY + 4);

        evY += 16;
      });

      // ── 6. AD INDICATORS (IF ANY) ──────────────────────────────────────────
      if (data.adEvents && data.adEvents.length > 0) {
        checkPageBreak(50);
        doc.y = evY + 12;

        doc.fillColor('#a855f7')
          .font('Helvetica-Bold')
          .fontSize(11)
          .text('⚠️ Active Directory Attack Indicators', margin, doc.y);

        doc.y += 6;
        let adY = doc.y;

        doc.rect(margin, adY, contentWidth, 18).fill('#faf5ff');
        doc.fillColor('#7e22ce').font('Helvetica-Bold').fontSize(7.5);
        doc.text('TIME', margin + 6, adY + 5);
        doc.text('MACHINE', margin + 95, adY + 5);
        doc.text('INDICATOR / MESSAGE', margin + 200, adY + 5);
        adY += 18;

        data.adEvents.slice(0, 15).forEach(e => {
          if (adY + 16 > doc.page.height - 40) {
            doc.addPage();
            adY = margin;
          }
          doc.rect(margin, adY, contentWidth, 16).fill('#ffffff');
          doc.fillColor(C_MUTED).font('Helvetica').fontSize(7)
            .text((e.ts || '').toString().slice(0, 16), margin + 6, adY + 4);
          doc.fillColor(C_ACCENT).font('Helvetica-Bold').fontSize(7.5)
            .text((e.machine || '').slice(0, 18), margin + 95, adY + 4);
          doc.fillColor(C_TEXT).font('Helvetica').fontSize(7)
            .text((e.message || '').slice(0, 75), margin + 200, adY + 4);
          adY += 16;
        });
      }

      // ── 7. PAGE NUMBERING IN FOOTER ─────────────────────────────────────────
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.rect(margin, doc.page.height - 28, contentWidth, 0.5).fill(C_BORDER);
        doc.fillColor(C_MUTED)
          .font('Helvetica')
          .fontSize(7.5)
          .text(
            `IOC Hunt SIEM • Automated Executive Intelligence • Confidential`,
            margin,
            doc.page.height - 22
          );
        doc.text(
          `Page ${i + 1} of ${range.count}`,
          margin,
          doc.page.height - 22,
          { width: contentWidth, align: 'right' }
        );
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
