import type { NotificationRow } from '@/domain/types';
import type { ToastTone } from '@/ui/Toast';

/** Toast / bell text for a notification. Staff-facing text is English (dashboard). */
export function notificationText(n: NotificationRow, lang: 'en' | 'hi' = 'en'): { title: string; body: string; tone: ToastTone } {
  const b = n.body ?? {};
  const where = [b.report_no, lang === 'hi' ? b.area_hi ?? b.area : b.area].filter(Boolean).join(' · ');
  const what = [b.severity, b.category].filter(Boolean).join(' ');
  switch (n.type) {
    case 'escalation':
      return { title: `Escalated to you · ${where}`, body: `${what || 'Report'} open past ${b.escalate_h ?? '?'} h — owner unchanged`, tone: 'escalation' };
    case 'reminder':
      return { title: `Reminder · ${where}`, body: `${what || 'Low report'} still open past ${b.escalate_h ?? '?'} h`, tone: 'info' };
    case 'sla_breach':
      return { title: `SLA breached · ${where}`, body: `${what || 'Report'} is past its due time`, tone: 'high' };
    case 'high_severity':
      return { title: `High severity · ${where}`, body: b.summary ?? 'New High report', tone: 'high' };
    case 'new_report':
      return { title: `New report · ${where}`, body: b.summary ?? 'Waiting for classification', tone: 'info' };
    case 'assigned':
      return { title: `Assigned to you · ${where}`, body: b.summary ?? what, tone: 'info' };
    case 'closed':
      return lang === 'hi'
        ? { title: `आपकी रिपोर्ट ठीक हो गई · ${b.report_no ?? ''}`, body: 'देखें क्या किया गया', tone: 'success' }
        : { title: `Your report was fixed · ${b.report_no ?? ''}`, body: 'See what was done', tone: 'success' };
    default:
      return { title: where, body: '', tone: 'info' };
  }
}
