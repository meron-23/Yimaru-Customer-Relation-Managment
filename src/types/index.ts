/** TypeScript interfaces matching the 9 database tables (spec §4). */

export type Role = 'partner' | 'staff';
export type Stage = 'registration' | 'assessment' | 'onboarding' | 'admission' | 'visafile' | 'submitted' | 'outcome';
export type PackageType = 'p1' | 'p2' | '';
export type Risk = 'strong' | 'improve' | 'high' | '';
export type Decision = 'approved' | 'additional' | 'refused' | '';
export type SponsorType = 'scholarship' | 'self' | '';
export type LeadStatus = 'open' | 'closed' | 'converted';
export type LeadOutcome = 'no_answer' | 'answered' | 'not_interested' | 'out_of_scope';
export type CloseReason = 'no_response' | 'not_interested' | 'out_of_scope' | 'other';
export type ApplicationStatus = 'Planned' | 'Applied' | 'In review' | 'Offer' | 'Rejected' | 'Enrolled';
export type ActivityKind = 'note' | 'stage' | 'money' | 'file' | 'call';
export type Lang = 'en' | 'am';
export type _LangExport = Lang; // exported to avoid unused warning

export interface User {
  id: string;
  full_name: string;
  username: string;
  password_hash?: string; // never returned by API
  role: Role;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

export interface Payment {
  id: string;
  student_id: string;
  kind: 'registration' | 'payment1' | 'payment2';
  paid: boolean;
  amount: number; // integers, birr
  paid_on?: string; // Gregorian YYYY-MM-DD
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface Application {
  id: string;
  student_id: string;
  university: string;
  program: string;
  portal?: string;
  conditions?: string;
  result?: string;
  fee?: number;
  deadline?: string;
  applied_on?: string;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface Activity {
  id: string;
  student_id: string;
  ts: string; // ISO timestamp
  author_id: string;
  author_name: string;
  kind: ActivityKind;
  text: string; // stored in English with {params}, translated on display
}

export interface Student {
  id: string;
  case_id: string; // YIM-YYYY-NNNN
  full_name: string;
  phone?: string;
  email?: string;
  source?: string;
  age?: string;
  education?: string;
  gpa?: string;
  graduation_year?: string;
  field_of_study?: string;
  english_proficiency?: string;
  work_experience?: string;
  study_level?: string;
  target_countries: string[];
  budget?: string;
  sponsor?: string;
  sponsor_relationship?: string;
  previous_visa_history?: string;
  previous_refusals?: string;
  passport_status?: string;
  intended_intake?: string;
  risk: Risk;
  assessment_notes?: string;
  strategy_country?: string;
  strategy_university?: string;
  strategy_program?: string;
  strategy_admission_route?: string;
  strategy_funding?: string;
  strategy_visa_route?: string;
  stage: Stage;
  officer?: string; // user id
  archived: boolean;
  sponsor_type: SponsorType;
  package_type: PackageType;
  financial: Record<string, boolean>;
  financial_notes?: string;
  visa_country?: string;
  visa: Record<string, boolean>;
  qc_passed: boolean;
  qc_notes?: string;
  appt_requested: boolean;
  appt_confirmed: boolean;
  appt_biometrics: boolean;
  appt_submitted: boolean;
  appt_date?: string;
  interview: Record<string, boolean>;
  decision: Decision;
  decided_at?: string;
  converted_from_lead?: string;
  is_sample: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  // joined
  payments?: Payment[];
  applications?: Application[];
}

export interface Lead {
  id: string;
  code: string; // L-001
  name?: string;
  phone?: string;
  telegram?: string;
  source?: string;
  interest_country?: string;
  interest_package?: PackageType;
  education?: string;
  intake?: string;
  goal?: string;
  notes?: string;
  status: LeadStatus;
  call_attempts: number;
  next_call_on?: string; // Gregorian YYYY-MM-DD
  close_reason?: CloseReason;
  converted_case_id?: string;
  deleted_at?: string;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string;
  // joined
  calls?: LeadCall[];
}

export interface LeadCall {
  id: string;
  lead_id: string;
  ts: string;
  attempt: number;
  outcome: LeadOutcome;
  note?: string;
  author_id: string;
  author_name: string;
}

export interface Settings {
  id: string;
  business_name: string;
  currency: string;
  p1_registration?: number;
  p1_total?: number;
  p2_registration?: number;
  p2_total?: number;
  cadence: number[]; // days from enquiry, default [0,1,3,7,14]
  updated_at: string;
  updated_by: string;
}

export interface DestinationPrice {
  id: string;
  country: string;
  payment1: number;
  payment2: number;
  sort_order: number;
}

/** Bucket a lead falls into on the Leads page */
export type LeadBucket = 'converted' | 'closed' | 'overdue' | 'today' | 'waiting' | 'uncalled';
