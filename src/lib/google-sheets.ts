const WEBHOOK_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL || '';

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    WEBHOOK_URL &&
    typeof WEBHOOK_URL === 'string' &&
    WEBHOOK_URL.trim() !== '' &&
    WEBHOOK_URL.includes('/exec')
  );
}

/**
 * Sends non-blocking sync payload to Google Apps Script Webhook.
 * Uses text/plain to avoid CORS preflight (OPTIONS) blocks in browsers.
 */
async function sendToWebhook(
  type: 'lead' | 'student' | 'delete-lead' | 'delete-student',
  record: any
): Promise<void> {
  if (!isGoogleSheetsConfigured()) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        type,
        record
      })
    });
  } catch (err) {
    console.warn(`[GoogleSheetsSync] Failed to sync ${type}:`, err);
  }
}

export function syncLeadToGoogleSheets(lead: any): void {
  sendToWebhook('lead', lead);
}

export function syncStudentToGoogleSheets(student: any): void {
  sendToWebhook('student', student);
}

export function deleteLeadFromGoogleSheets(codeOrId: string): void {
  sendToWebhook('delete-lead', { id: codeOrId });
}

export function deleteStudentFromGoogleSheets(studentId: string): void {
  sendToWebhook('delete-student', { id: studentId });
}
