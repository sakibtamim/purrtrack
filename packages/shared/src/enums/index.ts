export enum SessionStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  COMPLETED_RECOVERED = 'COMPLETED_RECOVERED',
}

export enum ExportFormat {
  CSV = 'csv',
  EXCEL = 'xlsx',
  PDF = 'pdf',
  JSON = 'json',
  EMBED = 'embed',
}

export enum TimeRangePreset {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  ALL_TIME = 'all_time',
  CUSTOM = 'custom',
}

export enum VoiceTransitionType {
  JOIN = 'JOIN',
  LEAVE = 'LEAVE',
  SWITCH = 'SWITCH',
  STATE_CHANGE = 'STATE_CHANGE',
}
