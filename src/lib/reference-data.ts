import refData from '../../../03-Reference-data/reference-data.json';

export const ALL_COUNTRIES: { en: string; am: string }[] = refData.all_countries;
export const COUNTRY_NAMES: string[] = ALL_COUNTRIES.map(c => c.en);

export const QUICK_DESTINATIONS: { en: string; am: string }[] = refData.study_destinations_quick_list;
export const QUICK_DESTINATION_NAMES: string[] = QUICK_DESTINATIONS.map(d => d.en);

export const SOURCES = [
  'Facebook / Instagram',
  'TikTok',
  'Telegram',
  'WhatsApp',
  'Referral',
  'Scholarship campaign',
  'Website',
  'Walk-in'
];

export const PACKAGES = [
  { key: 'p1', label: 'Package 1', desc: 'Consulting, applying & university admission', pays: ['registration', 'payment1'] },
  { key: 'p2', label: 'Package 2', desc: 'Full journey through visa completion', pays: ['registration', 'payment1', 'payment2'] }
];

export const PACKAGE_LABEL: Record<string, string> = {
  p1: 'Package 1',
  p2: 'Package 2'
};

export const LEAD_OUTCOMES: Record<string, string> = {
  no_answer: 'No answer',
  answered: 'Answered',
  not_interested: 'Not interested',
  out_of_scope: 'Out of scope'
};

export const CLOSE_REASONS: Record<string, string> = {
  no_response: 'No response after all calls',
  not_interested: 'Not interested',
  out_of_scope: 'Out of scope',
  other: 'Closed'
};

export const RISK_LEVELS = [
  { key: 'strong', label: 'Strong', tone: 'teal' },
  { key: 'improve', label: 'Needs improvement', tone: 'amber' },
  { key: 'high', label: 'High risk', tone: 'red' }
];

export const VISA_DECISIONS = [
  { key: 'approved', label: 'Approved', tone: 'green' },
  { key: 'additional', label: 'More documents', tone: 'amber' },
  { key: 'refused', label: 'Refused', tone: 'red' }
];

export const EDUCATION_LEVELS = ['Grade 12', 'Diploma', 'BA', 'BSc', 'MSc', 'PhD', 'Other'];
export const STUDY_LEVELS = ['Bachelor', 'Master', 'PhD', 'Diploma', 'Certificate'];
export const INTAKES = ['Sept 2026', 'Feb 2027', 'Sept 2027', 'Jan 2027', 'Other'];
export const GOALS = ['Bachelor’s', 'Master’s', 'Medicine', 'Scholarship', 'Diploma', 'Other'];
export const PASSPORT_STATUSES = ['Valid', 'Applying', 'Expired', 'None'];
