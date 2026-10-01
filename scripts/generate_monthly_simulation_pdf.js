const fs = require('fs');
const path = require('path');
const { buildReportDataAndPdf } = require('../backend/src/utils/reportBuilder');

async function main() {
  console.log('Generating 1-Month Data Simulation Executive PDF Report...');
  const { pdfBuffer, reportData } = await buildReportDataAndPdf({
    period: 'monthly',
    simulated: true,
    name: 'Monthly Executive Security Intelligence & SOC Dossier'
  });

  const outPath1 = path.join(__dirname, '../IOCHunt_Monthly_Executive_Security_Report_Simulation.pdf');
  const outPath2 = '/Users/joshwa/.gemini/antigravity-ide/brain/92bea948-299a-4653-8eff-815d2cc030fd/IOCHunt_Monthly_Executive_Security_Report_Simulation.pdf';

  fs.writeFileSync(outPath1, pdfBuffer);
  try {
    fs.writeFileSync(outPath2, pdfBuffer);
  } catch (_) {}

  console.log(`[SUCCESS] Monthly Executive PDF Generated! Buffer Size: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
  console.log(`[OUTPUT FILE]: ${outPath1}`);
}

main().catch(err => {
  console.error('[ERROR] Failed to generate simulation PDF:', err);
  process.exit(1);
});
