import ExcelJS from 'exceljs';
import { AggregatedReportData, getTimezoneLabel, formatTimeInTz, formatDateInTz } from '@purrtrack/shared';

/**
 * Generates an Excel (.xlsx) workbook buffer with summary KPI cards and a detailed sessions log.
 */
export async function generateExcelReport(data: AggregatedReportData): Promise<Buffer> {
  const tz = data.timezone || 'UTC';
  const tzLabel = getTimezoneLabel(tz);
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

  if (data.contractorRate) {
    summarySheet.addRow(['Hourly Billing Rate:', data.contractorRate.hourlyRateFormatted]);
    summarySheet.addRow(['Total Billable Payout:', data.contractorRate.totalPayableFormatted]);
  }
  if (data.manualAdjustments && data.manualAdjustments.count > 0) {
    summarySheet.addRow(['Manual Time Adjustments:', `${data.manualAdjustments.netFormatted} across ${data.manualAdjustments.count} entry/entries`]);
  }

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
    { width: 24 },
    { width: 32 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
  ];

  // Tab 2: Detailed Time Sessions
  const detailsSheet = workbook.addWorksheet('Detailed Sessions', {
    views: [{ showGridLines: true }],
  });

  const headerCols = [
    'Session ID',
    'User ID',
    'Username',
    'Display Name',
    'Channel Name',
    `Started At (${tzLabel})`,
    `Ended At (${tzLabel})`,
    'Duration (Seconds)',
    'Duration (Formatted)',
    'Status',
  ];

  if (data.contractorRate) {
    headerCols.push(`Line Amount (${data.contractorRate.currency})`);
  }

  const headerRow = detailsSheet.addRow(headerCols);

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
    const rowValues: any[] = [
      session.id,
      session.userId,
      session.username,
      session.displayName || '',
      session.channelName,
      session.startedAt ? formatTimeInTz(session.startedAt, tz) : '',
      session.endedAt ? formatTimeInTz(session.endedAt, tz) : '',
      session.durationSeconds,
      session.durationFormatted,
      session.status,
    ];

    if (data.contractorRate) {
      const lineAmount = ((session.durationSeconds / 3600) * (data.contractorRate.hourlyRateCents / 100)).toFixed(2);
      rowValues.push(Number(lineAmount));
    }

    const row = detailsSheet.addRow(rowValues);

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
    const totalRowValues: any[] = [
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
    ];

    if (data.contractorRate) {
      totalRowValues.push({ formula: `SUM(K2:K${rowIndex - 1})` });
    }

    const totalRow = detailsSheet.addRow(totalRowValues);
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

export interface ContractorPayrollItem {
  userId: string;
  username: string;
  hourlyRate: number;
  currency: string;
  trackedSeconds: number;
  trackedFormatted: string;
  adjustmentSeconds: number;
  adjustmentFormatted: string;
  billableHours: number;
  payoutAmount: number;
}

export interface ConsolidatedPayrollReportData {
  guildId: string;
  guildName: string;
  periodLabel: string;
  timezone: string;
  contractors: ContractorPayrollItem[];
  generatedAt?: Date;
}

/**
 * Generates an Excel (.xlsx) master payroll workbook with all contractors, billable hours, rates, and formula-backed payouts.
 */
export async function generatePayrollExcelReport(data: ConsolidatedPayrollReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PurrTrack Discord Bot';
  workbook.created = data.generatedAt || new Date();

  const sheet = workbook.addWorksheet('Payroll Summary', {
    views: [{ showGridLines: true }],
  });

  // Banner Row
  sheet.mergeCells('A1:H1');
  const banner = sheet.getCell('A1');
  banner.value = '🐱 PurrTrack • Master Contractor Payroll Ledger';
  banner.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  banner.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF5865F2' },
  };
  banner.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  // Metadata block
  sheet.addRow(['Server Name:', data.guildName]);
  sheet.addRow(['Reporting Period:', `${data.periodLabel} (${data.timezone})`]);
  sheet.addRow(['Total Contractors:', data.contractors.length]);
  sheet.addRow(['Generated Date:', (data.generatedAt || new Date()).toLocaleString('en-US')]);
  sheet.addRow([]);

  // Table Header Row (Row 7)
  const headers = [
    'Contractor Name',
    'Discord ID',
    'Hourly Rate',
    'Currency',
    'Tracked Time',
    'Manual Adjustments',
    'Billable Hours',
    'Gross Payout',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2C2F33' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 26;

  const startDataRow = 8;
  let currentRow = startDataRow;

  for (const c of data.contractors) {
    const row = sheet.addRow([
      `@${c.username}`,
      c.userId,
      c.hourlyRate,
      c.currency,
      c.trackedFormatted,
      c.adjustmentFormatted,
      Number(c.billableHours.toFixed(2)),
      { formula: `ROUND(C${currentRow}*G${currentRow}, 2)`, result: c.payoutAmount },
    ]);

    row.height = 22;
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(3).numFmt = '#,##0.00';
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(7).numFmt = '#,##0.00';
    row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).numFmt = '#,##0.00';

    if (currentRow % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF8F9FA' },
      };
    }

    currentRow++;
  }

  // Summary Row with =SUM formulas
  if (data.contractors.length > 0) {
    const lastDataRow = currentRow - 1;
    const summaryRow = sheet.addRow([
      'Total Summary',
      '',
      '',
      '',
      '',
      '',
      { formula: `SUM(G${startDataRow}:G${lastDataRow})` },
      { formula: `SUM(H${startDataRow}:H${lastDataRow})` },
    ]);

    summaryRow.height = 26;
    summaryRow.font = { name: 'Calibri', size: 11, bold: true };
    summaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E3FF' },
    };
    summaryRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    summaryRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell(7).numFmt = '#,##0.00';
    summaryRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    summaryRow.getCell(8).numFmt = '#,##0.00';
  }

  // Auto-fit columns
  sheet.columns.forEach((column) => {
    let maxLen = 14;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 4, 38);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

