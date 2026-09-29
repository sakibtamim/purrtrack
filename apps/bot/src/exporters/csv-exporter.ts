import { AggregatedReportData } from '@purrtrack/shared';

/**
 * Generates an RFC 4180 compliant CSV buffer with UTF-8 BOM so Excel opens it with proper encoding.
 */
export async function generateCsvReport(data: AggregatedReportData): Promise<Buffer> {
  const headers = [
    'Session ID',
    'User ID',
    'Username',
    'Display Name',
    'Channel ID',
    'Channel Name',
    'Start Time (UTC)',
    'End Time (UTC)',
    'Duration (Seconds)',
    'Duration (Formatted)',
    'Status',
  ];

  const escapeCell = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const lines: string[] = [];

  // Summary header block
  lines.push(`"# PurrTrack Time Tracking Report"`);
  lines.push(`"# Server: ${escapeCell(data.guildName).replace(/^"|"$/g, '')}"`);
  lines.push(`"# Period: ${data.period.startDate.toISOString()} to ${data.period.endDate.toISOString()}"`);
  lines.push(`"# Total Duration: ${data.totalDurationFormatted} (${data.totalDurationSeconds}s)"`);
  lines.push(`"# Total Sessions: ${data.totalSessions}"`);
  lines.push(`"# Unique Users: ${data.uniqueActiveUsers}"`);
  lines.push('');

  // Column header
  lines.push(headers.map(escapeCell).join(','));

  // Data rows
  for (const session of data.sessions) {
    const row = [
      session.id,
      session.userId,
      session.username,
      session.displayName || '',
      session.channelId,
      session.channelName,
      session.startedAt.toISOString(),
      session.endedAt.toISOString(),
      session.durationSeconds,
      session.durationFormatted,
      session.status,
    ];
    lines.push(row.map(escapeCell).join(','));
  }

  // Prepend UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + lines.join('\r\n');
  return Buffer.from(csvContent, 'utf-8');
}
