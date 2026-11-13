// Row shapes mirror supabase/migrations. Kept by hand (small schema) so the
// app type-checks without a generated file.

export const CATEGORIES = [
  'Spill / Leak',
  'Fire / Ignition',
  'Slip-Trip-Fall',
  'PPE',
  'Equipment Fault',
  'Chemical Exposure',
  'Electrical',
  'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = ['High', 'Medium', 'Low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUSES = ['New', 'Assigned', 'In Progress', 'Closed'] as const;
export type Status = (typeof STATUSES)[number];

export type Role = 'worker' | 'supervisor' | 'ehs';
export type Shift = 'A' | 'B' | 'C';
export type DuplicateStatus = 'suggested' | 'merged' | 'dismissed';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_contractor: boolean;
  language: 'en' | 'hi';
  area_id: number | null;
  induction_completed_at: string | null;
}

export interface AreaRow {
  id: number;
  code: string;
  name: string;
  name_hi: string;
  qr_code: string;
  svg_region_id: string;
  supervisor_id: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ReportRow {
  id: number;
  report_no: number;
  client_id: string;
  user_id: string;
  area_id: number;
  shift: Shift;
  created_at: string;
  input_mode: 'voice' | 'text';
  capture_seconds: number | null;
  transcript: string;
  language: string | null;
  photo_urls: string[];
  audio_url: string | null;
  lat: number | null;
  lng: number | null;
  ai_status: 'pending' | 'done' | 'failed';
  ai_category: Category | null;
  ai_severity: Severity | null;
  ai_confidence: number | null;
  ai_model: string | null;
  ai_error: string | null;
  summary: string | null;
  guard_reason: string | null;
  category: Category | null;
  severity: Severity | null;
  needs_review: boolean;
  triaged_at: string | null;
  is_duplicate_of: number | null;
  duplicate_status: DuplicateStatus | null;
  is_repeat: boolean;
  repeat_count: number;
}

export interface ActionRow {
  id: number;
  report_id: number;
  owner_id: string | null;
  status: Status;
  due_at: string;
  escalate_at: string;
  escalated_level: number;
  escalated_at: string | null;
  breached_at: string | null;
  reminded_at?: string | null;
  assigned_at: string | null;
  started_at: string | null;
  closed_at: string | null;
  resolution_note: string | null;
  fix_photo_url: string | null;
  merged_into: number | null;
  due_overridden: boolean;
}

export interface AuditRow {
  id: number;
  ts: string;
  actor_id: string | null;
  report_id: number | null;
  action_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

export interface NotificationRow {
  id: number;
  user_id: string;
  report_id: number | null;
  type: 'new_report' | 'high_severity' | 'assigned' | 'escalation' | 'reminder' | 'sla_breach' | 'closed';
  body: {
    report_no?: string;
    area?: string;
    area_hi?: string;
    category?: Category | null;
    severity?: Severity | null;
    summary?: string | null;
    escalate_h?: number;
  };
  created_at: string;
  read_at: string | null;
}

export interface SlaEntry {
  due_h: number;
  escalate_h: number;
}

export interface SettingsRow {
  demo_offset_minutes: number;
  confidence_threshold: number;
  sla: Record<Severity, SlaEntry>;
  risk_weights: { High: number; Medium: number; Low: number; repeat: number; breach: number };
  duplicate_window_h: number;
  repeat_window_d: number;
  retention_days: number;
  plant_tz: string;
  paper_minutes: number;
}

/** A report joined with its action — the unit every screen works with. */
export interface Item {
  report: ReportRow;
  action: ActionRow;
}

export const DEFAULT_SETTINGS: SettingsRow = {
  demo_offset_minutes: 0,
  confidence_threshold: 0.6,
  sla: {
    High: { due_h: 4, escalate_h: 2 },
    Medium: { due_h: 24, escalate_h: 12 },
    Low: { due_h: 72, escalate_h: 48 },
  },
  risk_weights: { High: 5, Medium: 3, Low: 1, repeat: 2, breach: 2 },
  duplicate_window_h: 2,
  repeat_window_d: 7,
  retention_days: 90,
  plant_tz: 'Asia/Kolkata',
  paper_minutes: 8,
};

export const reportLabel = (no: number) => `SS-${String(no).padStart(4, '0')}`;
