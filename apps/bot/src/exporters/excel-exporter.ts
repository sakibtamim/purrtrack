import ExcelJS from 'exceljs';
import { AggregatedReportData } from '@purrtrack/shared';

/**
 * Generates an Excel (.xlsx) workbook buffer with summary KPI cards and a detailed sessions log.
 */
export async function generateExcelReport(data: AggregatedReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PurrTrack Discord Bot';
  workbook.created = new Date();

  // Tab 1: Executive Summary
  const summarySheet = workbook.addWorksheet('Summary', {
    views: [{ showGridLines: true }],
  });

  // Title Row
  summarySheet.mergeCells('A1:E1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = '🐱 PurrTrack Voice Time Tracking Summary';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF5865F2' }, // Discord Blurple
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(1).height = 36;

  // Metadata block
  summarySheet.addRow(['Server Name:', data.guildName]);
  summarySheet.addRow([
    'Reporting Period:',
    `${data.period.startDate.toLocaleDateString()} to ${data.period.endDate.toLocaleDateString()} (UTC)`,
  ]);
  summarySheet.addRow(['Total Tracked Duration:', data.totalDurationFormatted]);
  summarySheet.addRow(['Total Voice Sessions:', data.totalSessions]);
  summarySheet.addRow(['Unique Active Users:', data.uniqueActiveUsers]);
  summarySheet.addRow([]);

  // Top Channels Section
  const channelHeaderRow = summarySheet.addRow(['Top Channels', 'Channel Name', 'Total Duration', 'Sessions Count']);
  channelHeaderRow.font = { bold: true };
  channelHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E3FF' },
  };

  for (const ch of data.topChannels.slice(0, 10)) {
    summarySheet.addRow(['', ch.channelName, ch.durationFormatted, ch.sessionCount]);
  }

  summarySheet.addRow([]);

  // Top Users Section
  if (data.topUsers && data.topUsers.length > 0) {
    const userHeaderRow = summarySheet.addRow(['Top Contributors', 'Username', 'Total Duration', 'Sessions Count']);
    userHeaderRow.font = { bold: true };
    userHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E3FF' },
    };

    for (const u of data.topUsers.slice(0, 10)) {
      summarySheet.addRow(['', u.displayName ? `${u.displayName} (@${u.username})` : u.username, u.durationFormatted, u.sessionCount]);
    }
  }

  summarySheet.columns = [
    { width: 22 },
    { width: 32 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
  ];

  // Tab 2: Detailed Time Sessions
  const detailsSheet = workbook.addWorksheet('Detailed Sessions', {
    views: [{ showGridLines: true }],
  });

  const headerRow = detailsSheet.addRow([
    'Session ID',
    'User ID',
    'Username',
    'Display Name',
    'Channel Name',
    'Started At (UTC)',
    'Ended At (UTC)',
    'Duration (Seconds)',
    'Duration (Formatted)',
    'Status',
  ]);

  headerRow.height = 26;
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2B2D42' }, // Sleek dark slate
    };
  });

  let rowIndex = 2;
  for (const session of data.sessions) {
    const row = detailsSheet.addRow([
      session.id,
      session.userId,
      session.username,
      session.displayName || '',
      session.channelName,
      session.startedAt.toISOString().replace('T', ' ').substring(0, 19),
      session.endedAt.toISOString().replace('T', ' ').substring(0, 19),
      session.durationSeconds,
      session.durationFormatted,
      session.status,
    ]);

    // Zebra striping
    if (rowIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7F8FA' },
        };
      });
    }
    rowIndex++;
  }

  // Summary Row with Excel formula
  if (data.sessions.length > 0) {
    const totalRow = detailsSheet.addRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      { formula: `SUM(H2:H${rowIndex - 1})` },
      data.totalDurationFormatted,
      '',
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(1).alignment = { horizontal: 'center' };
  }

  // Auto-fit column widths
  detailsSheet.columns.forEach((column) => {
    let maxLen = 12;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 4, 38);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
