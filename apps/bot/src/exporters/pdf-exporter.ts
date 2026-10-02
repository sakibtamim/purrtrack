import PDFDocument from 'pdfkit';
import { AggregatedReportData } from '@purrtrack/shared';

/**
 * Cleans text for standard PDF rendering.
 * Strips emojis, normalizes unicode compatibility characters (e.g. mathematical bold/script -> standard ASCII),
 * and removes control characters that PDF Type 1 fonts cannot render.
 */
export function sanitizePdfText(text: string | null | undefined, fallback = ''): string {
  if (!text) return fallback;

  // 1. Normalize unicode compatibility characters (e.g., stylized fonts: 𝐒𝐚𝐤𝐢𝐛 -> Sakib)
  let normalized = text.normalize('NFKD');

  // 2. Strip emojis, flags, pictographs, variation selectors
  normalized = normalized.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{200C}]/gu,
    ''
  );

  // 3. Remove non-printable / control characters (keep standard printable ASCII and Latin-1)
  normalized = normalized.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ').replace(/\s+/g, ' ').trim();

  return normalized || fallback;
}

/**
 * Formats a Discord user's display name and username safely for PDF export.
 */
export function formatUserForPdf(username: string, displayName?: string | null): string {
  const cleanDisplay = sanitizePdfText(displayName);
  const cleanUsername = sanitizePdfText(username, 'user');

  if (cleanDisplay && cleanDisplay.toLowerCase() !== cleanUsername.toLowerCase()) {
    return `${cleanDisplay} (@${cleanUsername})`;
  }
  return `@${cleanUsername}`;
}

/**
 * Generates an executive TimeTrack-style PDF timesheet report.
 */
export async function generatePdfReport(data: AggregatedReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const isInvoice = Boolean(data.contractorRate && data.targetUser);
      const invoiceNumber = `INV-${data.period.startDate.toISOString().slice(0, 10).replace(/-/g, '')}-${data.targetUser?.id.slice(-4) || '0000'}`;

      // Header Banner
      doc.rect(0, 0, 595.28, 60).fill('#5865F2'); // Discord Blurple
      doc.fillColor('#FFFFFF').fontSize(18).text(isInvoice ? 'INVOICE & TIMESHEET' : 'PurrTrack Time Report', 40, 18, { align: 'left' });
      doc.fontSize(10).text(sanitizePdfText(data.guildName, 'Discord Server'), 40, 40, { align: 'left' });

      if (isInvoice) {
        doc.fontSize(10).text(`Invoice #: ${invoiceNumber}`, 380, 22, { align: 'right', width: 175, lineBreak: false });
        doc.fontSize(8).text(`Date: ${new Date().toISOString().slice(0, 10)}`, 380, 38, { align: 'right', width: 175, lineBreak: false });
      }

      doc.fillColor('#333333');
      doc.moveDown(3);

      // Period and metadata
      if (isInvoice && data.targetUser) {
        const contractorName = formatUserForPdf(data.targetUser.username, data.targetUser.displayName);
        doc.fontSize(10).font('Helvetica-Bold').text('Contractor: ', { continued: true });
        doc.font('Helvetica').text(contractorName);
      }
      doc.fontSize(10).font('Helvetica-Bold').text('Reporting Period: ', { continued: true });
      doc.font('Helvetica').text(`${data.period.startDate.toLocaleDateString()} to ${data.period.endDate.toLocaleDateString()} (UTC)`);
      if (data.manualAdjustments && data.manualAdjustments.count > 0) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#5865F2')
          .text(`Includes ${data.manualAdjustments.count} manual adjustment(s): ${data.manualAdjustments.netFormatted}`);
      }
      doc.moveDown(0.5);

      // KPI Metric Cards (3 boxes)
      const startY = doc.y;
      const boxWidth = 160;
      const boxHeight = 50;

      if (isInvoice && data.contractorRate) {
        // Card 1: Billable Time
        doc.roundedRect(40, startY, boxWidth, boxHeight, 5).fillAndStroke('#F0F2F5', '#E4E6EB');
        doc.fillColor('#65676B').fontSize(8).font('Helvetica').text('BILLABLE TIME', 50, startY + 10);
        doc.fillColor('#1C1E21').fontSize(13).font('Helvetica-Bold').text(`${(data.totalDurationSeconds / 3600).toFixed(2)} hrs`, 50, startY + 24);

        // Card 2: Hourly Rate
        doc.roundedRect(210, startY, boxWidth, boxHeight, 5).fillAndStroke('#F0F2F5', '#E4E6EB');
        doc.fillColor('#65676B').fontSize(8).font('Helvetica').text('HOURLY RATE', 220, startY + 10);
        doc.fillColor('#1C1E21').fontSize(13).font('Helvetica-Bold').text(data.contractorRate.hourlyRateFormatted, 220, startY + 24);

        // Card 3: Total Payable (Highlighted in soft blurple/green tint)
        doc.roundedRect(380, startY, boxWidth, boxHeight, 5).fillAndStroke('#E8F5E9', '#C8E6C9');
        doc.fillColor('#2E7D32').fontSize(8).font('Helvetica-Bold').text('TOTAL PAYABLE', 390, startY + 10);
        doc.fillColor('#1B5E20').fontSize(13).font('Helvetica-Bold').text(data.contractorRate.totalPayableFormatted, 390, startY + 24);
      } else {
        // Standard Cards
        doc.roundedRect(40, startY, boxWidth, boxHeight, 5).fillAndStroke('#F0F2F5', '#E4E6EB');
        doc.fillColor('#65676B').fontSize(8).font('Helvetica').text('TOTAL TIME TRACKED', 50, startY + 10);
        doc.fillColor('#1C1E21').fontSize(14).font('Helvetica-Bold').text(data.totalDurationFormatted, 50, startY + 24);

        doc.roundedRect(210, startY, boxWidth, boxHeight, 5).fillAndStroke('#F0F2F5', '#E4E6EB');
        doc.fillColor('#65676B').fontSize(8).font('Helvetica').text('TOTAL SESSIONS', 220, startY + 10);
        doc.fillColor('#1C1E21').fontSize(14).font('Helvetica-Bold').text(`${data.totalSessions}`, 220, startY + 24);

        doc.roundedRect(380, startY, boxWidth, boxHeight, 5).fillAndStroke('#F0F2F5', '#E4E6EB');
        doc.fillColor('#65676B').fontSize(8).font('Helvetica').text('ACTIVE MEMBERS', 390, startY + 10);
        doc.fillColor('#1C1E21').fontSize(14).font('Helvetica-Bold').text(`${data.uniqueActiveUsers}`, 390, startY + 24);
      }

      doc.y = startY + boxHeight + 25;

      // Section: Session Details Table
      doc.fillColor('#1C1E21').fontSize(12).font('Helvetica-Bold').text(isInvoice ? 'Itemized Session Breakdown' : 'Voice Sessions Log');
      doc.moveDown(0.5);

      const tableTop = doc.y;
      const colUser = 40;
      const colUserW = 125;
      const colChannel = 170;
      const colChannelW = 130;
      const colStart = 305;
      const colStartW = 75;
      const colEnd = 385;
      const colEndW = 75;
      const colDuration = 465;
      const colDurationW = 90;

      // Table Header
      doc.rect(40, tableTop, 515, 20).fill('#2B2D42');
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      doc.text(isInvoice ? 'MEMBER' : 'USER', colUser + 5, tableTop + 6, { width: colUserW - 5, lineBreak: false });
      doc.text('CHANNEL', colChannel + 5, tableTop + 6, { width: colChannelW - 5, lineBreak: false });
      doc.text('START (UTC)', colStart + 5, tableTop + 6, { width: colStartW - 5, lineBreak: false });
      doc.text('END (UTC)', colEnd + 5, tableTop + 6, { width: colEndW - 5, lineBreak: false });
      doc.text('DURATION', colDuration + 5, tableTop + 6, { width: colDurationW - 5, lineBreak: false });

      let currentY = tableTop + 20;

      // Table Rows (limit to first 30 on PDF to keep layout neat)
      doc.font('Helvetica').fontSize(8).fillColor('#333333');

      for (let i = 0; i < Math.min(data.sessions.length, 30); i++) {
        const s = data.sessions[i];

        if (currentY > 720) {
          doc.addPage();
          currentY = 40;
        }

        if (i % 2 === 1) {
          doc.rect(40, currentY, 515, 18).fill('#F8F9FA');
          doc.fillColor('#333333');
        }

        const usernameText = formatUserForPdf(s.username, s.displayName);
        const channelText = sanitizePdfText(s.channelName, 'Voice Channel');
        const startText = s.startedAt ? s.startedAt.toISOString().substring(11, 19) : '--:--:--';
        const endText = s.endedAt ? s.endedAt.toISOString().substring(11, 19) : '--:--:--';
        const durationText = s.durationFormatted || '0s';

        doc.text(usernameText, colUser + 5, currentY + 5, { width: colUserW - 10, ellipsis: true, lineBreak: false });
        doc.text(channelText, colChannel + 5, currentY + 5, { width: colChannelW - 10, ellipsis: true, lineBreak: false });
        doc.text(startText, colStart + 5, currentY + 5, { width: colStartW - 10, lineBreak: false });
        doc.text(endText, colEnd + 5, currentY + 5, { width: colEndW - 10, lineBreak: false });
        doc.text(durationText, colDuration + 5, currentY + 5, { width: colDurationW - 10, lineBreak: false });

        currentY += 18;
      }

      if (data.sessions.length > 30) {
        doc.moveDown(1);
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666')
          .text(`* Displaying first 30 of ${data.sessions.length} sessions. For complete raw logs, export to Excel or CSV.`, 40, currentY + 10, { width: 515, lineBreak: false });
      }

      if (isInvoice && data.contractorRate) {
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
          .text(`* Total amount due payable in ${data.contractorRate.currency}. Verified via PurrTrack automated Discord tracking.`, 40, 745, { width: 515, lineBreak: false });
      }

      // Safe footer placed within printable bounds to avoid spilling onto a blank 2nd page
      doc.fontSize(8).font('Helvetica').fillColor('#999999').text(
        `Generated by PurrTrack • ${new Date().toISOString()}`,
        40,
        765,
        { align: 'center', width: 515, lineBreak: false }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
