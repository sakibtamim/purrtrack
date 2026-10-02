import { AttachmentBuilder } from 'discord.js';
import { AggregatedReportData, ExportFormat, formatDateIsoInTz } from '@purrtrack/shared';
import { generateCsvReport } from './csv-exporter.js';
import { generateExcelReport } from './excel-exporter.js';
import { generatePdfReport } from './pdf-exporter.js';
import { generateDiscordEmbed } from './embed-exporter.js';

export interface ExportResult {
  format: ExportFormat;
  attachment?: AttachmentBuilder;
  jsonPayload?: AggregatedReportData;
  embed?: ReturnType<typeof generateDiscordEmbed>;
}

export async function exportReport(
  data: AggregatedReportData,
  format: ExportFormat
): Promise<ExportResult> {
  const timestamp = formatDateIsoInTz(new Date(), data.timezone || 'UTC');
  const filePrefix = `purrtrack-${data.guildId}-${timestamp}`;

  switch (format) {
    case ExportFormat.CSV: {
      const buffer = await generateCsvReport(data);
      const attachment = new AttachmentBuilder(buffer, { name: `${filePrefix}.csv` });
      return { format, attachment };
    }

    case ExportFormat.EXCEL: {
      const buffer = await generateExcelReport(data);
      const attachment = new AttachmentBuilder(buffer, { name: `${filePrefix}.xlsx` });
      return { format, attachment };
    }

    case ExportFormat.PDF: {
      const buffer = await generatePdfReport(data);
      const attachment = new AttachmentBuilder(buffer, { name: `${filePrefix}.pdf` });
      return { format, attachment };
    }

    case ExportFormat.JSON: {
      const jsonStr = JSON.stringify(data, null, 2);
      const buffer = Buffer.from(jsonStr, 'utf-8');
      const attachment = new AttachmentBuilder(buffer, { name: `${filePrefix}.json` });
      return { format, attachment, jsonPayload: data };
    }

    case ExportFormat.EMBED:
    default: {
      const embed = generateDiscordEmbed(data);
      return { format: ExportFormat.EMBED, embed };
    }
  }
}

export * from './csv-exporter.js';
export * from './excel-exporter.js';
export * from './pdf-exporter.js';
export * from './embed-exporter.js';
