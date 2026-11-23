import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import ExcelJS from "exceljs";
import {
  isFirebaseConfigured,
  loadStudentsFromFirestore,
  saveStudentToFirestore,
  deleteStudentFromFirestore,
  loadLeadsFromFirestore,
  saveLeadToFirestore,
  deleteLeadFromFirestore,
  loadSettingsFromFirestore,
  saveSettingsToFirestore,
  loadUsersFromFirestore,
  saveUsersToFirestore,
  subscribeToStudents,
  subscribeToLeads
} from "./lib/firebase";
import {
  syncStudentToGoogleSheets,
  syncLeadToGoogleSheets,
  deleteLeadFromGoogleSheets,
  deleteStudentFromGoogleSheets
} from "./lib/google-sheets";

/* ---------- Language (English / Amharic) ----------
   LANG is set by the App on every render; T() looks a phrase up in AM.
   Phrases can carry {placeholders}. Anything without an Amharic entry falls back to English. */
let LANG = "en";
function T(s, p) {
  if (s == null) return "";
  let out = LANG === "am" && AM[s] != null ? AM[s] : s;
  if (p) out = out.replace(/\{(\w+)\}/g, (_, k) => (p[k] != null ? p[k] : ""));
  return out;
}

/* ============================================================
   Yimaru Consulting — Study Abroad CRM
   Internal student-visa case management.
   Data persists via window.storage (shared across your team).
   ============================================================ */

/* ---------- Pipeline (from the roadmap) ---------- */
const STAGES = [
  { key: "registration", label: "Registration", color: "#9A288D", hint: "Collect the registration fee. Work starts once it’s paid." },
  { key: "assessment",   label: "Assessment",   color: "#9A288D", hint: "Review the profile and set a risk level." },
  { key: "onboarding",   label: "Onboarding",   color: "#B4327E", hint: "Sign the contract and agree the study plan." },
  { key: "admission",    label: "Admission",    color: "#0E9384", hint: "Apply to universities and wait for offers." },
  { key: "visafile",     label: "Visa file",    color: "#4A1D6E", hint: "Build the financial story and documents, then get QC sign-off." },
  { key: "submitted",    label: "Submitted",    color: "#B7791F", hint: "Book the appointment, lodge the file, prepare for the interview." },
  { key: "outcome",      label: "Outcome",      color: "#227A54", hint: "Record the decision and support departure." },
];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i]));
const VALID_STAGES = new Set(STAGES.map((s) => s.key));
const stageColor = (k) => STAGES[STAGE_INDEX[k]]?.color || "#9A288D";
// Map older stage keys onto the current pipeline (lead is now a separate section).
const STAGE_MIGRATE = {
  lead: "registration", consult: "registration", assessed: "assessment", onboard: "onboarding", strategy: "onboarding",
  admitproc: "admission", admitrecv: "admission", financial: "visafile", visadocs: "visafile",
  qc: "visafile", appointment: "submitted", processing: "submitted", decision: "outcome",
  postvisa: "outcome",
};
function migrateStudent(s) {
  let stage = s.stage, archived = s.archived || false;
  if (stage === "closed") { archived = true; stage = "outcome"; }
  else if (!VALID_STAGES.has(stage)) stage = STAGE_MIGRATE[stage] || "registration";
  let payments = s.payments || blankPayments();
  // A case already being worked beyond registration is assumed to have paid the fee.
  if (STAGE_INDEX[stage] > STAGE_INDEX["registration"] && !payments.registration.paid) {
    payments = { ...payments, registration: { ...payments.registration, paid: true } };
  }
  const packageType = s.packageType || "";
  const needs = stage !== s.stage || archived !== (s.archived || false) ||
    !s.payments || payments !== s.payments || s.packageType === undefined;
  return needs ? { ...s, stage, archived, payments, packageType } : s;
}

const RISK = {
  strong:  { label: "Strong",              cls: "b-teal" },
  improve: { label: "Needs improvement",   cls: "b-amber" },
  high:    { label: "High risk",           cls: "b-red" },
};
const DECISION = {
  approved:   { label: "Approved",            cls: "b-green" },
  additional: { label: "More documents",      cls: "b-amber" },
  refused:    { label: "Refused",             cls: "b-red" },
};

/* ---------- Checklist presets ---------- */
const FINANCIAL_ITEMS = [
  "Sponsor identity", "Relationship to student", "Bank statements", "Bank balance",
  "Income source", "Employment / business evidence", "Tax documents",
  "Property / assets", "Tuition payment", "Scholarship", "Source of funds",
  "Consistency across documents",
];
const VISA_PRESETS = {
  Italy: ["Valid passport (+ old passports)", "Type-D visa application form", "Pre-enrolment on Universitaly",
    "University admission / acceptance letter", "CIMEA statement / Declaration of Value", "Proof of means of subsistence",
    "Sponsor bank statements (last 6 months)", "Sponsor income / employment proof", "Tuition payment receipt",
    "Accommodation proof in Italy", "Health insurance (valid in Italy)", "Academic transcripts & certificates (legalised)",
    "English/Italian proficiency certificate", "Round-trip flight reservation", "2 passport photos (ICAO)", "VFS appointment booked"],
  Germany: ["Valid passport (+ old passports)", "National visa application form (VIDEX)", "University admission (Zulassung)",
    "Blocked account (Sperrkonto) funded", "APS certificate", "Health insurance (travel + confirmation)",
    "Academic transcripts & degree certificates", "Motivation / SOP letter", "CV", "Proof of accommodation",
    "Language certificate (German/English)", "2 biometric photos", "Appointment booked"],
  Canada: ["Valid passport", "Study permit application (IMM1294)", "Provincial Attestation Letter (PAL)",
    "Letter of acceptance (DLI)", "Proof of funds (tuition + 1 year living + travel)", "GIC certificate",
    "Statement of Purpose", "Academic transcripts & certificates", "Language test (IELTS/PTE)", "Medical exam (panel physician)",
    "Digital photo", "Biometrics appointment"],
  USA: ["Valid passport (6+ months)", "Form I-20 (SEVIS registered)", "SEVIS I-901 fee receipt", "DS-160 confirmation",
    "Visa appointment (OFC + consular)", "Proof of funds (first year + evidence beyond)", "Sponsor affidavit & bank letters",
    "Academic transcripts & certificates", "Standardised test scores (IELTS/TOEFL/GRE)", "Ties-to-home evidence", "Photo (per spec)"],
  UK: ["Valid passport", "CAS from licensed sponsor", "Proof of funds held 28 consecutive days", "Tuition & maintenance evidence",
    "Academic qualifications on CAS", "English (SELT/approved)", "ATAS certificate (if required)", "TB test certificate",
    "IHS surcharge paid", "Appointment booked"],
  Hungary: ["Valid passport", "Residence-permit (type-D) application", "University admission / Stipendium award",
    "Proof of funds / scholarship letter", "Accommodation proof", "Health insurance", "Academic documents (legalised)",
    "Language certificate", "Photographs", "Appointment booked"],
  Default: ["Valid passport", "Visa application form", "University admission letter", "Proof of funds",
    "Sponsor documents", "Tuition payment proof", "Accommodation proof", "Health insurance",
    "Academic transcripts & certificates", "Language certificate", "Passport photos", "Appointment booked"],
};
const INTERVIEW_STEPS = [
  ["mock1", "Mock interview 1"], ["difficult", "Difficult-question session"],
  ["mock2", "Mock interview 2"], ["ready", "Final readiness assessment"],
];

const COUNTRIES = [
  "Italy", "Germany", "Hungary", "Austria", "Cyprus", "Poland", "Czech Republic",
  "France", "Netherlands", "Belgium", "Sweden", "Finland", "Ireland", "UK",
  "Malta", "Greece", "Spain", "Portugal", "Lithuania", "Latvia", "Estonia",
  "USA", "Canada", "Australia", "New Zealand", "China", "India", "Malaysia",
  "Turkey", "Dubai (UAE)", "Russia", "South Korea", "Japan", "Rwanda", "Other",
];
// Users: named logins with their own username + password.
// Partners see everything (incl. Settings); staff work cases but not Settings.
function seedUsers() {
  return [
    { id: uid(), fullName: "Ammanuel Esrael", username: "amman", role: "partner", pw: "Yimaru-2026", active: true },
    { id: uid(), fullName: "Endrias", username: "endrias", role: "partner", pw: "Endrias-2026", active: true },
  ];
}
const isPartnerRole = (r) => r === "partner";
const ROLE_LABEL = { partner: "Partner", staff: "Staff" };
function randomPw() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `Yimaru-${n}`;
}
const FUNDING = [
  { key: "scholarship", label: "Scholarship", cls: "b-teal" },
  { key: "self", label: "Self-sponsored", cls: "b-amber" },
];
const FUNDING_LABEL = Object.fromEntries(FUNDING.map((f) => [f.key, f.label]));
const PACKAGES = [
  { key: "p1", label: "Package 1", desc: "Consulting, applying & university admission", pays: ["registration", "payment1"] },
  { key: "p2", label: "Package 2", desc: "Full journey through visa completion", pays: ["registration", "payment1", "payment2"] },
];
const PACKAGE_LABEL = Object.fromEntries(PACKAGES.map((p) => [p.key, p.label]));
const PAYMENTS = [
  { key: "registration", label: "Registration fee", when: "Non-refundable — starts the whole process" },
  { key: "payment1",     label: "Payment 1",        when: "Due once university admission is received" },
  { key: "payment2",     label: "Payment 2",        when: "Due once the visa is completed" },
];
function blankPayments() {
  return {
    registration: { paid: false, amount: "", date: "" },
    payment1: { paid: false, amount: "", date: "" },
    payment2: { paid: false, amount: "", date: "" },
  };
}
const SOURCES = ["Facebook / Instagram", "TikTok", "Telegram", "WhatsApp", "Referral", "Scholarship campaign", "Website", "Walk-in"];

/* ---------- Storage keys ---------- */
const K_STUDENTS = "yim:students";
const K_USERS = "yim:users";
const K_SESSION = "yim:session";
const K_LEADS = "yim:leads";
const K_SETTINGS = "yim:settings";

/* ---------- Settings ---------- */
const DEFAULT_DESTINATIONS = ["Italy", "Germany", "Hungary", "Austria", "Canada", "USA", "UK", "Cyprus"];
// Older saved settings listed every country at the default price. Trim those back to the short list.
function tidySettings(st) {
  const c = st.countries || [];
  const untouched = c.length > 20 && c.every((x) => String(x.payment1) === "150000" && String(x.payment2) === "150000");
  return untouched ? { ...st, countries: defaultSettings().countries } : st;
}
function defaultSettings() {
  return {
    businessName: "Yimaru Consulting",
    currency: "ETB",
    team: ["Ammanuel", "Endrias"], // consultants / instructors
    // Package pricing — registration fee is part of each package.
    packages: {
      p1: { registration: "", total: "" },
      p2: { registration: "", total: "" },
    },
    // Per-country milestone payments (Payment 1 after admission, Payment 2 after visa).
    countries: DEFAULT_DESTINATIONS.map((name) => ({ name, payment1: "150000", payment2: "150000" })),
    cadence: [0, 1, 3, 7, 14], // follow-up call plan, in days from the first contact
  };
}
// Resolve the default amount for a payment from settings, the student's package and country.
function feeFor(settings, stu, key) {
  if (!settings) return "";
  if (key === "registration") return settings.packages?.[stu.packageType]?.registration || "";
  const country = stu.strategy?.country || stu.targetCountries?.[0];
  const row = (settings.countries || []).find((c) => c.name === country);
  return row?.[key] || "";
}

/* ---------- Leads ---------- */
const LEAD_OUTCOMES = {
  no_answer: "No answer",
  answered: "Answered",
  not_interested: "Not interested",
  out_of_scope: "Out of scope",
};
const CLOSE_REASONS = {
  no_response: "No response after all calls",
  not_interested: "Not interested",
  out_of_scope: "Out of scope",
  other: "Closed",
};
function blankLead(id, code) {
  return {
    id, code, createdAt: nowISO(), updatedAt: nowISO(),
    name: "", phone: "", telegram: "", source: "",
    interestCountry: "", interestPackage: "", education: "", intake: "", goal: "", notes: "",
    status: "open", // open | closed | converted
    callAttempts: 0, nextCallAt: todayStr(), calls: [],
    closeReason: "", convertedCaseId: "",
  };
}
function leadBucket(lead, today) {
  if (lead.status === "converted") return "converted";
  if (lead.status === "closed") return "closed";
  const d = lead.nextCallAt || today;
  if (d < today) return "overdue";
  if (d === today) return "today";
  return "upcoming";
}
function nextLeadCode(map) {
  let max = 0;
  Object.values(map || {}).forEach((l) => { const m = (l.code || "").match(/^L-(\d+)$/); if (m) max = Math.max(max, +m[1]); });
  return `L-${String(max + 1).padStart(3, "0")}`;
}
// Apply a logged call to a lead: appends to history, advances the follow-up plan.
function applyLeadCall(lead, outcome, note, author, cadence, answeredNextDate) {
  const today = todayStr();
  const call = { id: uid(), ts: nowISO(), attempt: lead.callAttempts + 1, outcome, note: note || "", author: author || "—" };
  const calls = [...(lead.calls || []), call];
  let { status, nextCallAt, closeReason } = lead;
  const attempts = lead.callAttempts + 1;
  if (outcome === "not_interested" || outcome === "out_of_scope") {
    status = "closed"; closeReason = outcome;
  } else if (outcome === "answered") {
    nextCallAt = answeredNextDate || addDaysStr(today, 2);
  } else { // no_answer
    const plan = cadence && cadence.length ? cadence : [0, 1, 3, 7, 14];
    if (attempts >= plan.length) { status = "closed"; closeReason = "no_response"; }
    else nextCallAt = addDaysStr(today, plan[attempts] - plan[attempts - 1] >= 0 ? plan[attempts] : 2);
  }
  return { ...lead, calls, callAttempts: attempts, status, nextCallAt, closeReason, updatedAt: nowISO() };
}

/* ---------- Per-student current status (what's happening now) ---------- */
function statusOf(stu) {
  if (stu.archived) return { label: "Archived", tone: "grey" };
  if (stu.decision === "approved") return { label: "Visa approved", tone: "green" };
  if (stu.decision === "refused") return { label: "Visa refused", tone: "red" };
  if (stu.decision === "additional") return { label: "Embassy asked for more", tone: "amber" };
  const regPaid = stu.payments?.registration?.paid;
  switch (stu.stage) {
    case "registration": return regPaid ? { label: "Registered, ready to start", tone: "teal" } : { label: "Registration fee due", tone: "magenta" };
    case "assessment": return { label: "Profile being assessed", tone: "purple" };
    case "onboarding": return { label: "Onboarding", tone: "purple" };
    case "admission": {
      const apps = stu.applications || [];
      if (apps.some((a) => a.status === "Offer" || a.status === "Enrolled")) return { label: "Offer received", tone: "teal" };
      if (apps.length) return { label: "Applying to {n} universities", n: apps.length, tone: "teal" };
      return { label: "Planning applications", tone: "teal" };
    }
    case "visafile": return stu.qcPassed ? { label: "Visa file ready", tone: "teal" } : { label: "Building visa file", tone: "purple" };
    case "submitted": return { label: "At the embassy", tone: "amber" };
    case "outcome": return { label: "Awaiting decision", tone: "amber" };
    default: return { label: STAGES[STAGE_INDEX[stu.stage]]?.label || "—", tone: "grey" };
  }
}
const TONE_CLS = { magenta: "b-magenta", amber: "b-amber", teal: "b-teal", green: "b-green", red: "b-red", purple: "b-purple", grey: "b-grey" };

/* ---------- Sample data: 50 students and 50 leads across every step ----------
   Seeded on first run, and swapped in once for the old 20-student sample.
   Records the team created themselves are never touched. Every sample is flagged sample:true. */
const SAMPLE_VERSION = 2;
const K_SAMPLE = "yim:sampleVersion";
const OLD_SAMPLE_STUDENTS = ["Kaleab Tesfaye", "Hanna Girma", "Yonas Bekele", "Mekdes Alemu", "Dawit Haile", "Selam Tadesse", "Biruk Assefa", "Rahel Worku", "Nahom Getachew", "Eyob Mengistu", "Liya Solomon", "Abel Desta", "Saba Tsegaye", "Fitsum Negash", "Hewan Kebede", "Yohannes Abera", "Bethlehem Fikru", "Samuel Tadele", "Meron Ayele", "Natnael Girmay"];
const OLD_SAMPLE_LEADS = ["Abenezer Tola", "Kidist Mamo", "Robel Girma", "Tsion Haile", "Michael Abebe", "Ruth Solomon", "Dagmawi Bekele", "Lidya Tesfaye"];
const isOldSampleStudent = (s) => !!s && (s.sample || (OLD_SAMPLE_STUDENTS.includes(s.fullName) && /^YIM-\d{4}-00(0[1-9]|1\d|20)$/.test(s.id || "")));
const isOldSampleLead = (l) => !!l && (l.sample || (OLD_SAMPLE_LEADS.includes(l.name) && /^L-00\d$/.test(l.code || "")));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SF = ["Abel", "Selam", "Kaleab", "Hanna", "Yonas", "Mekdes", "Dawit", "Rahel", "Biruk", "Liya", "Nahom", "Saba", "Eyob", "Hewan", "Fitsum", "Bethlehem", "Samuel", "Meron", "Natnael", "Tsion", "Robel", "Kidist", "Michael", "Ruth", "Dagmawi", "Lidya", "Abenezer", "Mahlet", "Henok", "Sara", "Yared", "Feven", "Bereket", "Eden", "Mikiyas", "Hiwot", "Kirubel", "Betelhem", "Amanuel", "Rediet", "Ermias", "Blen", "Tewodros", "Hermela", "Leul", "Ruth", "Yeabsira", "Nardos", "Surafel", "Selamawit", "Kalkidan", "Elias", "Martha", "Bemnet", "Gelila", "Haileab", "Tigist", "Fikir", "Daniel", "Lulit"];
const SL = ["Tesfaye", "Girma", "Bekele", "Alemu", "Haile", "Tadesse", "Assefa", "Worku", "Getachew", "Mengistu", "Solomon", "Desta", "Tsegaye", "Negash", "Kebede", "Abera", "Fikru", "Tadele", "Ayele", "Girmay", "Mamo", "Tola", "Abebe", "Wolde", "Gebre", "Hailu", "Mekonnen", "Demissie", "Berhane", "Yohannes", "Lemma", "Asfaw", "Kassa", "Teshome", "Woldemariam", "Mulugeta", "Shiferaw", "Gebremedhin", "Ayalew", "Zewdu"];
const UNI = {
  Italy: [["Univ. of Bologna", "MSc Computer Science"], ["Politecnico di Milano", "MSc Civil Engineering"], ["Sapienza Univ. of Rome", "MSc Public Health"], ["Univ. of Padua", "BSc Biology"], ["Univ. of Pisa", "MSc Data Science"]],
  Germany: [["TU Munich", "MSc Electrical Engineering"], ["RWTH Aachen", "MSc Mechanical Engineering"], ["Univ. of Freiburg", "MSc Renewable Energy"], ["Hochschule Bremen", "BSc Computer Science"]],
  Hungary: [["Univ. of Debrecen", "MD Medicine"], ["Semmelweis Univ.", "Pharmacy"], ["Univ. of Szeged", "BSc Nursing"]],
  Austria: [["Univ. of Vienna", "MSc Economics"], ["TU Graz", "MSc Software Engineering"]],
  Canada: [["Univ. of Toronto", "MSc Public Health"], ["Conestoga College", "Diploma Business"], ["Univ. of Manitoba", "MSc Agriculture"]],
  USA: [["Arizona State Univ.", "MS Computer Science"], ["Univ. of Houston", "MBA"], ["Purdue Univ.", "MS Industrial Engineering"]],
  UK: [["Univ. of Leeds", "MSc Finance"], ["Coventry Univ.", "MSc Project Management"], ["Univ. of Hertfordshire", "MSc Nursing"]],
  Cyprus: [["Univ. of Nicosia", "BSc Hospitality"], ["European Univ. Cyprus", "MBA"]],
  Poland: [["Warsaw Univ. of Technology", "MSc Architecture"]],
  Malta: [["Univ. of Malta", "MSc Tourism"]],
};
const NOTE_BANK = {
  registration: ["First meeting at the office. Explained both packages.", "Sent the registration fee details on Telegram."],
  assessment: ["Reviewed transcripts. GPA is solid for most programmes.", "English score below 6.0; suggested IELTS prep with Yimaru."],
  onboarding: ["Contract signed. Agreed on the destination and two backup universities."],
  admission: ["Application submitted through the university portal.", "University asked for a translated transcript."],
  visafile: ["Sponsor bank statements received. Need 6 months, have 4.", "Started the financial story with the sponsor."],
  submitted: ["Mock interview went well. Practise the sponsor questions again."],
  outcome: ["Embassy result received today."],
};

function buildSamples(usedCaseIds, usedLeadCodes) {
  const r = rng(2026);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const today = todayStr();
  const nowMs = Date.now() - 60000;
  const dayISO = (daysAgo, h) => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - daysAgo); d.setHours(h ?? int(8, 18), int(0, 59)); return new Date(Math.min(d.getTime(), nowMs - int(5, 240) * 60000 * (daysAgo === 0 ? 1 : 0))).toISOString(); };
  const year = yy();
  const used = new Set(usedCaseIds || []); let nCase = 0;
  const nextId = () => { let id; do { nCase++; id = `YIM-${year}-${String(nCase).padStart(4, "0")}`; } while (used.has(id)); used.add(id); return id; };
  const usedL = new Set(usedLeadCodes || []); let nLead = 0;
  const nextCode = () => { let c; do { nLead++; c = `L-${String(nLead).padStart(3, "0")}`; } while (usedL.has(c)); usedL.add(c); return c; };
  const names = []; const seen = new Set();
  while (names.length < 100) { const n = `${pick(SF)} ${pick(SL)}`; if (!seen.has(n)) { seen.add(n); names.push(n); } }
  const phone = () => `09${int(10, 99)}${String(int(100000, 999999))}`;
  const officers = ["Ammanuel Esrael", "Endrias"];

  /* ----- students ----- */
  const plan = [["registration", 6], ["assessment", 7], ["onboarding", 7], ["admission", 9], ["visafile", 8], ["submitted", 6], ["outcome", 7]];
  const ages = { registration: [1, 9], assessment: [7, 20], onboarding: [15, 32], admission: [28, 65], visafile: [55, 95], submitted: [80, 120], outcome: [100, 160] };
  const countryPool = ["Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Italy", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Germany", "Hungary", "Hungary", "Hungary", "Hungary", "Hungary", "Hungary", "Canada", "Canada", "Canada", "Canada", "Canada", "Canada", "USA", "USA", "USA", "USA", "USA", "UK", "UK", "UK", "UK", "UK", "Austria", "Austria", "Austria", "Austria", "Cyprus", "Cyprus", "Cyprus", "Poland", "Malta"];
  for (let k = countryPool.length - 1; k > 0; k--) { const m = Math.floor(r() * (k + 1)); [countryPool[k], countryPool[m]] = [countryPool[m], countryPool[k]]; }
  const decisions = ["approved", "approved", "approved", "additional", "additional", "refused", ""];
  const rows = []; let ci = 0;
  plan.forEach(([stage, count]) => {
    for (let n = 0; n < count; n++) rows.push({ stage, n, name: names[ci], country: countryPool[ci++] });
  });
  // oldest first so case numbers follow the order cases were opened
  rows.forEach((x) => { const [lo, hi] = ages[x.stage]; x.age = int(lo, hi); });
  rows.sort((a, b) => b.age - a.age);

  const students = {};
  rows.forEach((x, i) => {
    const { stage, n, name, country } = x;
    const idx = STAGE_INDEX[stage];
    const id = nextId();
    const created = dayISO(x.age);
    const updated = dayISO(Math.max(0, Math.min(x.age, int(0, idx >= 4 ? 12 : 6))));
    const pkg = idx >= STAGE_INDEX.visafile ? "p2" : (r() < 0.55 ? "p1" : "p2");
    const funding = r() < 0.24 ? "scholarship" : "self";
    const officer = r() < 0.07 ? "" : officers[i % 2];
    const [uni, prog] = pick(UNI[country] || UNI.Italy);
    const st = blankStudent(id);
    const regPaid = idx >= 1 || n < 2;
    const offerAtAdmission = stage === "admission" && n % 3 !== 0;
    const p1Paid = idx >= STAGE_INDEX.visafile || (offerAtAdmission && n % 2 === 0);
    const decision = stage === "outcome" ? decisions[n] : "";
    const p2Paid = pkg === "p2" && decision === "approved" && n !== 2;
    const visaKey = VISA_PRESETS[country] ? country : "";
    const docs = VISA_PRESETS[visaKey || "Default"];
    const docsDone = idx > STAGE_INDEX.visafile ? docs.length : stage === "visafile" ? Math.min(docs.length, [2, 5, 8, 10, 12, 3, 7, 11][n % 8]) : 0;
    const finDone = idx > STAGE_INDEX.visafile ? FINANCIAL_ITEMS.length : stage === "visafile" ? int(3, FINANCIAL_ITEMS.length - 1) : 0;
    const apps = [];
    if (idx >= STAGE_INDEX.admission) {
      const howMany = stage === "admission" ? (n % 3 === 0 ? int(1, 3) : int(1, 3)) : int(1, 2);
      const alts = (UNI[country] || UNI.Italy).filter((u) => u[0] !== uni);
      for (let a = 0; a < howMany; a++) {
        const [u, pr] = a === 0 ? [uni, prog] : (alts[a - 1] || [uni, prog]);
        let status = "Applied";
        if (stage === "admission") status = a === 0 && offerAtAdmission ? "Offer" : pick(["Applied", "In review", "In review", "Planned"]);
        else status = a === 0 ? (idx >= STAGE_INDEX.outcome && decision === "approved" ? "Enrolled" : "Offer") : pick(["Rejected", "In review", "Offer"]);
        apps.push({ id: uid(), university: u, program: pr, portal: country === "Italy" ? "Universitaly + uni portal" : "University portal", fee: country === "Italy" ? "€30" : country === "USA" ? "$75" : "", deadline: addDaysStr(today, int(-40, 60)), appliedDate: addDaysStr(today, -int(5, 40)), status, result: "", conditions: status === "Offer" && r() < 0.3 ? "Final transcript" : "" });
      }
    }
    const fin = {}; FINANCIAL_ITEMS.slice(0, finDone).forEach((f) => { fin[f] = true; });
    const visa = {}; docs.slice(0, docsDone).forEach((d) => { visa[d] = true; });
    const qc = idx > STAGE_INDEX.visafile || (stage === "visafile" && docsDone >= docs.length - 1);
    const ap = { requested: false, confirmed: false, biometrics: false, submitted: false, date: "" };
    if (stage === "submitted") { const lvl = n % 4; ap.requested = true; ap.confirmed = lvl >= 1; ap.biometrics = lvl >= 2; ap.submitted = lvl >= 2; ap.date = lvl >= 2 ? addDaysStr(today, -int(5, 25)) : addDaysStr(today, int(3, 21)); }
    if (stage === "outcome") { ap.requested = ap.confirmed = ap.biometrics = ap.submitted = true; ap.date = addDaysStr(today, -int(25, 60)); }
    const iv = {};
    if (stage === "submitted") INTERVIEW_STEPS.slice(0, n % 5).forEach(([k]) => { iv[k] = true; });
    if (stage === "outcome") { INTERVIEW_STEPS.forEach(([k]) => { iv[k] = true; }); if (decision === "approved") ["Flight planning", "Accommodation", "Travel checklist"].slice(0, n + 1).forEach((p) => { iv["pv_" + p] = true; }); }
    // activity: creation, each step move, and a few working notes
    const notes = [{ id: uid(), ts: created, author: officer || "Ammanuel Esrael", text: "Case created", kind: "stage" }];
    for (let s2 = 1; s2 <= idx; s2++) {
      const ts = dayISO(Math.max(0, Math.round(x.age - (x.age * s2) / (idx + 1))));
      notes.push({ id: uid(), ts, author: officer || "Endrias", text: `Moved from ${STAGES[s2 - 1].label} to ${STAGES[s2].label}`, kind: "stage" });
      const bank = NOTE_BANK[STAGES[s2].key]; if (bank && r() < 0.6) notes.push({ id: uid(), ts, author: officer || "Endrias", text: pick(bank), kind: "note" });
    }
    if (r() < 0.5) notes.push({ id: uid(), ts: dayISO(0), author: officer || "Endrias", text: pick(NOTE_BANK[stage]), kind: "note" });
    notes.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
    const riskSet = idx >= 2 || (stage === "assessment" && n % 2 === 0);
    students[id] = {
      ...st, id, sample: true, createdAt: created, updatedAt: updated,
      fullName: name, phone: phone(), email: r() < 0.6 ? `${name.split(" ")[0].toLowerCase()}.${name.split(" ")[1].toLowerCase()}@gmail.com` : "",
      source: pick(SOURCES), age: String(int(19, 31)),
      education: pick(["BSc", "BA", "Grade 12", "Diploma", "MSc", "BSc"]), gpa: pick(["3.1", "3.4", "3.6", "2.9", "3.8", "3.2"]), graduationYear: String(int(2019, 2025)),
      fieldOfStudy: pick(["Computer Science", "Civil Engineering", "Nursing", "Economics", "Biology", "Accounting", "Public Health"]),
      englishProficiency: pick(["IELTS 6.5", "IELTS 6.0", "IELTS 7.0", "Duolingo 115", "None yet", "IELTS 5.5"]), workExperience: pick(["", "1 year", "2 years", "3 years", ""]),
      studyLevel: prog.startsWith("B") || prog.startsWith("Diploma") ? "Bachelor" : prog.startsWith("MD") || prog === "Pharmacy" ? "Bachelor" : "Master",
      targetCountries: [country], budget: `${int(25, 90) * 10},000 ETB`, sponsor: pick(["Parent", "Self", "Uncle", "Sibling", "Parent"]), sponsorRelationship: pick(["Father", "Mother", "Brother", "Uncle", ""]),
      passportStatus: pick(["Valid", "Valid", "Applying", "Valid"]), previousVisaHistory: pick(["None", "UAE tourist", "None", "Kenya", ""]), previousRefusals: r() < 0.15 ? "Germany, 2023" : "None",
      intendedIntake: pick(["Sept 2026", "Feb 2027", "Sept 2027", "Jan 2027"]),
      risk: riskSet ? pick(["strong", "strong", "improve", "improve", "high"]) : "", assessmentNotes: riskSet && r() < 0.6 ? "Good academic record. Sponsor income needs a clear paper trail." : "",
      strategy: { country, university: idx >= 3 || (stage === "onboarding" && n % 2 === 0) ? uni : "", program: idx >= 3 || (stage === "onboarding" && n % 2 === 0) ? prog : "", admissionRoute: idx >= 3 ? "Direct application" : "", funding: funding === "scholarship" ? "Scholarship" : "Self-funded", visaRoute: idx >= 3 ? "National D-visa (study)" : "" },
      stage, officer, archived: false, sponsorType: funding, packageType: pkg,
      payments: {
        registration: { paid: regPaid, amount: regPaid ? "10000" : "", date: regPaid ? created.slice(0, 10) : "" },
        payment1: { paid: p1Paid, amount: p1Paid ? "150000" : "", date: p1Paid ? updated.slice(0, 10) : "" },
        payment2: { paid: p2Paid, amount: p2Paid ? "150000" : "", date: p2Paid ? updated.slice(0, 10) : "" },
      },
      applications: apps, financial: fin, financialNotes: finDone ? "Sponsor is the father; salary plus rental income. Statements are consistent." : "",
      visaCountry: idx >= STAGE_INDEX.visafile ? visaKey : "", visa, qcPassed: qc, qcNotes: qc ? "Checked by a second officer. All translations stamped." : "",
      appointment: ap, interview: iv, decision, decidedAt: decision ? updated : "", notes,
    };
  });
  // two cases that stopped: archived
  const arch = Object.values(students).filter((s) => s.stage === "registration" && !s.payments.registration.paid).slice(-1)
    .concat(Object.values(students).filter((s) => s.stage === "assessment").slice(0, 1));
  arch.forEach((s) => { s.archived = true; s.notes = [{ id: uid(), ts: s.updatedAt, author: s.officer || "Endrias", text: "Student decided to pause until next year.", kind: "note" }, ...s.notes]; });

  /* ----- leads ----- */
  const leads = {};
  const cadence = [0, 1, 3, 7, 14];
  const lplan = [
    ...Array(6).fill("new"), ...Array(6).fill("today"), ...Array(8).fill("overdue"), ...Array(12).fill("upcoming"),
    ...Array(10).fill("converted"), ...Array(4).fill("closed_nr"), ...Array(2).fill("closed_ni"), ...Array(2).fill("closed_os"),
  ];
  const convertible = Object.values(students).filter((s) => !s.archived && STAGE_INDEX[s.stage] <= STAGE_INDEX.admission).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 10);
  const items = lplan.map((kind, k) => {
    let age;
    if (kind === "new") age = k < 3 ? 0 : 1;
    else if (kind === "today") age = [1, 3, 7, 3, 1, 7][k % 6];
    else if (kind === "overdue") age = int(4, 18);
    else if (kind === "upcoming") age = int(1, 10);
    else if (kind === "converted") age = 0; // set from the student below
    else age = int(16, 45);
    return { kind, age };
  });
  let conv = 0;
  items.forEach((it) => { if (it.kind === "converted") { const stu = convertible[conv++]; it.stu = stu; it.age = Math.max(0, Math.round((Date.now() - new Date(stu.createdAt).getTime()) / 86400000) + int(2, 6)); } });
  items.sort((a, b) => b.age - a.age);
  let nm = 50;
  items.forEach((it) => {
    const id = uid(); const code = nextCode();
    const createdD = addDaysStr(today, -it.age);
    const created = dayISO(it.age);
    const name = it.stu ? it.stu.fullName : names[nm++];
    const country = it.stu ? it.stu.strategy.country : pick(["Italy", "Italy", "Germany", "Canada", "Hungary", "USA", "UK", "Austria", "Cyprus", ""]);
    const src = it.stu ? it.stu.source : pick(SOURCES);
    let attempts = 0, status = "open", closeReason = "", nextCallAt = today; const calls = [];
    const callAt = (j) => { const d = addDaysStr(createdD, cadence[Math.min(j, cadence.length - 1)]); return d > today ? today : d; };
    const addCall = (j, outcome, note) => { const cts = new Date(callAt(j) + "T" + String(int(6, 14)).padStart(2, "0") + ":" + String(int(0, 59)).padStart(2, "0") + ":00.000Z").getTime();
      calls.push({ id: uid(), ts: new Date(Math.min(cts, nowMs)).toISOString(), attempt: j + 1, outcome, note: note || "", author: officers[j % 2] }); };
    if (it.kind === "new") { attempts = 0; nextCallAt = today; }
    else if (it.kind === "today") { attempts = { 1: 1, 3: 2, 7: 3 }[it.age] || 1; for (let j = 0; j < attempts; j++) addCall(j, "no_answer"); nextCallAt = today; }
    else if (it.kind === "overdue") { attempts = int(1, 3); for (let j = 0; j < attempts; j++) addCall(j, j === attempts - 1 && r() < 0.4 ? "answered" : "no_answer", "Asked us to call back later."); nextCallAt = addDaysStr(today, -int(1, 4)); }
    else if (it.kind === "upcoming") { attempts = int(1, 2); for (let j = 0; j < attempts; j++) addCall(j, j === attempts - 1 ? "answered" : "no_answer", j === attempts - 1 ? pick(["Interested in Italy. Wants the scholarship list.", "Parents want to visit the office first.", "Waiting for exam results.", "Will send transcripts on Telegram."]) : ""); nextCallAt = addDaysStr(today, int(1, 6)); }
    else if (it.kind === "converted") { attempts = int(1, 3); for (let j = 0; j < attempts; j++) addCall(j, j === attempts - 1 ? "answered" : "no_answer", j === attempts - 1 ? "Came to the office and registered." : ""); status = "converted"; }
    else if (it.kind === "closed_nr") { attempts = 5; for (let j = 0; j < 5; j++) addCall(j, "no_answer"); status = "closed"; closeReason = "no_response"; }
    else if (it.kind === "closed_ni") { attempts = 1; addCall(0, "not_interested", "Decided to study locally."); status = "closed"; closeReason = "not_interested"; }
    else { attempts = 1; addCall(0, "out_of_scope", "Looking for a work visa, not study."); status = "closed"; closeReason = "out_of_scope"; }
    leads[id] = {
      ...blankLead(id, code), id, code, sample: true, createdAt: created, updatedAt: calls.length ? calls[calls.length - 1].ts : created,
      name, phone: it.stu ? it.stu.phone : phone(), telegram: r() < 0.35 ? "@" + name.split(" ")[0].toLowerCase() + int(1, 99) : "",
      source: src, interestCountry: country, interestPackage: it.stu ? it.stu.packageType : pick(["p1", "p2", ""]),
      education: pick(["BSc", "Grade 12", "Diploma", "BA", "MSc"]), intake: pick(["Sept 2026", "Feb 2027", "Sept 2027"]),
      goal: pick(["Master’s", "Bachelor’s", "Scholarship", "Master’s", "Medicine"]), notes: r() < 0.3 ? "Prefers calls after 5pm." : "",
      status, callAttempts: attempts, nextCallAt, calls, closeReason, convertedCaseId: it.stu ? it.stu.id : "",
    };
    if (it.stu) {
      it.stu.notes = [...it.stu.notes, { id: uid(), ts: it.stu.createdAt, author: officers[0], text: `Converted from lead ${code}`, kind: "stage" }].sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
    }
  });
  return { students, leads };
}
function seedStudents() { return buildSamples().students; }
function seedLeadsData() { return buildSamples().leads; }
// Seed both together so converted leads point at real cases.
function seedAll(keepStudents, keepLeads) {
  const ks = keepStudents || {}, kl = keepLeads || {};
  const { students, leads } = buildSamples(Object.keys(ks), Object.values(kl).map((l) => l.code));
  return { students: { ...students, ...ks }, leads: { ...leads, ...kl } };
}

/* ---------- Branding ---------- */
const LOGO_MARK = "data:image/png;base64,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";
const LOGO_FULL = "data:image/png;base64,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";

/* ---------- Helpers ---------- */
const nowISO = () => new Date().toISOString();
const uid = () => Math.random().toString(36).slice(2, 9);
const yy = () => new Date().getFullYear();
const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const addDaysStr = (s, n) => { const d = new Date((s || todayStr()) + "T00:00:00"); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const toDate = (s) => new Date(String(s).length <= 10 ? s + "T00:00:00" : s);
/* ---------- Ethiopian calendar ----------
   Dates are stored as Gregorian (YYYY-MM-DD / ISO) and always shown in the
   Ethiopian calendar. Conversion goes through the Julian Day Number. */
const ETH_EPOCH = 1724221; // JDN of Meskerem 1, year 1 (Amete Mihret)
const gToJdn = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy2 = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy2 + Math.floor(yy2 / 4) - Math.floor(yy2 / 100) + Math.floor(yy2 / 400) - 32045; };
const jdnToG = (j) => { const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor((146097 * b) / 4); const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * d) / 4), m = Math.floor((5 * e + 2) / 153); return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 }; };
const ethJdn = (y, m, d) => ETH_EPOCH + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d - 1;
const localYmd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Gregorian date string or ISO timestamp -> { y, m, d } in the Ethiopian calendar (local day)
function toEth(s) {
  const str = String(s || "");
  const iso = str.length <= 10 ? str : localYmd(new Date(str));
  const [Y, M, D] = iso.slice(0, 10).split("-").map(Number);
  if (!Y || !M || !D) return null;
  const j = gToJdn(Y, M, D);
  let y = Math.floor((j - ETH_EPOCH) / 365.25) + 1;
  while (ethJdn(y + 1, 1, 1) <= j) y++;
  while (ethJdn(y, 1, 1) > j) y--;
  const n = j - ethJdn(y, 1, 1);
  return { y, m: Math.floor(n / 30) + 1, d: (n % 30) + 1 };
}
// Ethiopian { y, m, d } -> Gregorian "YYYY-MM-DD"
function fromEth(y, m, d) { const g = jdnToG(ethJdn(y, m, d)); return `${g.y}-${String(g.m).padStart(2, "0")}-${String(g.d).padStart(2, "0")}`; }
const ethMonthDays = (y, m) => (m === 13 ? (y % 4 === 3 ? 6 : 5) : 30);
const ETH_MONTHS_EN = ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"];
const ETH_MONTHS_AM = ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_AM = ["እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
const ethMonth = (m, short) => { const n = (LANG === "am" ? ETH_MONTHS_AM : ETH_MONTHS_EN)[m - 1] || ""; return short && LANG !== "am" ? n.slice(0, 3) : n; };
const weekdayName = (s, short) => { const w = toDate(String(s).slice(0, 10)).getDay(); const n = (LANG === "am" ? WEEKDAYS_AM : WEEKDAYS_EN)[w]; return short ? (LANG === "am" ? n.slice(0, 2) : n.slice(0, 3)) : n; };
// "Hidar 11, 2019" / "ኅዳር 11 ቀን 2019 ዓ.ም."; opts: { year, weekday, short }
function ethLong(s, opts = {}) {
  if (!s) return "";
  const e = toEth(s); if (!e) return String(s);
  const mo = ethMonth(e.m, opts.short);
  let out = LANG === "am" ? `${mo} ${e.d}${opts.year ? ` ቀን ${e.y} ዓ.ም.` : ""}` : `${mo} ${e.d}${opts.year ? `, ${e.y} E.C.` : ""}`;
  if (opts.weekday) out = `${weekdayName(s, opts.short)}${LANG === "am" ? "፣" : ","} ${out}`;
  return out;
}
const ethMonthYear = (y, m, short) => (LANG === "am" ? `${ethMonth(m, short)} ${y}` : `${ethMonth(m, short)} ${y}`);
// List separator: the Ethiopic comma in Amharic
const SEP = () => (LANG === "am" ? "፣ " : ", ");
const fmtDay = (s) => { if (!s) return "—"; const e = toEth(s); return e ? ethLong(s, { short: true }) : String(s); };
// DD/MM/YYYY in the Ethiopian calendar, the way dates are written day to day in Ethiopia
const dmy = (s) => { if (!s) return ""; const e = toEth(s); if (!e) return String(s); return `${String(e.d).padStart(2, "0")}/${String(e.m).padStart(2, "0")}/${e.y}`; };

function nextCaseId(map) {
  const year = yy();
  let max = 0;
  Object.keys(map || {}).forEach((id) => {
    const m = id.match(new RegExp(`^YIM-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `YIM-${year}-${String(max + 1).padStart(4, "0")}`;
}

async function sGet(key, shared) {
  if (isFirebaseConfigured() && shared) {
    if (key === K_STUDENTS) {
      const data = await loadStudentsFromFirestore();
      return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
    }
    if (key === K_LEADS) {
      const data = await loadLeadsFromFirestore();
      return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
    }
    if (key === K_SETTINGS) {
      const data = await loadSettingsFromFirestore();
      return data ? JSON.stringify(data) : null;
    }
    if (key === K_USERS) {
      const data = await loadUsersFromFirestore();
      return data && data.length > 0 ? JSON.stringify(data) : null;
    }
  }
  try {
    return localStorage.getItem("yimcrm:" + key);
  } catch {
    return null;
  }
}

async function sSet(key, value, shared) {
  try {
    localStorage.setItem("yimcrm:" + key, value);
  } catch {}
  if (isFirebaseConfigured() && shared) {
    try {
      const parsed = JSON.parse(value);
      if (key === K_STUDENTS) {
        if (parsed && typeof parsed === "object") {
          for (const s of Object.values(parsed)) {
            if (s && (s.id || s.fullName)) await saveStudentToFirestore(s);
          }
        }
      } else if (key === K_LEADS) {
        if (parsed && typeof parsed === "object") {
          for (const l of Object.values(parsed)) {
            if (l && (l.id || l.name)) await saveLeadToFirestore(l);
          }
        }
      } else if (key === K_SETTINGS) {
        await saveSettingsToFirestore(parsed);
      } else if (key === K_USERS) {
        if (Array.isArray(parsed)) {
          await saveUsersToFirestore(parsed);
        }
      }
    } catch (e) {
      console.warn("Error syncing to Firestore:", e);
    }
  }
  return true;
}

function blankStudent(id) {
  return {
    id, createdAt: nowISO(), updatedAt: nowISO(),
    fullName: "", phone: "", email: "", source: "",
    age: "", education: "", gpa: "", graduationYear: "", fieldOfStudy: "",
    englishProficiency: "", workExperience: "", studyLevel: "",
    targetCountries: [], budget: "", sponsor: "", sponsorRelationship: "",
    previousVisaHistory: "", previousRefusals: "", passportStatus: "", intendedIntake: "",
    risk: "", assessmentNotes: "",
    strategy: { country: "", university: "", program: "", admissionRoute: "", funding: "", visaRoute: "" },
    stage: "registration", officer: "", archived: false, sponsorType: "", packageType: "", payments: blankPayments(),
    applications: [],
    financial: {}, financialNotes: "",
    visaCountry: "", visa: {},
    qcPassed: false, qcNotes: "",
    appointment: { requested: false, confirmed: false, biometrics: false, submitted: false, date: "" },
    interview: {},
    decision: "",
    notes: [],
  };
}
/* ============================================================
   UI PRIMITIVES
   ============================================================ */
function Badge({ children, cls }) {
  return <span className={`badge ${cls || ""}`}>{children}</span>;
}

const ICONS = {
  dash: "M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z",
  users: "M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20c0-3 2.7-5 6-5s6 2 6 5M17 12a3 3 0 100-6M15.5 15c2.7.2 4.5 2 4.5 5",
  phone: "M15.5 20.5a14 14 0 01-12-12A2.5 2.5 0 016 6l1.5 3-1.5 2a11 11 0 004 4l2-1.5 3 1.5a2.5 2.5 0 012 2.5z",
  gear: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.5-2.4 1a7.5 7.5 0 00-1.7-1L14.5 3h-4l-.4 2.5a7.5 7.5 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a7.5 7.5 0 000 2l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 001.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 001.7-1l2.4 1 2-3.5z",
  book: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM19 3v18",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3",
  back: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  up: "M6 15l6-6 6 6",
  check: "M20 6L9 17l-5-5",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  close: "M6 6l12 12M18 6L6 18",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  lock: "M6 10V7a6 6 0 1112 0v3M5 10h14v11H5z",
  tag: "M3 3h8l10 10-8 8L3 11zM7.5 7.5h.01",
  refresh: "M21 12a9 9 0 11-3-6.7L21 7M21 3v4h-4",
  convert: "M4 7h11l-3-3M20 17H9l3 3",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  chat: "M21 12a8 8 0 01-11.8 7L4 20l1-4.6A8 8 0 1121 12z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z",
  cal: "M4 5h16v16H4zM4 9h16M8 3v4M16 3v4",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  money: "M3 6h18v12H3zM12 9a3 3 0 100 6 3 3 0 000-6z",
  archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  note: "M5 3h10l4 4v14H5zM14 3v5h5M8 13h8M8 17h5",
  file: "M6 3h8l4 4v14H6zM14 3v4h4",
  plane: "M2 16l20-8-8 13-2-6z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  arrowUR: "M7 17 17 7M9 7h8v8",
  filter: "M4 6h16M7 12h10M10 18h4",
  school: "M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5",
  dl: "M12 4v11M7 10l5 5 5-5M5 20h14",
  copy: "M9 9h11v11H9zM15 9V4H4v11h5",
  chart: "M4 20V11M10 20V5M16 20v-6M21 20H3",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
};
function Icon({ name, size }) {
  return (
    <svg viewBox="0 0 24 24" className="ic" fill="none" stroke="currentColor" style={size ? { width: size, height: size } : undefined}
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name] || ""} />
    </svg>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-lbl">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

const AV_TONES = [["#F8DAF0", "#8E2A7C"], ["#DCE8FC", "#24508F"], ["#FDE4D2", "#8A4318"], ["#CDF5EA", "#0D6650"], ["#E8DDF8", "#55339A"], ["#FFF0A8", "#735300"]];
function initials(name) {
  return (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}
function Avatar({ name, size = 28 }) {
  let h = 0; for (const ch of name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const t = AV_TONES[h % AV_TONES.length];
  return <span className="av" style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: t[0], color: t[1] }}>{initials(name)}</span>;
}

const PILL_DOT = { magenta: "#C2459F", amber: "#D9A400", teal: "#14B88E", green: "#4FA02A", red: "#D64545", purple: "#7E5BD0", grey: "#A39BA8" };
function Pill({ tone = "grey", children }) {
  return <span className={`pill pl-${tone}`}><i style={{ background: PILL_DOT[tone] || PILL_DOT.grey }} />{children}</span>;
}
function StatusPill({ stu }) {
  const s = statusOf(stu);
  return <Pill tone={s.tone}>{T(s.label, s)}</Pill>;
}

// One soft colour per step, used on cards, chips, the pipeline and the journey strip.
// bg = card fill, fg = text on that fill, bar = the strong accent.
const STAGE_TONE = [
  { bg: "#FDE4D2", fg: "#8A4318", bar: "#F39A5B" }, // Registration: peach
  { bg: "#DCE8FC", fg: "#24508F", bar: "#6E9EEA" }, // Assessment: sky
  { bg: "#E8DDF8", fg: "#55339A", bar: "#A386E3" }, // Onboarding: lavender
  { bg: "#F8DAF0", fg: "#8E2A7C", bar: "#DB7FC6" }, // Admission: pink
  { bg: "#FFF0A8", fg: "#735300", bar: "#F5C518" }, // Visa file: Yimaru yellow
  { bg: "#CDF5EA", fg: "#0D6650", bar: "#22D3A6" }, // Submitted: aquamarine
  { bg: "#DFF3CD", fg: "#3B6A18", bar: "#83C45A" }, // Outcome: green
];
const stageTone = (key) => STAGE_TONE[STAGE_INDEX[key] ?? 0];
const STAGE_SHORT = ["Fee and sign-up", "Profile review", "Study plan", "University offers", "Documents and QC", "At the embassy", "Visa decision"];

// Stat cards that double as filters (pick one). Selected card fills with its colour.
function StatCards({ items, value, onChange, cls }) {
  return (
    <div className={`scards ${cls || ""}`} role="tablist">
      {items.map((t) => {
        const on = value === t.key;
        return (
          <button key={t.key} role="tab" aria-selected={on} className={`scard ${on ? "on" : ""} ${t.hero ? "hero" : ""}`}
            style={{ "--c": t.bar || "var(--vv)", "--cf": t.fg || "var(--vv)", "--cb": t.bg || "var(--vv-50)" }} onClick={() => onChange(t.key)} title={t.hint || ""}>
            <span className="sc-top"><span className="sc-l">{t.label}</span>{on && <Icon name="check" />}</span>
            <b className="sc-n">{t.count}</b>
            {t.sub && <span className="sc-s">{t.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}
// Pill chips with a coloured dot. Each chip toggles on its own.
function ChipBar({ items }) {
  return (
    <div className="cbar">
      {items.map((c) => (
        <button key={c.key} className={`cchip ${c.on ? "on" : ""}`} onClick={c.onClick} aria-pressed={!!c.on}>
          {c.dot && <i style={{ background: c.dot }} />}<span>{c.label}</span>{c.count != null && <em>{c.count}</em>}
        </button>
      ))}
    </div>
  );
}

// Signature element: the 7-segment journey strip, used wherever a case appears.
function Journey({ stu, label, big }) {
  const cur = STAGE_INDEX[stu.stage] ?? 0;
  const blocked = stu.stage === "registration" && !stu.payments?.registration?.paid;
  const end = stu.decision === "approved" ? "ok" : stu.decision === "refused" ? "no" : null;
  return (
    <span className={`jr ${big ? "jr-big" : ""}`} title={T("Step {a} of {b}: {s}", { a: cur + 1, b: STAGES.length, s: T(STAGES[cur].label) })}>
      <span className="jr-bar">{STAGES.map((s, i) => <i key={s.key} className={i < cur ? "d" : i === cur ? (blocked ? "b" : end || "c") : ""} style={i === cur && !blocked && !end ? { background: STAGE_TONE[i].bar } : undefined} />)}</span>
      {label && <span className="jr-lbl">{T(STAGES[cur].label)}</span>}
    </span>
  );
}

function ago(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return T("Today");
  if (days === 1) return T("Yesterday");
  if (days < 7) return T("{n}d ago", { n: days });
  if (days < 35) return T("{n}w ago", { n: Math.floor(days / 7) });
  return dmy(iso);
}
function dayLabel(iso) {
  const d = String(iso || "").slice(0, 10);
  const today = todayStr();
  if (d === today) return T("Today");
  if (d === addDaysStr(today, -1)) return T("Yesterday");
  return dmy(d);
}
// Same as dayLabel, lower-case for use mid-sentence ("was due yesterday").
function dayWord(iso) {
  const d = String(iso || "").slice(0, 10);
  const today = todayStr();
  if (d === today) return T("today");
  if (d === addDaysStr(today, -1)) return T("yesterday");
  if (d === addDaysStr(today, 1)) return T("tomorrow");
  return dmy(d);
}
// Show money with thousands separators while typing; store digits only.
const moneyIn = (v) => { const d = String(v ?? "").replace(/[^\d]/g, ""); return d ? Number(d).toLocaleString("en-US") : ""; };
const moneyOut = (v) => String(v ?? "").replace(/[^\d]/g, "");
function etb(v) {
  const n = Number(String(v || "").replace(/[^\d.]/g, ""));
  return n ? `${n.toLocaleString()} ${T("ETB")}` : "";
}
function waLink(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("0")) d = "251" + d.slice(1);
  return `https://wa.me/${d}`;
}

// Countries the team works with (from Settings) first, then the standard list.
let CUSTOM_DEST = [];
function destinations() {
  const seen = new Set(); const out = [];
  [...CUSTOM_DEST, ...COUNTRIES].forEach((c) => { const k = String(c || "").trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); } });
  return out;
}
// Every country, for the "add a country" suggestions in Settings.
const WORLD_COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo","Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic","Dubai (UAE)","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hong Kong","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kosovo","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","UK","Ukraine","United Arab Emirates","Uruguay","USA","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];

/* ---------- Branded date picker (replaces the browser's own calendar) ---------- */
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function DateInput({ value, onChange, min, max, placeholder, clearable, compact, ariaLabel }) {
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const today = todayStr();
  const viewOf = (s) => { const e = toEth(s); return { y: e.y, m: e.m }; };
  const [view, setView] = useState(() => viewOf(value || today));
  const [focus, setFocus] = useState(value || today);
  function show() {
    setView(viewOf(value || today)); setFocus(value || today);
    const r = btn.current.getBoundingClientRect();
    const W = 300, H = 352, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - W - 8));
    const top = r.bottom + 8 + H > vh && r.top - H - 8 > 0 ? r.top - H - 8 : Math.min(r.bottom + 8, Math.max(8, vh - H - 8));
    setPos({ left, top }); setOpen(true);
  }
  const ok = (d) => (!min || d >= min) && (!max || d <= max);
  const pickDay = (d) => { if (!ok(d)) return; onChange(d); setOpen(false); setTimeout(() => btn.current?.focus(), 0); };
  // The grid shows one Ethiopian month (30 days, or 5/6 for Pagume), Monday first.
  const first = fromEth(view.y, view.m, 1);
  const startOffset = (toDate(first).getDay() + 6) % 7;
  const cells = Math.ceil((startOffset + ethMonthDays(view.y, view.m)) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => { const d = addDaysStr(first, i - startOffset); const e = toEth(d); return { d, n: e.d, out: e.m !== view.m }; });
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((w) => { const n = (LANG === "am" ? WEEKDAYS_AM : WEEKDAYS_EN)[w]; return LANG === "am" ? n.slice(0, 2) : n.slice(0, 2); });
  const title = LANG === "am" ? `${ethMonth(view.m)} ${view.y} ዓ.ም.` : `${ethMonth(view.m)} ${view.y} E.C.`;
  const move = (n) => setView((v) => { let m = v.m + n, y = v.y; if (m < 1) { m = 13; y--; } if (m > 13) { m = 1; y++; } return { y, m }; });
  function onKey(e) {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step) { e.preventDefault(); const nd = addDaysStr(focus, step); setFocus(nd); setView(viewOf(nd)); }
    else if (e.key === "Enter") { e.preventDefault(); pickDay(focus); }
    else if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
  }
  return (
    <>
      <button type="button" ref={btn} className={`dinput ${compact ? "sm" : ""} ${open ? "on" : ""}`} onClick={() => (open ? setOpen(false) : show())} aria-haspopup="dialog" aria-expanded={open} aria-label={ariaLabel}>
        <Icon name="cal" /><span className={value ? "" : "ph"}>{value ? dmy(value) : (placeholder || T("Pick a date"))}</span>
      </button>
      {open && pos && createPortal(
        <div className={`dp-layer ${LANG === "am" ? "am" : ""}`}>
          <div className="dp-bg" onClick={() => setOpen(false)} />
          <div className="dpop" style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={T("Pick a date")} tabIndex={-1} onKeyDown={onKey} ref={(el) => el && !el.contains(document.activeElement) && el.focus()}>
            <div className="dp-h">
              <button type="button" className="dp-nav" onClick={() => move(-1)} aria-label={T("Previous month")}><Icon name="back" /></button>
              <b>{title}</b>
              <button type="button" className="dp-nav" onClick={() => move(1)} aria-label={T("Next month")}><Icon name="right" /></button>
            </div>
            <div className="dp-w">{weekdays.map((w, i) => <span key={i}>{w}</span>)}</div>
            <div className="dp-g">
              {days.map((x) => (
                <button type="button" key={x.d} disabled={!ok(x.d)} onClick={() => pickDay(x.d)}
                  className={`dp-d ${x.out ? "out" : ""} ${x.d === today ? "today" : ""} ${x.d === value ? "sel" : ""} ${x.d === focus ? "foc" : ""}`}>{x.n}</button>
              ))}
            </div>
            <div className="dp-f">
              <button type="button" className="dp-link" disabled={!ok(today)} onClick={() => pickDay(today)}>{T("Today")}</button>
              {clearable && value && <button type="button" className="dp-link mute" onClick={() => { onChange(""); setOpen(false); }}>{T("Clear")}</button>}
            </div>
          </div>
        </div>, document.body
      )}
    </>
  );
}

/* ---------- Searchable dropdown that also accepts free text ---------- */
function ComboBox({ value, onChange, onPick, options, placeholder, label, exclude, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef(null);
  const q = (value || "").trim().toLowerCase();
  const ex = new Set((exclude || []).map((x) => x.toLowerCase()));
  const shown = (() => {
    const pool = options.filter((o) => !ex.has(o.toLowerCase()));
    if (!q) return pool;
    const name = (o) => `${o} ${AM[o] || ""}`.toLowerCase();
    const starts = pool.filter((o) => o.toLowerCase().startsWith(q) || (AM[o] || "").startsWith(value.trim()));
    const has = pool.filter((o) => !starts.includes(o) && name(o).includes(q));
    return [...starts, ...has];
  })();
  const exact = shown.some((o) => o.toLowerCase() === q);
  const rows = [...shown.map((o) => ({ k: o, label: o })), ...(q && !exact && !ex.has(q) ? [{ k: "__free", label: value.trim(), free: true }] : [])];
  useEffect(() => { setHi(0); }, [value]);
  useEffect(() => { const el = listRef.current?.querySelector(".cb-o.hi"); el?.scrollIntoView({ block: "nearest" }); }, [hi, open]);
  const choose = (row) => { if (!row) return; onChange(row.label); setOpen(false); onPick && onPick(row.label); };
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (open && rows[hi]) choose(rows[hi]); else if (value.trim()) { setOpen(false); onPick && onPick(value.trim()); } }
    else if (e.key === "Escape") setOpen(false);
  }
  return (
    <div className={`cb ${open ? "open" : ""}`}>
      <div className="cb-in">
        <Icon name="search" />
        <input value={value} autoFocus={autoFocus} placeholder={placeholder} aria-label={label} role="combobox" aria-expanded={open} aria-autocomplete="list"
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onKeyDown={onKey} />
        <button type="button" className="cb-t" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { const inp = e.currentTarget.parentNode.querySelector("input"); if (open) setOpen(false); else { inp?.focus(); setOpen(true); } }} aria-label={label}><Icon name="down" /></button>
      </div>
      {open && (
        <>
          <div className="cb-list" role="listbox" ref={listRef}>
            {rows.length === 0 && <div className="cb-empty">{T("Already in your list")}</div>}
            {rows.map((r, i) => (
              <button type="button" key={r.k} role="option" aria-selected={i === hi} className={`cb-o ${i === hi ? "hi" : ""} ${r.free ? "free" : ""}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                {r.free ? <><Icon name="plus" /><span>{T("Add “{c}”", { c: r.label })}</span></> : <><span className="cb-n">{LANG === "am" && AM[r.label] ? AM[r.label] : r.label}</span>{LANG === "am" && AM[r.label] && <span className="cb-s">{r.label}</span>}</>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PageHead({ title, sub, children }) {
  return (
    <header className="ph">
      <div className="ph-t"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="ph-a">{children}</div>}
    </header>
  );
}
// Large, clearly visible pill tabs with counts
function Tabs({ items, value, onChange, small }) {
  return (
    <div className={`ptabs ${small ? "sm" : ""}`} role="tablist">
      {items.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={`ptab ${value === t.key ? "on" : ""} ${t.tone ? "t-" + t.tone : ""}`} onClick={() => onChange(t.key)} title={t.hint || ""}>
          {t.dot && <i className="ptab-dot" style={{ background: t.dot }} />}
          <span>{t.label}</span>
          {t.count != null && <em>{t.count}</em>}
        </button>
      ))}
    </div>
  );
}
function Segmented({ items, value, onChange }) {
  return (
    <div className="segc">
      {items.map(([k, l]) => <button key={k} className={value === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}
    </div>
  );
}
function SelectChip({ label, value, onChange, options }) {
  const cur = options.find((o) => o[0] === value);
  return (
    <label className={`selchip ${value ? "set" : ""}`}>
      <span>{cur ? cur[1] : label}</span>
      <Icon name="down" />
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{T("Any {x}", { x: label.toLowerCase() })}</option>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}
function Check({ on, label, sub, onClick }) {
  return (
    <button className={`chk ${on ? "done" : ""}`} onClick={onClick} role="checkbox" aria-checked={!!on}>
      <span className="chk-box"><Icon name="check" /></span>
      <span className="chk-t">{label}{sub && <i>{sub}</i>}</span>
    </button>
  );
}
function LangSwitch({ lang, setLang, dark }) {
  return (
    <div className={`lang ${dark ? "dark" : ""}`} role="group" aria-label="Language">
      <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
      <button type="button" className={lang === "am" ? "on" : ""} onClick={() => setLang("am")}>አማ</button>
    </div>
  );
}

/* ============================================================
   QUICK SEARCH (Ctrl/Cmd + K)
   ============================================================ */
function Palette({ open, onClose, students, leads, go, amPartner }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);
  if (!open) return null;
  const t = q.trim().toLowerCase();
  const actions = [
    { key: "a1", label: T("New case"), kind: T("Action"), icon: "plus", run: () => go({ view: "new" }) },
    { key: "a2", label: T("New lead"), kind: T("Action"), icon: "phone", run: () => go({ view: "lead-new" }) },
    { key: "a3", label: T("Go to home"), kind: T("Page"), icon: "dash", run: () => go({ view: "dash" }) },
    { key: "a4", label: T("Go to leads"), kind: T("Page"), icon: "phone", run: () => go({ view: "leads" }) },
    { key: "a5", label: T("Go to students"), kind: T("Page"), icon: "users", run: () => go({ view: "students" }) },
    ...(amPartner ? [{ key: "a6", label: T("Go to settings"), kind: T("Page"), icon: "gear", run: () => go({ view: "settings" }) }] : []),
  ];
  const match = (...v) => !t || v.some((x) => (x || "").toLowerCase().includes(t));
  const st = students.filter((s) => match(s.fullName, s.id, s.strategy?.country)).slice(0, t ? 7 : 4)
    .map((s) => ({ key: s.id, label: s.fullName || s.id, kind: T("Student"), sub: s.id, av: s.fullName, run: () => go({ student: s.id }) }));
  const ld = leads.filter((l) => match(l.name, l.code, l.phone)).slice(0, t ? 5 : 3)
    .map((l) => ({ key: l.id, label: l.name || l.code, kind: T("Lead"), sub: l.code, av: l.name, run: () => go({ lead: l.id }) }));
  const acts = actions.filter((a) => match(a.label));
  const items = t ? [...st, ...ld, ...acts] : [...acts, ...st, ...ld];
  const pick = (it) => { if (it) { it.run(); onClose(); } };
  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[i]); }
    else if (e.key === "Escape") onClose();
  };
  return (
    <div className="pal-wrap" onMouseDown={onClose}>
      <div className="pal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-in"><Icon name="search" /><input autoFocus value={q} placeholder={T("Search students, leads, or type a command")} onChange={(e) => { setQ(e.target.value); setI(0); }} onKeyDown={onKey} /><button className="ib" onClick={onClose} aria-label={T("Close")}><Icon name="close" /></button></div>
        <div className="pal-list">
          {items.length === 0 && <p className="pal-empty">{T("Nothing matches “{q}”.", { q })}</p>}
          {items.map((it, k) => (
            <button key={it.key} className={`pal-it ${k === i ? "on" : ""}`} onMouseEnter={() => setI(k)} onClick={() => pick(it)}>
              {it.av ? <Avatar name={it.av} size={26} /> : <span className="pal-ic"><Icon name={it.icon} /></span>}
              <span className="pal-l">{it.label}</span>
              {it.sub && <span className="pal-sub">{it.sub}</span>}
              <span className="pal-k">{it.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
/* ============================================================
   APP SHELL
   ============================================================ */
const K_LANG = "yim:lang";
function readLangLocal() { try { return localStorage.getItem(K_LANG); } catch { return null; } }
function writeLangLocal(v) { try { localStorage.setItem(K_LANG, v); } catch {} }

// Make sure saved logins are usable: every user has a username and password, and the two
// partner accounts exist (older saves sometimes lacked them, which locked everyone out).
function healUsers(list) {
  let u = Array.isArray(list) ? list.filter((x) => x && typeof x === "object") : [];
  if (!u.length) return seedUsers();
  let changed = u.length !== (list || []).length;
  const seeds = seedUsers();
  u = u.map((x) => {
    const seed = seeds.find((s) => s.username === String(x.username || "").trim().toLowerCase());
    if (!x.username || typeof x.pw !== "string" || !x.pw.trim() || !x.id) {
      changed = true;
      return { ...x, id: x.id || uid(), username: x.username || (seed ? seed.username : String(x.fullName || "user").split(" ")[0].toLowerCase()), pw: (typeof x.pw === "string" && x.pw.trim()) ? x.pw : seed ? seed.pw : randomPw(), role: x.role || "staff" };
    }
    return x;
  });
  seeds.forEach((s) => {
    if (!u.some((x) => String(x.username).toLowerCase() === s.username)) { u.push(s); changed = true; }
  });
  return changed ? u : list;
}

export default function App() {
  const [lang, setLangState] = useState(() => (readLangLocal() === "am" ? "am" : "en"));
  LANG = lang; // every T() call in this render uses the chosen language
  const [students, setStudents] = useState({});
  const [leads, setLeads] = useState({});
  const [settings, setSettings] = useState(defaultSettings());
  const [users, setUsers] = useState([]);
  const [meId, setMeId] = useState(null);
  const [view, setView] = useState("dash");
  const [selId, setSelId] = useState(null);
  const [selLead, setSelLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storeOk, setStoreOk] = useState(true);
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [fRisk, setFRisk] = useState("");
  const [fFunding, setFFunding] = useState("");
  const [fPackage, setFPackage] = useState("");
  const [fOfficer, setFOfficer] = useState("");
  const [fArchived, setFArchived] = useState(false);
  const [fNeeds, setFNeeds] = useState(false);
  const [toast, setToast] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [palette, setPalette] = useState(false);

  CUSTOM_DEST = (settings.countries || []).map((c) => c.name);
  const me = users.find((u) => u.id === meId) || null;
  const amPartner = isPartnerRole(me?.role);

  const toastT = useRef(null);
  const flash = (m) => {
    setToast(m); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 2600);
  };
  function setLang(v) {
    setLangState(v); writeLangLocal(v);
    if (typeof window.storage !== "undefined") sSet(K_LANG, v, false);
  }

  // Phones: make sure the page is laid out at device width (the artifact page may not set this itself).
  useEffect(() => {
    try {
      let m = document.querySelector('meta[name="viewport"]');
      if (!m) { m = document.createElement("meta"); m.name = "viewport"; document.head.appendChild(m); }
      m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    } catch {}
  }, []);
  useEffect(() => { try { document.documentElement.lang = lang === "am" ? "am" : "en"; } catch {} }, [lang]);

  /* ---- load ---- */
  useEffect(() => {
    (async () => {
      const savedLang = await sGet(K_LANG, false);
      if (savedLang === "am" || savedLang === "en") { setLangState(savedLang); writeLangLocal(savedLang); }
      let u = null;
      const rawUsers = await sGet(K_USERS, true);
      if (rawUsers) { try { u = JSON.parse(rawUsers); } catch {} }
      const healed = healUsers(u);
      if (healed !== u) { u = healed; await sSet(K_USERS, JSON.stringify(u), true); }
      setUsers(u); setAuthReady(true);
      const rawSess = await sGet(K_SESSION, false);
      if (rawSess) { try { const j = JSON.parse(rawSess); if (j.userId && u.some((x) => x.id === j.userId)) setMeId(j.userId); } catch {} }

      let stuMap = null, leadMap = null;
      const raw = await sGet(K_STUDENTS, true);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          stuMap = {};
          Object.entries(parsed).forEach(([id, s]) => { stuMap[id] = migrateStudent(s); });
        } catch {}
      }
      const rawLeads = await sGet(K_LEADS, true);
      if (rawLeads) { try { leadMap = JSON.parse(rawLeads); } catch {} }

      // DO NOT SEED FAKE DATA: Start clean with empty objects if no database records exist
      if (!stuMap) stuMap = {};
      if (!leadMap) leadMap = {};

      setStudents(stuMap); setLeads(leadMap);
      const rawSet = await sGet(K_SETTINGS, true);
      if (rawSet) { try { setSettings(tidySettings({ ...defaultSettings(), ...JSON.parse(rawSet) })); } catch {} }
      setLoading(false);
    })();
  }, []);

  // Real-time listener for Firestore changes
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const unsubStudents = subscribeToStudents((fresh) => {
      if (fresh) {
        const migrated = {};
        Object.entries(fresh).forEach(([id, s]) => { migrated[id] = migrateStudent(s); });
        setStudents(migrated);
      }
    });
    const unsubLeads = subscribeToLeads((fresh) => {
      if (fresh) {
        setLeads(fresh);
      }
    });
    return () => {
      if (unsubStudents) unsubStudents();
      if (unsubLeads) unsubLeads();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---- auth ---- */
  async function login(username, pw) {
    const uname = String(username || "").trim().toLowerCase().replace(/^@/, "");
    const pass = String(pw || "").trim();
    let list = users;
    const raw = await sGet(K_USERS, true);
    if (raw) { try { const fresh = healUsers(JSON.parse(raw)); if (fresh.length) { list = fresh; setUsers(fresh); } } catch {} }
    const u = list.find((x) => String(x.username || "").trim().toLowerCase() === uname && x.active !== false);
    if (!u || String(u.pw || "").trim() !== pass) return false;
    setMeId(u.id);
    await sSet(K_SESSION, JSON.stringify({ userId: u.id, at: nowISO() }), false);
    return true;
  }
  async function logout() {
    setMeId(null); setView("dash"); setSelId(null);
    await sSet(K_SESSION, JSON.stringify({}), false);
  }
  async function saveUsers(next, msg) {
    setUsers(next); await sSet(K_USERS, JSON.stringify(next), true); if (msg) flash(msg);
  }
  function addUser(data) {
    const u = { id: uid(), active: true, ...data };
    saveUsers([...users, u], T("Login created for {n}", { n: u.fullName || u.username }));
  }
  function updateUser(id, fields, msg) { saveUsers(users.map((u) => u.id === id ? { ...u, ...fields } : u), msg); }
  function removeUser(id) { saveUsers(users.filter((u) => u.id !== id), T("Login removed")); }

  /* ---- persistence ---- */
  async function persist(next, msg) {
    setStudents(next);
    await sSet(K_STUDENTS, JSON.stringify(next), true);
    if (msg) flash(msg);
  }
  async function saveStudent(stu, msg) {
    const latestRaw = await sGet(K_STUDENTS, true);
    let latest = students;
    if (latestRaw) { try { latest = JSON.parse(latestRaw); } catch {} }
    const merged = { ...latest, [stu.id]: { ...stu, updatedAt: nowISO() } };
    await persist(merged, msg);
    syncStudentToGoogleSheets(merged[stu.id]);
  }
  async function removeStudent(id) {
    if (isFirebaseConfigured()) {
      await deleteStudentFromFirestore(id);
    }
    const latestRaw = await sGet(K_STUDENTS, true);
    let latest = students;
    if (latestRaw) { try { latest = JSON.parse(latestRaw); } catch {} }
    const stuToDelete = latest[id];
    const merged = { ...latest }; delete merged[id];
    await persist(merged, T("Case deleted"));
    if (stuToDelete) {
      deleteStudentFromGoogleSheets(stuToDelete.id);
    }
    setSelId(null); setView("students");
  }
  async function saveLead(lead, msg) {
    const latestRaw = await sGet(K_LEADS, true);
    let latest = leads;
    if (latestRaw) { try { latest = JSON.parse(latestRaw); } catch {} }
    const merged = { ...latest, [lead.id]: { ...lead, updatedAt: nowISO() } };
    setLeads(merged); await sSet(K_LEADS, JSON.stringify(merged), true); if (msg) flash(msg);
    syncLeadToGoogleSheets(merged[lead.id]);
  }
  async function removeLead(id, msg) {
    if (isFirebaseConfigured()) {
      await deleteLeadFromFirestore(id);
    }
    const latestRaw = await sGet(K_LEADS, true);
    let latest = leads;
    if (latestRaw) { try { latest = JSON.parse(latestRaw); } catch {} }
    const leadToDelete = latest[id];
    const merged = { ...latest }; delete merged[id];
    setLeads(merged); await sSet(K_LEADS, JSON.stringify(merged), true); if (msg) flash(msg);
    if (leadToDelete) {
      deleteLeadFromGoogleSheets(leadToDelete.code || leadToDelete.id);
    }
  }
  function createLead(data) {
    const id = uid(), code = nextLeadCode(leads);
    saveLead({ ...blankLead(id, code), ...data }, T("Lead {c} added", { c: code }));
    return id;
  }
  async function convertLead(lead) {
    const id = nextCaseId(students);
    const stu = {
      ...blankStudent(id), fullName: lead.name, phone: lead.phone, source: lead.source,
      targetCountries: lead.interestCountry ? [lead.interestCountry] : [],
      packageType: lead.interestPackage || "", officer: me?.fullName || "",
      education: lead.education || "", intendedIntake: lead.intake || "",
      strategy: { country: lead.interestCountry || "", university: "", program: "", admissionRoute: "", funding: "", visaRoute: "" },
    };
    const withNote = addNote(stu, `Converted from lead ${lead.code}`, "stage");
    await saveStudent(withNote);
    await saveLead({ ...lead, status: "converted", convertedCaseId: id }, T("{n} registered as {id}", { n: lead.name || T("Lead"), id }));
    setSelId(id); setView("detail");
  }
  async function saveSettings(next, msg) {
    setSettings(next); await sSet(K_SETTINGS, JSON.stringify(next), true); if (msg) flash(msg);
  }

  const list = useMemo(() => Object.values(students).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")), [students]);
  const sel = selId ? students[selId] : null;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((x) => {
      if (!fArchived && x.archived) return false;
      if (fArchived && !x.archived) return false;
      if (fStage && x.stage !== fStage) return false;
      if (fRisk && x.risk !== fRisk) return false;
      if (fFunding && x.sponsorType !== fFunding) return false;
      if (fPackage && x.packageType !== fPackage) return false;
      if (fOfficer && x.officer !== fOfficer) return false;
      if (fNeeds && !["warn", "bad"].includes(nextAction(x).tone)) return false;
      if (s && !((x.fullName || "").toLowerCase().includes(s) || x.id.toLowerCase().includes(s) ||
        (x.strategy?.country || "").toLowerCase().includes(s) || (x.targetCountries || []).join(" ").toLowerCase().includes(s))) return false;
      return true;
    });
  }, [list, q, fStage, fRisk, fFunding, fPackage, fOfficer, fArchived, fNeeds, lang]);
  const activeCount = useMemo(() => list.filter((x) => !x.archived).length, [list]);
  const leadList = useMemo(() => Object.values(leads).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")), [leads]);

  function addNote(stu, text, kind) {
    const note = { id: uid(), ts: nowISO(), author: me?.fullName || "—", text, kind: kind || "note" };
    return { ...stu, notes: [note, ...(stu.notes || [])] };
  }
  function moveStage(stu, key) {
    if (stu.stage === key) return;
    if (STAGE_INDEX[key] > STAGE_INDEX["registration"] && !(stu.payments?.registration?.paid)) {
      flash(T("Record the registration fee before moving this case on."));
      return;
    }
    const from = STAGES[STAGE_INDEX[stu.stage]]?.label;
    const to = STAGES[STAGE_INDEX[key]]?.label;
    const withNote = addNote({ ...stu, stage: key }, `Moved from ${from} to ${to}`, "stage");
    saveStudent(withNote, T("Moved to {s}", { s: T(to) }));
  }
  function createStudent(data) {
    const id = nextCaseId(students);
    const stu = { ...blankStudent(id), ...data, officer: data.officer || me?.fullName || "" };
    const withNote = addNote(stu, "Case created", "stage");
    saveStudent(withNote, T("Case {id} created", { id }));
    setSelId(id); setView("detail");
  }
  function go(t) {
    if (t.student) { setSelId(t.student); setView("detail"); }
    else if (t.lead) { setSelLead(t.lead); setView("leads"); }
    else { setView(t.view); if (t.view !== "detail") setSelId(null); }
    setPalette(false);
    try { window.scrollTo(0, 0); } catch {}
  }

  const leadDue = leadList.filter((l) => l.status === "open" && ["today", "overdue"].includes(leadBucket(l, todayStr()))).length;
  const nav = [
    { v: "dash", label: T("Home"), icon: "dash" },
    { v: "leads", label: T("Leads"), icon: "phone", count: leadDue, hot: true },
    { v: "students", label: T("Students"), icon: "users", count: activeCount },
    { v: "reports", label: T("Reports"), icon: "chart" },
  ];
  if (amPartner) nav.push({ v: "settings", label: T("Settings"), icon: "gear" });
  const isOn = (v) => view === v || (v === "students" && (view === "detail" || view === "new")) || (v === "leads" && view === "lead-new");
  const titles = { dash: T("Home"), leads: T("Leads"), "lead-new": T("New lead"), students: T("Students"), detail: T("Student"), new: T("New case"), settings: T("Settings"), reports: T("Reports") };

  const shellCls = `app ${lang === "am" ? "am" : ""}`;
  if (!authReady) {
    return (<div className={`${shellCls} center`}><FontStyles /><div className="loading"><span className="spin" />{T("Loading")}</div></div>);
  }
  if (!meId) {
    return (<div className={`${shellCls} center`}><FontStyles /><Login onLogin={login} lang={lang} setLang={setLang} /></div>);
  }

  return (
    <div className={shellCls}>
      <FontStyles />
      <aside className="side">
        <div className="side-brand">
          <img className="logo-full" src={LOGO_FULL} alt="Yimaru Consulting" />
          <img className="logo-mark" src={LOGO_MARK} alt="Yimaru Consulting" />
        </div>
        <button className="side-search" onClick={() => setPalette(true)} title={T("Search")}>
          <Icon name="search" /><span>{T("Search")}</span><kbd>Ctrl K</kbd>
        </button>
        <nav className="side-nav">
          {nav.map((n) => (
            <button key={n.v} className={`sn ${isOn(n.v) ? "on" : ""}`} onClick={() => go({ view: n.v })} title={n.label}>
              <Icon name={n.icon} /><span>{n.label}</span>
              {!!n.count && <em className={n.hot ? "hot" : ""}>{n.count}</em>}
            </button>
          ))}
        </nav>
        <div className="side-create">
          <button className="sc-btn y" onClick={() => go({ view: "new" })} title={T("New case")}><Icon name="plus" /><span>{T("New case")}</span></button>
          <button className="sc-btn" onClick={() => go({ view: "lead-new" })} title={T("New lead")}><Icon name="phone" /><span>{T("New lead")}</span></button>
        </div>
        <div className="side-foot">
          <LangSwitch lang={lang} setLang={setLang} dark />
          <div className="side-me">
            <Avatar name={me?.fullName} size={32} />
            <span className="side-me-t"><b>{me?.fullName}</b><i>{T(ROLE_LABEL[me?.role] || "")}</i></span>
            <button className="ib" onClick={logout} title={T("Sign out")} aria-label={T("Sign out")}><Icon name="logout" /></button>
          </div>
        </div>
      </aside>

      <header className="mtop">
        <img src={LOGO_MARK} alt="Yimaru Consulting" />
        <span className="mtop-t">{titles[view] || ""}</span>
        <LangSwitch lang={lang} setLang={setLang} dark />
        <button className="ib" onClick={() => setPalette(true)} aria-label={T("Search")}><Icon name="search" /></button>
        <button className="ib" onClick={logout} aria-label={T("Sign out")}><Icon name="logout" /></button>
      </header>

      <main className="main">
        {!isFirebaseConfigured() && (
          <div className="banner" style={{ background: "#FFF3E0", color: "#B76E00", border: "1px solid #FFE0B2", borderRadius: "10px", padding: "10px 16px", marginBottom: "16px" }}>
            {T("Firestore is in local preview mode. Add your Firebase keys (VITE_FIREBASE_PROJECT_ID, etc.) in .env to connect to your live database.")}
          </div>
        )}
        {loading ? (
          <div className="loading"><span className="spin" />{T("Loading cases")}</div>
        ) : view === "dash" ? (
          <Dashboard list={list} leads={leadList} me={me} go={go} settings={settings}
            openStage={(k) => { setFStage(k); setFArchived(false); setFNeeds(false); go({ view: "students" }); }}
            openNeeds={() => { setFStage(""); setFNeeds(true); go({ view: "students" }); }} />
        ) : view === "leads" ? (
          <Leads leads={leadList} settings={settings} me={me?.fullName || ""} selId={selLead} setSel={setSelLead}
            onNew={() => go({ view: "lead-new" })} saveLead={saveLead} removeLead={removeLead} convertLead={convertLead}
            openCase={(id) => go({ student: id })} />
        ) : view === "lead-new" ? (
          <LeadForm onCancel={() => go({ view: "leads" })} onCreate={(d) => { const id = createLead(d); setSelLead(id); setView("leads"); }} />
        ) : view === "students" ? (
          <Students allList={list} users={users} q={q} setQ={setQ}
            fStage={fStage} setFStage={setFStage} fRisk={fRisk} setFRisk={setFRisk}
            fFunding={fFunding} setFFunding={setFFunding} fPackage={fPackage} setFPackage={setFPackage}
            fOfficer={fOfficer} setFOfficer={setFOfficer} fArchived={fArchived} setFArchived={setFArchived}
            fNeeds={fNeeds} setFNeeds={setFNeeds}
            open={(id) => go({ student: id })} newCase={() => go({ view: "new" })} />
        ) : view === "reports" ? (
          <Reports students={list} leads={leadList} me={me} partner={amPartner} settings={settings} flash={flash} />
        ) : view === "new" ? (
          <IntakeForm users={users} onCancel={() => go({ view: "students" })} onCreate={createStudent} />
        ) : view === "settings" && amPartner ? (
          <Settings settings={settings} saveSettings={saveSettings} users={users} meId={meId}
            addUser={addUser} updateUser={updateUser} removeUser={removeUser} />
        ) : view === "detail" && sel ? (
          <Detail stu={sel} users={users} settings={settings} save={saveStudent} move={moveStage} remove={removeStudent}
            addNote={addNote} back={() => go({ view: "students" })} />
        ) : (
          <div className="loading">{T("This page isn’t available.")}</div>
        )}
      </main>

      <nav className="mnav">
        {nav.map((n) => (
          <button key={n.v} className={isOn(n.v) ? "on" : ""} onClick={() => go({ view: n.v })}>
            <Icon name={n.icon} /><span>{n.label}</span>{n.hot && !!n.count && <em>{n.count}</em>}
          </button>
        ))}
        <button className="mnav-new" onClick={() => go({ view: "new" })}><Icon name="plus" /><span>{T("New")}</span></button>
      </nav>

      <Palette open={palette} onClose={() => setPalette(false)} students={list} leads={leadList} go={go} amPartner={amPartner} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
/* ============================================================
   HOME / DASHBOARD
   ============================================================ */
const STAGE_RAMP = STAGE_TONE.map((t) => t.bar);

function RankList({ rows, color, empty }) {
  if (!rows.length) return <p className="muted pad">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return (
    <div className="rank">
      {rows.map((r) => (
        <div key={r.key || r.label} className="rank-r">
          <span className="rank-l">{r.label}</span>
          <span className="rank-s">{r.sub || ""}</span>
          <span className="rank-bar"><i style={{ width: `${(r.n / max) * 100}%`, background: color }} /></span>
          <span className="rank-n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ list, leads, me, go, settings, openStage, openNeeds }) {
  const today = todayStr();
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState(addDaysStr(today, -30));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const RANGES = [["today", T("Today")], ["week", T("7 days")], ["month", T("30 days")], ["year", T("12 months")], ["all", T("All time")], ["custom", T("Custom")]];
  const lo = from <= to ? from : to, hi = from <= to ? to : from;
  const rangeLabel = range === "custom" ? T("from {a} to {b}", { a: dmy(lo), b: dmy(hi) })
    : { today: T("today"), week: T("in the last 7 days"), month: T("in the last 30 days"), year: T("in the last 12 months"), all: T("all time") }[range];
  const [start, end] = (() => {
    const d = new Date();
    if (range === "custom") { const e = new Date(hi + "T00:00:00"); e.setDate(e.getDate() + 1); return [new Date(lo + "T00:00:00").getTime(), e.getTime()]; }
    if (range === "today") { d.setHours(0, 0, 0, 0); return [d.getTime(), Infinity]; }
    if (range === "week") { d.setDate(d.getDate() - 7); return [d.getTime(), Infinity]; }
    if (range === "month") { d.setDate(d.getDate() - 30); return [d.getTime(), Infinity]; }
    if (range === "year") { d.setFullYear(d.getFullYear() - 1); return [d.getTime(), Infinity]; }
    return [0, Infinity];
  })();
  const inRange = (iso) => { if (!iso) return false; const t = new Date(iso).getTime(); return t >= start && t < end; };

  const active = list.filter((s) => !s.archived);
  const atQc = active.filter((s) => s.stage === "visafile" && !s.qcPassed);
  const atEmbassy = active.filter((s) => s.stage === "submitted");
  const regDue = active.filter((s) => s.stage === "registration" && !s.payments?.registration?.paid);
  const milestoneDue = [];
  active.forEach((s) => {
    const i = STAGE_INDEX[s.stage];
    if (i >= STAGE_INDEX.admission && !s.payments?.payment1?.paid) milestoneDue.push({ s, key: "payment1" });
    if (s.packageType === "p2" && i >= STAGE_INDEX.outcome && s.decision === "approved" && !s.payments?.payment2?.paid) milestoneDue.push({ s, key: "payment2" });
  });
  const dueTotal = regDue.reduce((a, s) => a + (Number(feeFor(settings, s, "registration")) || 0), 0)
    + milestoneDue.reduce((a, m) => a + (Number(feeFor(settings, m.s, m.key)) || 0), 0);

  const openLeads = leads.filter((l) => l.status === "open");
  const overdue = openLeads.filter((l) => leadBucket(l, today) === "overdue");
  const dueToday = openLeads.filter((l) => leadBucket(l, today) === "today");
  const enquiries = leads.filter((l) => range === "all" || inRange(l.createdAt));
  const newCases = active.filter((s) => range === "all" || inRange(s.createdAt)).length;

  const todo = [
    ...overdue.map((l) => ({ kind: "call", name: l.name, detail: T("Call {n}", { n: l.callAttempts + 1 }), tag: T("Late, {d}", { d: fmtDay(l.nextCallAt) }), urgent: true, on: () => go({ lead: l.id }) })),
    ...dueToday.map((l) => ({ kind: "call", name: l.name, detail: l.callAttempts === 0 ? T("First call") : T("Call {n}", { n: l.callAttempts + 1 }), tag: T("Today"), on: () => go({ lead: l.id }) })),
    ...regDue.map((s) => ({ kind: "money", name: s.fullName, detail: T("Registration fee"), tag: T("Blocks start"), urgent: true, on: () => go({ student: s.id }) })),
    ...milestoneDue.map(({ s, key }) => ({ kind: "money", name: s.fullName, detail: key === "payment1" ? T("Payment 1 (admission)") : T("Payment 2 (visa)"), tag: etb(feeFor(settings, s, key)) || T("Due"), on: () => go({ student: s.id }) })),
    ...atQc.map((s) => ({ kind: "file", name: s.fullName, detail: T("Visa file needs QC sign-off"), tag: T(s.strategy?.country || ""), on: () => go({ student: s.id }) })),
    ...atEmbassy.map((s) => ({ kind: "file", name: s.fullName, detail: T("Waiting on the embassy"), tag: T(s.strategy?.country || ""), on: () => go({ student: s.id }) })),
  ];
  const KIND = { call: T("Call"), money: T("Payment"), file: T("Visa file") };
  const shown = todo.filter((t) => kind === "all" || t.kind === kind);
  const visible = showAll ? shown : shown.slice(0, 8);

  const ctry = new Map();
  active.forEach((s) => { const c = s.strategy?.country || s.targetCountries?.[0] || "Not set"; ctry.set(c, (ctry.get(c) || 0) + 1); });
  const destRows = [...ctry.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([c, n]) => ({ key: c, label: T(c), n }));
  const src = new Map();
  enquiries.forEach((l) => { const k = l.source || "Unknown"; const e = src.get(k) || { n: 0, r: 0 }; e.n++; if (l.status === "converted") e.r++; src.set(k, e); });
  const srcRows = [...src.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ key: k, label: T(k), n: v.n, sub: v.r ? T("{n} registered", { n: v.r }) : "" }));

  const hour = new Date().getHours();
  const greet = hour < 12 ? T("Good morning") : hour < 17 ? T("Good afternoon") : T("Good evening");
  const first = (me?.fullName || "").split(" ")[0];
  const dateStr = ethLong(todayStr(), { weekday: true, year: true });

  const KPIS = [
    { key: "active", icon: "users", bg: "#E8DDF8", fg: "#3E2577", label: T("Active cases"), n: active.length, c: T("{n} opened {r}", { n: newCases, r: rangeLabel }), on: () => go({ view: "students" }) },
    { key: "enq", icon: "inbox", bg: "#CDF5EA", fg: "#0A4F3E", label: T("New enquiries"), n: enquiries.length, c: T("{n} registered so far", { n: enquiries.filter((l) => l.status === "converted").length }), on: () => go({ view: "leads" }) },
    { key: "calls", icon: "phone", bg: "#FFF0A8", fg: "#5C4300", label: T("Calls to make"), n: overdue.length + dueToday.length, c: overdue.length ? T("{n} overdue", { n: overdue.length }) : T("All on schedule"), warn: overdue.length > 0, on: () => go({ view: "leads" }) },
    { key: "pay", icon: "money", bg: "#F8DAF0", fg: "#6E1F60", label: T("Payments due"), n: regDue.length + milestoneDue.length, c: dueTotal ? T("{a} outstanding", { a: etb(dueTotal) }) : T("{a} registration, {b} milestone", { a: regDue.length, b: milestoneDue.length }), on: openNeeds },
  ];

  return (
    <div className="pg">
      <PageHead title={`${greet}${first ? `, ${first}` : ""}`} sub={dateStr}>
        <div className="rangebox">
          <Segmented items={RANGES} value={range} onChange={setRange} />
          {range === "custom" && (
            <div className="customr">
              <label><span>{T("From")}</span><DateInput compact value={from} max={to < today ? to : today} onChange={(v) => v && setFrom(v)} ariaLabel={T("From")} /></label>
              <label><span>{T("To")}</span><DateInput compact value={to} min={from} max={today} onChange={(v) => v && setTo(v)} ariaLabel={T("To")} /></label>
            </div>
          )}
        </div>
      </PageHead>

      <div className="kpis">
        {KPIS.map((k) => (
          <button key={k.key} className="kpi" style={{ background: k.bg, color: k.fg }} onClick={k.on}>
            <span className="kpi-t"><span className="kpi-l"><Icon name={k.icon === "inbox" ? "chat" : k.icon} />{k.label}</span><span className="kpi-go"><Icon name="arrowUR" /></span></span>
            <b>{k.n}</b>
            <span className={`kpi-c ${k.warn ? "warn" : ""}`}>{k.c}</span>
          </button>
        ))}
      </div>

      <div className="dgrid">
        <section className="panel">
          <div className="panel-h">
            <h2>{T("To do")}</h2><span className="cnt">{shown.length}</span>
            <div className="panel-x"><Segmented items={[["all", T("All")], ["call", T("Calls")], ["money", T("Payments")], ["file", T("Visa files")]]} value={kind} onChange={(k) => { setKind(k); setShowAll(false); }} /></div>
          </div>
          {visible.length === 0 ? (
            <div className="empty-s"><Icon name="check" /><p>{T("Nothing waiting here. New calls and payments will show up as they fall due.")}</p></div>
          ) : (
            <div className="tlist">
              {visible.map((x, i) => (
                <button key={i} className="trow" onClick={x.on}>
                  <span className={`ttype k-${x.kind}`} title={KIND[x.kind]}><Icon name={x.kind === "call" ? "phone" : x.kind === "money" ? "money" : "file"} /></span>
                  <span className="tmain"><b>{x.name || T("Unnamed")}</b><span>{x.detail}</span></span>
                  <span className={`tdue ${x.urgent ? "u" : ""}`}>{x.tag}</span>
                  <Icon name="right" />
                </button>
              ))}
            </div>
          )}
          {shown.length > 8 && <button className="more" onClick={() => setShowAll((v) => !v)}>{showAll ? T("Show fewer") : T("Show all {n}", { n: shown.length })}</button>}
        </section>

        <div className="dcol">
          <section className="panel">
            <div className="panel-h"><h2>{T("Pipeline")}</h2><span className="cnt">{active.length}</span></div>
            <div className="stack">
              {STAGES.map((s, i) => {
                const n = active.filter((x) => x.stage === s.key).length;
                return n ? <span key={s.key} style={{ flex: n, background: STAGE_RAMP[i] }} title={`${T(s.label)}: ${n}`} /> : null;
              })}
            </div>
            <div className="legend">
              {STAGES.map((s, i) => (
                <button key={s.key} className="lg" onClick={() => openStage(s.key)}>
                  <i style={{ background: STAGE_RAMP[i] }} /><span>{T(s.label)}</span><b>{active.filter((x) => x.stage === s.key).length}</b>
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-h"><h2>{T("Destinations")}</h2></div>
            <RankList rows={destRows} color="#A386E3" empty={T("No active students yet.")} />
          </section>
          <section className="panel">
            <div className="panel-h"><h2>{T("Where enquiries come from")}</h2></div>
            <RankList rows={srcRows} color="#22D3A6" empty={T("No enquiries {r}.", { r: rangeLabel })} />
          </section>
        </div>
      </div>
    </div>
  );
}
/* ============================================================
   STUDENTS
   ============================================================ */
function readPref(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } }
function writePref(k, v) { try { localStorage.setItem(k, v); } catch {} }

function Students({ allList, users, q, setQ, fStage, setFStage, fRisk, setFRisk, fFunding, setFFunding, fPackage, setFPackage, fOfficer, setFOfficer, fArchived, setFArchived, fNeeds, setFNeeds, open, newCase }) {
  const wide = typeof window !== "undefined" && window.innerWidth >= 1000;
  const [view, setViewS] = useState(() => readPref("yim:stuView", wide ? "board" : "list"));
  const setView = (v) => { setViewS(v); writePref("yim:stuView", v); };
  const [group, setGroup] = useState("none");
  const [sort, setSort] = useState("updated");
  const [more, setMore] = useState(false);
  const [openCols, setOpenCols] = useState({});
  const needs = (x) => ["warn", "bad"].includes(nextAction(x).tone);
  // One matcher, so the numbers on the cards always agree with what's listed.
  const matches = (x, { stage = true, need = true } = {}) => {
    if (!!x.archived !== !!fArchived) return false;
    if (stage && fStage && x.stage !== fStage) return false;
    if (fRisk && x.risk !== fRisk) return false;
    if (fFunding && x.sponsorType !== fFunding) return false;
    if (fPackage && x.packageType !== fPackage) return false;
    if (fOfficer && x.officer !== fOfficer) return false;
    if (need && fNeeds && !needs(x)) return false;
    const t = q.trim().toLowerCase();
    if (t && ![x.fullName, x.id, x.phone, x.strategy?.country, ...(x.targetCountries || [])].some((v) => String(v || "").toLowerCase().includes(t))) return false;
    return true;
  };
  const base = allList.filter((x) => matches(x, { stage: false }));
  const sorter = (a, b) => sort === "name" ? (a.fullName || "").localeCompare(b.fullName || "")
    : sort === "stage" ? (STAGE_INDEX[b.stage] - STAGE_INDEX[a.stage]) || (b.updatedAt || "").localeCompare(a.updatedAt || "")
    : (b.updatedAt || "").localeCompare(a.updatedAt || "");
  const rows = allList.filter((x) => matches(x)).sort(sorter);
  const needCount = allList.filter((x) => matches(x, { need: false }) && needs(x)).length;
  const officers = [...new Set([...(users || []).map((u) => u.fullName), ...allList.map((x) => x.officer).filter(Boolean)])];

  const cards = [
    { key: "", label: T("All students"), count: base.length, sub: fArchived ? T("Archived") : T("Active cases"), hero: true },
    ...STAGES.map((st, i) => ({ key: st.key, label: `${i + 1}. ${T(st.label)}`, count: base.filter((x) => x.stage === st.key).length, sub: T(STAGE_SHORT[i]), hint: T(st.hint), ...STAGE_TONE[i] })),
  ];
  const quick = [
    { key: "all", label: T("All"), on: !fNeeds && !fPackage && fFunding !== "scholarship" && !fArchived, onClick: () => { setFNeeds(false); setFPackage(""); setFFunding(""); setFArchived(false); } },
    { key: "need", label: T("Needs attention"), dot: "#F5C518", count: needCount, on: fNeeds, onClick: () => setFNeeds(!fNeeds) },
    { key: "p1", label: T("Package 1"), dot: "#6E9EEA", on: fPackage === "p1", onClick: () => setFPackage(fPackage === "p1" ? "" : "p1") },
    { key: "p2", label: T("Package 2"), dot: "#DB7FC6", on: fPackage === "p2", onClick: () => setFPackage(fPackage === "p2" ? "" : "p2") },
    { key: "sch", label: T("Scholarship"), dot: "#22D3A6", on: fFunding === "scholarship", onClick: () => setFFunding(fFunding === "scholarship" ? "" : "scholarship") },
    { key: "arc", label: T("Archived"), dot: "#3A2A36", on: fArchived, onClick: () => setFArchived(!fArchived) },
  ];
  const moreCount = (fRisk ? 1 : 0) + (fOfficer ? 1 : 0) + (fFunding && fFunding !== "scholarship" ? 1 : 0);
  const anyFilter = fNeeds || fPackage || fFunding || fRisk || fOfficer || fArchived || !!q.trim();
  const clearAll = () => { setQ(""); setFRisk(""); setFFunding(""); setFPackage(""); setFOfficer(""); setFArchived(false); setFNeeds(false); };

  const groups = (() => {
    if (view === "board" || group === "none") return [{ key: "_", label: "", items: rows }];
    const keyOf = (x) => group === "country" ? (x.strategy?.country || x.targetCountries?.[0] || "") : group === "officer" ? (x.officer || "") : (x.packageType || "");
    const labelOf = (k) => !k ? T("Not set") : group === "country" ? T(k) : group === "package" ? T(PACKAGE_LABEL[k]) : k;
    const m = new Map(); rows.forEach((x) => { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, items]) => ({ key: k || "_none", label: labelOf(k), items }));
  })();
  const cols = view === "board" ? STAGES.map((st, i) => ({ st, i, items: rows.filter((x) => x.stage === st.key) })).filter((c) => !fStage || c.st.key === fStage) : [];

  const Card = ({ x }) => {
    const i = STAGE_INDEX[x.stage] ?? 0; const tone = STAGE_TONE[i];
    const na = nextAction(x); const att = needs(x);
    const country = x.strategy?.country || x.targetCountries?.[0];
    return (
      <button className={`bcard ${x.archived ? "dim" : ""}`} style={{ "--cb": tone.bg, "--cf": tone.fg, "--c": tone.bar }} onClick={() => open(x.id)}>
        <span className="bc-top"><b>{x.fullName || T("Unnamed")}</b>{att && <span className="bc-att" title={T("Needs attention")}><Icon name="alert" /></span>}</span>
        <span className="bc-id">{x.id}</span>
        <span className="bc-dash">{STAGES.map((s2, j) => <i key={s2.key} className={j < i ? "d" : j === i ? "c" : ""} />)}</span>
        <span className="bc-next">{T(na.short || na.text, na)}</span>
        <span className="bc-foot">
          {x.officer ? <Avatar name={x.officer} size={26} /> : <span className="bc-noav" />}
          <span className="bc-ct">{country ? T(country) : T("No destination yet")}</span>
          <span className="bc-up">{ago(x.updatedAt)}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="pg">
      <PageHead title={T("Students")} sub={T("Every student moves through 7 steps, from registration to the visa decision.")}>
        <div className="sbox hs"><Icon name="search" /><input placeholder={T("Search students")} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="ib" onClick={() => setQ("")} aria-label={T("Clear search")}><Icon name="close" /></button>}</div>
        <Segmented items={[["board", T("Board")], ["list", T("List")]]} value={view} onChange={setView} />
        <button className="btn primary" onClick={newCase}><Icon name="plus" />{T("New case")}</button>
      </PageHead>

      <StatCards items={cards} value={fStage} onChange={(k) => setFStage(fStage === k && k ? "" : k)} cls="stage8" />

      <div className="tbar">
        <ChipBar items={quick} />
        <div className="fpop-w">
          <button className={`cchip ${moreCount ? "on" : ""}`} onClick={() => setMore((v) => !v)} aria-expanded={more}><Icon name="filter" /><span>{T("More filters")}</span>{moreCount > 0 && <em>{moreCount}</em>}</button>
          {more && (<>
            <div className="fpop-bg" onClick={() => setMore(false)} />
            <div className="fpop" role="dialog" aria-label={T("More filters")}>
              <div className="fpop-h"><b>{T("More filters")}</b><button className="ib" onClick={() => setMore(false)} aria-label={T("Close")}><Icon name="close" /></button></div>
              <Field label={T("Funding")}><select value={fFunding} onChange={(e) => setFFunding(e.target.value)}><option value="">{T("Any funding")}</option>{FUNDING.map((f) => <option key={f.key} value={f.key}>{T(f.label)}</option>)}</select></Field>
              <Field label={T("Risk")}><select value={fRisk} onChange={(e) => setFRisk(e.target.value)}><option value="">{T("Any risk")}</option>{Object.entries(RISK).map(([k, r]) => <option key={k} value={k}>{T(r.label)}</option>)}</select></Field>
              <Field label={T("Officer")}><select value={fOfficer} onChange={(e) => setFOfficer(e.target.value)}><option value="">{T("Anyone")}</option>{officers.map((o) => <option key={o} value={o}>{o}</option>)}</select></Field>
              <Field label={T("Sort")}><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">{T("Recently updated")}</option><option value="name">{T("Name (A–Z)")}</option><option value="stage">{T("Furthest along")}</option></select></Field>
              <div className="fpop-f"><button className="btn" onClick={() => { setFRisk(""); setFOfficer(""); if (fFunding !== "scholarship") setFFunding(""); }}>{T("Reset")}</button><button className="btn primary" onClick={() => setMore(false)}>{T("Show {n} students", { n: rows.length })}</button></div>
            </div>
          </>)}
        </div>
        {view === "list" && (
          <div className="grp"><span>{T("Group by")}</span><Segmented items={[["none", T("No grouping")], ["country", T("Destination")], ["officer", T("Officer")], ["package", T("Package")]]} value={group} onChange={setGroup} /></div>
        )}
      </div>

      {(fRisk || fOfficer || (fFunding && fFunding !== "scholarship")) && (
        <div className="chips">
          {fFunding && fFunding !== "scholarship" && <button className="chip" onClick={() => setFFunding("")}>{T(FUNDING_LABEL[fFunding])}<Icon name="close" /></button>}
          {fRisk && <button className="chip" onClick={() => setFRisk("")}>{T("Risk: {r}", { r: T(RISK[fRisk]?.label) })}<Icon name="close" /></button>}
          {fOfficer && <button className="chip" onClick={() => setFOfficer("")}>{fOfficer}<Icon name="close" /></button>}
          <button className="linkbtn" onClick={clearAll}>{T("Clear all")}</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty">
          <span className="empty-ic"><Icon name="users" /></span>
          <h3>{T("No students here")}</h3>
          <p>{anyFilter ? T("No student matches these filters. Remove one to see more.") : fStage ? T("No student is at this step right now.") : T("Create the first case, or register one from a lead.")}</p>
          {anyFilter ? <button className="btn" onClick={clearAll}>{T("Clear filters")}</button> : !fStage && <button className="btn primary" onClick={newCase}><Icon name="plus" />{T("New case")}</button>}
        </div>
      ) : view === "board" ? (
        <div className={`board ${fStage ? "one" : ""}`}>
          {cols.map(({ st, i, items }) => (
            <section key={st.key} className="bcol" style={{ "--c": STAGE_TONE[i].bar, "--cf": STAGE_TONE[i].fg }}>
              <header className="bcol-h"><span className="bcol-n">{i + 1}</span><b>{T(st.label)}</b><em>{items.length}</em></header>
              <p className="bcol-s">{T(STAGE_SHORT[i])}</p>
              <div className="bcol-b">
                {items.length === 0 ? <div className="bempty">{T("No one at this step")}</div> : (fStage || openCols[st.key] ? items : items.slice(0, 6)).map((x) => <Card key={x.id} x={x} />)}
                {!fStage && items.length > 6 && <button className="bmore" onClick={() => setOpenCols((o) => ({ ...o, [st.key]: !o[st.key] }))}>{openCols[st.key] ? T("Show fewer") : T("Show all {n}", { n: items.length })}</button>}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="lgroups">
          {groups.map((g) => (
            <section key={g.key} className="lgrp">
              {g.label && <h3 className="ldg-h"><span>{g.label}</span><em>{g.items.length}</em></h3>}
              <div className="slist" role="list">
                {g.items.map((x) => {
                  const i = STAGE_INDEX[x.stage] ?? 0; const tone = STAGE_TONE[i];
                  const na = nextAction(x); const att = needs(x);
                  const country = x.strategy?.country || x.targetCountries?.[0];
                  return (
                    <button key={x.id} className={`sl-r ${x.archived ? "dim" : ""}`} role="listitem" onClick={() => open(x.id)}>
                      <span className="sl-who"><Avatar name={x.fullName} size={40} /><span className="who-t"><b>{x.fullName || T("Unnamed")}</b><i>{x.id}</i></span></span>
                      <span className="sl-step"><span className="stp" style={{ background: tone.bg, color: tone.fg }}><i style={{ background: tone.bar }} />{i + 1}. {T(STAGES[i].label)}</span><Journey stu={x} /></span>
                      <span className={`sl-next ${att ? "att" : ""} t-${na.tone}`}>{att && <i className="dot" />}{T(na.short || na.text, na)}</span>
                      <span className="sl-ct">{country ? T(country) : <em className="nil">{T("Not set")}</em>}</span>
                      <span className="sl-of">{x.officer ? <Avatar name={x.officer} size={28} /> : null}</span>
                      <Icon name="right" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   NEW CASE (intake)
   ============================================================ */
function IntakeForm({ users, onCancel, onCreate }) {
  const officers = (users || []).map((u) => u.fullName);
  const [d, setD] = useState(blankStudent("draft"));
  const [err, setErr] = useState("");
  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const country = d.strategy?.country || "";
  function submit() {
    if (!d.fullName.trim()) { setErr(T("Add the student’s name to create the case.")); return; }
    const { id, createdAt, updatedAt, notes, ...rest } = d;
    onCreate(rest);
  }
  const txt = (k, label, ph) => <Field label={T(label)}><input value={d[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder={ph ? T(ph) : ""} /></Field>;
  return (
    <div className="pg narrow">
      <div className="crumb"><button onClick={onCancel}>{T("Students")}</button><Icon name="right" /><span>{T("New case")}</span></div>
      <PageHead title={T("New case")} sub={T("A case number is assigned when you create it. Only the name is required; fill in the rest as you learn it.")}>
        <button className="btn" onClick={onCancel}>{T("Cancel")}</button>
        <button className="btn primary" onClick={submit}><Icon name="check" />{T("Create case")}</button>
      </PageHead>
      {err && <p className="formerr"><Icon name="alert" />{err}</p>}

      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[0].bar }}>1</span><div><h2>{T("Contact")}</h2><p>{T("Who the student is and how to reach them.")}</p></div></div>
        <div className="grid3">
          <Field label={T("Full name")}><input value={d.fullName} autoFocus onChange={(e) => { set("fullName", e.target.value); setErr(""); }} placeholder="Kaleab Tesfaye" /></Field>
          {txt("phone", "Phone", "09…")}
          {txt("email", "Email")}
          <Field label={T("How they found us")}><select value={d.source} onChange={(e) => set("source", e.target.value)}><option value="">{T("Select…")}</option>{SOURCES.map((s) => <option key={s} value={s}>{T(s)}</option>)}</select></Field>
          <Field label={T("Officer")}><select value={d.officer} onChange={(e) => set("officer", e.target.value)}><option value="">{T("Me")}</option>{officers.map((o) => <option key={o}>{o}</option>)}</select></Field>
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[1].bar }}>2</span><div><h2>{T("Study plan")}</h2><p>{T("Where they want to go and which package they’re on.")}</p></div></div>
        <div className="grid3">
          <Field label={T("Destination")}><select value={country} onChange={(e) => { const v = e.target.value; setD((s) => ({ ...s, strategy: { ...s.strategy, country: v }, targetCountries: v ? [v] : [] })); }}><option value="">{T("Not sure yet")}</option>{destinations().map((c) => <option key={c} value={c}>{T(c)}</option>)}</select></Field>
          {txt("intendedIntake", "Intended intake", "e.g. Sept 2026")}
          {txt("studyLevel", "Study level sought", "Bachelor / Master / PhD")}
        </div>
        <div className="grid2 mt">
          <Field label={T("Package")}><div className="seg">{PACKAGES.map((p) => <button key={p.key} type="button" className={`segbtn ${d.packageType === p.key ? "on" : ""}`} onClick={() => set("packageType", d.packageType === p.key ? "" : p.key)}>{T(p.label)}</button>)}</div></Field>
          <Field label={T("Funding")}><div className="seg">{FUNDING.map((f) => <button key={f.key} type="button" className={`segbtn ${d.sponsorType === f.key ? "on" : ""}`} onClick={() => set("sponsorType", d.sponsorType === f.key ? "" : f.key)}>{T(f.label)}</button>)}</div></Field>
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[2].bar }}>3</span><div><h2>{T("Academic background")}</h2><p>{T("Used to judge which universities fit.")}</p></div></div>
        <div className="grid3">
          {txt("education", "Highest education", "e.g. BSc")}
          {txt("fieldOfStudy", "Field of study")}
          {txt("gpa", "GPA / grade")}
          {txt("graduationYear", "Graduation year")}
          {txt("englishProficiency", "English level", "IELTS 6.5 / none yet")}
          {txt("workExperience", "Work experience")}
        </div>
      </section>

      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[3].bar }}>4</span><div><h2>{T("Sponsor and visa history")}</h2><p>{T("What the embassy will look at most closely.")}</p></div></div>
        <div className="grid3">
          {txt("budget", "Budget", "e.g. 400,000 ETB")}
          {txt("sponsor", "Sponsor", "Self / parent / relative")}
          {txt("sponsorRelationship", "Sponsor relationship")}
          {txt("passportStatus", "Passport", "Valid / applying")}
          {txt("previousVisaHistory", "Previous visas")}
          {txt("previousRefusals", "Previous refusals", "None / country and year")}
        </div>
      </section>

      <div className="formfoot">
        <button className="btn" onClick={onCancel}>{T("Cancel")}</button>
        <button className="btn primary" onClick={submit}><Icon name="check" />{T("Create case")}</button>
      </div>
    </div>
  );
}
/* ============================================================
   STUDENT RECORD
   ============================================================ */
function nextAction(stu) {
  const pay = stu.payments || {};
  if (stu.archived) return { text: "This case is archived. Restore it to keep working on it.", short: "Archived", tone: "grey" };
  switch (stu.stage) {
    case "registration":
      return pay.registration?.paid
        ? { text: "Registration fee is recorded. Move the case to Assessment.", short: "Move to Assessment", tone: "ok" }
        : { text: "Collect the registration fee. Nothing else can start until it’s recorded.", short: "Collect the registration fee", tone: "warn" };
    case "assessment":
      return stu.risk ? { text: "Risk level is set. Agree the study plan next.", short: "Move to Onboarding", tone: "ok" } : { text: "Review the profile and set a risk level.", short: "Review the profile", tone: "todo" };
    case "onboarding":
      return stu.strategy?.university ? { text: "Study plan is in place. Start the university applications.", short: "Start applications", tone: "ok" } : { text: "Agree the study plan: destination, university and programme.", short: "Agree the study plan", tone: "todo" };
    case "admission": {
      const apps = stu.applications || [];
      const offer = apps.some((a) => a.status === "Offer" || a.status === "Enrolled");
      if (offer && !pay.payment1?.paid) return { text: "Offer received. Collect Payment 1, then start the visa file.", short: "Collect Payment 1", tone: "warn" };
      if (offer) return { text: "Offer received. Move on to the visa file.", short: "Start the visa file", tone: "ok" };
      if (!apps.length) return { text: "Add the universities this student is applying to.", short: "Add universities", tone: "todo" };
      return apps.length === 1 ? { text: "Waiting on 1 application.", short: "Waiting on 1 university", tone: "todo" } : { text: "Waiting on {n} applications.", short: "Waiting on {n} universities", n: apps.length, tone: "todo" };
    }
    case "visafile": {
      const items = VISA_PRESETS[stu.visaCountry] || VISA_PRESETS.Default;
      const done = items.filter((i) => stu.visa?.[i]).length;
      return stu.qcPassed ? { text: "File is signed off. Book the visa appointment.", short: "Book the visa appointment", tone: "ok" } : { text: "{a} of {b} documents ready. Finish the file and get QC sign-off.", short: "Finish visa documents ({a}/{b})", a: done, b: items.length, tone: "todo" };
    }
    case "submitted":
      return stu.appointment?.submitted ? { text: "Lodged with the embassy. Waiting for a decision.", short: "Waiting for the embassy", tone: "todo" } : { text: "Book the appointment and lodge the file.", short: "Book appointment, lodge file", tone: "todo" };
    case "outcome":
      if (stu.decision === "approved") return stu.packageType === "p2" && !pay.payment2?.paid ? { text: "Visa approved. Collect Payment 2.", short: "Collect Payment 2", tone: "warn" } : { text: "Visa approved. Help with travel and arrival.", short: "Help with travel", tone: "ok" };
      if (stu.decision === "refused") return { text: "Visa refused. Review the reasons and decide whether to reapply.", short: "Decide whether to reapply", tone: "bad" };
      if (stu.decision === "additional") return { text: "The embassy asked for more documents. Send them and note it here.", short: "Send the extra documents", tone: "warn" };
      return { text: "Record the visa decision.", short: "Record the visa decision", tone: "todo" };
    default: return { text: "", tone: "todo" };
  }
}

// One-line summary shown on each step row, so the timeline reads at a glance.
function stepSummary(stu, key) {
  const pay = stu.payments || {};
  switch (key) {
    case "registration": {
      const r = pay.registration || {};
      return r.paid ? T("Paid {a} on {d}", { a: etb(r.amount) || "", d: r.date ? dmy(r.date) : "" }).replace(/\s+on\s*$/, "").replace(/\s+/g, " ") : T("Fee not recorded yet");
    }
    case "assessment": return stu.risk ? T("Risk: {r}", { r: T(RISK[stu.risk]?.label) }) : T("Risk level not set");
    case "onboarding": {
      const s = stu.strategy || {};
      const bits = [s.university, s.program].filter(Boolean);
      return bits.length ? bits.join(SEP()) : s.country ? T("Destination: {c}", { c: T(s.country) }) : T("No study plan yet");
    }
    case "admission": {
      const apps = stu.applications || [];
      if (!apps.length) return T("No applications yet");
      const offers = apps.filter((a) => a.status === "Offer" || a.status === "Enrolled").length;
      return `${T(apps.length === 1 ? "{n} application" : "{n} applications", { n: apps.length })}${SEP()}${T(offers === 1 ? "{o} offer" : "{o} offers", { o: offers })}`;
    }
    case "visafile": {
      const items = VISA_PRESETS[stu.visaCountry] || VISA_PRESETS.Default;
      const done = items.filter((i) => stu.visa?.[i]).length;
      return `${T("{a} of {b} documents", { a: done, b: items.length })}${SEP()}${stu.qcPassed ? T("QC passed") : T("QC not signed off")}`;
    }
    case "submitted": {
      const ap = stu.appointment || {};
      if (ap.submitted) return T("Lodged with the embassy");
      if (ap.date) return T("Appointment {d}", { d: dmy(ap.date) });
      return T("No appointment yet");
    }
    case "outcome": return stu.decision ? T(DECISION[stu.decision]?.label) : T("No decision yet");
    default: return "";
  }
}

function Detail({ stu, users, settings, save, move, remove, addNote, back }) {
  const patch = (fields, msg) => save({ ...stu, ...fields }, msg);
  const cur = STAGE_INDEX[stu.stage] ?? 0;
  const [tab, setTab] = useState("journey");
  const [openStep, setOpenStep] = useState(stu.stage);
  const [confirmDel, setConfirmDel] = useState(false);
  const [noteText, setNoteText] = useState("");
  useEffect(() => { setOpenStep(stu.stage); }, [stu.id, stu.stage]);
  useEffect(() => { setTab("journey"); setConfirmDel(false); }, [stu.id]);

  const regPaid = !!stu.payments?.registration?.paid;
  const prev = STAGES[cur - 1], next = STAGES[cur + 1];
  const blocked = !!next && !regPaid;
  const stuckOnFee = stu.stage === "registration" && !regPaid;
  const country = stu.strategy?.country || stu.targetCountries?.[0] || "";
  const pay = stu.payments || blankPayments();
  const pk = PACKAGES.find((p) => p.key === stu.packageType);
  const applicable = pk ? pk.pays : ["registration", "payment1", "payment2"];
  const na = nextAction(stu);
  const officers = (users || []).map((u) => u.fullName);
  if (stu.officer && !officers.includes(stu.officer)) officers.push(stu.officer);
  const wa = waLink(stu.phone);
  const end = stu.decision === "approved" ? "ok" : stu.decision === "refused" ? "no" : "";

  const body = (key) => {
    switch (key) {
      case "registration": return <RegistrationBlock stu={stu} patch={patch} settings={settings} />;
      case "assessment": return <AssessmentBlock stu={stu} patch={patch} />;
      case "onboarding": return <StudyPlanBlock stu={stu} patch={patch} />;
      case "admission": return <><ApplicationsBlock stu={stu} save={save} /><PaymentInline stu={stu} patch={patch} settings={settings} k="payment1" show={(stu.applications || []).some((a) => a.status === "Offer" || a.status === "Enrolled") || !!pay.payment1?.paid} /></>;
      case "visafile": return <><FinancialBlock stu={stu} patch={patch} /><VisaDocsBlock stu={stu} patch={patch} /><QcBlock stu={stu} patch={patch} /></>;
      case "submitted": return <><AppointmentBlock stu={stu} patch={patch} /><InterviewBlock stu={stu} patch={patch} /></>;
      case "outcome": return <DecisionBlock stu={stu} patch={patch} settings={settings} />;
      default: return null;
    }
  };

  return (
    <div className="pg rec">
      <div className="crumb"><button onClick={back}><Icon name="back" />{T("Students")}</button><Icon name="right" /><span>{stu.fullName || stu.id}</span></div>

      <header className="rec-h">
        <div className="rec-top">
          <Avatar name={stu.fullName} size={56} />
          <div className="rec-t">
            <h1>{stu.fullName || T("Unnamed student")}</h1>
            <div className="rec-meta">
              <span className="rec-id">{stu.id}</span>
              <StatusPill stu={stu} />
              {stu.archived && <Pill tone="grey">{T("Archived")}</Pill>}
              {country && <span className="rec-ct"><Icon name="globe" />{T(country)}</span>}
            </div>
          </div>
          <div className="rec-a">
            {stu.phone && <a className="btn ic-only" href={`tel:${stu.phone}`} aria-label={T("Call")}><Icon name="phone" /></a>}
            {wa && <a className="btn ic-only" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp"><Icon name="chat" /></a>}
            <button className="btn" onClick={() => patch({ archived: !stu.archived }, stu.archived ? T("Case restored") : T("Case archived"))}><Icon name="archive" /><span className="hide-s">{stu.archived ? T("Restore") : T("Archive")}</span></button>
            {next && <button className="btn primary" disabled={blocked} title={blocked ? T("Record the registration fee first") : ""} onClick={() => move(stu, next.key)}>{T("Move to {s}", { s: T(next.label) })}<Icon name="right" /></button>}
          </div>
        </div>
        <div className={`na-m na-${na.tone}`}><Icon name={na.tone === "ok" ? "check" : na.tone === "grey" ? "archive" : "flag"} /><span><b>{T("Next action")}</b>{T(na.text, na)}</span></div>
        <div className="rec-prog">
          <div className="rp-steps">
            {STAGES.map((s, i) => {
              const st = i < cur ? "d" : i === cur ? (stuckOnFee ? "b" : end || "c") : "";
              return (
                <button key={s.key} className={`rps ${st}`} style={{ "--c": STAGE_TONE[i].bar }} onClick={() => { setTab("journey"); setOpenStep(s.key); setTimeout(() => { try { document.getElementById("step-" + s.key)?.scrollIntoView({ behavior: "smooth", block: "start" }); } catch {} }, 30); }} title={T(s.hint)}>
                  <i />
                  <span>{T(s.label)}</span>
                </button>
              );
            })}
          </div>
          <span className="rp-cap">{T("Step {a} of {b}", { a: cur + 1, b: STAGES.length })}: <b>{T(STAGES[cur].label)}</b></span>
        </div>
      </header>

      <div className="rec-body">
        <div className="rec-main">
          <Tabs value={tab} onChange={setTab} items={[
            { key: "journey", label: T("Journey") },
            { key: "profile", label: T("Profile") },
            { key: "payments", label: T("Payments"), count: `${applicable.filter((k) => pay[k]?.paid).length}/${applicable.length}` },
            { key: "activity", label: T("Activity"), count: (stu.notes || []).length },
          ]} />

          {tab === "journey" && (
            <ol className="tl7">
              {STAGES.map((s, i) => {
                const state = i < cur ? "done" : i === cur ? "now" : "later";
                const isOpen = openStep === s.key;
                const tone = state === "done" ? "green" : state === "now" ? (stuckOnFee ? "amber" : "magenta") : "grey";
                const pillText = state === "done" ? T("Done") : state === "now" ? (stuckOnFee ? T("Waiting on fee") : T("Current step")) : T("Not started");
                return (
                  <li key={s.key} id={"step-" + s.key} className={`st7 ${state} ${isOpen ? "open" : ""} ${state === "now" && stuckOnFee ? "blk" : ""}`} style={{ "--c": STAGE_TONE[i].bar, "--cb": STAGE_TONE[i].bg }}>
                    <button className="st7-h" onClick={() => setOpenStep(isOpen ? "" : s.key)} aria-expanded={isOpen}>
                      <span className="st7-dot">{state === "done" ? <Icon name="check" /> : i + 1}</span>
                      <span className="st7-t">
                        <b>{T(s.label)}</b>
                        <span>{isOpen ? T(s.hint) : stepSummary(stu, s.key)}</span>
                      </span>
                      <Pill tone={tone}>{pillText}</Pill>
                      <span className="st7-chev"><Icon name="down" /></span>
                    </button>
                    {isOpen && (
                      <div className="st7-b">
                        {state === "later" && <p className="st7-note"><Icon name="clock" />{T("This step hasn’t started. You can fill things in early; they’ll be here when the case gets to it.")}</p>}
                        {body(s.key)}
                        {state === "now" && (
                          <div className="st7-f">
                            <button className="btn" disabled={!prev} onClick={() => prev && move(stu, prev.key)}><Icon name="back" />{prev ? T("Back to {s}", { s: T(prev.label) }) : T("First step")}</button>
                            {blocked && <span className="warnline"><Icon name="lock" />{T("Record the registration fee to move on.")}</span>}
                            {next ? <button className="btn primary" disabled={blocked} onClick={() => move(stu, next.key)}>{T("Done, move to {s}", { s: T(next.label) })}<Icon name="right" /></button> : <span className="muted">{T("This is the final step.")}</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {tab === "profile" && <ProfileTab stu={stu} patch={patch} />}
          {tab === "payments" && <PaymentsTab stu={stu} patch={patch} settings={settings} />}
          {tab === "activity" && (
            <div className="card">
              <div className="notebox">
                                <textarea placeholder={T("Add a note: a call, a document received, a decision…")} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <button className="btn primary" disabled={!noteText.trim()} onClick={() => { save(addNote(stu, noteText.trim(), "note"), T("Note added")); setNoteText(""); }}>{T("Add note")}</button>
              </div>
              <ul className="timeline">
                {(stu.notes || []).length === 0 && <li className="tl-empty">{T("No activity yet. Notes and stage changes will appear here.")}</li>}
                {(stu.notes || []).map((n) => (
                  <li key={n.id} className={`tl tl-${n.kind}`}>
                    <span className="tl-dot" />
                    <div><p>{noteText2(n.text)}</p><span className="tl-meta">{n.author}{SEP()}{dmy(n.ts)} {new Date(n.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="dz">
            {!confirmDel ? (
              <button className="linkbtn danger" onClick={() => setConfirmDel(true)}><Icon name="trash" />{T("Delete this case")}</button>
            ) : (
              <div className="dz-c">
                <span>{T("Delete {id} for good? This can’t be undone. Archive keeps the record instead.", { id: stu.id })}</span>
                <button className="btn" onClick={() => setConfirmDel(false)}>{T("Keep it")}</button>
                <button className="btn danger" onClick={() => remove(stu.id)}>{T("Delete case")}</button>
              </div>
            )}
          </div>
        </div>

        <aside className="rec-rail">
          <section className={`na na-${na.tone}`}>
            <span className="na-l"><Icon name={na.tone === "ok" ? "check" : na.tone === "grey" ? "archive" : "flag"} />{T("Next action")}</span>
            <p>{T(na.text, na)}</p>
          </section>

          <section className="rail-s">
            <h3>{T("Details")}</h3>
            <dl className="props">
              <div><dt>{T("Destination")}</dt><dd>
                <select value={country} onChange={(e) => { const v = e.target.value; patch({ strategy: { ...(stu.strategy || {}), country: v }, targetCountries: v ? [v] : [] }, T("Destination updated")); }}>
                  <option value="">{T("Not set")}</option>{destinations().map((c) => <option key={c} value={c}>{T(c)}</option>)}
                </select></dd></div>
              <div><dt>{T("Package")}</dt><dd>
                <select value={stu.packageType || ""} onChange={(e) => patch({ packageType: e.target.value }, T("Package updated"))}>
                  <option value="">{T("Not set")}</option>{PACKAGES.map((p) => <option key={p.key} value={p.key}>{T(p.label)}</option>)}
                </select></dd></div>
              <div><dt>{T("Funding")}</dt><dd>
                <select value={stu.sponsorType || ""} onChange={(e) => patch({ sponsorType: e.target.value }, T("Funding updated"))}>
                  <option value="">{T("Not set")}</option>{FUNDING.map((f) => <option key={f.key} value={f.key}>{T(f.label)}</option>)}
                </select></dd></div>
              <div><dt>{T("Officer")}</dt><dd>
                <select value={stu.officer || ""} onChange={(e) => patch({ officer: e.target.value }, T("Officer updated"))}>
                  <option value="">{T("Unassigned")}</option>{officers.map((o) => <option key={o}>{o}</option>)}
                </select></dd></div>
              <div><dt>{T("Risk")}</dt><dd>
                <select value={stu.risk || ""} onChange={(e) => patch({ risk: e.target.value }, T("Risk updated"))}>
                  <option value="">{T("Not assessed")}</option>{Object.entries(RISK).map(([k, r]) => <option key={k} value={k}>{T(r.label)}</option>)}
                </select></dd></div>
            </dl>
          </section>

          <section className="rail-s">
            <h3>{T("Contact")}</h3>
            <dl className="props ro">
              <div><dt>{T("Phone")}</dt><dd>{stu.phone ? <a href={`tel:${stu.phone}`}>{stu.phone}</a> : <em className="nil">{T("Not set")}</em>}</dd></div>
              <div><dt>{T("Email")}</dt><dd>{stu.email || <em className="nil">{T("Not set")}</em>}</dd></div>
              <div><dt>{T("Intake")}</dt><dd>{stu.intendedIntake || <em className="nil">{T("Not set")}</em>}</dd></div>
              <div><dt>{T("Source")}</dt><dd>{stu.source ? T(stu.source) : <em className="nil">{T("Not set")}</em>}</dd></div>
              <div><dt>{T("Opened")}</dt><dd>{dmy(stu.createdAt)}</dd></div>
            </dl>
          </section>

          <section className="rail-s">
            <div className="rail-sh"><h3>{T("Payments")}</h3><button className="linkbtn" onClick={() => setTab("payments")}>{T("Manage")}</button></div>
            {!pk && <p className="muted small">{T("Choose a package to see which payments apply.")}</p>}
            <div className="payrail">
              {PAYMENTS.filter((p) => applicable.includes(p.key)).map((p) => {
                const row = pay[p.key] || {};
                const amt = row.amount || feeFor(settings, stu, p.key);
                return (
                  <div key={p.key} className={`pr ${row.paid ? "paid" : ""}`}>
                    <span className="pr-ic">{row.paid ? <Icon name="check" /> : null}</span>
                    <span className="pr-l">{T(p.label)}</span>
                    <span className="pr-v">{row.paid ? (etb(row.amount) || T("Paid")) : amt ? etb(amt) : T("Not set")}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

// Activity notes are stored in English; translate the system-written ones on display.
function noteText2(t) {
  if (LANG !== "am" || !t) return t;
  let m = t.match(/^Moved from (.+) to (.+)$/);
  if (m) return T("Moved from {a} to {b}", { a: T(m[1]), b: T(m[2]) });
  m = t.match(/^Converted from lead (.+)$/);
  if (m) return T("Converted from lead {c}", { c: m[1] });
  return T(t);
}

/* --- Blocks inside each step --- */
function Block({ title, right, note, children, tone }) {
  return (
    <section className={`blk ${tone ? "blk-" + tone : ""}`}>
      {(title || right) && <div className="blk-h"><h3>{title}</h3>{right}</div>}
      {note && <p className="blk-note">{note}</p>}
      {children}
    </section>
  );
}
function Count({ a, b, label }) {
  return <span className={`cnt-p ${a >= b && b ? "full" : ""}`}>{a}/{b} {label}</span>;
}
function BlurArea({ label, value, onSave, placeholder }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return <Field label={label}><textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== (value || "") && onSave(v)} placeholder={placeholder} /></Field>;
}
function PayRow({ stu, patch, settings, k, big }) {
  const pay = stu.payments || blankPayments();
  const row = pay[k] || {};
  const p = PAYMENTS.find((x) => x.key === k);
  const fee = feeFor(settings, stu, k);
  const idx = STAGE_INDEX[stu.stage];
  const due = row.paid ? null
    : k === "registration" ? T("Due now. Blocks the start of work.")
    : k === "payment1" && idx >= STAGE_INDEX.admission ? T("Due now. Admission stage reached.")
    : k === "payment2" && idx >= STAGE_INDEX.outcome ? T("Due now. Case is at visa outcome.")
    : null;
  const set = (field, val, msg) => {
    const r = { ...row, [field]: val };
    if (field === "paid" && val) { if (!r.amount && fee) r.amount = String(fee); if (!r.date) r.date = todayStr(); }
    patch({ payments: { ...pay, [k]: r } }, msg);
  };
  return (
    <div className={`payrow ${big ? "big" : ""} ${row.paid ? "paid" : ""} ${due ? "due" : ""}`}>
      <Check on={row.paid} label={T(p.label)} sub={row.paid ? T("Paid") : due || T(p.when)} onClick={() => set("paid", !row.paid, row.paid ? T("Payment reopened") : T("{p} marked paid", { p: T(p.label) }))} />
      <div className="payfields">
        <label className="pf"><span>{T("Amount")}</span><input inputMode="numeric" placeholder={fee ? T("{a} (default)", { a: moneyIn(fee) }) : T("Amount")} value={moneyIn(row.amount)} onChange={(e) => set("amount", moneyOut(e.target.value))} /></label>
        <label className="pf"><span>{T("Date")}</span><DateInput value={row.date || ""} onChange={(v) => set("date", v)} clearable ariaLabel={T("Date")} /></label>
      </div>
    </div>
  );
}
function PaymentInline({ stu, patch, settings, k, show }) {
  const pk = PACKAGES.find((p) => p.key === stu.packageType);
  if (!show || (pk && !pk.pays.includes(k))) return null;
  return (
    <Block title={T(PAYMENTS.find((p) => p.key === k).label)} tone={stu.payments?.[k]?.paid ? "ok" : "warn"} note={T(PAYMENTS.find((p) => p.key === k).when)}>
      <PayRow stu={stu} patch={patch} settings={settings} k={k} />
    </Block>
  );
}

function RegistrationBlock({ stu, patch, settings }) {
  return (
    <>
      <Block title={T("Package")} note={T("Pick the package first so the right fees apply.")}>
        <div className="pkgpick">
          {PACKAGES.map((p) => (
            <button key={p.key} className={`pkgc ${stu.packageType === p.key ? "on" : ""}`} onClick={() => patch({ packageType: stu.packageType === p.key ? "" : p.key }, T("Package updated"))}>
              <span className="pkgc-r" /><b>{T(p.label)}</b><span>{T(p.desc)}</span>
            </button>
          ))}
        </div>
      </Block>
      <Block title={T("Registration fee")} tone={stu.payments?.registration?.paid ? "ok" : "warn"} note={T("Non-refundable. Nothing starts until it’s recorded.")}>
        <PayRow stu={stu} patch={patch} settings={settings} k="registration" big />
      </Block>
    </>
  );
}

function AssessmentBlock({ stu, patch }) {
  const mini = [["Education", stu.education], ["English", stu.englishProficiency], ["Budget", stu.budget], ["Sponsor", stu.sponsor], ["Previous refusals", stu.previousRefusals], ["Intake", stu.intendedIntake]];
  return (
    <>
      <Block title={T("Risk level")} note={T("An honest read of the profile, not a promise to the student.")}>
        <RiskPicker value={stu.risk} onChange={(r) => patch({ risk: r }, T("Risk updated"))} />
      </Block>
      <Block title={T("Profile at a glance")} right={<span className="muted small">{T("Edit on the Profile tab")}</span>}>
        <div className="minigrid">
          {mini.map(([l, v]) => <div key={l}><span className="mini-l">{T(l)}</span><b>{v || <em className="nil">—</em>}</b></div>)}
        </div>
      </Block>
      <Block>
        <BlurArea label={T("Assessment notes")} value={stu.assessmentNotes} onSave={(v) => patch({ assessmentNotes: v })} placeholder={T("Academic, financial and visa profile, and how well the country fits.")} />
      </Block>
    </>
  );
}

function StudyPlanBlock({ stu, patch }) {
  const [s, setS] = useState(stu.strategy || {});
  useEffect(() => setS(stu.strategy || {}), [stu.id, stu.strategy]);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const commit = (k) => { if ((stu.strategy || {})[k] !== s[k]) patch({ strategy: s, ...(k === "country" ? { targetCountries: s.country ? [s.country] : [] } : {}) }, T("Study plan saved")); };
  const F = [["university", "University"], ["program", "Programme"], ["admissionRoute", "Admission route"], ["funding", "Funding"], ["visaRoute", "Visa type"]];
  return (
    <Block title={T("Study plan")} note={T("Country, then university and programme, then how they’ll get in, pay and get the visa.")}>
      <div className="grid3">
        <Field label={T("Country")}><select value={s.country || ""} onChange={(e) => { const v = e.target.value; const nx = { ...s, country: v }; setS(nx); patch({ strategy: nx, targetCountries: v ? [v] : [] }, T("Study plan saved")); }}><option value="">{T("Not set")}</option>{destinations().map((c) => <option key={c} value={c}>{T(c)}</option>)}</select></Field>
        {F.map(([k, l]) => <Field key={k} label={T(l)}><input value={s[k] || ""} onChange={(e) => set(k, e.target.value)} onBlur={() => commit(k)} /></Field>)}
      </div>
    </Block>
  );
}

const APP_STATUSES = ["Planned", "Applied", "In review", "Offer", "Rejected", "Enrolled"];
const APP_TONE = { Planned: "grey", Applied: "purple", "In review": "amber", Offer: "green", Rejected: "red", Enrolled: "green" };
function ApplicationsBlock({ stu, save }) {
  const apps = stu.applications || [];
  const [openId, setOpenId] = useState(null);
  const add = () => { const id = uid(); save({ ...stu, applications: [...apps, { id, university: "", program: "", portal: "", fee: "", deadline: "", appliedDate: "", status: "Planned", result: "", conditions: "" }] }); setOpenId(id); };
  const upd = (id, k, v) => save({ ...stu, applications: apps.map((a) => a.id === id ? { ...a, [k]: v } : a) });
  const del = (id) => save({ ...stu, applications: apps.filter((a) => a.id !== id) }, T("Application removed"));
  return (
    <Block title={T("University applications")} right={<button className="btn sm" onClick={add}><Icon name="plus" />{T("Add university")}</button>}>
      {apps.length === 0 ? <p className="blk-empty">{T("No applications yet. Add each university the student applies to.")}</p> : (
        <div className="apps">
          {apps.map((a) => {
            const isOpen = openId === a.id;
            return (
              <div className={`uapp ${isOpen ? "open" : ""}`} key={a.id}>
                <div className="app-h">
                  <Icon name="school" />
                  <input className="app-title" placeholder={T("University name")} value={a.university} onChange={(e) => upd(a.id, "university", e.target.value)} />
                  <label className={`app-st pl-${APP_TONE[a.status] || "grey"}`}>
                    <select value={a.status} onChange={(e) => upd(a.id, "status", e.target.value)}>{APP_STATUSES.map((s) => <option key={s} value={s}>{T(s)}</option>)}</select>
                  </label>
                  <button className="ib" onClick={() => setOpenId(isOpen ? null : a.id)} aria-label={T("Details")}><Icon name={isOpen ? "up" : "down"} /></button>
                </div>
                {!isOpen && (a.program || a.deadline) && <p className="app-sub">{[a.program, a.deadline && T("Deadline {d}", { d: dmy(a.deadline) })].filter(Boolean).join(SEP())}</p>}
                {isOpen && (
                  <div className="app-b">
                    <div className="grid3">
                      <Field label={T("Programme")}><input value={a.program} onChange={(e) => upd(a.id, "program", e.target.value)} /></Field>
                      <Field label={T("Portal")}><input value={a.portal} onChange={(e) => upd(a.id, "portal", e.target.value)} /></Field>
                      <Field label={T("Application fee")}><input value={a.fee} onChange={(e) => upd(a.id, "fee", e.target.value)} /></Field>
                      <Field label={T("Deadline")}><DateInput value={a.deadline} onChange={(v) => upd(a.id, "deadline", v)} clearable /></Field>
                      <Field label={T("Applied on")}><DateInput value={a.appliedDate} onChange={(v) => upd(a.id, "appliedDate", v)} clearable /></Field>
                      <Field label={T("Conditions")}><input value={a.conditions} onChange={(e) => upd(a.id, "conditions", e.target.value)} /></Field>
                    </div>
                    <button className="linkbtn danger" onClick={() => del(a.id)}><Icon name="trash" />{T("Remove application")}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Block>
  );
}

function FinancialBlock({ stu, patch }) {
  const fin = stu.financial || {};
  const done = FINANCIAL_ITEMS.filter((i) => fin[i]).length;
  return (
    <Block title={T("Financial file")} right={<Count a={done} b={FINANCIAL_ITEMS.length} label={T("verified")} />} note={T("Build one consistent financial story, not just a pile of documents.")}>
      <div className="checklist">
        {FINANCIAL_ITEMS.map((item) => <Check key={item} on={fin[item]} label={T(item)} onClick={() => patch({ financial: { ...fin, [item]: !fin[item] } })} />)}
      </div>
      <BlurArea label={T("Financial story and flags")} value={stu.financialNotes} onSave={(v) => patch({ financialNotes: v })} placeholder={T("Source of funds, consistency between documents, anything an officer would question.")} />
    </Block>
  );
}
function VisaDocsBlock({ stu, patch }) {
  const country = stu.visaCountry || "";
  const items = VISA_PRESETS[country] || VISA_PRESETS.Default;
  const visa = stu.visa || {};
  const done = items.filter((i) => visa[i]).length;
  return (
    <Block title={T("Visa documents")} right={<Count a={done} b={items.length} label={T("ready")} />}>
      <Field label={T("Country checklist")}>
        <select value={country} onChange={(e) => patch({ visaCountry: e.target.value }, T("Checklist updated"))}>
          <option value="">{T("General checklist")}</option>
          {Object.keys(VISA_PRESETS).filter((k) => k !== "Default").map((k) => <option key={k} value={k}>{T(k)}</option>)}
        </select>
      </Field>
      <div className="checklist">
        {items.map((item) => <Check key={item} on={visa[item]} label={T(item)} onClick={() => patch({ visa: { ...visa, [item]: !visa[item] } })} />)}
      </div>
    </Block>
  );
}
function QcBlock({ stu, patch }) {
  return (
    <Block title={T("Quality check")} tone={stu.qcPassed ? "ok" : ""} right={<Pill tone={stu.qcPassed ? "green" : "amber"}>{stu.qcPassed ? T("Passed") : T("Not signed off")}</Pill>}
      note={T("A second person reviews the whole file: is everything there, correct, consistent, authentic, translated and legalised?")}>
      <BlurArea label={T("QC notes")} value={stu.qcNotes} onSave={(v) => patch({ qcNotes: v })} placeholder={T("What the reviewer checked and any fixes needed.")} />
      <button className={`btn ${stu.qcPassed ? "" : "primary"}`} onClick={() => patch({ qcPassed: !stu.qcPassed }, stu.qcPassed ? T("QC reopened") : T("QC signed off"))}>
        <Icon name={stu.qcPassed ? "refresh" : "check"} />{stu.qcPassed ? T("Reopen file") : T("Sign off, file is ready")}
      </button>
    </Block>
  );
}
function AppointmentBlock({ stu, patch }) {
  const ap = stu.appointment || {};
  const steps = [["requested", "Appointment requested"], ["confirmed", "Appointment confirmed"], ["biometrics", "Biometrics done"], ["submitted", "File lodged"]];
  return (
    <Block title={T("Appointment and lodging")} right={<Count a={steps.filter(([k]) => ap[k]).length} b={steps.length} label={T("done")} />}>
      <div className="grid2">
        <Field label={T("Appointment date")}><DateInput value={ap.date || ""} onChange={(v) => patch({ appointment: { ...ap, date: v } })} clearable /></Field>
      </div>
      <div className="checklist two">
        {steps.map(([k, l]) => <Check key={k} on={ap[k]} label={T(l)} onClick={() => patch({ appointment: { ...ap, [k]: !ap[k] } })} />)}
      </div>
    </Block>
  );
}
function InterviewBlock({ stu, patch }) {
  const iv = stu.interview || {};
  return (
    <Block title={T("Interview preparation")} right={<Count a={INTERVIEW_STEPS.filter(([k]) => iv[k]).length} b={INTERVIEW_STEPS.length} label={T("done")} />}
      note={T("Practise their real story: why this course, the university, the money, the sponsor and their plans after.")}>
      <div className="checklist two">
        {INTERVIEW_STEPS.map(([k, l]) => <Check key={k} on={iv[k]} label={T(l)} onClick={() => patch({ interview: { ...iv, [k]: !iv[k] } })} />)}
      </div>
    </Block>
  );
}
const POST_VISA = ["Flight planning", "Accommodation", "Travel checklist", "Airport guidance", "University registration", "Residence permit", "Arrival orientation", "Emergency contacts"];
function DecisionBlock({ stu, patch, settings }) {
  const iv = stu.interview || {};
  return (
    <>
      <Block title={T("Visa decision")}>
        <div className="decision-pick">
          {Object.entries(DECISION).map(([k, d]) => (
            <button key={k} className={`dp dp-${k} ${stu.decision === k ? "on" : ""}`} onClick={() => patch({ decision: stu.decision === k ? "" : k, decidedAt: stu.decision === k ? "" : nowISO() }, T("Decision: {d}", { d: T(d.label) }))}>
              <Icon name={k === "approved" ? "check" : k === "refused" ? "close" : "file"} />{T(d.label)}
            </button>
          ))}
        </div>
      </Block>
      <PaymentInline stu={stu} patch={patch} settings={settings} k="payment2" show={stu.packageType === "p2" && (stu.decision === "approved" || !!stu.payments?.payment2?.paid)} />
      {stu.decision === "approved" && (
        <Block title={T("Before they fly")} right={<Count a={POST_VISA.filter((i) => iv["pv_" + i]).length} b={POST_VISA.length} label={T("done")} />}>
          <div className="checklist two">
            {POST_VISA.map((item) => <Check key={item} on={iv["pv_" + item]} label={T(item)} onClick={() => patch({ interview: { ...iv, ["pv_" + item]: !iv["pv_" + item] } })} />)}
          </div>
        </Block>
      )}
    </>
  );
}

function RiskPicker({ value, onChange }) {
  return (
    <div className="riskpicker">
      {Object.entries(RISK).map(([k, r]) => (
        <button key={k} className={`rp rp-${k} ${value === k ? "on" : ""}`} onClick={() => onChange(k)}><i />{T(r.label)}</button>
      ))}
    </div>
  );
}

function ProfileTab({ stu, patch }) {
  const [d, setD] = useState(stu);
  useEffect(() => setD(stu), [stu.id]);
  const set = (k, v) => setD((s) => ({ ...s, [k]: v }));
  const inp = (k, l) => <Field key={k} label={T(l)}><input value={d[k] || ""} onChange={(e) => set(k, e.target.value)} onBlur={() => d[k] !== stu[k] && patch({ [k]: d[k] })} /></Field>;
  const groups = [
    ["Contact", [["fullName", "Full name"], ["phone", "Phone"], ["email", "Email"], ["age", "Age"], ["intendedIntake", "Intended intake"]]],
    ["Academic background", [["education", "Highest education"], ["fieldOfStudy", "Field of study"], ["gpa", "GPA / grade"], ["graduationYear", "Graduation year"], ["englishProficiency", "English level"], ["workExperience", "Work experience"], ["studyLevel", "Study level sought"]]],
    ["Sponsor and visa history", [["budget", "Budget"], ["sponsor", "Sponsor"], ["sponsorRelationship", "Sponsor relationship"], ["passportStatus", "Passport"], ["previousVisaHistory", "Previous visas"], ["previousRefusals", "Previous refusals"]]],
  ];
  return (
    <div className="prof">
      {groups.map(([g, rows]) => (
        <Block key={g} title={T(g)}>
          <div className="grid3">{rows.map(([k, l]) => inp(k, l))}</div>
        </Block>
      ))}
      <Block title={T("Assessment")}>
        <RiskPicker value={d.risk} onChange={(r) => { set("risk", r); patch({ risk: r }, T("Risk updated")); }} />
        <BlurArea label={T("Assessment notes")} value={stu.assessmentNotes} onSave={(v) => patch({ assessmentNotes: v })} placeholder={T("Academic, financial and visa profile, and how well the country fits.")} />
      </Block>
    </div>
  );
}

function PaymentsTab({ stu, patch, settings }) {
  const pkg = PACKAGES.find((p) => p.key === stu.packageType);
  const applicable = pkg ? pkg.pays : ["registration", "payment1", "payment2"];
  const pay = stu.payments || blankPayments();
  const paidSum = applicable.reduce((a, k) => a + (pay[k]?.paid ? Number(String(pay[k].amount || "").replace(/[^\d.]/g, "")) || 0 : 0), 0);
  return (
    <div className="prof">
      <Block title={T("Package")}>
        <div className="pkgpick">
          {PACKAGES.map((p) => (
            <button key={p.key} className={`pkgc ${stu.packageType === p.key ? "on" : ""}`} onClick={() => patch({ packageType: stu.packageType === p.key ? "" : p.key }, T("Package updated"))}>
              <span className="pkgc-r" /><b>{T(p.label)}</b><span>{T(p.desc)}</span>
            </button>
          ))}
        </div>
      </Block>
      <Block title={T("Payments")} right={<span className="cnt-p full-n">{T("{n} received", { n: etb(paidSum) || "0 " + T("ETB") })}</span>}>
        {!stu.packageType && <p className="blk-note">{T("Choose a package to set which payments apply.")}</p>}
        <div className="paylist">
          {PAYMENTS.filter((p) => applicable.includes(p.key)).map((p) => <PayRow key={p.key} stu={stu} patch={patch} settings={settings} k={p.key} />)}
        </div>
        {!pay.registration?.paid && <p className="pay-warn"><Icon name="lock" />{T("The case can’t move past Registration until the fee is marked paid.")}</p>}
      </Block>
    </div>
  );
}
/* ============================================================
   LEADS
   ============================================================ */
const LEAD_TABS = [
  { key: "all", label: "All leads", hint: "Every enquiry, newest first", sub: "Every enquiry", hero: true },
  { key: "today", label: "Call today", hint: "Calls due today", sub: "Due today", bar: "#6E9EEA", fg: "#24508F", bg: "#DCE8FC" },
  { key: "overdue", label: "Overdue", hint: "Calls that should already have happened", sub: "Call these first", bar: "#F39A5B", fg: "#9A4A16", bg: "#FDE4D2" },
  { key: "new", label: "Not called yet", hint: "Fresh enquiries with no call logged", sub: "Fresh enquiries", bar: "#A386E3", fg: "#55339A", bg: "#E8DDF8" },
  { key: "converted", label: "Registered", hint: "Became paying cases", sub: "Became cases", bar: "#22D3A6", fg: "#0D6650", bg: "#CDF5EA" },
  { key: "closed", label: "Closed", hint: "No response, not interested, or out of scope", sub: "No longer active", bar: "#B9B0B6", fg: "#5B5158", bg: "#EEEAEC" },
];
const LEAD_STATE = {
  new: ["Call now", "magenta"], today: ["Call today", "teal"], overdue: ["Overdue", "amber"],
  upcoming: ["Waiting", "purple"], closed: ["Closed", "grey"], converted: ["Registered", "green"],
};

function Leads({ leads, settings, me, selId, setSel, onNew, saveLead, removeLead, convertLead, openCase }) {
  const today = todayStr();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState(null);
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState(addDaysStr(today, 2));
  const [panel, setPanel] = useState(!!selId);
  const [confirmDel, setConfirmDel] = useState(false);
  const cadence = settings.cadence || [0, 1, 3, 7, 14];
  const maxCalls = cadence.length;

  const stateOf = (l) => {
    if (l.status === "converted") return "converted";
    if (l.status === "closed") return "closed";
    const b = leadBucket(l, today);
    if (l.callAttempts === 0 && (b === "today" || b === "overdue")) return "new";
    return b;
  };
  const inTab = (l, k) => {
    if (k === "all") return true;
    if (k === "new") return l.status === "open" && l.callAttempts === 0;
    if (k === "converted") return l.status === "converted";
    if (k === "closed") return l.status === "closed";
    return l.status === "open" && leadBucket(l, today) === k;
  };
  const tabs = LEAD_TABS.map((t) => ({ ...t, label: T(t.label), hint: T(t.hint), sub: T(t.sub), count: leads.filter((l) => inTab(l, t.key)).length }));
  const term = q.trim().toLowerCase();
  let rows = leads.filter((l) => inTab(l, tab));
  if (term) rows = rows.filter((l) => [l.name, l.phone, l.code, l.interestCountry, l.telegram].some((v) => (v || "").toLowerCase().includes(term)));
  rows = [...rows].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const groups = [];
  rows.forEach((l) => {
    const d = String(l.createdAt || "").slice(0, 10);
    const g = groups[groups.length - 1];
    if (g && g.d === d) g.items.push(l); else groups.push({ d, items: [l] });
  });
  const sel = leads.find((l) => l.id === selId) || null;
  const calls = sel ? [...(sel.calls || [])].reverse() : [];
  useEffect(() => { setMode(null); setNote(""); setConfirmDel(false); }, [sel?.id]);
  useEffect(() => { if (!selId && rows[0] && typeof window !== "undefined" && window.innerWidth > 1100) setSel(rows[0].id); }, [tab]);

  function nextLabel(l) {
    if (l.status === "converted") return T("Registered as {id}", { id: l.convertedCaseId || T("a case") });
    if (l.status === "closed") return T(CLOSE_REASONS[l.closeReason] || "Closed");
    const n = l.callAttempts + 1, last = n >= maxCalls;
    const d = l.nextCallAt;
    const call = last ? T("Call {n}, the last one", { n }) : T("Call {n}", { n });
    if (d < today) return T("{c}, was due {d}", { c: call, d: dayWord(d) });
    if (d === today) return l.callAttempts === 0 ? T("First call, today") : T("{c}, today", { c: call });
    return (d === addDaysStr(today, 1) ? T("{c}, tomorrow", { c: call }) : T("{c} on {d}", { c: call, d: dmy(d) }));
  }
  function log(outcome) {
    if (!sel) return;
    const updated = applyLeadCall(sel, outcome, note.trim(), me, cadence, outcome === "answered" ? nextDate : undefined);
    saveLead(updated, outcome === "answered" ? T("Call logged, follow-up booked") : outcome === "no_answer" ? T("No answer logged, next call booked") : T("Lead closed"));
    setNote(""); setMode(null);
  }
  const pick = (id) => { setSel(id); setPanel(true); };
  const tg = sel?.telegram ? `https://t.me/${sel.telegram.replace(/^@/, "")}` : null;
  const wa = sel ? waLink(sel.phone) : null;
  const planText = cadence.map((d) => (d === 0 ? T("same day") : T("day {n}", { n: d }))).join(SEP());

  return (
    <div className="pg">
      <PageHead title={T("Leads")} sub={T("Call plan: {p}. A lead closes after {n} unanswered calls.", { p: planText, n: maxCalls })}>
        <button className="btn primary" onClick={onNew}><Icon name="plus" />{T("New lead")}</button>
      </PageHead>

      <StatCards items={tabs} value={tab} onChange={(k) => { setTab(k); setSel(null); setPanel(false); }} cls="lead6" />
      <div className="fbar">
        <div className="sbox"><Icon name="search" /><input placeholder={T("Search name, phone, lead number or country")} value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="ib" onClick={() => setQ("")} aria-label={T("Clear search")}><Icon name="close" /></button>}</div>
        <span className="fbar-n">{T(rows.length === 1 ? "{n} lead" : "{n} leads", { n: rows.length })}</span>
      </div>

      <div className={`split ${sel ? "has-sel" : ""}`}>
        <div className="split-l">
          {rows.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><Icon name="phone" /></span>
              <h3>{term ? T("No leads match") : tab === "today" ? T("No calls due today") : T("Nothing in this list")}</h3>
              <p>{term ? T("Try a different name or number.") : T("New enquiries show up under All and Call today straight away.")}</p>
              <button className="btn primary" onClick={onNew}><Icon name="plus" />{T("New lead")}</button>
            </div>
          ) : (
            <div className="ldl">
              {groups.map((g) => (
                <section key={g.d} className="ldg">
                  <h3 className="ldg-h"><span>{dayLabel(g.d)}</span><em>{g.items.length}</em></h3>
                  <div className="ldg-b">
                    {g.items.map((l) => {
                      const st = stateOf(l);
                      return (
                        <button key={l.id} className={`ldr s-${st} ${sel?.id === l.id ? "sel" : ""}`} onClick={() => pick(l.id)}>
                          <Avatar name={l.name} size={38} />
                          <span className="ldr-who"><b>{l.name || T("Unnamed")}</b><i>{l.code}{l.source ? `${SEP()}${T(l.source)}` : ""}</i></span>
                          <span className="ldr-int"><Icon name="globe" /><span>{l.interestCountry ? T(l.interestCountry) : T("Not sure yet")}</span>{l.interestPackage && <em className={`pkgtag ${l.interestPackage}`}>{T(PACKAGE_LABEL[l.interestPackage])}</em>}</span>
                          <span className="ldr-calls" title={T("{a} of {b} calls made", { a: l.callAttempts, b: maxCalls })}><span className="dots">{Array.from({ length: maxCalls }, (_, i) => <i key={i} className={i < l.callAttempts ? "on" : ""} />)}</span></span>
                          <span className="ldr-next"><Pill tone={LEAD_STATE[st][1]}>{T(LEAD_STATE[st][0])}</Pill><i>{nextLabel(l)}</i></span>
                          <Icon name="right" />
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {sel ? (
          <aside className={`lp ${panel ? "open" : ""}`}>
            <div className="lp-top">
              <button className="ib lp-back" onClick={() => { setPanel(false); setSel(null); }} aria-label={T("Back to list")}><Icon name="back" /></button>
              <Avatar name={sel.name} size={46} />
              <div className="lp-t"><h2>{sel.name || T("Unnamed")}</h2><span>{T("{c}, logged {d}", { c: sel.code, d: dayWord(sel.createdAt) })}</span></div>
              <button className="ib lp-x" onClick={() => setSel(null)} aria-label={T("Close")}><Icon name="close" /></button>
            </div>
            <div className={`lp-next s-${stateOf(sel)}`}>
              <Pill tone={LEAD_STATE[stateOf(sel)][1]}>{T(LEAD_STATE[stateOf(sel)][0])}</Pill>
              <span>{nextLabel(sel)}</span>
              <span className="dots">{Array.from({ length: maxCalls }, (_, i) => <i key={i} className={i < sel.callAttempts ? "on" : ""} />)}</span>
            </div>
            <div className="lp-cta">
              {sel.phone ? <a className="btn" href={`tel:${sel.phone}`}><Icon name="phone" />{T("Call")}</a> : <span className="btn" aria-disabled="true"><Icon name="phone" />{T("No phone")}</span>}
              {wa && <a className="btn" href={wa} target="_blank" rel="noreferrer"><Icon name="chat" />WhatsApp</a>}
              {tg && <a className="btn" href={tg} target="_blank" rel="noreferrer"><Icon name="send" />Telegram</a>}
            </div>

            {sel.status === "open" && (
              <div className="lp-log">
                <h3>{T("Log call {n}", { n: sel.callAttempts + 1 })}</h3>
                <input className="inp" placeholder={T("What happened? (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
                {mode === null ? (
                  <div className="lp-btns">
                    <button className="btn ob-ok" onClick={() => setMode("answered")}><Icon name="check" />{T("Talked, call again")}</button>
                    <button className="btn" onClick={() => log("no_answer")}><Icon name="clock" />{T("No answer")}</button>
                    <button className="btn" onClick={() => log("not_interested")}><Icon name="close" />{T("Not interested")}</button>
                    <button className="btn" onClick={() => log("out_of_scope")}><Icon name="flag" />{T("Out of scope")}</button>
                  </div>
                ) : (
                  <div className="lp-ans">
                    <Field label={T("Next call on")}><DateInput value={nextDate} min={today} onChange={(v) => v && setNextDate(v)} /></Field>
                    <div className="row-btn"><button className="btn" onClick={() => setMode(null)}>{T("Cancel")}</button><button className="btn primary" onClick={() => log("answered")}>{T("Save call")}</button></div>
                  </div>
                )}
              </div>
            )}

            <div className="lp-sec">
              <h3>{T("Enquiry")}</h3>
              <dl className="props ro">
                <div><dt>{T("Phone")}</dt><dd>{sel.phone || <em className="nil">{T("Not given")}</em>}</dd></div>
                {sel.telegram && <div><dt>Telegram</dt><dd>{sel.telegram}</dd></div>}
                <div><dt>{T("Destination")}</dt><dd>{sel.interestCountry ? T(sel.interestCountry) : <em className="nil">{T("Not sure yet")}</em>}</dd></div>
                <div><dt>{T("Package")}</dt><dd>{sel.interestPackage ? T(PACKAGE_LABEL[sel.interestPackage]) : <em className="nil">{T("Not sure yet")}</em>}</dd></div>
                <div><dt>{T("Intake")}</dt><dd>{sel.intake || <em className="nil">{T("Not given")}</em>}</dd></div>
                <div><dt>{T("Education")}</dt><dd>{sel.education || <em className="nil">{T("Not given")}</em>}</dd></div>
                <div><dt>{T("Goal")}</dt><dd>{sel.goal || <em className="nil">{T("Not given")}</em>}</dd></div>
                <div><dt>{T("Source")}</dt><dd>{sel.source ? T(sel.source) : <em className="nil">{T("Not given")}</em>}</dd></div>
              </dl>
              {sel.notes && <p className="lp-notes">{sel.notes}</p>}
            </div>

            <div className="lp-sec">
              <h3>{T("Call history")}</h3>
              {calls.length === 0 ? <p className="muted small">{T("No calls logged yet.")}</p> : (
                <ul className="timeline">
                  {calls.map((c) => (
                    <li key={c.id} className={`tl tl-${c.outcome}`}>
                      <span className="tl-dot" />
                      <div><p><b>{T("Call {n}", { n: c.attempt })}</b>: {T(LEAD_OUTCOMES[c.outcome] || c.outcome)}{c.note ? `. ${c.note}` : ""}</p><span className="tl-meta">{c.author}, {dayLabel(c.ts)}</span></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="lp-foot">
              {sel.status === "converted" && sel.convertedCaseId
                ? <button className="btn primary" onClick={() => openCase(sel.convertedCaseId)}><Icon name="users" />{T("Open case {id}", { id: sel.convertedCaseId })}</button>
                : <button className="btn primary" onClick={() => convertLead(sel)}><Icon name="convert" />{T("Register as a case")}</button>}
              {sel.status === "closed" && <button className="btn" onClick={() => saveLead({ ...sel, status: "open", closeReason: "", nextCallAt: today }, T("Lead reopened"))}><Icon name="refresh" />{T("Reopen")}</button>}
              {!confirmDel
                ? <button className="ib" title={T("Delete lead")} aria-label={T("Delete lead")} onClick={() => setConfirmDel(true)}><Icon name="trash" /></button>
                : <span className="dz-c inline"><button className="btn sm" onClick={() => setConfirmDel(false)}>{T("Keep")}</button><button className="btn sm danger" onClick={() => { removeLead(sel.id, T("Lead deleted")); setSel(null); setPanel(false); }}>{T("Delete lead")}</button></span>}
            </div>
          </aside>
        ) : rows.length > 0 && (
          <aside className="lp lp-empty"><span className="empty-ic"><Icon name="phone" /></span><p>{T("Pick a lead to see their details and log a call.")}</p></aside>
        )}
      </div>
    </div>
  );
}

function LeadForm({ onCancel, onCreate }) {
  const [d, setD] = useState({ name: "", phone: "", telegram: "", source: "", interestCountry: "", interestPackage: "", education: "", intake: "", goal: "", notes: "" });
  const [err, setErr] = useState("");
  const set = (k, v) => { setD((s) => ({ ...s, [k]: v })); setErr(""); };
  const submit = () => { if (!d.name.trim() && !d.phone.trim()) { setErr(T("Add a name or phone number.")); return; } onCreate(d); };
  return (
    <div className="pg narrow">
      <div className="crumb"><button onClick={onCancel}><Icon name="back" />{T("Leads")}</button><Icon name="right" /><span>{T("New lead")}</span></div>
      <PageHead title={T("New lead")} sub={T("Capture an enquiry in seconds. The first call is due today.")}>
        <button className="btn" onClick={onCancel}>{T("Cancel")}</button>
        <button className="btn primary" onClick={submit}><Icon name="check" />{T("Add lead")}</button>
      </PageHead>
      {err && <p className="formerr"><Icon name="alert" />{err}</p>}
      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[0].bar }}>1</span><div><h2>{T("Contact")}</h2><p>{T("A name or a phone number is enough to start.")}</p></div></div>
        <div className="grid2">
          <Field label={T("Student name")}><input value={d.name} onChange={(e) => set("name", e.target.value)} placeholder={T("Full name")} autoFocus /></Field>
          <Field label={T("Phone")}><input value={d.phone} inputMode="tel" onChange={(e) => set("phone", e.target.value)} placeholder="09…" /></Field>
          <Field label="Telegram"><input value={d.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="@username" /></Field>
          <Field label={T("How they found us")}><select value={d.source} onChange={(e) => set("source", e.target.value)}><option value="">{T("Select…")}</option>{SOURCES.map((s) => <option key={s} value={s}>{T(s)}</option>)}</select></Field>
        </div>
      </section>
      <section className="fsec">
        <div className="fsec-h"><span className="fsec-n" style={{ background: STAGE_TONE[1].bar }}>2</span><div><h2>{T("Study interest")}</h2><p>{T("Whatever they shared on the first contact.")}</p></div></div>
        <div className="grid2">
          <Field label={T("Destination")}><select value={d.interestCountry} onChange={(e) => set("interestCountry", e.target.value)}><option value="">{T("Not sure yet")}</option>{destinations().map((c) => <option key={c} value={c}>{T(c)}</option>)}</select></Field>
          <Field label={T("Package interest")}><select value={d.interestPackage} onChange={(e) => set("interestPackage", e.target.value)}><option value="">{T("Not sure yet")}</option>{PACKAGES.map((p) => <option key={p.key} value={p.key}>{T(p.label)}</option>)}</select></Field>
          <Field label={T("Intended intake")}><input value={d.intake} onChange={(e) => set("intake", e.target.value)} placeholder={T("e.g. Sept 2026")} /></Field>
          <Field label={T("Education level")}><input value={d.education} onChange={(e) => set("education", e.target.value)} placeholder={T("e.g. BSc, Grade 12")} /></Field>
          <Field label={T("Study goal")}><input value={d.goal} onChange={(e) => set("goal", e.target.value)} placeholder={T("Master’s, Bachelor’s, scholarship…")} /></Field>
        </div>
        <div className="mt"><Field label={T("Notes")}><textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder={T("Anything useful for the first call")} /></Field></div>
      </section>
      <div className="formfoot">
        <button className="btn" onClick={onCancel}>{T("Cancel")}</button>
        <button className="btn primary" onClick={submit}><Icon name="check" />{T("Add lead")}</button>
      </div>
    </div>
  );
}
/* ============================================================
   SIGN IN
   ============================================================ */
function Login({ onLogin, lang, setLang }) {
  const userRef = useRef(null);
  const pwRef = useRef(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  // Read straight from the fields so browser/phone autofill always counts,
  // and don't rely on <form> submission (the artifact frame can block it).
  async function submit() {
    const username = (userRef.current?.value || "").trim();
    const pw = (pwRef.current?.value || "").trim();
    if (!username || !pw) { setErr(T("Enter your username and password.")); return; }
    setBusy(true); setErr("");
    let ok = false;
    try { ok = await onLogin(username, pw); } catch { ok = false; }
    setBusy(false);
    if (!ok) setErr(T("That username and password don’t match an active login. Check both and try again."));
  }
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } };
  return (
    <div className="login">
      <div className="login-brand">
        <img className="login-logo" src={LOGO_FULL} alt="Yimaru Consulting" />
        <div className="lb-copy">
          <h2>{T("Every student’s journey, from first call to arrival.")}</h2>
          <p>{T("Leads, cases, payments and visa files for the Yimaru team.")}</p>
        </div>
        <ol className="lb-steps">
          {STAGES.map((st, i) => (
            <li key={st.key} style={{ "--cb": STAGE_TONE[i].bg, "--cf": STAGE_TONE[i].fg, "--c": STAGE_TONE[i].bar }}><span>{i + 1}</span>{T(st.label)}</li>
          ))}
        </ol>
      </div>
      <div className="login-card" role="form" aria-label={T("Sign in")}>
        <div className="lc-top"><img className="login-mark" src={LOGO_MARK} alt="" /><LangSwitch lang={lang} setLang={setLang} /></div>
        <h1>{T("Sign in")}</h1>
        <p className="login-sub">{T("Use the username and password a partner set up for you.")}</p>
        <Field label={T("Username")}><input ref={userRef} name="username" autoComplete="username" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={T("e.g. amman")} onKeyDown={onKey} onInput={() => setErr("")} /></Field>
        <Field label={T("Password")}>
          <span className="pwbox">
            <input ref={pwRef} name="password" autoComplete="current-password" type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false} onKeyDown={onKey} onInput={() => setErr("")} />
            <button type="button" className="linkbtn" onClick={() => setShow((s) => !s)}>{show ? T("Hide") : T("Show")}</button>
          </span>
        </Field>
        {err && <p className="login-err" role="alert"><Icon name="alert" />{err}</p>}
        <button type="button" className="btn primary wide" disabled={busy} onClick={submit}>{busy ? T("Signing in…") : T("Sign in")}</button>
        <p className="login-foot">{T("Forgot your password? Ask a partner to show or reset it in Settings.")}</p>
      </div>
    </div>
  );
}

/* ============================================================
   SETTINGS (partners only)
   ============================================================ */
const SET_SECTIONS = [
  ["business", "Business", "tag"],
  ["packages", "Packages", "book"],
  ["countries", "Destination prices", "globe"],
  ["team", "Team and logins", "users"],
  ["followup", "Lead follow-up", "phone"],
];

function Settings({ settings, saveSettings, users, meId, addUser, updateUser, removeUser }) {
  const [sec, setSec] = useState("business");
  const [f, setF] = useState(settings);
  const [cad, setCad] = useState(settings.cadence || [0, 1, 3, 7, 14]);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");
  const [customName, setCustomName] = useState("");
  const [showAllC, setShowAllC] = useState(false);
  const [nu, setNu] = useState({ fullName: "", username: "", role: "staff", pw: randomPw() });
  const [nuErr, setNuErr] = useState("");
  const [reveal, setReveal] = useState({});
  const [confirmRm, setConfirmRm] = useState(null);
  useEffect(() => { setF(settings); setCad(settings.cadence || [0, 1, 3, 7, 14]); }, [settings]);

  const dirty = JSON.stringify({ ...f, cadence: cad }) !== JSON.stringify({ ...settings, cadence: settings.cadence || [0, 1, 3, 7, 14] });
  const save = () => saveSettings({ ...f, cadence: [...cad].sort((a, b) => a - b) }, T("Settings saved"));
  const setPkg = (p, k, v) => setF((s) => ({ ...s, packages: { ...s.packages, [p]: { ...(s.packages?.[p] || {}), [k]: v } } }));
  const setCountry = (i, k, v) => setF((s) => ({ ...s, countries: s.countries.map((c, j) => j === i ? { ...c, [k]: v } : c) }));
  const list = f.countries || [];
  const cur = f.currency || "ETB";
  const LIMIT = 6;
  const shownC = showAllC ? list : list.slice(0, LIMIT);

  function addCountry(picked) {
    const name = String(typeof picked === "string" ? picked : customName).trim().replace(/\s+/g, " ");
    if (!name) return;
    if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) { setAddErr(T("{c} is already in the list.", { c: name })); return; }
    setF((s) => ({ ...s, countries: [...(s.countries || []), { name, payment1: "", payment2: "" }] }));
    setCustomName(""); setAdding(false); setAddErr("");
    if (list.length + 1 > LIMIT) setShowAllC(true);
  }
  function createLogin() {
    const uname = nu.username.trim().toLowerCase().replace(/\s+/g, "");
    if (!nu.fullName.trim()) { setNuErr(T("Add the person’s full name.")); return; }
    if (!uname) { setNuErr(T("Add a username.")); return; }
    if (users.some((u) => u.username.toLowerCase() === uname)) { setNuErr(T("The username “{u}” is already taken.", { u: uname })); return; }
    addUser({ fullName: nu.fullName.trim(), username: uname, role: nu.role, pw: nu.pw });
    setNu({ fullName: "", username: "", role: "staff", pw: randomPw() }); setNuErr("");
  }

  return (
    <div className="pg">
      <PageHead title={T("Settings")} sub={T("Partners only. Prices, logins and how leads are followed up.")}>
        {sec !== "team" && <>
          {dirty && <span className="unsaved">{T("Unsaved changes")}</span>}
          <button className="btn primary" disabled={!dirty} onClick={save}><Icon name="check" />{T("Save changes")}</button>
        </>}
      </PageHead>

      <div className="set">
        <nav className="set-nav">
          {SET_SECTIONS.map(([k, l, ic]) => (
            <button key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}><Icon name={ic} /><span>{T(l)}</span></button>
          ))}
        </nav>

        <div className="set-pane">
          {sec === "business" && (
            <section className="sp">
              <h2>{T("Business")}</h2><p className="sp-sub">{T("Shown on the CRM and used for amounts.")}</p>
              <div className="grid2">
                <Field label={T("Business name")}><input value={f.businessName || ""} onChange={(e) => setF((s) => ({ ...s, businessName: e.target.value }))} /></Field>
                <Field label={T("Currency")}><input value={f.currency || ""} onChange={(e) => setF((s) => ({ ...s, currency: e.target.value }))} placeholder="ETB" /></Field>
              </div>
            </section>
          )}

          {sec === "packages" && (
            <section className="sp">
              <h2>{T("Packages")}</h2>
              <p className="sp-sub">{T("Both packages start with a non-refundable registration fee. Payment 1 and Payment 2 are set per destination.")}</p>
              <div className="pkgs">
                {PACKAGES.map((p) => (
                  <div key={p.key} className={`pkg pkg-${p.key}`}>
                    <div className="pkg-h"><h3>{T(p.label)}</h3><span>{T("{n} payments", { n: p.pays.length })}</span></div>
                    <p>{T(p.desc)}</p>
                    <ol className="pkg-steps">{p.pays.map((k) => <li key={k}>{T(PAYMENTS.find((x) => x.key === k).label)}<span>{T(PAYMENTS.find((x) => x.key === k).when)}</span></li>)}</ol>
                    <div className="grid2">
                      <Field label={T("Registration fee ({c})", { c: cur })}><input inputMode="numeric" value={moneyIn(f.packages?.[p.key]?.registration)} onChange={(e) => setPkg(p.key, "registration", moneyOut(e.target.value))} placeholder={T("e.g. 10000")} /></Field>
                      <Field label={T("Package total ({c})", { c: cur })} hint={T("Optional, for reference")}><input inputMode="numeric" value={moneyIn(f.packages?.[p.key]?.total)} onChange={(e) => setPkg(p.key, "total", moneyOut(e.target.value))} /></Field>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sec === "countries" && (
            <section className="sp">
              <div className="sp-h">
                <div><h2>{T("Destination prices")}</h2><p className="sp-sub">{T("What a student pays per destination. These fill in automatically on each student’s payments.")}</p></div>
                {!adding && <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" />{T("Add a country")}</button>}
              </div>
              {adding && (
                <div className="addc">
                  <Field label={T("Country")} hint={T("Type any country. Suggestions appear as you type.")}>
                    <ComboBox value={customName} autoFocus label={T("Country")} placeholder={T("e.g. Slovakia")} options={WORLD_COUNTRIES} exclude={list.map((x) => x.name)}
                      onChange={(v) => { setCustomName(v); setAddErr(""); }} onPick={(v) => addCountry(v)} />
                  </Field>
                  <div className="row-btn">
                    <button className="btn" onClick={() => { setAdding(false); setCustomName(""); setAddErr(""); }}>{T("Cancel")}</button>
                    <button className="btn primary" disabled={!customName.trim()} onClick={() => addCountry()}><Icon name="plus" />{T("Add")}</button>
                  </div>
                  {addErr && <p className="formerr"><Icon name="alert" />{addErr}</p>}
                </div>
              )}
              <div className="ctl">
                <div className="ctl-h"><span>{T("Destination")}</span><span>{T("Payment 1, after admission")}</span><span>{T("Payment 2, after visa")}</span><span>{T("Total")}</span><span /></div>
                {shownC.map((c) => {
                  const i = list.indexOf(c);
                  return (
                    <div key={c.name} className="ctl-r">
                      <span className="ctl-n"><Icon name="globe" /><b>{T(c.name)}</b></span>
                      <label className="ctl-f"><em>{T("Payment 1")}</em><input className="inp num" inputMode="numeric" value={moneyIn(c.payment1)} placeholder={T("Set price")} onChange={(e) => setCountry(i, "payment1", moneyOut(e.target.value))} aria-label={`${c.name} payment 1`} /></label>
                      <label className="ctl-f"><em>{T("Payment 2")}</em><input className="inp num" inputMode="numeric" value={moneyIn(c.payment2)} placeholder={T("Set price")} onChange={(e) => setCountry(i, "payment2", moneyOut(e.target.value))} aria-label={`${c.name} payment 2`} /></label>
                      <span className="ctl-t">{((Number(c.payment1) || 0) + (Number(c.payment2) || 0)).toLocaleString()} {cur}</span>
                      <button className="ib" aria-label={T("Remove {c}", { c: c.name })} onClick={() => setF((s) => ({ ...s, countries: s.countries.filter((_, j) => j !== i) }))}><Icon name="trash" /></button>
                    </div>
                  );
                })}
                {list.length === 0 && <p className="blk-empty">{T("No destinations yet. Add the countries you send students to.")}</p>}
              </div>
              {list.length > LIMIT && <button className="more" onClick={() => setShowAllC((v) => !v)}>{showAllC ? T("Show fewer") : T("Show all {n}", { n: list.length })}</button>}
            </section>
          )}

          {sec === "team" && (
            <section className="sp">
              <h2>{T("Team and logins")}</h2>
              <p className="sp-sub">{T("Everyone gets their own username and password. Partners can open Settings; staff work leads and cases. Changes here save straight away.")}</p>
              <div className="usr">
                {users.map((u) => (
                  <div key={u.id} className="usr-r">
                    <span className="c-who"><Avatar name={u.fullName} size={36} /><span className="who-t"><b>{u.fullName}{u.id === meId ? ` ${T("(you)")}` : ""}</b><i>@{u.username}</i></span></span>
                    <span className="usr-pw"><code className="pwc">{reveal[u.id] ? u.pw : "••••••••"}</code><button className="linkbtn" onClick={() => setReveal((r) => ({ ...r, [u.id]: !r[u.id] }))}>{reveal[u.id] ? T("Hide") : T("Show")}</button></span>
                    <select className="inp" value={u.role} disabled={u.id === meId} onChange={(e) => updateUser(u.id, { role: e.target.value }, T("{n} is now {r}", { n: u.fullName, r: T(ROLE_LABEL[e.target.value]) }))}><option value="partner">{T("Partner")}</option><option value="staff">{T("Staff")}</option></select>
                    <span className="usr-sw"><button className={`switch ${u.active !== false ? "on" : ""}`} disabled={u.id === meId} role="switch" aria-checked={u.active !== false} onClick={() => updateUser(u.id, { active: u.active === false }, u.active === false ? T("{n} can sign in", { n: u.fullName }) : T("{n} can no longer sign in", { n: u.fullName }))}><span /></button><em>{u.active !== false ? T("Can sign in") : T("Blocked")}</em></span>
                    <span className="usr-x">{u.id !== meId && (confirmRm === u.id
                      ? <span className="dz-c inline"><button className="btn sm" onClick={() => setConfirmRm(null)}>{T("Keep")}</button><button className="btn sm danger" onClick={() => { removeUser(u.id); setConfirmRm(null); }}>{T("Remove")}</button></span>
                      : <button className="ib" aria-label={T("Remove {c}", { c: u.fullName })} onClick={() => setConfirmRm(u.id)}><Icon name="trash" /></button>)}</span>
                  </div>
                ))}
              </div>
              <div className="newlogin">
                <h3>{T("Create a login")}</h3>
                <div className="nl-grid">
                  <Field label={T("Full name")}><input value={nu.fullName} onChange={(e) => { setNu({ ...nu, fullName: e.target.value }); setNuErr(""); }} placeholder="Hana Bekele" /></Field>
                  <Field label={T("Username")}><input value={nu.username} autoCapitalize="none" onChange={(e) => { setNu({ ...nu, username: e.target.value }); setNuErr(""); }} placeholder={(nu.fullName.split(" ")[0] || "hana").toLowerCase()} /></Field>
                  <Field label={T("Role")}><select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="staff">{T("Staff")}</option><option value="partner">{T("Partner")}</option></select></Field>
                  <Field label={T("Password")}><span className="pwbox"><input value={nu.pw} onChange={(e) => setNu({ ...nu, pw: e.target.value })} /><button type="button" className="ib" title={T("Generate a new password")} aria-label={T("Generate a new password")} onClick={() => setNu({ ...nu, pw: randomPw() })}><Icon name="refresh" /></button></span></Field>
                  <button className="btn primary" onClick={createLogin}><Icon name="plus" />{T("Create login")}</button>
                </div>
                {nuErr && <p className="formerr"><Icon name="alert" />{nuErr}</p>}
                <p className="muted small">{T("Share the username and password with the person directly. You can show it again here any time.")}</p>
              </div>
            </section>
          )}

          {sec === "followup" && (
            <section className="sp">
              <h2>{T("Lead follow-up")}</h2>
              <p className="sp-sub">{T("When each call is due, counted in days from the enquiry. If nobody answers the last call, the lead closes as “No response”.")}</p>
              <div className="flow">
                {cad.map((d, i) => (
                  <div key={i} className="flow-n">
                    <span className="flow-dot">{i + 1}</span>
                    <span className="flow-l">{T("Call {n}", { n: i + 1 })}</span>
                    {i === 0 ? <span className="flow-d same">{T("Same day")}</span> : (
                      <label className="flow-d">{T("Day")} <input inputMode="numeric" value={d} onChange={(e) => setCad(cad.map((x, j) => j === i ? Math.max(0, parseInt(e.target.value || 0, 10)) : x))} /></label>
                    )}
                    {i > 0 && cad.length > 2 && <button className="flow-x" aria-label={T("Remove call {n}", { n: i + 1 })} onClick={() => setCad(cad.filter((_, j) => j !== i))}><Icon name="close" /></button>}
                  </div>
                ))}
                <button className="flow-add" onClick={() => setCad([...cad, (cad[cad.length - 1] || 0) + 7])}><Icon name="plus" />{T("Add a call")}</button>
                <div className="flow-n end"><span className="flow-dot x"><Icon name="close" /></span><span className="flow-l">{T("Closed")}</span><span className="flow-d same">{T("No response")}</span></div>
              </div>
              <p className="muted small">{T("Calls on day {d}. Save changes to apply the new plan to open leads.", { d: [...cad].sort((a, b) => a - b).join(SEP()) })}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   REPORTS
   Send the partners a ready-made summary, open quick weekly / monthly /
   yearly reports, or build your own and download it as Excel or CSV.
   ============================================================ */

/* ---------- Periods ---------- */
const dateOf = (iso) => { if (!iso) return ""; const s = String(iso); if (s.length <= 10) return s; const d = new Date(s); return isNaN(d) ? "" : ymd(d); };
const weekStartStr = (s) => { const d = toDate(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
// Months and years follow the Ethiopian calendar (13 months; Pagume is the short 13th).
const monthStartStr = (s) => { const e = toEth(s); return fromEth(e.y, e.m, 1); };
const monthEndStr = (s) => { const e = toEth(s); return fromEth(e.y, e.m, ethMonthDays(e.y, e.m)); };
const addMonthsStr = (s, n) => { const e = toEth(s); let k = (e.y * 13 + (e.m - 1)) + n; return fromEth(Math.floor(k / 13), (k % 13) + 1, 1); };
const yearStartStr = (s) => fromEth(toEth(s).y, 1, 1);
const yearEndStr = (s) => { const y = toEth(s).y; return fromEth(y, 13, ethMonthDays(y, 13)); };
const longDay = (s, withYear) => ethLong(s, { short: true, year: withYear });
const monthName = (s, short) => { const e = toEth(s); return short ? ethMonth(e.m, true) : ethMonthYear(e.y, e.m); };

function resolveRange(key, from, to) {
  const today = todayStr();
  let f = today, t = today;
  switch (key) {
    case "week": f = weekStartStr(today); t = addDaysStr(f, 6); break;
    case "lastWeek": f = addDaysStr(weekStartStr(today), -7); t = addDaysStr(f, 6); break;
    case "month": f = monthStartStr(today); t = monthEndStr(today); break;
    case "lastMonth": f = addMonthsStr(today, -1); t = monthEndStr(f); break;
    case "year": f = yearStartStr(today); t = yearEndStr(today); break;
    case "custom": f = from || monthStartStr(today); t = to || today; if (f > t) [f, t] = [t, f]; break;
    default: break;
  }
  const label = f === t ? ethLong(f, { weekday: true, short: true, year: true })
    : `${longDay(f, toEth(f).y !== toEth(t).y)} – ${longDay(t, true)}`;
  const plain = f === t ? dmy(f) : `${dmy(f)} to ${dmy(t)}`;
  return { key, from: f, to: t, label, plain };
}

/* ---------- What a report can hold ---------- */
const DATASETS = ["leads", "calls", "students", "moves", "payments", "visas"];
const DATASET_INFO = {
  leads: { label: "Enquiries", desc: "Every new lead logged: name, phone, source, interest, status and calls made", icon: "chat", tone: 6 },
  calls: { label: "Calls made", desc: "Every follow-up call: when, outcome, note and who called", icon: "phone", tone: 1 },
  students: { label: "New students", desc: "Cases opened: destination, university, package, funding and officer", icon: "users", tone: 2 },
  moves: { label: "Step moves", desc: "Every time a case moved to a new step, and who moved it", icon: "right", tone: 3 },
  payments: { label: "Payments", desc: "Registration fees and milestone payments received", icon: "money", tone: 4 },
  visas: { label: "Visa decisions", desc: "Approved, refused, or more documents asked for", icon: "plane", tone: 5 },
};
const PAY_LABEL = { registration: "Registration fee", payment1: "Payment 1", payment2: "Payment 2" };
const LEAD_STATUS = { open: "Open", closed: "Closed", converted: "Registered" };

function buildReport(students, leads, from, to, include) {
  const within = (iso) => { const d = dateOf(iso); return !!d && d >= from && d <= to; };
  const leadsIn = leads.filter((l) => within(l.createdAt)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const calls = [];
  leads.forEach((l) => (l.calls || []).forEach((c) => { if (within(c.ts)) calls.push({ c, l }); }));
  calls.sort((a, b) => (a.c.ts || "").localeCompare(b.c.ts || ""));
  const newStu = students.filter((s) => within(s.createdAt)).sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const moves = [];
  students.forEach((s) => (s.notes || []).forEach((n) => {
    if (n.kind !== "stage" || !within(n.ts)) return;
    const m = (n.text || "").match(/^Moved from (.+) to (.+)$/);
    if (m) moves.push({ s, n, from: m[1], to: m[2] });
  }));
  moves.sort((a, b) => (a.n.ts || "").localeCompare(b.n.ts || ""));
  const pays = [];
  students.forEach((s) => Object.keys(PAY_LABEL).forEach((k) => { const p = s.payments?.[k]; if (p?.paid && within(p.date)) pays.push({ s, k, p, amount: Number(moneyOut(p.amount)) || 0 }); }));
  pays.sort((a, b) => (a.p.date || "").localeCompare(b.p.date || ""));
  const visas = students.filter((s) => s.decision && within(s.decidedAt || s.updatedAt)).sort((a, b) => (a.decidedAt || a.updatedAt || "").localeCompare(b.decidedAt || b.updatedAt || ""));
  const closed = leads.filter((l) => l.status === "closed" && within(l.updatedAt)).length;
  const dest = (s) => s.strategy?.country || s.targetCountries?.[0] || "";

  const tables = [];
  const C = (xs) => xs.map((x) => T(x));
  if (include.includes("leads")) tables.push({ key: "leads", name: T(DATASET_INFO.leads.label),
    columns: C(["Code", "Logged", "Name", "Phone", "Source", "Interested in", "Package", "Status", "Closed because", "Calls"]),
    types: ["t", "d", "t", "t", "t", "t", "t", "t", "t", "n"],
    rows: leadsIn.map((l) => [l.code, dateOf(l.createdAt), l.name, l.phone, T(l.source || ""), T(l.interestCountry || ""), l.interestPackage ? T(PACKAGE_LABEL[l.interestPackage] || l.interestPackage) : "", T(LEAD_STATUS[l.status] || l.status), l.closeReason ? T(CLOSE_REASONS[l.closeReason] || "") : "", l.callAttempts || 0]) });
  if (include.includes("calls")) tables.push({ key: "calls", name: T(DATASET_INFO.calls.label),
    columns: C(["Date", "Time", "Lead", "Name", "Phone", "Call no.", "Outcome", "Note", "Called by"]),
    types: ["d", "t", "t", "t", "t", "n", "t", "t", "t"],
    rows: calls.map(({ c, l }) => [dateOf(c.ts), new Date(c.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), l.code, l.name, l.phone, c.attempt || "", T(LEAD_OUTCOMES[c.outcome] || c.outcome), c.note || "", c.author || ""]) });
  if (include.includes("students")) tables.push({ key: "students", name: T(DATASET_INFO.students.label),
    columns: C(["Case", "Opened", "Name", "Phone", "Source", "Destination", "University", "Package", "Funding", "Officer", "Current step"]),
    types: ["t", "d", "t", "t", "t", "t", "t", "t", "t", "t", "t"],
    rows: newStu.map((s) => [s.id, dateOf(s.createdAt), s.fullName, s.phone, T(s.source || ""), T(dest(s)), s.strategy?.university || "", s.packageType ? T(PACKAGE_LABEL[s.packageType]) : "", s.sponsorType ? T(FUNDING_LABEL[s.sponsorType]) : "", s.officer || "", s.archived ? T("Archived") : T(STAGES[STAGE_INDEX[s.stage]]?.label || "")]) });
  if (include.includes("moves")) tables.push({ key: "moves", name: T(DATASET_INFO.moves.label),
    columns: C(["Date", "Case", "Student", "From", "To", "Moved by"]),
    types: ["d", "t", "t", "t", "t", "t"],
    rows: moves.map((m) => [dateOf(m.n.ts), m.s.id, m.s.fullName, T(m.from), T(m.to), m.n.author || ""]) });
  if (include.includes("payments")) tables.push({ key: "payments", name: T(DATASET_INFO.payments.label),
    columns: C(["Date paid", "Case", "Student", "Payment", "Amount (ETB)", "Package", "Destination"]),
    types: ["d", "t", "t", "t", "m", "t", "t"],
    rows: pays.map((x) => [x.p.date, x.s.id, x.s.fullName, T(PAY_LABEL[x.k]), x.amount, x.s.packageType ? T(PACKAGE_LABEL[x.s.packageType]) : "", T(dest(x.s))]) });
  if (include.includes("visas")) tables.push({ key: "visas", name: T(DATASET_INFO.visas.label),
    columns: C(["Date", "Case", "Student", "Country", "University", "Decision", "Officer"]),
    types: ["d", "t", "t", "t", "t", "t", "t"],
    rows: visas.map((s) => [dateOf(s.decidedAt || s.updatedAt), s.id, s.fullName, T(s.visaCountry || dest(s)), s.strategy?.university || "", T(DECISION[s.decision]?.label || s.decision), s.officer || ""]) });

  const tally = (xs, key) => { const m = new Map(); xs.forEach((x) => { const k = key(x) || T("Not set"); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const byOfficer = new Map();
  const bump = (name, field) => { const k = name || T("Not assigned"); const e = byOfficer.get(k) || { calls: 0, moves: 0, students: 0 }; e[field]++; byOfficer.set(k, e); };
  calls.forEach(({ c }) => bump(c.author, "calls"));
  moves.forEach((m) => bump(m.n.author, "moves"));
  newStu.forEach((s) => bump(s.officer, "students"));
  const summary = {
    leads: leadsIn.length, calls: calls.length, answered: calls.filter(({ c }) => c.outcome === "answered").length,
    students: newStu.length, moves: moves.length, payments: pays.length, collected: pays.reduce((a, x) => a + x.amount, 0),
    approved: visas.filter((s) => s.decision === "approved").length, refused: visas.filter((s) => s.decision === "refused").length,
    additional: visas.filter((s) => s.decision === "additional").length, closed,
    converted: leads.filter((l) => l.status === "converted" && within(l.updatedAt)).length,
    bySource: tally(leadsIn, (l) => T(l.source || "")), byDest: tally(newStu, (s) => T(dest(s))),
    byPayment: Object.keys(PAY_LABEL).map((k) => [T(PAY_LABEL[k]), pays.filter((x) => x.k === k).reduce((a, x) => a + x.amount, 0), pays.filter((x) => x.k === k).length]).filter((x) => x[2]),
    byOfficer: [...byOfficer.entries()].sort((a, b) => (b[1].calls + b[1].moves + b[1].students) - (a[1].calls + a[1].moves + a[1].students)),
    newNames: newStu.map((s) => s.fullName),
  };
  return { tables, summary };
}

/* Last N months, for the trend chart */
function monthlyTrend(students, leads, months) {
  // Pagume (5 or 6 days) is folded into Nehase so every bar is a full month.
  const out = [];
  let cur = monthStartStr(todayStr());
  if (toEth(cur).m === 13) cur = addMonthsStr(cur, -1);
  while (out.length < months) {
    const e = toEth(cur);
    const end = e.m === 12 ? monthEndStr(addMonthsStr(cur, 1)) : monthEndStr(cur);
    const s = buildReport(students, leads, cur, end, []).summary;
    out.unshift({ m: cur, leads: s.leads, students: s.students, approved: s.approved, collected: s.collected });
    cur = addMonthsStr(cur, -1);
    if (toEth(cur).m === 13) cur = addMonthsStr(cur, -1);
  }
  return out;
}

/* Ready-to-send summary for Telegram / WhatsApp */
function reportMessage(students, leads, r, title, by, partner, settings) {
  const s = buildReport(students, leads, r.from, r.to, []).summary;
  const today = todayStr();
  const overdue = leads.filter((l) => l.status === "open" && leadBucket(l, today) === "overdue").length;
  const active = students.filter((x) => !x.archived);
  const feesDue = active.filter((x) => x.stage === "registration" && !x.payments?.registration?.paid).length
    + active.filter((x) => STAGE_INDEX[x.stage] >= STAGE_INDEX.admission && !x.payments?.payment1?.paid).length;
  const src = s.bySource.slice(0, 4).map(([k, v]) => `${k} ${v}`).join(SEP());
  const names = s.newNames.slice(0, 6).join(SEP()) + (s.newNames.length > 6 ? T(" and {n} more", { n: s.newNames.length - 6 }) : "");
  const lines = [
    `📋 ${T("{biz}: {title}", { biz: settings?.businessName || "Yimaru Consulting", title })}`,
    `🗓 ${r.label}`,
    `✍️ ${T("Prepared by {name}", { name: by || "—" })}`,
    "",
    `📞 ${T("New enquiries: {n}", { n: s.leads })}${src ? ` (${src})` : ""}`,
    `☎️ ${T("Calls made: {n}, answered: {a}", { n: s.calls, a: s.answered })}`,
    `✅ ${T("New students: {n}", { n: s.students })}${names ? `: ${names}` : ""}`,
    `➡️ ${T("Step moves: {n}", { n: s.moves })}`,
    `💳 ${T("Payments received: {n}", { n: s.payments })}${partner && s.collected ? `, ${etb(s.collected)}` : ""}`,
    `🛂 ${T("Visas: {a} approved, {r} refused, {m} asked for more", { a: s.approved, r: s.refused, m: s.additional })}`,
    `❌ ${T("Leads closed: {n}", { n: s.closed })}`,
    "",
    `⚠️ ${T("Right now: {a} calls overdue, {b} payments due", { a: overdue, b: feesDue })}`,
  ];
  return lines.join("\n");
}

/* ---------- Files ---------- */
// Save a file: the published page asks the viewer through the downloads capability; elsewhere a plain link.
async function saveFile(filename, blob) {
  const c = typeof window !== "undefined" ? window.claude : null;
  if (c && typeof c.use === "function") {
    let d = null;
    try { d = await c.use("downloads"); } catch { d = null; }
    if (d) {
      try { await d.save({ filename, data: blob }); return "saved"; }
      catch (e) { return e && e.code === "declined" ? "declined" : "failed"; }
    }
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "saved";
  } catch { return "failed"; }
}
const fileBase = (r) => `${T("Yimaru report")} ${r.plain.replace(/\//g, "-")}`;
const cellText = (v, type) => (type === "d" && v ? dmy(v) : type === "m" ? (v ? Number(v).toLocaleString("en-US") : "") : String(v ?? ""));

function toCSV(tables) {
  const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return tables.map((t) => [q(t.name), t.columns.map(q).join(","), ...t.rows.map((r) => r.map((v, j) => q(t.types[j] === "m" ? String(v || 0) : cellText(v, t.types[j]))).join(","))].join("\n")).join("\n\n");
}

// Use the already-imported ExcelJS package (bundled via npm, not CDN)
let _excelJSPromise = null;
function loadExcel() {
  if (!_excelJSPromise) {
    _excelJSPromise = Promise.resolve(ExcelJS);
  }
  return _excelJSPromise;
}

/* Brand colours for the workbook (ARGB) */
const XB = { plum: "FF3E0F3A", vv: "FF9A288D", vvLight: "FFF6DDF0", tint: "FFFBF6FA", ink: "FF211320", muted: "FF7D6F7C", line: "FFE8DFE8", white: "FFFFFFFF", yellow: "FFFFD23F" };
const XTAB = { summary: "FF9A288D", leads: "FF22D3A6", calls: "FF6E9EEA", students: "FFA386E3", moves: "FFDB7FC6", payments: "FFF5C518", visas: "FF83C45A" };
const XSOFT = { leads: ["FFCDF5EA", "FF0D6650"], calls: ["FFDCE8FC", "FF24508F"], students: ["FFE8DDF8", "FF55339A"], moves: ["FFF8DAF0", "FF8E2A7C"], payments: ["FFFFF0A8", "FF735300"], visas: ["FFDFF3CD", "FF3B6A18"], money: ["FFFDE4D2", "FF8A4318"] };

async function buildWorkbook({ students, leads, r, include, by, partner, settings }) {
  const EJS = await loadExcel();
  const { tables, summary: s } = buildReport(students, leads, r.from, r.to, include);
  const font = LANG === "am" ? "Nyala" : "Calibri";
  const wb = new EJS.Workbook();
  wb.creator = settings?.businessName || "Yimaru Consulting"; wb.created = new Date();
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const ws = wb.addWorksheet(T("Summary"), { properties: { tabColor: { argb: XTAB.summary } }, views: [{ showGridLines: false }],
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 3 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 3 }];
  ws.getRow(1).height = 10;
  for (let rr = 2; rr <= 5; rr++) ws.getRow(rr).height = 21;
  try {
    const img = wb.addImage({ base64: LOGO_FULL.split(",")[1], extension: "png" });
    ws.addImage(img, { tl: { col: 1, row: 1.2 }, ext: { width: 190, height: 58 } });
  } catch {}
  ["D2:G2", "D3:G3", "D4:G4"].forEach((m) => ws.mergeCells(m));
  ws.getCell("D2").value = T("Activity report"); ws.getCell("D2").font = { name: font, size: 20, bold: true, color: { argb: XB.plum } };
  ws.getCell("D3").value = r.label; ws.getCell("D3").font = { name: font, size: 12, color: { argb: XB.ink } };
  ws.getCell("D4").value = T("Prepared by {name} on {date}", { name: by || "—", date: dmy(todayStr()) }); ws.getCell("D4").font = { name: font, size: 10, color: { argb: XB.muted } };
  ["D2", "D3", "D4"].forEach((c) => (ws.getCell(c).alignment = { horizontal: "right", vertical: "middle" }));
  ws.getRow(6).height = 6;
  const bar = ["FF9A288D", "FF7A2194", "FF6A1B9A", "FF4C6FE0", "FF34AACB", "FF1DE9B6"];
  for (let c = 2; c <= 7; c++) ws.getRow(6).getCell(c).fill = fill(bar[c - 2]);

  let row = 8;
  const band = (title) => {
    ws.mergeCells(row, 2, row, 7);
    const c = ws.getCell(row, 2); c.value = title; c.font = { name: font, size: 11, bold: true, color: { argb: XB.white } };
    c.fill = fill(XB.plum); c.alignment = { vertical: "middle", indent: 1 }; ws.getRow(row).height = 24; row += 1;
  };
  band(T("Key figures"));
  const kpis = [
    [T("New enquiries"), s.leads, XSOFT.leads], [T("Calls made"), s.calls, XSOFT.calls], [T("New students"), s.students, XSOFT.students],
    [T("Step moves"), s.moves, XSOFT.moves], [T("Payments received"), s.payments, XSOFT.payments], [T("Visas approved"), s.approved, XSOFT.visas],
  ];
  if (partner) kpis.push([T("Collected (ETB)"), s.collected, XSOFT.money, true]);
  for (let i = 0; i < kpis.length; i += 3) {
    const lr = ws.getRow(row), vr = ws.getRow(row + 1); lr.height = 20; vr.height = 32;
    kpis.slice(i, i + 3).forEach(([label, v, [bg, fg], money], j) => {
      const col = 2 + j * 2;
      ws.mergeCells(row, col, row, col + 1); ws.mergeCells(row + 1, col, row + 1, col + 1);
      const l = ws.getCell(row, col), val = ws.getCell(row + 1, col);
      l.value = label; l.font = { name: font, size: 10, bold: true, color: { argb: fg } }; l.fill = fill(bg); l.alignment = { indent: 1, vertical: "bottom" };
      val.value = v; val.numFmt = money ? "#,##0" : "0"; val.font = { name: font, size: 20, bold: true, color: { argb: XB.ink } }; val.fill = fill(bg); val.alignment = { indent: 1, horizontal: "left", vertical: "middle" };
    });
    row += 3;
  }
  const list = (title, rows, cols) => {
    if (!rows.length) return;
    band(title);
    const h = ws.getRow(row);
    cols.forEach((c, j) => { const cell = h.getCell(2 + j * (j ? 1 : 1)); cell.value = c; cell.font = { name: font, size: 10, bold: true, color: { argb: XB.muted } }; });
    row++;
    rows.forEach((vals, i) => {
      const rr = ws.getRow(row);
      vals.forEach((v, j) => { const cell = rr.getCell(2 + j); cell.value = v; cell.font = { name: font, size: 11, color: { argb: XB.ink } }; if (typeof v === "number" && v > 999) cell.numFmt = "#,##0"; if (i % 2) cell.fill = fill(XB.tint); cell.border = { bottom: { style: "thin", color: { argb: XB.line } } }; });
      row++;
    });
    row++;
  };
  list(T("Enquiries by source"), s.bySource.map(([k, v]) => [k, v]), [T("Source"), T("Enquiries")]);
  list(T("New students by destination"), s.byDest.map(([k, v]) => [k, v]), [T("Destination"), T("Students")]);
  if (partner) list(T("Money received"), s.byPayment.map(([k, v, n]) => [k, n, v]), [T("Payment"), T("Count"), T("Amount (ETB)")]);
  list(T("Work by team member"), s.byOfficer.map(([k, v]) => [k, v.calls, v.moves, v.students]), [T("Team member"), T("Calls"), T("Step moves"), T("New students")]);
  ws.getCell(row, 2).value = T("One sheet follows for each part of the report.") + " " + T("All dates are in the Ethiopian calendar.");
  ws.getCell(row, 2).font = { name: font, size: 9, italic: true, color: { argb: XB.muted } };

  tables.forEach((t) => {
    const sh = wb.addWorksheet(t.name.slice(0, 31), { properties: { tabColor: { argb: XTAB[t.key] } }, views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    const n = t.columns.length;
    sh.mergeCells(1, 1, 1, n);
    const ttl = sh.getCell(1, 1); ttl.value = `${t.name}: ${t.rows.length}`; ttl.font = { name: font, size: 15, bold: true, color: { argb: XB.plum } }; sh.getRow(1).height = 26;
    sh.mergeCells(2, 1, 2, n);
    const sub = sh.getCell(2, 1); sub.value = r.label; sub.font = { name: font, size: 10, color: { argb: XB.muted } };
    const head = sh.getRow(3); head.height = 22;
    t.columns.forEach((c, j) => { const cell = head.getCell(j + 1); cell.value = c; cell.font = { name: font, size: 10, bold: true, color: { argb: XB.white } }; cell.fill = fill(XB.plum); cell.alignment = { vertical: "middle", horizontal: t.types[j] === "m" || t.types[j] === "n" ? "right" : "left" }; });
    t.rows.forEach((vals, i) => {
      const rr = sh.getRow(4 + i);
      vals.forEach((v, j) => {
        const cell = rr.getCell(j + 1); const ty = t.types[j];
        if (ty === "d" && v) { cell.value = dmy(v); cell.alignment = { horizontal: "left" }; }
        else if (ty === "m") { cell.value = Number(v) || 0; cell.numFmt = "#,##0"; }
        else cell.value = v === "" ? null : v;
        cell.font = { name: font, size: 10.5, color: { argb: XB.ink } };
        if (i % 2) cell.fill = fill(XB.tint);
        cell.border = { bottom: { style: "thin", color: { argb: XB.line } } };
      });
    });
    if (t.rows.length) {
      sh.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + t.rows.length, column: n } };
      const mi = t.types.indexOf("m");
      if (mi >= 0) {
        const tr = sh.getRow(4 + t.rows.length);
        tr.getCell(1).value = T("Total"); tr.getCell(1).font = { name: font, bold: true };
        const cell = tr.getCell(mi + 1); cell.value = { formula: `SUM(${String.fromCharCode(65 + mi)}4:${String.fromCharCode(65 + mi)}${3 + t.rows.length})`, result: t.rows.reduce((a, x) => a + (Number(x[mi]) || 0), 0) };
        cell.numFmt = "#,##0"; cell.font = { name: font, bold: true }; cell.fill = fill(XB.vvLight);
      }
    } else {
      sh.getCell(4, 1).value = T("None in this period."); sh.getCell(4, 1).font = { name: font, italic: true, color: { argb: XB.muted } };
    }
    sh.columns.forEach((col, j) => {
      const w = Math.max(String(t.columns[j]).length, ...t.rows.map((x) => cellText(x[j], t.types[j]).length));
      col.width = Math.min(Math.max(w + 3, 9), j === t.columns.length - 1 || /Note|ማስታወሻ/.test(t.columns[j]) ? 48 : 34);
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* A standalone page of the report, to open in a browser and print or save as PDF */
function reportHTML({ students, leads, r, include, by, partner, settings }) {
  const { tables, summary: s } = buildReport(students, leads, r.from, r.to, include);
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const kp = [[T("New enquiries"), s.leads, "#CDF5EA"], [T("Calls made"), s.calls, "#DCE8FC"], [T("New students"), s.students, "#E8DDF8"], [T("Step moves"), s.moves, "#F8DAF0"], [T("Payments received"), s.payments, "#FFF0A8"], [T("Visas approved"), s.approved, "#DFF3CD"]];
  if (partner) kp.push([T("Collected"), etb(s.collected) || "0", "#FDE4D2"]);
  const lists = [[T("Enquiries by source"), s.bySource], [T("New students by destination"), s.byDest]];
  return `<!doctype html><html lang="${LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(fileBase(r))}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&family=Noto+Sans+Ethiopic:wght@400;600;700&display=swap">
<style>body{margin:0;background:#F6F2F6;color:#211320;font:14px/1.45 'Hanken Grotesk','Noto Sans Ethiopic',system-ui,sans-serif}.pg{max-width:1100px;margin:24px auto;background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 14px rgba(46,12,43,.06)}
header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding-bottom:16px;border-bottom:4px solid;border-image:linear-gradient(90deg,#9A288D,#6A1B9A,#4C6FE0,#1DE9B6) 1}header img{height:52px}h1{margin:0;font-size:26px;color:#3E0F3A}.m{color:#7D6F7C;font-size:13px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:22px 0}.k div{border-radius:14px;padding:12px 14px}.k span{display:block;font-size:12px;font-weight:600;color:#4B3D4A}.k b{font-size:24px}
.l{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:12px}.l h2,section h2{font-size:15px;margin:18px 0 8px}.l p{display:flex;justify-content:space-between;margin:0;padding:6px 0;border-bottom:1px solid #F2ECF2}
table{width:100%;border-collapse:collapse;font-size:12px}th{background:#3E0F3A;color:#fff;text-align:left;padding:7px 8px;white-space:nowrap}td{padding:6px 8px;border-bottom:1px solid #F2ECF2}tr:nth-child(even) td{background:#FBF6FA}.r{text-align:right}
button{position:fixed;right:20px;top:20px;border:0;border-radius:999px;background:#9A288D;color:#fff;font:inherit;font-weight:700;padding:10px 20px;cursor:pointer}@media print{body{background:#fff}.pg{margin:0;box-shadow:none;padding:0}button{display:none}section{break-inside:auto}}</style></head><body>
<button onclick="print()">${esc(T("Print or save as PDF"))}</button><div class="pg"><header><div><h1>${esc(T("Activity report"))}</h1><div>${esc(settings?.businessName || "Yimaru Consulting")} · ${esc(r.label)}</div><div class="m">${esc(T("Prepared by {name} on {date}", { name: by || "—", date: dmy(todayStr()) }))}</div></div><img src="${LOGO_FULL}" alt="Yimaru Consulting"></header>
<div class="k">${kp.map(([l, v, c]) => `<div style="background:${c}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("")}</div>
<div class="l">${lists.map(([t, rows]) => `<div><h2>${esc(t)}</h2>${rows.length ? rows.map(([k, v]) => `<p><span>${esc(k)}</span><b>${v}</b></p>`).join("") : `<p class="m">${esc(T("None in this period."))}</p>`}</div>`).join("")}</div>
${tables.map((t) => `<section><h2>${esc(t.name)} <span class="m">(${t.rows.length})</span></h2>${t.rows.length ? `<table><thead><tr>${t.columns.map((c, j) => `<th class="${t.types[j] === "m" || t.types[j] === "n" ? "r" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((row) => `<tr>${row.map((v, j) => `<td class="${t.types[j] === "m" || t.types[j] === "n" ? "r" : ""}">${esc(cellText(v, t.types[j]))}</td>`).join("")}</tr>`).join("")}</tbody></table>` : `<p class="m">${esc(T("None in this period."))}</p>`}</section>`).join("")}
</div></body></html>`;
}

/* ---------- UI pieces ---------- */
function TrendChart({ data, partner }) {
  const SERIES = [["leads", T("Enquiries"), "#4C6FE0"], ["students", T("New students"), "#9A288D"], ["approved", T("Visas approved"), "#14A57F"]];
  const [hover, setHover] = useState(-1);
  const [table, setTable] = useState(false);
  const wrap = useRef(null);
  const [cw, setCw] = useState(900);
  useEffect(() => {
    const el = wrap.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setCw(w); });
    ro.observe(el); return () => ro.disconnect();
  }, [table]);
  const W = Math.max(300, cw), H = cw < 560 ? 220 : 250, padL = 30, padB = 26, padT = 12;
  const max = Math.max(4, ...data.flatMap((d) => SERIES.map(([k]) => d[k])));
  const nice = Math.ceil(max / 4) * 4;
  const gw = (W - padL) / data.length, bw = Math.min(16, (gw - 18) / 3);
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  return (
    <section className="panel">
      <div className="panel-h">
        <h2>{T("Last 6 months")}</h2>
        <div className="rpt-legend">{SERIES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}</span>)}</div>
        <div className="panel-x"><Segmented items={[["chart", T("Chart")], ["table", T("Table")]]} value={table ? "table" : "chart"} onChange={(v) => setTable(v === "table")} /></div>
      </div>
      {table ? (
        <div className="rpt-tw"><table className="rpt-t">
          <thead><tr><th>{T("Month")}</th>{SERIES.map(([k, l]) => <th key={k} className="r">{l}</th>)}{partner && <th className="r">{T("Collected")}</th>}</tr></thead>
          <tbody>{data.map((d) => <tr key={d.m}><td>{monthName(d.m)}</td>{SERIES.map(([k]) => <td key={k} className="r">{d[k]}</td>)}{partner && <td className="r">{etb(d.collected) || "0"}</td>}</tr>)}</tbody>
        </table></div>
      ) : (
        <div className="rpt-chart" ref={wrap} onMouseLeave={() => setHover(-1)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={T("Enquiries, new students and visas approved, month by month")}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}><line x1={padL} x2={W} y1={y(nice * f)} y2={y(nice * f)} stroke="var(--line)" strokeWidth="1" /><text x={padL - 8} y={y(nice * f) + 4} textAnchor="end" className="rpt-ax">{Math.round(nice * f)}</text></g>
            ))}
            {data.map((d, i) => {
              const x0 = padL + i * gw + (gw - bw * 3 - 4) / 2;
              return (
                <g key={d.m} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
                  <rect x={padL + i * gw} y={padT} width={gw} height={H - padT - padB} fill={hover === i ? "rgba(154,40,141,.05)" : "transparent"} />
                  {SERIES.map(([k, , c], j) => {
                    const v = d[k], top = y(v), h = Math.max(0, H - padB - top);
                    return v ? <path key={k} d={`M${x0 + j * (bw + 2)},${H - padB} v${-Math.max(h - 4, 0)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(h - 4, 0)} z`} fill={c} /> : null;
                  })}
                  <text x={padL + i * gw + gw / 2} y={H - 8} textAnchor="middle" className="rpt-ax">{monthName(d.m, true)}</text>
                </g>
              );
            })}
          </svg>
          {hover >= 0 && (
            <div className="rpt-tip" style={{ left: `${((padL + hover * gw + gw / 2) / W) * 100}%` }}>
              <b>{monthName(data[hover].m)}</b>
              {SERIES.map(([k, l, c]) => <span key={k}><i style={{ background: c }} />{l}<em>{data[hover][k]}</em></span>)}
              {partner && <span><i style={{ background: "transparent" }} />{T("Collected")}<em>{etb(data[hover].collected) || "0"}</em></span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Step({ n, title, hint }) {
  return <div className="rpt-step"><span>{n}</span><div><b>{title}</b>{hint && <p>{hint}</p>}</div></div>;
}

/* ---------- On-screen report ---------- */
function ReportView({ students, leads, spec, me, partner, settings, back, excel, flash }) {
  const r = resolveRange(spec.range, spec.from, spec.to);
  const { tables, summary: s } = buildReport(students, leads, r.from, r.to, spec.what);
  const kp = [
    [T("New enquiries"), s.leads, STAGE_TONE[5]], [T("Calls made"), s.calls, STAGE_TONE[1]], [T("New students"), s.students, STAGE_TONE[2]],
    [T("Step moves"), s.moves, STAGE_TONE[3]], [T("Payments received"), s.payments, STAGE_TONE[4]], [T("Visas approved"), s.approved, STAGE_TONE[6]],
  ];
  if (partner) kp.push([T("Collected"), etb(s.collected) || "0", STAGE_TONE[0]]);
  const copy = () => {
    const text = toCSV(tables).replace(/,/g, "\t");
    const ok = () => flash(T("Copied. Paste it into Excel or Google Sheets."));
    try { navigator.clipboard.writeText(text).then(ok, () => flash(T("Couldn’t copy here."))); } catch { flash(T("Couldn’t copy here.")); }
  };
  return (
    <div className="pg">
      <div className="rpt-bar">
        <button className="btn" onClick={back}><Icon name="back" />{T("Back to reports")}</button>
        <div className="rpt-bar-a">
          <button className="btn primary" onClick={() => excel(spec.range, spec.what)}><Icon name="dl" />{T("Download Excel")}</button>
          <button className="btn" onClick={copy}><Icon name="copy" />{T("Copy table")}</button>
        </div>
      </div>
      <article className="panel rpt-doc">
        <header className="rpt-doc-h">
          <div><h1>{T("Activity report")}</h1><p>{settings?.businessName || "Yimaru Consulting"} · {r.label}</p><p className="muted small">{T("Prepared by {name} on {date}", { name: me?.fullName || "—", date: dmy(todayStr()) })}</p></div>
          <img src={LOGO_FULL} alt="Yimaru Consulting" />
        </header>
        <div className="rpt-kp">{kp.map(([l, v, t]) => <div key={l} style={{ background: t.bg, color: t.fg }}><span>{l}</span><b>{v}</b></div>)}</div>
        <div className="rpt-lists">
          <div><h2>{T("Enquiries by source")}</h2><RankList rows={s.bySource.map(([k, v]) => ({ key: k, label: k, n: v }))} color="#4C6FE0" empty={T("None in this period.")} /></div>
          <div><h2>{T("New students by destination")}</h2><RankList rows={s.byDest.map(([k, v]) => ({ key: k, label: k, n: v }))} color="#9A288D" empty={T("None in this period.")} /></div>
          {s.byOfficer.length > 0 && <div className="rpt-wide"><h2>{T("Work by team member")}</h2>
            <div className="rpt-tw"><table className="rpt-t"><thead><tr><th>{T("Team member")}</th><th className="r">{T("Calls")}</th><th className="r">{T("Step moves")}</th><th className="r">{T("New students")}</th></tr></thead>
              <tbody>{s.byOfficer.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{v.calls}</td><td className="r">{v.moves}</td><td className="r">{v.students}</td></tr>)}</tbody></table></div></div>}
        </div>
        {tables.map((t) => (
          <section key={t.key} className="rpt-sec">
            <h2><i style={{ background: XTAB[t.key].replace("FF", "#") }} />{t.name}<span className="cnt">{t.rows.length}</span></h2>
            {t.rows.length === 0 ? <p className="muted">{T("None in this period.")}</p> : (
              <div className="rpt-tw"><table className="rpt-t">
                <thead><tr>{t.columns.map((c, j) => <th key={j} className={t.types[j] === "m" || t.types[j] === "n" ? "r" : ""}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j} className={t.types[j] === "m" || t.types[j] === "n" ? "r" : ""}>{cellText(v, t.types[j])}</td>)}</tr>)}</tbody>
                {t.types.includes("m") && <tfoot><tr>{t.columns.map((c, j) => <td key={j} className={t.types[j] === "m" ? "r" : ""}>{j === 0 ? T("Total") : t.types[j] === "m" ? Number(t.rows.reduce((a, x) => a + (Number(x[j]) || 0), 0)).toLocaleString("en-US") : ""}</td>)}</tr></tfoot>}
              </table></div>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}

/* ---------- Reports page ---------- */
function Reports({ students, leads, me, partner, settings, flash }) {
  const PERIODS = [["today", T("Today"), T("Daily report")], ["week", T("This week"), T("Weekly report")], ["lastWeek", T("Last week"), T("Weekly report")], ["month", T("This month"), T("Monthly report")], ["lastMonth", T("Last month"), T("Monthly report")]];
  const [wk, setWk] = useState("week");
  const [copied, setCopied] = useState("");
  const [what, setWhat] = useState(["leads", "calls", "students", "payments"]);
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState(monthStartStr(todayStr()));
  const [to, setTo] = useState(todayStr());
  const [fmt, setFmt] = useState("excel");
  const [busy, setBusy] = useState("");
  const [view, setView] = useState(null);
  const by = me?.fullName || "";

  const wr = resolveRange(wk);
  const perTitle = PERIODS.find((x) => x[0] === wk)[2];
  const msg = reportMessage(students, leads, wr, perTitle, by, partner, settings);
  const ws = buildReport(students, leads, wr.from, wr.to, []).summary;
  const r = resolveRange(range, from, to);
  const all = buildReport(students, leads, r.from, r.to, DATASETS);
  const counts = Object.fromEntries(all.tables.map((t) => [t.key, t.rows.length]));
  const trend = useMemo(() => monthlyTrend(students, leads, 6), [students, leads, LANG]);

  const top = () => { try { window.scrollTo(0, 0); } catch {} };
  const open = (rk, w) => { setView({ range: rk, from, to, what: w }); top(); };
  const result = (res, ok) => flash(res === "saved" ? ok : res === "declined" ? T("Download cancelled.") : T("Couldn’t download here. Try again from the published CRM."));
  async function excel(rk, w) {
    if (busy) return;
    const rr = resolveRange(rk, from, to);
    setBusy("excel");
    try {
      const blob = await buildWorkbook({ students, leads, r: rr, include: w, by, partner, settings });
      result(await saveFile(`${fileBase(rr)}.xlsx`, blob), T("Excel file downloaded."));
    } catch { flash(T("Couldn’t create the Excel file. Check the internet connection and try again.")); }
    setBusy("");
  }
  async function create() {
    if (fmt === "excel") return excel(range, what);
    const tables = buildReport(students, leads, r.from, r.to, what).tables;
    if (fmt === "csv") return result(await saveFile(`${fileBase(r)}.csv`, new Blob(["﻿" + toCSV(tables)], { type: "text/csv;charset=utf-8" })), T("CSV file downloaded."));
    return result(await saveFile(`${fileBase(r)}.html`, new Blob([reportHTML({ students, leads, r, include: what, by, partner, settings })], { type: "text/html;charset=utf-8" })), T("Page downloaded. Open it and choose Print to save a PDF."));
  }
  const copyMsg = () => {
    const ok = () => { setCopied(wr.label); flash(T("Report copied. Paste it in the partners’ Telegram group.")); };
    try { navigator.clipboard.writeText(msg).then(ok, () => flash(T("Couldn’t copy here. Select the text and copy it."))); } catch { flash(T("Couldn’t copy here. Select the text and copy it.")); }
  };

  if (view) return <ReportView students={students} leads={leads} spec={view} me={me} partner={partner} settings={settings} back={() => { setView(null); top(); }} excel={excel} flash={flash} />;

  const QUICK = [["week", T("Weekly"), STAGE_TONE[1]], ["month", T("Monthly"), STAGE_TONE[5]], ["year", T("Yearly"), STAGE_TONE[4]]];
  const TILES = [
    [T("New enquiries"), ws.leads, "chat", STAGE_TONE[5]], [T("Calls made"), ws.calls, "phone", STAGE_TONE[1]], [T("New students"), ws.students, "users", STAGE_TONE[2]],
    [T("Step moves"), ws.moves, "right", STAGE_TONE[3]], partner ? [T("Collected"), etb(ws.collected) || "0", "money", STAGE_TONE[4]] : [T("Payments received"), ws.payments, "money", STAGE_TONE[4]], [T("Visas approved"), ws.approved, "plane", STAGE_TONE[6]],
  ];
  const FMTS = [["excel", T("Excel"), T("A summary sheet, then one sheet per part")], ["csv", "CSV", T("Plain table that opens anywhere")], ["html", T("Printable page"), T("Open in a browser, print or save as PDF")]];

  return (
    <div className="pg">
      <PageHead title={T("Reports")} sub={T("Send the team update to the partners, or download any report you need.")} />

      <section className="rpt-hero">
        <div className="rpt-hero-h">
          <span className="rpt-hero-ic"><Icon name="send" /></span>
          <div className="rpt-hero-t"><h2>{T("Report to partners")}</h2><p>{T("Pick the day, week or month. The summary fills itself in, ready to send.")}</p></div>
          <div className="rpt-per" role="group" aria-label={T("Report period")}>
            {PERIODS.map(([k, l]) => <button key={k} aria-pressed={wk === k} className={wk === k ? "on" : ""} onClick={() => setWk(k)}>{l}</button>)}
          </div>
        </div>
        <div className="rpt-hero-b">
          <div className="rpt-hero-l">
            <span className="rpt-eyebrow">{perTitle} · {wr.label}</span>
            <div className="rpt-tiles">
              {TILES.map(([l, v, ic, t]) => <div key={l} style={{ background: t.bg, color: t.fg }}><span><Icon name={ic} />{l}</span><b className={typeof v === "string" ? "mn" : ""}>{v}</b></div>)}
            </div>
            <div className="rpt-acts">
              <button className="btn primary" disabled={busy === "excel"} onClick={() => excel(wk, DATASETS)}><Icon name="dl" />{busy === "excel" ? T("Preparing…") : T("Download Excel")}</button>
              <button className="btn" onClick={() => open(wk, DATASETS)}><Icon name="file" />{T("View full report")}</button>
            </div>
          </div>
          <div className="rpt-hero-r">
            <span className="rpt-eyebrow">{T("Message to send")}</span>
            <pre className="rpt-msg">{msg}</pre>
            <div className="rpt-acts">
              <button className="btn dark" onClick={copyMsg}><Icon name="copy" />{T("Copy for Telegram")}</button>
              <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer" onClick={() => setCopied(wr.label)}><Icon name="chat" />{T("Send on WhatsApp")}</a>
              {copied === wr.label && <span className="rpt-ok"><Icon name="check" />{T("Ready to paste")}</span>}
            </div>
            <p className="muted small">{T("Attach the Excel file to the message for the full details.")}</p>
          </div>
        </div>
      </section>

      <div className="rpt-quick">
        {QUICK.map(([k, l, t]) => {
          const qr = resolveRange(k); const s = buildReport(students, leads, qr.from, qr.to, []).summary;
          const figs = [[T("Enquiries"), s.leads], [T("New students"), s.students], partner ? [T("Collected"), etb(s.collected) || "0"] : [T("Payments"), s.payments], [T("Visas approved"), s.approved]];
          return (
            <article key={k} className="panel rpt-q">
              <div className="rpt-q-h" style={{ background: t.bg, color: t.fg }}><b>{l}</b><span>{qr.label}</span></div>
              <div className="rpt-q-f">{figs.map(([a, b]) => <span key={a}><i>{a}</i><b>{b}</b></span>)}</div>
              <div className="rpt-q-a">
                <button className="btn sm" onClick={() => open(k, DATASETS)}><Icon name="file" />{T("View")}</button>
                <button className="btn sm primary" onClick={() => excel(k, DATASETS)}><Icon name="dl" />{T("Excel")}</button>
              </div>
            </article>
          );
        })}
      </div>

      <TrendChart data={trend} partner={partner} />

      <section className="panel rpt-build">
        <div className="panel-h"><h2>{T("Build your own report")}</h2><span className="muted">{T("Three steps: what, when, and the file type.")}</span></div>
        <div className="rpt-steps">
          <div>
            <Step n={1} title={T("What should the report include?")} hint={T("Tick one or more. The number is how many rows each part has for the dates you pick.")} />
            <div className="rpt-pick">
              {DATASETS.map((k) => {
                const on = what.includes(k); const info = DATASET_INFO[k]; const t = STAGE_TONE[info.tone];
                return (
                  <button key={k} aria-pressed={on} className={`rpt-opt ${on ? "on" : ""}`} onClick={() => setWhat(on ? what.filter((x) => x !== k) : DATASETS.filter((x) => x === k || what.includes(x)))}>
                    <span className="rpt-box">{on && <Icon name="check" />}</span>
                    <span className="rpt-opt-ic" style={{ background: t.bg, color: t.fg }}><Icon name={info.icon} /></span>
                    <span className="rpt-opt-t"><b>{T(info.label)}</b><i>{T(info.desc)}</i></span>
                    <em>{counts[k] ?? 0}</em>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Step n={2} title={T("Which dates?")} hint={r.label} />
            <div className="rpt-chips">
              {[["today", T("Today")], ["week", T("This week")], ["month", T("This month")], ["lastMonth", T("Last month")], ["year", T("This year")], ["custom", T("Pick dates")]].map(([k, l]) => (
                <button key={k} className={`cchip ${range === k ? "on" : ""}`} onClick={() => setRange(k)}>{l}</button>
              ))}
            </div>
            {range === "custom" && (
              <div className="customr rpt-custom">
                <label><span>{T("From")}</span><DateInput compact value={from} max={to} onChange={(v) => v && setFrom(v)} ariaLabel={T("From")} /></label>
                <label><span>{T("To")}</span><DateInput compact value={to} min={from} onChange={(v) => v && setTo(v)} ariaLabel={T("To")} /></label>
              </div>
            )}
          </div>
          <div>
            <Step n={3} title={T("What kind of file?")} />
            <div className="rpt-fmts">
              {FMTS.map(([k, l, d]) => <button key={k} aria-pressed={fmt === k} className={`rpt-fmt ${fmt === k ? "on" : ""}`} onClick={() => setFmt(k)}><b>{l}</b><i>{d}</i></button>)}
            </div>
          </div>
          <div className="rpt-sum">
            {what.length ? <p><b>{FMTS.find((x) => x[0] === fmt)[1]}</b> · {r.label} · {what.map((k) => `${T(DATASET_INFO[k].label)}: ${counts[k] ?? 0}`).join(SEP())}</p>
              : <p className="rpt-warn">{T("Tick at least one thing in step 1.")}</p>}
            <div className="rpt-acts">
              <button className="btn primary" disabled={!what.length || !!busy} onClick={create}><Icon name="dl" />{busy ? T("Preparing…") : fmt === "excel" ? T("Download Excel") : fmt === "csv" ? T("Download CSV") : T("Download page")}</button>
              <button className="btn" disabled={!what.length} onClick={() => open(range, what)}><Icon name="file" />{T("Preview on screen")}</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
/* ============================================================
   STYLES
   ============================================================ */
function FontStyles() {
  return <style>{CSS}</style>;
}
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700;800&family=Noto+Sans+Ethiopic:wght@400;500;600;700&display=swap');
:root{
  --vv:#9A288D; --vv-d:#7D1F72; --vv-50:#FBF0F8; --vv-100:#F6DDF0; --vv-200:#E9BEDF;
  --wv:#9A288D; --wv-d:#6B1A61; --wv-50:#F7ECF4; --deep:#5E1655;
  --sy:#FFD23F; --sy-50:#FFF6D3; --sy-d:#6B4E00;
  --aq:#1DE9B6; --aq-50:#DDF9F0; --aq-d:#0D6650;
  --red:#D64545; --red-50:#FDE4E4;
  --side:#2E0C2B; --side-2:#3D1239; --plum:#3E0F3A; --brandbar:linear-gradient(90deg,#9A288D 0%,#6A1B9A 30%,#4C6FE0 62%,#1DE9B6 100%);
  --bg:#F6F2F6; --card:#FFFFFF; --ink:#211320; --ink2:#4B3D4A; --ink3:#7D6F7C; --ink4:#ACA0AB;
  --line:#E8DFE8; --line2:#F2ECF2;
  --r:16px; --r-s:12px; --r-l:24px;
  --sh:0 1px 2px rgba(46,12,43,.04), 0 4px 14px rgba(46,12,43,.04);
  --sh-l:0 18px 50px rgba(30,15,25,.22);
  --font:'Hanken Grotesk', 'Noto Sans Ethiopic', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg)}
.app{font-family:var(--font);color:var(--ink);font-size:14.5px;line-height:1.45;-webkit-font-smoothing:antialiased;min-height:100vh;
  display:grid;grid-template-columns:256px minmax(0,1fr);background:linear-gradient(90deg,var(--side) 0,var(--side) 256px,var(--bg) 256px)}
.uapp{border-radius:16px;padding:8px 8px 8px 14px;background:#fff}
  display:grid;grid-template-columns:256px minmax(0,1fr);background:linear-gradient(90deg,var(--side) 0,var(--side) 256px,var(--bg) 256px)}
.app.am{--font:'Noto Sans Ethiopic','Hanken Grotesk',system-ui,sans-serif;font-size:14px;line-height:1.55}
.app.center{display:block;background:var(--bg)}
.app :where(button,input,select,textarea){font:inherit;color:inherit}
.app :where(button){cursor:pointer;background:none;border:0;padding:0;text-align:inherit}
.pal :where(button){cursor:pointer;background:none;border:0;padding:0;text-align:inherit;font:inherit;color:inherit}
.app a{color:var(--vv)}
.ic{width:18px;height:18px;flex:none}
:focus-visible{outline:2.5px solid var(--vv);outline-offset:2px;border-radius:8px}
h1,h2,h3{margin:0;font-weight:700;letter-spacing:-.015em}
p{margin:0}
.muted{color:var(--ink3)} .small{font-size:12.5px} .pad{padding:14px 4px} .mt{margin-top:14px}
.nil{color:var(--ink4);font-style:normal}
kbd{font:inherit;font-size:11px;padding:1px 6px;border-radius:6px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.6)}

/* ---------- sidebar (dark) ---------- */
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:6px;padding:24px 16px 16px;color:#fff;background:var(--brandbar) top/100% 4px no-repeat,radial-gradient(120% 40% at 0% 0%,rgba(154,40,141,.35),transparent 70%),var(--side);overflow-y:auto}
.side-brand{padding:4px 8px 18px}
.side-brand img{display:block;filter:brightness(0) invert(1)}
.side-brand .logo-full{height:40px;width:auto}
.side-brand .logo-mark{display:none;height:34px;width:auto;margin:0 auto}
.side-search{display:flex;align-items:center;gap:10px;padding:11px 14px;border-radius:999px;background:rgba(255,255,255,.07);color:rgba(255,255,255,.62);margin-bottom:14px}
.side-search span{flex:1}
.side-search:hover{background:rgba(255,255,255,.11)}
.side-nav{display:flex;flex-direction:column;gap:4px}
.sn{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:999px;color:rgba(255,255,255,.68);font-weight:600;position:relative}
.sn:hover{background:rgba(255,255,255,.06);color:#fff}
.sn.on{background:#F2E1F4;color:var(--plum)}
.sn span{flex:1}
.sn em{font-style:normal;font-size:12px;font-weight:700;min-width:24px;height:24px;padding:0 7px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.1);color:#fff}
.sn.on em{background:rgba(29,20,25,.12);color:var(--ink)}
.sn em.hot{background:var(--sy);color:var(--ink)}
.side-create{display:flex;flex-direction:column;gap:8px;margin-top:18px}
.sc-btn{display:flex;align-items:center;gap:10px;justify-content:center;padding:12px;border-radius:999px;font-weight:700;border:1.5px solid rgba(255,255,255,.18)!important;color:#fff}
.sc-btn:hover{background:rgba(255,255,255,.06)}
.sc-btn.y{background:var(--sy);color:var(--ink);border-color:var(--sy)!important}
.sc-btn.y:hover{background:#FFDC66}
.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:12px;padding-top:16px}
.side-me{display:flex;align-items:center;gap:10px;padding:10px;border-radius:18px;background:rgba(255,255,255,.06)}
.side-me-t{flex:1;min-width:0;display:flex;flex-direction:column}
.side-me-t b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.side-me-t i{font-style:normal;font-size:12px;color:rgba(255,255,255,.55)}
.side-me .ib{color:rgba(255,255,255,.7)}
.side-me .ib:hover{background:rgba(255,255,255,.1);color:#fff}

/* language switch */
.lang{display:inline-flex;padding:3px;border-radius:999px;background:#ECE4EC;gap:2px;flex:none}
.lang button{padding:5px 12px;border-radius:999px;font-size:12.5px;font-weight:700;color:var(--ink3)}
.lang button.on{background:var(--plum);color:#fff}
.side .lang,.mtop .lang{background:rgba(255,255,255,.08)}
.side .lang button,.mtop .lang button{color:rgba(255,255,255,.7)}
.side .lang button.on,.mtop .lang button.on{background:#fff;color:var(--ink)}
.lang button:nth-child(2){font-family:'Noto Sans Ethiopic',sans-serif}

/* ---------- main ---------- */
.main{min-width:0;padding:34px 40px 64px;container-type:inline-size;container-name:main}
.pg{max-width:1360px;margin:0 auto;display:flex;flex-direction:column;gap:22px}
.pg > *{min-width:0;max-width:100%}
.pg.narrow{max-width:960px}
.banner{max-width:1360px;margin:0 auto 18px;padding:10px 16px;border-radius:999px;background:var(--sy-50);color:var(--sy-d);font-size:13px}
.loading{display:flex;align-items:center;gap:12px;justify-content:center;padding:80px 0;color:var(--ink3)}
.spin{width:20px;height:20px;border-radius:50%;border:2.5px solid var(--vv-100);border-top-color:var(--vv);animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

.ph{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.ph-t{flex:1;min-width:240px}
.ph-t h1{font-size:34px;line-height:1.15;letter-spacing:-.025em;font-weight:700}
.ph-t p{color:var(--ink3);margin-top:6px;max-width:70ch;font-size:15px}
.ph-a{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.crumb{display:flex;align-items:center;gap:6px;color:var(--ink3);font-size:13.5px;margin-bottom:-8px}
.crumb button{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:650;height:34px;padding:0 12px 0 8px;border-radius:999px;background:#fff}
.crumb .ic{width:15px;height:15px}
.crumb span{color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* buttons: pills */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line)!important;background:#fff!important;font-weight:650;color:var(--ink)!important;text-decoration:none;white-space:nowrap;transition:background .12s,border-color .12s}
.btn:hover{border-color:var(--ink4)!important}
.btn.primary{background:var(--vv)!important;border-color:var(--vv)!important;color:#fff!important}
.btn.primary:hover{background:var(--vv-d)!important}
.btn.dark{background:var(--plum)!important;border-color:var(--plum)!important;color:#fff!important}
.btn.danger{background:var(--red)!important;border-color:var(--red)!important;color:#fff!important}
.btn.ob-ok{border-color:var(--plum)!important}
.btn.sm{height:34px;padding:0 14px;font-size:13px}
.btn.wide{width:100%;height:48px}
.btn.ic-only{width:42px;padding:0}
.btn:disabled,.btn[aria-disabled=true]{cursor:not-allowed;background:#EAE2EA!important;border-color:#EAE2EA!important;color:var(--ink4)!important}
.ib{width:36px;height:36px;border-radius:50%;display:inline-grid;place-items:center;color:var(--ink3);flex:none}
.ib:hover{background:var(--line2);color:var(--ink)}
.linkbtn{color:var(--vv);font-weight:650;display:inline-flex;align-items:center;gap:6px;font-size:13.5px}
.linkbtn:hover{text-decoration:underline}
.linkbtn.danger{color:var(--red)}
.row-btn{display:flex;gap:8px;flex-wrap:wrap;align-items:center}

/* inputs */
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field-lbl{font-size:12.5px;font-weight:650;color:var(--ink2)}
.field-hint{font-size:12px;color:var(--ink4)}
.field input,.field select,.field textarea,.inp{width:100%;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line);background:#fff;outline:none;transition:border-color .12s,box-shadow .12s;min-width:0}
.field textarea{height:auto;min-height:92px;padding:12px 14px;resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus,.inp:focus{border-color:var(--vv);box-shadow:0 0 0 3px var(--vv-100)}
.inp.num{text-align:right;font-variant-numeric:tabular-nums}
.pwbox{display:flex;align-items:center;gap:6px}
.pwbox input{flex:1}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px 16px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 16px}
.formerr{display:flex;gap:8px;align-items:center;color:#A12F2F;background:var(--red-50);padding:10px 14px;border-radius:14px;font-weight:600;font-size:13.5px}
.formerr .ic{width:16px;height:16px}

/* segmented: white pill on a soft track */
.segc{display:inline-flex;padding:4px;border-radius:999px;background:#ECE4EC;gap:2px;max-width:100%}
.segc button{padding:8px 15px;border-radius:999px;font-weight:600;font-size:13.5px;color:var(--ink2);white-space:nowrap}
.segc button.on{background:#fff;color:var(--ink);font-weight:700;box-shadow:0 1px 3px rgba(46,12,43,.12)}
.seg{display:flex;gap:8px;flex-wrap:wrap}
.segbtn{height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line)!important;background:#fff;font-weight:600}
.segbtn.on{border-color:var(--plum)!important;background:var(--plum);color:#fff}

/* tabs: dark pill for the active one, yellow count badge */
.ptabs{display:inline-flex;align-self:flex-start;gap:4px;padding:5px;border-radius:999px;background:#fff;box-shadow:var(--sh);overflow-x:auto;scrollbar-width:none;max-width:100%}
.ptabs::-webkit-scrollbar{display:none}
.ptab{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:999px;font-weight:650;font-size:14.5px;color:var(--ink2);white-space:nowrap;flex:none;transition:background .12s,color .12s}
.ptab:hover{background:var(--line2);color:var(--ink)}
.ptab em{font-style:normal;font-size:12px;font-weight:700;min-width:22px;height:22px;padding:0 7px;border-radius:11px;display:grid;place-items:center;background:var(--line2);color:var(--ink3)}
.ptab.on{background:var(--plum);color:#fff}
.ptab.on em{background:var(--sy);color:var(--ink)}
.ptab-dot{display:none}

/* stat cards used as filters */
.scards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.scards.stage8{grid-template-columns:repeat(8,minmax(0,1fr));gap:10px}
.scard{position:relative;background:#fff;border-radius:22px;padding:18px 18px 16px;text-align:left;display:flex;flex-direction:column;gap:2px;overflow:hidden;box-shadow:var(--sh);transition:transform .14s,box-shadow .14s;min-width:0}
.scard::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:var(--c)}
.scard:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(46,12,43,.08)}
.sc-top{display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0}
.sc-top .ic{width:17px;height:17px;flex:none}
.sc-l{font-weight:700;font-size:14px;color:var(--cf);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sc-n{font-size:36px;line-height:1.1;font-weight:800;letter-spacing:-.03em;margin-top:8px}
.sc-s{font-size:13px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.scard.on{background:var(--cb);box-shadow:inset 0 0 0 2px var(--c)}
.scard.on::before{display:none}
.scard.on .sc-l,.scard.on .sc-top .ic{color:var(--cf)}
.scard.on .sc-s{color:var(--cf);opacity:.8}
.scard.hero{--c:var(--vv);--cf:var(--vv)}
.scard.hero:not(.on)::before{background:var(--brandbar)}
.scard.hero.on{background:linear-gradient(135deg,#B0359F 0%,var(--vv) 45%,#6A1B9A 100%)!important}
.scard.hero.on{background:var(--vv);box-shadow:none}
.scard.hero.on .sc-l,.scard.hero.on .sc-n,.scard.hero.on .sc-s,.scard.hero.on .sc-top .ic{color:#fff;opacity:1}
.stage8 .scard{padding:16px 13px 14px;border-radius:20px}
.stage8 .sc-l{font-size:13px}
.stage8 .sc-n{font-size:30px}
.stage8 .sc-s{font-size:12px}

/* chip bar */
.tbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border-radius:24px;padding:10px;box-shadow:var(--sh)}
.cbar{display:flex;gap:8px;flex-wrap:wrap}
.cchip{display:inline-flex;align-items:center;gap:9px;height:44px;padding:0 18px;border-radius:999px;border:1.5px solid var(--line)!important;background:#fff;font-weight:600;font-size:14.5px;color:var(--ink);white-space:nowrap}
.cchip:hover{border-color:var(--ink4)!important}
.cchip i{width:9px;height:9px;border-radius:50%;flex:none}
.cchip .ic{width:16px;height:16px}
.cchip em{font-style:normal;font-size:12px;font-weight:700;min-width:22px;height:22px;padding:0 7px;border-radius:11px;display:grid;place-items:center;background:var(--line2);color:var(--ink2)}
.cchip.on{background:var(--plum);color:#fff;border-color:var(--plum)!important}
.cchip.on em{background:var(--sy);color:var(--ink)}
.grp{display:flex;align-items:center;gap:10px;color:var(--ink3);font-weight:600;font-size:14px}
.tbar .grp{flex-basis:100%;padding:4px 6px 0}

/* search */
.sbox{flex:1 1 260px;display:flex;align-items:center;gap:8px;height:44px;padding:0 6px 0 16px;border-radius:999px;background:#fff;border:1.5px solid var(--line);color:var(--ink3)}
.sbox:focus-within{border-color:var(--vv);box-shadow:0 0 0 3px var(--vv-100)}
.sbox input{flex:1;border:0;outline:0;background:none;height:100%;min-width:0;color:var(--ink)}
.sbox.hs{flex:0 0 250px}
.ph-a:has(.sbox.hs){flex-wrap:nowrap}
.fbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fbar-n{margin-left:auto;color:var(--ink3);font-size:13px;font-weight:600}

/* pills: soft colour fills */
.pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 11px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;background:#EFE9EF;color:#5B5158}
.pill i{width:7px;height:7px;border-radius:50%}
.pl-magenta{background:#F8DAF0;color:#8E2A7C}
.pl-purple{background:#E8DDF8;color:#55339A}
.pl-teal{background:#CDF5EA;color:#0D6650}
.pl-green{background:#DFF3CD;color:#3B6A18}
.pl-amber{background:#FFF0A8;color:#735300}
.pl-red{background:#FDE0E0;color:#A12F2F}
.pl-grey{background:#EFE9EF;color:#5B5158}
.pkgtag{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700;font-style:normal;white-space:nowrap}
.pkgtag.p1{background:#DCE8FC;color:#24508F}
.pkgtag.p2{background:#F8DAF0;color:#8E2A7C}
.tagx{display:inline-flex;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700;align-items:center}
.tagx.aq{background:#CDF5EA;color:#0D6650}
.badge{display:inline-flex;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:var(--line2)}
.av{border-radius:50%;display:inline-grid;place-items:center;font-weight:800;flex:none;letter-spacing:.02em}

/* journey bar: done = ink, current = its step colour */
.jr{display:inline-flex;align-items:center;gap:10px}
.jr-bar{display:inline-grid;grid-template-columns:repeat(7,1fr);gap:4px;width:130px}
.jr-bar i{height:6px;border-radius:3px;background:#E8E0E8}
.jr-bar i.d{background:var(--plum)}
.jr-bar i.c{background:var(--sy)}
.jr-bar i.b{background:repeating-linear-gradient(135deg,var(--sy) 0 4px,#FFE68A 4px 8px)}
.jr-bar i.ok{background:#22D3A6}
.jr-bar i.no{background:var(--red)}
.jr-big .jr-bar{width:100%;gap:5px}
.jr-big .jr-bar i{height:10px;border-radius:5px}
.jr-lbl{font-size:12.5px;font-weight:600;color:var(--ink2)}

/* cards / panels: white on the warm canvas, no hard borders */
.card,.panel,.fsec,.sp{background:var(--card);border-radius:var(--r-l);box-shadow:var(--sh)}
.card{padding:22px}
.panel{padding:22px 24px;display:flex;flex-direction:column;gap:16px;min-width:0}
.panel-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.panel-h h2{font-size:18px}
.panel-x{margin-left:auto}
.cnt{font-size:12.5px;font-weight:700;padding:2px 10px;border-radius:999px;background:var(--line2);color:var(--ink2)}
.more{align-self:center;color:var(--ink);font-weight:700;padding:10px 16px;border-radius:999px;background:var(--line2)}
.more:hover{background:#EAE2EA}
.empty{background:#fff;border-radius:var(--r-l);padding:52px 20px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;box-shadow:var(--sh)}
.empty h3{font-size:18px}
.empty p{color:var(--ink3);max-width:46ch}
.empty-ic{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#F2E1F4;color:var(--ink)}
.empty-ic .ic{width:24px;height:24px}
.empty-s{display:flex;align-items:center;gap:12px;padding:18px;border-radius:var(--r);background:#DFF3CD;color:#3B6A18;font-weight:600}

/* ---------- dashboard ---------- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.kpi{display:flex;flex-direction:column;gap:6px;padding:20px 20px 18px;border-radius:26px;transition:transform .14s,box-shadow .14s;min-width:0;text-align:left}
.kpi:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(46,12,43,.1)}
.kpi-t{display:flex;align-items:center;justify-content:space-between;gap:8px}
.kpi-l{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700}
.kpi-l .ic{width:17px;height:17px}
.kpi-go{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.65);flex:none}
.kpi-go .ic{width:16px;height:16px}
.kpi b{font-size:44px;line-height:1.05;font-weight:800;letter-spacing:-.035em;margin-top:14px}
.kpi-c{font-size:13px;opacity:.78;font-weight:600}
.kpi-c.warn{opacity:1;font-weight:800}
.dgrid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:18px;align-items:start}
.dcol{display:flex;flex-direction:column;gap:18px;min-width:0}
.tlist{display:flex;flex-direction:column;gap:6px}
.trow{display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:18px;min-width:0;background:#FAF6FA}
.trow:hover{background:var(--line2)}
.trow > .ic{color:var(--ink4)}
.ttype{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none}
.ttype .ic{width:17px;height:17px}
.ttype.k-call{background:#DCE8FC;color:#24508F}
.ttype.k-money{background:#FFF0A8;color:#735300}
.ttype.k-file{background:#E8DDF8;color:#55339A}
.tmain{flex:1;min-width:0;display:flex;flex-direction:column}
.tmain b,.tmain span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tmain span{font-size:13px;color:var(--ink3)}
.tdue{font-size:12.5px;font-weight:700;color:var(--ink2);white-space:nowrap;padding:5px 10px;border-radius:999px;background:#fff}
.tdue.u{color:#9A4A16;background:#FDE4D2}
.stack{display:flex;height:16px;border-radius:8px;overflow:hidden;gap:3px}
.stack span{border-radius:4px}
.legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 12px}
.lg{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:12px;font-size:13.5px;min-width:0}
.lg:hover{background:var(--line2)}
.lg i{width:10px;height:10px;border-radius:50%;flex:none}
.lg span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank{display:flex;flex-direction:column;gap:12px}
.rank-r{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"l n" "b b" "s s";gap:5px 10px;align-items:center}
.rank-l{grid-area:l;font-weight:600;font-size:13.5px}
.rank-s{grid-area:s;font-size:12px;color:var(--ink3)}
.rank-s:empty{display:none}
.rank-n{grid-area:n;font-weight:800;font-variant-numeric:tabular-nums}
.rank-bar{grid-area:b;height:10px;border-radius:5px;background:var(--line2);overflow:hidden}
.rank-bar i{display:block;height:100%;border-radius:5px}
.rangebox{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
.customr{display:flex;gap:8px}
.customr label{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:650;color:var(--ink3)}
.who-t{display:flex;flex-direction:column;min-width:0}
.who-t b{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who-t i{font-style:normal;font-size:12px;color:var(--ink4);font-variant-numeric:tabular-nums}

/* ---------- students ---------- */
.fpop-w{position:relative}
.fpop-bg{position:fixed;inset:0;z-index:44}
.fpop{position:absolute;z-index:45;top:calc(100% + 8px);left:0;width:330px;background:#fff;border-radius:22px;box-shadow:var(--sh-l);padding:18px;display:flex;flex-direction:column;gap:12px}
.fpop-h{display:flex;align-items:center;justify-content:space-between}
.fpop-h b{font-size:16px}
.fpop-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13.5px;font-weight:600;color:var(--ink2);padding:6px 0}
.fpop-f{display:flex;gap:8px;padding-top:4px}
.fpop-f .btn{flex:1}
.chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:-8px}
.chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px 0 14px;border-radius:999px;background:#fff;font-size:13px;font-weight:650;color:var(--ink2);box-shadow:var(--sh)}
.chip .ic{width:14px;height:14px;color:var(--ink4)}
.chip:hover .ic{color:var(--ink)}
/* board */
.board{width:100%;min-width:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(238px,1fr);gap:14px;overflow-x:auto;padding:2px 2px 10px;align-items:start;scroll-snap-type:x proximity}
.board.one{grid-auto-flow:row;grid-template-columns:minmax(0,1fr)}
.board.one .bcol-b{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.bcol{display:flex;flex-direction:column;gap:10px;min-width:0;scroll-snap-align:start}
.bcol::before{content:"";height:5px;border-radius:5px;background:var(--c)}
.bcol-h{display:flex;align-items:center;gap:9px;padding:4px 4px 0}
.bcol-n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--c);color:var(--ink);font-weight:800;font-size:12.5px;flex:none}
.bcol-h b{font-size:15.5px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bcol-h em{font-style:normal;font-size:12.5px;font-weight:700;min-width:26px;height:26px;padding:0 8px;border-radius:13px;display:grid;place-items:center;background:#fff;color:var(--ink2)}
.bcol-s{font-size:12.5px;color:var(--ink3);padding:0 4px;margin-top:-4px}
.bcol-b{display:flex;flex-direction:column;gap:10px}
.bcard{background:var(--cb);color:var(--ink);border-radius:22px;padding:16px 16px 14px;display:flex;flex-direction:column;gap:8px;text-align:left;transition:transform .14s,box-shadow .14s;min-width:0}
.bcard:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(46,12,43,.12)}
.bcard.dim{opacity:.6}
.bc-top{display:flex;align-items:flex-start;gap:8px;justify-content:space-between}
.bc-top b{font-size:15.5px;line-height:1.25}
.bc-att{width:28px;height:28px;border-radius:50%;background:#fff;color:#B07A00;display:grid;place-items:center;flex:none}
.bc-att .ic{width:15px;height:15px}
.bc-id{font-size:12px;color:rgba(29,20,25,.5);margin-top:-6px;font-variant-numeric:tabular-nums}
.bc-dash{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:4px 0 2px}
.bc-dash i{height:4px;border-radius:2px;background:rgba(255,255,255,.75)}
.bc-dash i.d{background:var(--plum)}
.bc-dash i.c{background:var(--c)}
.bc-next{font-size:13.5px;font-weight:650;color:var(--cf);line-height:1.35}
.bc-foot{display:flex;align-items:center;gap:8px;margin-top:4px;padding-top:10px;border-top:1px solid rgba(29,20,25,.08)}
.bc-noav{width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.7);flex:none}
.bc-ct{flex:1;min-width:0;font-size:12.5px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc-up{font-size:12px;color:rgba(29,20,25,.5);white-space:nowrap}
.bmore{display:flex;align-items:center;justify-content:center;gap:6px;height:44px;border-radius:999px;background:rgba(255,255,255,.75);font-weight:700;font-size:13.5px;color:var(--cf);border:1.5px dashed var(--c)!important;text-align:center}
.bmore:hover{background:#fff}
.bempty{border-radius:20px;padding:22px 14px;text-align:center;font-size:13px;color:var(--ink3);background:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 8px,rgba(255,255,255,.2) 8px 16px);border:1.5px dashed #DDD2DD}
/* list */
.lgroups{display:flex;flex-direction:column;gap:20px}
.lgrp{display:flex;flex-direction:column}
.slist{background:#fff;border-radius:var(--r-l);box-shadow:var(--sh);overflow:hidden;padding:6px}
.sl-r{display:grid;grid-template-columns:minmax(190px,1.25fr) minmax(200px,1.15fr) minmax(190px,1.35fr) minmax(90px,.55fr) 30px 18px;gap:16px;align-items:center;width:100%;min-height:74px;padding:12px 16px;border-radius:18px;text-align:left}
.sl-r + .sl-r{box-shadow:0 -1px 0 var(--line2)}
.sl-r:hover{background:#FAF6FA}
.sl-r:hover > .ic{color:var(--ink)}
.sl-r > .ic{color:var(--ink4)}
.sl-r.dim{opacity:.6}
.sl-who{display:flex;align-items:center;gap:12px;min-width:0}
.sl-step{display:flex;flex-direction:column;align-items:flex-start;gap:8px;min-width:0}
.stp{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 12px;border-radius:999px;font-size:12.5px;font-weight:700;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.stp i{width:8px;height:8px;border-radius:50%;flex:none}
.sl-next{font-size:13.5px;color:var(--ink2);display:flex;align-items:center;gap:8px;min-width:0}
.sl-next .dot{width:9px;height:9px;border-radius:50%;background:var(--sy);flex:none;box-shadow:0 0 0 3px var(--sy-50)}
.sl-next.t-bad .dot{background:var(--red);box-shadow:0 0 0 3px var(--red-50)}
.sl-next.att{font-weight:700;color:var(--ink)}
.sl-ct{font-size:13.5px;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sl-of{display:flex;justify-content:center}

/* ---------- forms ---------- */
.fsec{padding:24px}
.fsec-h{display:flex;gap:14px;margin-bottom:18px;align-items:flex-start}
.fsec-n{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--plum);color:var(--ink);font-weight:800;font-size:13px;flex:none}
.fsec-h h2{font-size:17px}
.fsec-h p{color:var(--ink3);font-size:13.5px;margin-top:2px}
.formfoot{display:flex;justify-content:flex-end;gap:10px;padding-top:4px}

/* ---------- record ---------- */
.rec-h{background:#fff;border-radius:26px;box-shadow:var(--sh);overflow:hidden}
.rec-top{display:flex;align-items:center;gap:16px;padding:22px 24px;flex-wrap:wrap}
.rec-t{flex:1;min-width:200px}
.rec-t h1{font-size:28px;line-height:1.15;letter-spacing:-.02em}
.rec-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
.rec-id{font-size:12.5px;font-weight:700;color:var(--ink2);background:var(--line2);padding:4px 10px;border-radius:999px;font-variant-numeric:tabular-nums}
.rec-ct{display:inline-flex;gap:5px;align-items:center;font-size:13px;color:var(--ink2);font-weight:600}
.rec-ct .ic{width:15px;height:15px;color:var(--ink4)}
.rec-a{display:flex;gap:8px;flex-wrap:wrap}
.rec-prog{padding:16px 24px 18px;background:#FAF6FA}
.rp-steps{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.rps{display:flex;flex-direction:column;gap:7px;min-width:0;padding:4px 2px;border-radius:8px}
.rps i{height:10px;border-radius:5px;background:#E8E0E8}
.rps span{font-size:12px;font-weight:650;color:var(--ink4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rps:hover span{color:var(--ink)}
.rps.d i{background:var(--plum)} .rps.d span{color:var(--ink2)}
.rps.c i{background:var(--c)} .rps.c span{color:var(--ink);font-weight:800}
.rps.b i{background:repeating-linear-gradient(135deg,var(--sy) 0 5px,#FFE68A 5px 10px)} .rps.b span{color:var(--sy-d);font-weight:800}
.rps.ok i{background:#22D3A6} .rps.ok span{color:var(--aq-d);font-weight:800}
.rps.no i{background:var(--red)} .rps.no span{color:var(--red);font-weight:800}
.rp-cap{display:none;font-size:13px;color:var(--ink3);margin-top:8px}
.rp-cap b{color:var(--ink)}
.na-m{display:none}
.rec-body{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}
.rec-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.rec-rail{display:flex;flex-direction:column;gap:14px;position:sticky;top:20px;min-width:0}

/* journey accordion */
.tl7{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;position:relative}
.st7{position:relative;padding-left:0}
.st7::before{content:"";position:absolute;left:37px;top:0;bottom:0;width:2px;background:var(--line)}
.st7:first-child::before{top:30px}
.st7:last-child::before{bottom:calc(100% - 30px)}
.st7.done::before{background:var(--plum)}
.st7.now::before{background:linear-gradient(var(--plum) 0 30px,var(--line) 30px)}
.st7:first-child.now::before{background:var(--line)}
.st7-h{position:relative;display:flex;align-items:center;gap:14px;width:100%;padding:12px 16px 12px 20px;border-radius:16px;min-height:60px}
.st7-h:hover{background:rgba(255,255,255,.7)}
.st7-dot{position:relative;z-index:1;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13.5px;flex:none;background:#fff;border:2px solid var(--line);color:var(--ink4)}
.st7.done .st7-dot{background:var(--plum);border-color:var(--plum);color:#fff}
.st7.done .st7-dot .ic{width:17px;height:17px;stroke-width:2.6}
.st7.now .st7-dot{background:var(--c);border-color:var(--c);color:var(--ink);box-shadow:0 0 0 6px var(--cb)}
.st7.now.blk .st7-dot{background:var(--sy);border-color:#E5AE00;color:var(--sy-d);box-shadow:0 0 0 5px var(--sy-50)}
.st7-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.st7-t b{font-size:15.5px}
.st7.later .st7-t b{color:var(--ink2)}
.st7-t span{font-size:13px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st7-chev{color:var(--ink4);transition:transform .15s;display:grid}
.st7.open .st7-chev{transform:rotate(180deg)}
.st7.open > .st7-h{background:#fff;border-radius:22px 22px 0 0}
.st7.open{margin:6px 0}
.st7.open > .st7-h,.st7.open > .st7-b{margin-left:0}
.st7-b{position:relative;z-index:1;background:#fff;border-radius:0 0 22px 22px;padding:6px 22px 22px 76px;display:flex;flex-direction:column;gap:14px;box-shadow:var(--sh)}
.st7.open > .st7-h{box-shadow:var(--sh)}
.st7.now.open > .st7-h{background:var(--cb)}
.st7.now.open > .st7-b{box-shadow:0 10px 30px rgba(46,12,43,.08);border-top:4px solid var(--cb)}
.st7-note{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--ink2);background:var(--line2);padding:10px 14px;border-radius:14px}
.st7-note .ic{width:16px;height:16px}
.st7-f{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line2);margin-top:2px}
.st7-f .btn.primary{margin-left:auto}
.warnline{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--sy-d);font-weight:650;background:var(--sy-50);padding:7px 12px;border-radius:999px}
.warnline .ic{width:15px;height:15px}

/* blocks inside a step */
.blk{border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:12px;background:#FAF6FA;min-width:0}
.blk-ok{background:#EEF8E6}
.blk-warn{background:#FFF7D6}
.blk-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.blk-h h3{font-size:15px;flex:1;min-width:0}
.blk-note{font-size:13px;color:var(--ink3);margin-top:-6px}
.blk-h + .blk-note{margin-top:-6px}
.blk-empty{font-size:13.5px;color:var(--ink3);padding:16px;border-radius:14px;background:#fff;text-align:center}
.cnt-p{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#fff;color:var(--ink2);white-space:nowrap}
.cnt-p.full,.cnt-p.full-n{background:#DFF3CD;color:#3B6A18}
.checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.chk{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:14px;border:1.5px solid transparent!important;background:#fff;min-width:0;font-size:13.5px;text-align:left}
.chk:hover{border-color:var(--line)!important}
.chk-box{width:20px;height:20px;border-radius:6px;border:2px solid #CFC8D4;display:grid;place-items:center;flex:none;color:transparent;margin-top:0}
.chk-box .ic{width:13px;height:13px;stroke-width:3}
.chk.done{background:#fff;opacity:.85}
.chk.done .chk-box{background:var(--plum);border-color:var(--plum);color:#fff}
.chk.done .chk-t{color:var(--ink3);text-decoration:line-through;text-decoration-color:rgba(0,0,0,.25)}
.chk-t{display:flex;flex-direction:column;min-width:0;line-height:1.35}
.chk-t i{font-style:normal;font-size:12px;color:var(--ink3);margin-top:2px}
.minigrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.minigrid > div{padding:12px 14px;border-radius:14px;background:#fff;display:flex;flex-direction:column;gap:2px;min-width:0}
.mini-l{font-size:12px;color:var(--ink3);font-weight:600}
.minigrid b{font-size:13.5px;overflow:hidden;text-overflow:ellipsis}
.riskpicker{display:flex;gap:8px;flex-wrap:wrap}
.rp{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 16px;border-radius:999px;border:1.5px solid var(--line)!important;font-weight:650;background:#fff}
.rp i{width:10px;height:10px;border-radius:50%}
.rp-strong i{background:#18A77D} .rp-improve i{background:var(--sy)} .rp-high i{background:var(--red)}
.rp-strong.on{border-color:#83C45A!important;background:#DFF3CD;color:#3B6A18}
.rp-improve.on{border-color:#F5C518!important;background:#FFF0A8;color:#735300}
.rp-high.on{border-color:#E77!important;background:#FDE0E0;color:#A12F2F}
.decision-pick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.dp{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:999px;border:1.5px solid var(--line)!important;font-weight:700;background:#fff}
.dp-approved.on{background:#DFF3CD;border-color:#83C45A!important;color:#3B6A18}
.dp-additional.on{background:#FFF0A8;border-color:#F5C518!important;color:#735300}
.dp-refused.on{background:#FDE0E0;border-color:#E77!important;color:#A12F2F}
.pkgpick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.pkgc{display:grid;grid-template-columns:auto 1fr;grid-template-areas:"r b" "r s";gap:2px 10px;padding:16px;border-radius:18px;border:1.5px solid transparent!important;background:#fff;text-align:left}
.pkgc-r{grid-area:r;width:18px;height:18px;border-radius:50%;border:2px solid #CFC8D4;margin-top:2px}
.pkgc b{grid-area:b}
.pkgc span:last-child{grid-area:s;font-size:12.5px;color:var(--ink3)}
.pkgc.on{border-color:var(--plum)!important;background:#F8DAF0}
.pkgc.on .pkgc-r{border:5px solid var(--plum)}
.payrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:12px;align-items:center;padding:12px;border-radius:18px;background:#fff}
.payrow.due{box-shadow:inset 0 0 0 2px #F5C518}
.payrow.paid{background:#EEF8E6}
.payrow .chk{border:0!important;background:none;padding:4px;opacity:1}
.payrow .chk.done .chk-t{text-decoration:none;color:var(--ink)}
.payrow .chk.done .chk-box{background:#4FA02A;border-color:#4FA02A}
.payfields{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pf{display:flex;flex-direction:column;gap:3px}
.pf span{font-size:11.5px;font-weight:650;color:var(--ink3)}
.pf input{height:40px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line);background:#fff;min-width:0;width:100%}
.pf input:focus{border-color:var(--vv);outline:0}
.paylist{display:flex;flex-direction:column;gap:8px}
.pay-warn{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--sy-d);background:var(--sy-50);padding:12px 14px;border-radius:14px;font-weight:600}
.pay-warn .ic{width:16px;height:16px}
.apps{display:flex;flex-direction:column;gap:8px}
.uapp.open{box-shadow:inset 0 0 0 1.5px var(--line)}
.app-h{display:flex;align-items:center;gap:8px}
.app-h > .ic{color:var(--ink4)}
.app-title{flex:1;min-width:0;border:0;outline:0;font-weight:700;font-size:14.5px;height:36px;background:none;border-radius:8px;padding:0 6px}
.app-title:focus{background:var(--line2)}
.app-st{position:relative;height:30px;border-radius:999px;display:inline-flex;align-items:center;padding:0 10px;font-size:12.5px;font-weight:700}
.app-st select{border:0;background:none;font-weight:700;outline:0;cursor:pointer;color:inherit}
.app-sub{font-size:12.5px;color:var(--ink3);padding:0 6px 4px 32px}
.app-b{padding:10px 4px 6px;display:flex;flex-direction:column;gap:12px}
.app-b .linkbtn{align-self:flex-start}
.prof{display:flex;flex-direction:column;gap:14px}
.prof .blk{padding:22px;background:#fff;box-shadow:var(--sh);border-radius:24px}

/* right rail */
.na{border-radius:24px;padding:18px 20px;display:flex;flex-direction:column;gap:8px;background:#F2E8F8;color:#3E0F3A}
.na-l{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;opacity:.8}
.na-l .ic{width:15px;height:15px}
.na p{font-size:15px;font-weight:650;line-height:1.45}
.na-warn{background:#FFF0A8;color:#4A3600}
.na-ok{background:#CDF5EA;color:#08463A}
.na-bad{background:#FDE0E0;color:#7A1F1F}
.na-grey{background:#EFE9EF;color:var(--ink2)}
.rail-s{background:#fff;border-radius:24px;padding:18px 20px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:10px}
.rail-s h3{font-size:15px}
.rail-sh{display:flex;align-items:center;justify-content:space-between}
.props{margin:0;display:flex;flex-direction:column}
.props > div{display:grid;grid-template-columns:82px minmax(0,1fr);gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line2)}
.props > div:last-child{border-bottom:0}
.props dt{font-size:12.5px;color:var(--ink3);font-weight:600}
.props dd{margin:0;font-size:13.5px;font-weight:600;min-width:0;overflow-wrap:anywhere}
.props select{width:100%;height:36px;border-radius:999px;border:1.5px solid transparent;background:var(--line2);padding:0 8px 0 12px;font-size:13.5px;text-overflow:ellipsis;font-weight:600;outline:0;min-width:0}
.props select:hover,.props select:focus{border-color:var(--line);background:#fff}
.payrail{display:flex;flex-direction:column;gap:6px}
.pr{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:#FAF6FA;font-size:13.5px}
.pr-ic{width:20px;height:20px;border-radius:50%;border:2px solid #CFC8D4;display:grid;place-items:center;flex:none}
.pr-ic .ic{width:12px;height:12px;stroke-width:3}
.pr.paid{background:#DFF3CD}
.pr.paid .pr-ic{background:#4FA02A;border-color:#4FA02A;color:#fff}
.pr-l{flex:1;font-weight:600}
.pr-v{font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink2);font-size:13px}

/* activity */
.notebox{position:relative;margin-bottom:18px}
.notebox textarea{min-height:84px;padding:14px;border-radius:18px;border:1.5px solid var(--line);outline:0;resize:vertical}
.notebox textarea:focus{border-color:var(--vv);box-shadow:0 0 0 3px var(--vv-100)}
.notebox textarea{width:100%;padding-bottom:58px!important;display:block}
.notebox .btn{position:absolute;right:10px;bottom:10px;height:38px}
.timeline{list-style:none;margin:0;padding:0;display:flex;flex-direction:column}
.tl{display:flex;gap:12px;padding:10px 0;position:relative}
.tl::before{content:"";position:absolute;left:5px;top:24px;bottom:-10px;width:2px;background:var(--line2)}
.tl:last-child::before{display:none}
.tl-dot{width:12px;height:12px;border-radius:50%;background:#DB7FC6;margin-top:5px;flex:none;position:relative}
.tl-stage .tl-dot{background:var(--plum)}
.tl-answered .tl-dot{background:#83C45A}
.tl-no_answer .tl-dot{background:#F5C518}
.tl p{font-size:13.5px}
.tl-meta{font-size:12px;color:var(--ink4)}
.tl-empty{color:var(--ink3);font-size:13.5px;padding:10px 0}
.dz{padding:8px 4px}
.dz-c{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13.5px;color:var(--ink2);background:var(--red-50);padding:12px 14px;border-radius:18px}
.dz-c.inline{background:none;padding:0}

/* ---------- leads ---------- */
.split{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:18px;align-items:start}
.split-l{min-width:0}
.ldl{display:flex;flex-direction:column;gap:18px}
.ldg-h{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:800;color:var(--ink);padding:0 6px 10px}
.ldg-h em{font-style:normal;font-size:12px;font-weight:700;color:var(--ink2);background:#fff;padding:2px 9px;border-radius:999px}
.ldg-h::after{content:"";flex:1;height:1px;background:#E3DAE3}
.ldg-b{background:#fff;border-radius:24px;box-shadow:var(--sh);overflow:hidden;padding:6px}
.ldr{display:grid;grid-template-columns:auto minmax(150px,1.3fr) minmax(130px,1fr) auto minmax(170px,1.3fr) auto;align-items:center;gap:14px;width:100%;padding:12px 14px;border-radius:18px;position:relative}
.ldr + .ldr{box-shadow:0 -1px 0 var(--line2)}
.ldr:hover{background:#FAF6FA}
.ldr.sel{background:#FBEAF6;box-shadow:none}
.ldr.sel::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:0 4px 4px 0;background:var(--vv)}
.ldr > .ic{color:var(--ink4)}
.ldr-who{display:flex;flex-direction:column;min-width:0}
.ldr-who b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldr-who i{font-style:normal;font-size:12px;color:var(--ink4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ldr-int{display:flex;align-items:center;gap:6px;font-size:13.5px;min-width:0;flex-wrap:wrap}
.ldr-int .ic{width:15px;height:15px;color:var(--ink4)}
.ldr-next{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.ldr-next i{font-style:normal;font-size:12.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ldr.s-overdue .ldr-next i{color:#9A4A16;font-weight:700}
.dots{display:inline-flex;gap:4px}
.dots i{width:9px;height:9px;border-radius:50%;background:#E8E0E8}
.dots i.on{background:var(--plum)}
.lp{position:sticky;top:20px;background:#fff;border-radius:26px;box-shadow:var(--sh);display:flex;flex-direction:column;max-height:calc(100vh - 40px);overflow-y:auto}
.lp > *{padding-left:20px;padding-right:20px}
.lp-top{display:flex;align-items:center;gap:12px;padding-top:18px;padding-bottom:14px}
.lp-t{flex:1;min-width:0}
.lp-t h2{font-size:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lp-t span{font-size:12.5px;color:var(--ink3)}
.lp-back{display:none}
.lp-next{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 20px;padding:14px 16px!important;border-radius:18px;background:#E8DDF8;color:#2E1B57;font-size:13.5px;font-weight:650}
.lp-next > span:nth-child(2){flex:1;min-width:120px}
.lp-next.s-overdue{background:#FDE4D2;color:#6B3210} .lp-next.s-today,.lp-next.s-new{background:#DCE8FC;color:#1B3D6E} .lp-next.s-closed{background:#EFE9EF;color:var(--ink2)}
.lp-next.s-converted{background:#CDF5EA;color:#08463A}
.lp-cta{display:flex;gap:8px;flex-wrap:wrap;padding-top:14px;padding-bottom:4px}
.lp-cta .btn{flex:1;min-width:0}
.lp-log{margin:14px 20px 0;padding:18px!important;border-radius:22px;background:#FAF6FA;display:flex;flex-direction:column;gap:10px}
.lp-log h3{font-size:14.5px}
.lp-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lp-btns .btn{height:44px;font-size:13.5px;padding:0 10px}
.lp-btns .btn:first-child{grid-column:1/-1;background:var(--plum)!important;color:#fff!important;border-color:var(--plum)!important}
.lp-ans{display:flex;flex-direction:column;gap:10px}
.lp-sec{padding-top:18px;display:flex;flex-direction:column;gap:8px}
.lp-sec h3{font-size:14px;color:var(--ink2)}
.lp-notes{font-size:13.5px;background:#FAF6FA;padding:12px 14px;border-radius:14px;color:var(--ink2)}
.lp-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:16px;padding-bottom:18px;margin-top:10px;border-top:1px solid var(--line2);position:sticky;bottom:0;background:#fff}
.lp-foot .btn:first-child{flex:1}
.lp-empty{align-items:center;justify-content:center;text-align:center;gap:12px;padding:48px 24px;color:var(--ink3);background:transparent;border:2px dashed #DDD2DD;box-shadow:none}

/* ---------- login ---------- */
.login{min-height:100vh;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);background:var(--bg)}
.login-brand{background:radial-gradient(80% 60% at 10% 0%,rgba(154,40,141,.75),transparent 60%),radial-gradient(60% 50% at 100% 100%,rgba(255,210,63,.28),transparent 65%),var(--side);color:#fff;padding:48px;display:flex;flex-direction:column;justify-content:space-between;gap:40px;margin:14px;border-radius:30px;border-top:0;background-clip:padding-box;position:relative;overflow:hidden}
.login-brand::before{content:"";position:absolute;left:0;right:0;top:0;height:5px;background:var(--brandbar)}
.login-logo{height:48px;width:auto;align-self:flex-start;filter:brightness(0) invert(1)}
.lb-copy h2{font-size:40px;line-height:1.1;max-width:15ch;font-weight:800;letter-spacing:-.03em}
.lb-copy p{margin-top:12px;color:rgba(255,255,255,.78);font-size:16px;max-width:40ch}
.lb-steps{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px;max-width:520px}
.lb-steps li{display:inline-flex;align-items:center;gap:8px;height:38px;padding:0 14px 0 6px;border-radius:999px;background:var(--cb);color:var(--cf);font-weight:700;font-size:13.5px}
.lb-steps li span{width:26px;height:26px;border-radius:50%;background:var(--c);color:var(--ink);display:grid;place-items:center;font-size:12px;font-weight:800}
.login-card{align-self:center;justify-self:center;width:100%;max-width:400px;padding:40px 28px;display:flex;flex-direction:column;gap:16px}
.lc-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.login-mark{height:40px;width:auto}
.login-card h1{font-size:28px}
.login-sub{color:var(--ink3);margin-top:-8px}
.login-err{display:flex;gap:8px;align-items:flex-start;color:#A12F2F;background:var(--red-50);padding:12px 14px;border-radius:14px;font-size:13.5px;font-weight:600}
.login-err .ic{width:16px;height:16px;margin-top:2px}
.login-foot{font-size:12.5px;color:var(--ink3);text-align:center}

/* ---------- settings ---------- */
.set{display:grid;grid-template-columns:230px minmax(0,1fr);gap:20px;align-items:start}
.set-nav{display:flex;flex-direction:column;gap:4px;position:sticky;top:20px}
.set-nav button{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:999px;font-weight:650;color:var(--ink2);white-space:nowrap}
.set-nav button:hover{background:#fff}
.set-nav button.on{background:var(--plum);color:#fff}
.set-pane{min-width:0}
.sp{padding:26px;display:flex;flex-direction:column;gap:16px}
.sp h2{font-size:19px}
.sp-sub{color:var(--ink3);margin-top:-10px;max-width:72ch}
.sp-h{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.sp-h .sp-sub{margin-top:4px}
.unsaved{font-size:13px;font-weight:700;color:var(--sy-d);background:var(--sy-50);padding:7px 12px;border-radius:999px}
.pkgs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.pkg{border-radius:22px;padding:20px;display:flex;flex-direction:column;gap:12px;background:#DCE8FC}
.pkg-p2{background:#F8DAF0}
.pkg .field input{border-color:transparent}
.pkg-h{display:flex;justify-content:space-between;align-items:center}
.pkg-h span{font-size:12.5px;color:var(--ink3);font-weight:600}
.pkg p{color:var(--ink3);font-size:13.5px}
.pkg-steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-weight:650;font-size:13.5px}
.pkg-steps span{display:block;font-weight:400;color:var(--ink3);font-size:12.5px}
.addc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end;padding:18px;border-radius:22px;background:#FFF0A8}
.addc .formerr{grid-column:1/-1}
.ctl{display:flex;flex-direction:column;border-radius:20px;overflow:hidden;background:#FAF6FA;padding:4px}
.ctl-h,.ctl-r{display:grid;grid-template-columns:minmax(120px,1.2fr) minmax(0,1fr) minmax(0,1fr) minmax(100px,.8fr) 40px;gap:12px;align-items:center;padding:10px 14px}
.ctl-h{font-size:12px;font-weight:700;color:var(--ink3)}
.ctl-h span:nth-child(n+2):nth-child(-n+4){text-align:right}
.ctl-r{background:#fff;border-radius:16px;margin-top:4px}
.ctl-n{display:flex;align-items:center;gap:8px;min-width:0}
.ctl-n .ic{color:var(--ink4);width:16px;height:16px}
.ctl-f em{display:none}
.ctl-f{display:block}
.ctl-t{text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ink2);font-size:13.5px}
.usr{display:flex;flex-direction:column;border-radius:20px;overflow:hidden;background:#FAF6FA;padding:4px;gap:4px}
.usr-r{display:grid;grid-template-columns:minmax(160px,1.4fr) minmax(150px,1fr) 120px minmax(130px,.9fr) 40px;gap:12px;align-items:center;padding:12px 14px;background:#fff;border-radius:16px}
.usr-r:first-child{border-top:0}
.usr-r .c-who{display:flex;align-items:center;gap:10px;min-width:0}
.usr-pw{display:flex;align-items:center;gap:8px}
.pwc{font-size:13px;background:var(--line2);padding:5px 10px;border-radius:999px}
.usr-r .inp{height:36px}
.usr-sw{display:flex;align-items:center;gap:8px}
.usr-sw em{font-style:normal;font-size:12.5px;color:var(--ink3)}
.switch{width:42px;height:24px;border-radius:12px;background:#D9D3DD;position:relative;flex:none;transition:background .15s}
.switch span{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .15s}
.switch.on{background:var(--vv)}
.switch.on span{left:21px}
.switch:disabled{opacity:.5;cursor:not-allowed}
.newlogin{padding:20px;border-radius:22px;background:#E8DDF8;display:flex;flex-direction:column;gap:12px}
.newlogin h3{font-size:15px}
.nl-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:12px;align-items:end}
.flow{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.flow-n{display:flex;align-items:center;gap:10px;padding:10px 14px 10px 10px;border-radius:999px;background:#DCE8FC;position:relative}
.flow-dot{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--plum);color:#fff;font-weight:800;font-size:13px}
.flow-dot.x{background:#fff;color:var(--ink3)}
.flow-n.end{background:#EFE9EF}
.flow-l{font-weight:700}
.flow-d{font-size:13px;color:var(--ink3);display:flex;align-items:center;gap:6px}
.flow-d input{width:52px;height:32px;border-radius:999px;border:0;text-align:center;background:#fff}
.flow-x{color:var(--ink4);display:grid}
.flow-add{display:flex;align-items:center;gap:6px;padding:12px 16px;border-radius:999px;border:1.5px dashed #B9B0B6!important;color:var(--ink);font-weight:700}

/* ---------- palette + toast ---------- */
.pal-wrap{position:fixed;inset:0;background:rgba(50,10,45,.45);display:flex;justify-content:center;align-items:flex-start;padding:12vh 16px 16px;z-index:60}
.pal{width:100%;max-width:600px;background:#fff;border-radius:24px;box-shadow:var(--sh-l);overflow:hidden;font-family:var(--font)}
.pal-in{display:flex;align-items:center;gap:10px;padding:0 10px 0 16px;height:58px;border-bottom:1px solid var(--line);color:var(--ink3)}
.pal-in input{flex:1;border:0;outline:0;font-size:16px;height:100%;min-width:0;color:var(--ink)}
.pal-list{max-height:52vh;overflow-y:auto;padding:8px}
.pal-it{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border-radius:14px}
.pal-it.on{background:#FBEAF6}
.pal-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--bg);color:var(--ink2)}
.pal-ic .ic{width:15px;height:15px}
.pal-l{flex:1;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pal-sub{font-size:12px;color:var(--ink4)}
.pal-k{font-size:12px;font-weight:700;color:var(--ink3);background:var(--line2);padding:2px 8px;border-radius:7px}
.pal-empty{padding:24px;text-align:center;color:var(--ink3)}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:var(--plum);color:#fff;padding:13px 22px;border-radius:999px;font-weight:600;box-shadow:var(--sh-l);z-index:70;max-width:calc(100vw - 32px);font-family:var(--font)}


/* ---------- date picker ---------- */
.dinput{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line)!important;background:#fff;font-weight:600;color:var(--ink);text-align:left;white-space:nowrap;min-width:0}
.dinput .ic{width:17px;height:17px;color:var(--vv);flex:none}
.dinput span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.dinput .ph{color:var(--ink4);font-weight:500}
.dinput:hover{border-color:var(--vv-200)!important}
.dinput.on{border-color:var(--vv)!important;box-shadow:0 0 0 3px var(--vv-100)}
.dinput.sm{height:38px;width:auto;border-radius:999px;padding:0 14px 0 12px;font-size:13.5px}
.pf .dinput{height:40px;border-radius:12px}
.dp-layer{font-family:'Hanken Grotesk','Noto Sans Ethiopic',system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.dp-layer.am{font-family:'Noto Sans Ethiopic','Hanken Grotesk',system-ui,sans-serif}
.dp-layer :where(button){cursor:pointer;background:none;border:0;padding:0;font:inherit;color:inherit}
.dp-bg{position:fixed;inset:0;z-index:80}
.dpop{position:fixed;z-index:81;width:300px;background:#fff;border-radius:24px;box-shadow:var(--sh-l);padding:14px;outline:none;font-family:var(--font)}
.dpop::before{content:"";position:absolute;left:18px;right:18px;top:0;height:4px;border-radius:0 0 4px 4px;background:var(--brandbar)}
.dp-h{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 2px 10px}
.dp-h b{font-size:15px;color:var(--ink)}
.dp-nav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--line2);color:var(--ink2)}
.dp-nav:hover{background:#F2E1F4;color:var(--vv)}
.dp-nav .ic{width:16px;height:16px}
.dp-w{display:grid;grid-template-columns:repeat(7,1fr);padding:0 0 4px}
.dp-w span{text-align:center;font-size:11.5px;font-weight:700;color:var(--ink3)}
.dp-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}
.dp-d{height:36px;border-radius:12px;font-size:13.5px;font-weight:600;color:var(--ink);text-align:center;font-variant-numeric:tabular-nums}
.dp-d:hover:not(:disabled){background:#F2E1F4}
.dp-d.out{color:var(--ink4);font-weight:500}
.dp-d.today{box-shadow:inset 0 0 0 1.5px var(--vv);color:var(--vv);font-weight:800}
.dp-d.foc{background:var(--line2)}
.dp-d.sel{background:var(--vv);color:#fff;box-shadow:none;font-weight:800}
.dp-d:disabled{color:#D6CDD6;cursor:not-allowed}
.dp-f{display:flex;justify-content:space-between;padding:10px 4px 2px;border-top:1px solid var(--line2);margin-top:8px}
.dp-link{font-weight:700;font-size:13.5px;color:var(--vv);padding:6px 10px;border-radius:999px}
.dp-link:hover:not(:disabled){background:#F2E1F4}
.dp-link.mute{color:var(--ink3)}
.dp-link:disabled{opacity:.4}
.customr label{display:flex;align-items:center;gap:6px}

/* ---------- combobox ---------- */
.cb{position:relative}
.cb-in{display:flex;align-items:center;gap:8px;height:46px;padding:0 6px 0 14px;border-radius:16px;border:1.5px solid var(--line);background:#fff;color:var(--ink3)}
.cb-in .ic{width:17px;height:17px}
.cb.open .cb-in,.cb-in:focus-within{border-color:var(--vv);box-shadow:0 0 0 3px var(--vv-100)}
.cb-in input{flex:1;min-width:0;border:0!important;outline:0;background:none;height:100%;color:var(--ink);font-weight:600;box-shadow:none!important;padding:0!important}
.cb-t{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;color:var(--ink3)}
.cb-t:hover{background:var(--line2)}
.cb.open .cb-t .ic{transform:rotate(180deg)}
.cb-bg{position:fixed;inset:0;z-index:60}
.cb-list{position:absolute;z-index:61;left:0;right:0;top:calc(100% + 8px);max-height:300px;overflow-y:auto;background:#fff;border-radius:20px;box-shadow:var(--sh-l);padding:6px;overscroll-behavior:contain;scrollbar-width:thin}
.cb-o{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:8px 14px;border-radius:14px;font-weight:600;font-size:14px;color:var(--ink);text-align:left}
.cb-o.hi{background:#F2E1F4;color:var(--vv)}
.cb-o.free{color:var(--vv)}
.cb-o.free .ic{width:16px;height:16px}
.cb-n{flex:1;min-width:0}
.cb-s{font-size:12.5px;color:var(--ink3);font-weight:500}
.cb-empty{padding:14px;color:var(--ink3);font-size:13.5px;text-align:center}

/* ---------- reports ---------- */
.rpt-hero{background:#fff;border-radius:var(--r-l);box-shadow:var(--sh);overflow:hidden}
.rpt-hero-h{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:20px 24px;color:#fff;background:linear-gradient(120deg,var(--plum) 0%,#6A1B9A 55%,#4C6FE0 100%)}
.rpt-hero-ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.16);flex:none}
.rpt-hero-t{flex:1;min-width:220px}
.rpt-hero-t h2{font-size:20px}
.rpt-hero-t p{font-size:13.5px;opacity:.85;margin-top:2px}
.rpt-per{display:flex;flex-wrap:wrap;gap:3px;padding:4px;border-radius:999px;background:rgba(255,255,255,.14)}
.rpt-per button{height:34px;padding:0 14px;border-radius:999px;font-size:13px;font-weight:600;color:#fff!important;white-space:nowrap}
.rpt-per button:hover{background:rgba(255,255,255,.1)}
.rpt-per button.on{background:#fff;color:var(--plum)!important;font-weight:750}
.rpt-hero-b{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:24px;padding:22px 24px 24px}
.rpt-hero-l,.rpt-hero-r{display:flex;flex-direction:column;gap:12px;min-width:0}
.rpt-eyebrow{font-size:12.5px;font-weight:700;color:var(--ink3)}
.rpt-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.rpt-tiles div{border-radius:18px;padding:14px 14px 12px;display:flex;flex-direction:column;gap:6px;min-width:0}
.rpt-tiles span{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700}
.rpt-tiles span .ic{width:15px;height:15px}
.rpt-tiles b{font-size:28px;line-height:1.05;font-weight:800;letter-spacing:-.03em;color:var(--ink);overflow-wrap:anywhere}
.rpt-acts{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:auto}
.rpt-msg{margin:0;max-height:380px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:inherit;font-size:13.5px;line-height:1.6;padding:14px 16px;border-radius:16px;background:var(--bg);border:1.5px solid var(--line2)}
.rpt-ok{display:inline-flex;align-items:center;gap:6px;color:var(--aq-d);font-weight:700;font-size:13px}
.rpt-ok .ic{width:16px;height:16px}
.rpt-quick{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.rpt-q{padding:0;overflow:hidden;gap:0}
.rpt-q-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:14px 20px}
.rpt-q-h b{font-size:16px}
.rpt-q-h span{font-size:12.5px;font-weight:600;opacity:.85;text-align:right}
.rpt-q-f{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;padding:16px 20px}
.rpt-q-f span{display:flex;flex-direction:column;min-width:0}
.rpt-q-f i{font-style:normal;font-size:12.5px;color:var(--ink3)}
.rpt-q-f b{font-size:18px;font-weight:800;overflow-wrap:anywhere}
.rpt-q-a{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 20px 18px}
.rpt-legend{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;font-weight:600;color:var(--ink2)}
.rpt-legend span{display:inline-flex;align-items:center;gap:6px}
.rpt-legend i,.rpt-tip i{width:10px;height:10px;border-radius:3px;display:inline-block;flex:none}
.rpt-chart{position:relative}
.rpt-chart svg{display:block;width:100%;height:auto;overflow:visible}
.rpt-chart g:focus{outline:none}
.rpt-ax{font-size:11px;fill:var(--ink3);font-family:var(--font)}
.rpt-tip{position:absolute;top:0;transform:translateX(-50%);background:#fff;border-radius:12px;box-shadow:var(--sh-l);padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:12.5px;pointer-events:none;min-width:170px;z-index:2}
.rpt-tip span{display:flex;align-items:center;gap:7px;color:var(--ink2)}
.rpt-tip em{margin-left:auto;font-style:normal;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.rpt-tw{overflow-x:auto;border-radius:14px;border:1.5px solid var(--line2)}
.rpt-t{width:100%;border-collapse:collapse;font-size:13px}
.rpt-t th{background:var(--plum);color:#fff;text-align:left;font-weight:650;padding:9px 12px;white-space:nowrap}
.rpt-t td{padding:8px 12px;border-top:1px solid var(--line2);white-space:nowrap}
.rpt-t tbody tr:nth-child(even) td{background:#FBF6FA}
.rpt-t tfoot td{font-weight:800;background:var(--vv-50)}
.rpt-t .r{text-align:right;font-variant-numeric:tabular-nums}
.rpt-steps{display:flex;flex-direction:column;gap:26px}
.rpt-steps > div{display:flex;flex-direction:column;gap:12px;min-width:0}
.rpt-step{display:flex;gap:12px;align-items:flex-start}
.rpt-step > span{width:30px;height:30px;border-radius:50%;background:var(--plum);color:#fff;font-weight:800;display:grid;place-items:center;flex:none}
.rpt-step b{font-size:15.5px;display:block}
.rpt-step p{font-size:13px;color:var(--ink3)}
.rpt-pick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.rpt-opt{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;border:1.5px solid var(--line)!important;background:#fff;text-align:left;min-width:0}
.rpt-opt:hover{border-color:var(--ink4)!important}
.rpt-opt.on{border-color:var(--vv)!important;background:var(--vv-50)}
.rpt-box{width:22px;height:22px;border-radius:7px;border:2px solid var(--ink4);display:grid;place-items:center;flex:none}
.rpt-opt.on .rpt-box{background:var(--vv);border-color:var(--vv);color:#fff}
.rpt-box .ic{width:14px;height:14px;stroke-width:3}
.rpt-opt-ic{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;flex:none}
.rpt-opt-ic .ic{width:17px;height:17px}
.rpt-opt-t{flex:1;min-width:0;display:flex;flex-direction:column}
.rpt-opt-t b{font-size:14px}
.rpt-opt-t i{font-style:normal;font-size:12.5px;color:var(--ink3);line-height:1.35}
.rpt-opt em{font-style:normal;font-weight:800;font-size:13px;min-width:32px;height:26px;padding:0 9px;border-radius:13px;display:grid;place-items:center;background:var(--line2);color:var(--ink2);flex:none}
.rpt-opt.on em{background:var(--sy);color:var(--ink)}
.rpt-chips{display:flex;flex-wrap:wrap;gap:8px}
.rpt-custom{flex-wrap:wrap}
.rpt-fmts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.rpt-fmt{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-radius:18px;border:1.5px solid var(--line)!important;background:#fff;text-align:left;min-width:0}
.rpt-fmt:hover{border-color:var(--ink4)!important}
.rpt-fmt.on{border-color:var(--plum)!important;background:var(--plum);color:#fff}
.rpt-fmt b{font-size:14.5px}
.rpt-fmt i{font-style:normal;font-size:12.5px;opacity:.75}
.rpt-sum{padding:16px 18px;border-radius:18px;background:var(--bg);gap:12px!important}
.rpt-sum p{font-size:13.5px;color:var(--ink2)}
.rpt-warn{color:var(--red)!important;font-weight:700}
.rpt-bar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px}
.rpt-bar-a{display:flex;flex-wrap:wrap;gap:10px}
.rpt-doc{gap:22px;padding:30px}
.rpt-doc-h{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;padding-bottom:18px;border-bottom:4px solid;border-image:var(--brandbar) 1}
.rpt-doc-h h1{font-size:28px;color:var(--plum)}
.rpt-doc-h img{height:54px;width:auto;max-width:100%}
.rpt-kp{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.rpt-kp div{border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0}
.rpt-kp span{font-size:12.5px;font-weight:700}
.rpt-kp b{font-size:24px;font-weight:800;color:var(--ink);overflow-wrap:anywhere}
.rpt-lists{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 28px}
.rpt-lists h2,.rpt-sec h2{font-size:16px;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.rpt-wide{grid-column:1/-1}
.rpt-lists > div{min-width:0}
.rpt-tiles b.mn{font-size:22px;white-space:nowrap;overflow-wrap:normal}
.rpt-sec h2 i{width:10px;height:10px;border-radius:3px}
.rpt-sec{min-width:0}

/* ---------- mobile chrome (hidden on desktop) ---------- */
.mtop,.mnav{display:none}

/* ---------- container queries: content width ---------- */
@container main (max-width: 1240px){
  .sl-r{grid-template-columns:minmax(180px,1.2fr) minmax(190px,1.1fr) minmax(180px,1.3fr) minmax(90px,.55fr) 18px}
  .sl-of{display:none}
}
@container main (max-width: 1180px){
  .ldr{grid-template-columns:auto minmax(140px,1.2fr) minmax(150px,1.2fr) auto}
  .ldr-int,.ldr-calls{display:none}
  .rec-body{grid-template-columns:minmax(0,1fr) 290px}
}
@container main (max-width: 1000px){
  .ph-a:has(.sbox.hs){flex-wrap:wrap;width:100%}
  .ph-a .sbox.hs{flex:1 1 220px}
  .sl-r{grid-template-columns:minmax(170px,1.2fr) minmax(180px,1fr) minmax(170px,1.3fr) 18px}
  .sl-ct{display:none}
  .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dgrid{grid-template-columns:minmax(0,1fr)}
  .split{grid-template-columns:minmax(0,1fr)}
  .scards.stage8,.scards.lead6{display:flex;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity;scrollbar-width:thin}
  .stage8 .scard{flex:0 0 148px;scroll-snap-align:start}
  .lead6 .scard{flex:0 0 170px}
  .grp{margin-left:0}
  .lp-empty{display:none}
  .lp{position:fixed;z-index:50;top:0;right:0;bottom:0;width:min(460px,100vw);max-height:none;border-radius:0;transform:translateX(100%);transition:transform .2s ease;box-shadow:var(--sh-l)}
  .lp.open{transform:none}
  .lp-back{display:inline-grid}
  .lp-x{display:none}
  .rec-body{grid-template-columns:minmax(0,1fr)}
  .rec-rail{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}
  .rec-rail .na{display:none}
  .na-m{display:flex;gap:10px;align-items:flex-start;padding:14px 24px;font-size:14px;font-weight:650;background:#E8DDF8;color:#2E1B57}
  .na-m .ic{margin-top:2px;width:16px;height:16px}
  .na-m b{display:block;font-size:12px;opacity:.75}
  .na-m.na-warn{background:#FFF0A8;color:#4A3600} .na-m.na-ok{background:#CDF5EA;color:#08463A} .na-m.na-bad{background:#FDE0E0;color:#7A1F1F} .na-m.na-grey{background:#EFE9EF;color:var(--ink2)}
  .set{grid-template-columns:minmax(0,1fr)}
  .set-nav{position:static;flex-direction:row;overflow-x:auto;padding-bottom:4px}
  .set-nav button{flex:none;background:#fff}
  .nl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .usr-r{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"w x" "p p" "r s"}
  .usr-r .c-who{grid-area:w} .usr-pw{grid-area:p} .usr-r .inp{grid-area:r} .usr-sw{grid-area:s} .usr-x{grid-area:x}
}
@container main (max-width: 780px){
  .rpt-hero-b{grid-template-columns:1fr}
  .rpt-quick{grid-template-columns:1fr}
  .rpt-pick{grid-template-columns:1fr}
  .rpt-lists{grid-template-columns:1fr}
  .rpt-doc{padding:20px}
  .sl-r{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"who chev" "step step" "next next";gap:10px 12px;padding:14px}
  .sl-who{grid-area:who} .sl-r > .ic{grid-area:chev} .sl-step{grid-area:step;flex-direction:row;align-items:center;justify-content:space-between;gap:12px} .sl-next{grid-area:next;padding-top:10px;border-top:1px dashed var(--line)}
  .sl-step .jr-bar{width:110px}
  .tbar{border-radius:22px}
  .cbar{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:100%}
  .cchip{height:40px;padding:0 14px;font-size:14px}
  .grp{width:100%;overflow-x:auto}
  .grp > span{display:none}
  .board{grid-auto-columns:minmax(250px,82%)}
  .rangebox{align-items:stretch;width:100%}
  .ldr{grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"a w c" "a n n";gap:4px 12px;padding:12px}
  .ldr > .av{grid-area:a;align-self:start}
  .ldr-who{grid-area:w} .ldr > .ic{grid-area:c;justify-self:end}
  .ldr-next{grid-area:n;flex-direction:row;align-items:center;gap:8px}
  .grid3{grid-template-columns:repeat(2,minmax(0,1fr))}
  .checklist{grid-template-columns:minmax(0,1fr)}
  .minigrid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .payrow{grid-template-columns:minmax(0,1fr)}
  .st7-b{padding:6px 16px 18px}
  .rp-steps span{display:none}
  .rp-cap{display:block}
  .rec-rail{grid-template-columns:minmax(0,1fr)}
  .pkgs,.pkgpick{grid-template-columns:minmax(0,1fr)}
  .addc{grid-template-columns:minmax(0,1fr)}
  .ctl-h{display:none}
  .ctl-r{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 36px;grid-template-areas:"n n x" "a b b" "t t t";row-gap:8px}
  .ctl-n{grid-area:n} .ctl-r > .ib{grid-area:x} .ctl-f:nth-of-type(1){grid-area:a} .ctl-f:nth-of-type(2){grid-area:b} .ctl-t{grid-area:t;text-align:left;color:var(--ink3);font-weight:600}
  .ctl-f em{display:block;font-style:normal;font-size:11.5px;color:var(--ink3);font-weight:650;margin-bottom:3px}
  .ctl-f .inp{text-align:left}
}
@container main (max-width: 560px){
  .rpt-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .rpt-fmts{grid-template-columns:1fr}
  .rpt-hero-h,.rpt-hero-b{padding-left:16px;padding-right:16px}
  .rpt-per{width:100%;overflow-x:auto;flex-wrap:nowrap}
  .fpop{position:fixed;left:12px;right:12px;top:auto;bottom:calc(84px + env(safe-area-inset-bottom));width:auto}
  .customr{flex-direction:column}
  .grid2,.grid3,.nl-grid{grid-template-columns:minmax(0,1fr)}
  .kpis{gap:10px}
  .kpi{padding:16px;border-radius:22px}
  .kpi b{font-size:32px;margin-top:8px}
  .kpi-go{display:none}
  .ph-t h1{font-size:26px}
  .ph-a{width:100%}
  .ph-a .btn{flex:1}
  .ph-a:has(.sbox.hs){flex-wrap:wrap}
  .ph-a .sbox.hs{flex:1 1 100%}
  .segc{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .segc button{flex:none}
  .ph-a .segc{width:100%}
  .ph-a .segc button{flex:1}
  .panel-x{margin-left:0;width:100%}
  .panel{padding:18px}
  .rec-top{padding:18px}
  .rec-t h1{font-size:22px}
  .rec-a{width:100%}
  .rec-a .btn.primary{flex:1}
  .hide-s{display:none}
  .rec-prog{padding:14px 18px}
  .decision-pick{grid-template-columns:minmax(0,1fr)}
  .st7-h{padding:10px 10px 10px 14px;gap:10px}
  .st7::before{left:31px}
  .st7-h .pill{display:none}
  .st7-f .btn{flex:1}
  .st7-f .btn.primary{margin-left:0}
  .legend{grid-template-columns:minmax(0,1fr)}
  .fbar .sbox{flex-basis:100%}
  .fbar-n{margin-left:0;width:100%}
  .formfoot .btn{flex:1}
  .sp{padding:18px}
  .fsec{padding:18px}
  .ptabs{align-self:stretch}
}

/* ---------- viewport: sidebar → icon rail → bottom nav ---------- */
@media (max-width: 1179px) and (min-width: 761px){
  .app{grid-template-columns:80px minmax(0,1fr);background:linear-gradient(90deg,var(--side) 0,var(--side) 80px,var(--bg) 80px)}
  .side{padding:18px 12px;align-items:center}
  .side-brand{padding:4px 0 14px}
  .side-brand .logo-full{display:none} .side-brand .logo-mark{display:block}
  .side-search,.sn,.sc-btn{width:52px;height:52px;padding:0;justify-content:center}
  .side-search span,.side-search kbd,.sn span,.sc-btn span,.side-me-t{display:none}
  .sn em{position:absolute;top:2px;right:0;min-width:18px;height:18px;font-size:10.5px;padding:0 4px}
  .side-foot{align-items:center}
  .side-me{flex-direction:column;padding:8px 6px;background:none}
  .side-foot .lang{flex-direction:column;border-radius:18px}
  .main{padding:26px 26px 56px}
}
@media (max-width: 760px){
  .app{display:block;background:var(--bg)}
  .side{display:none}
  .mtop{display:flex;align-items:center;gap:8px;position:sticky;top:0;z-index:30;height:60px;padding:0 10px 0 16px;background:var(--brandbar) bottom/100% 3px no-repeat,var(--side);color:#fff}
  .mtop img{height:30px;width:auto;filter:brightness(0) invert(1)}
  .mtop-t{flex:1;font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mtop .ib{color:rgba(255,255,255,.85)}
  .mtop .ib:hover{background:rgba(255,255,255,.1)}
  .mtop .lang button{padding:4px 9px}
  .main{padding:20px 16px calc(96px + env(safe-area-inset-bottom))}
  .pg{gap:16px}
  .mnav{display:flex;position:fixed;left:10px;right:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:40;background:#fff;border-radius:26px;padding:6px;box-shadow:0 10px 30px rgba(30,15,25,.16)}
  .mnav button{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 2px;border-radius:20px;font-size:11.5px;font-weight:700;color:var(--ink3);position:relative;min-width:0}
  .mnav button span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
  .mnav button .ic{width:22px;height:22px}
  .mnav button.on{color:var(--ink)}
  .mnav button.on .ic{background:#F2E1F4;border-radius:999px;width:46px;padding:2px 12px;box-sizing:border-box;height:26px}
  .mnav em{position:absolute;top:2px;left:calc(50% + 6px);font-style:normal;font-size:10.5px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:var(--sy);color:var(--ink);display:grid;place-items:center}
  .mnav-new{color:var(--ink)!important}
  .mnav-new .ic{background:var(--plum);color:#fff;border-radius:999px;width:46px!important;height:30px!important;padding:5px 12px;box-sizing:border-box}
  .toast{bottom:calc(94px + env(safe-area-inset-bottom))}
  .crumb{display:none}
  .login{grid-template-columns:minmax(0,1fr)}
  .login-brand{padding:28px 24px;gap:20px;margin:10px 10px 0;border-radius:26px}
  .lb-copy h2{font-size:26px}
  .lb-copy p{font-size:14.5px}
  .lb-steps{display:none}
  .login-card{padding:28px 20px 40px}
  .lp{width:100vw}
  .pal-wrap{padding-top:8vh}
}
@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}
`;
/* ============================================================
   AMHARIC DICTIONARY
   ============================================================ */
const AM = {
"(you)": "(እርስዎ)",
"Enter your username and password.": "የተጠቃሚ ስምና የይለፍ ቃል ያስገቡ።",
"verified": "ተረጋግጠዋል",
"ready": "ዝግጁ",
"done": "ተጠናቋል",
"English": "እንግሊዝኛ",
"12 months": "12 ወራት",
"30 days": "30 ቀናት",
"7 days": "7 ቀናት",
"All time": "ከመጀመሪያው ጀምሮ",
"2 biometric photos": "2 ባዮሜትሪክ ፎቶዎች",
"2 passport photos (ICAO)": "2 የፓስፖርት ፎቶዎች (ICAO)",
"A case number is assigned when you create it. Only the name is required; fill in the rest as you learn it.": "ጉዳዩን ሲፈጥሩ ቁጥር ይሰጠዋል። የሚያስፈልገው ስም ብቻ ነው፤ የቀረውን መረጃ ሲያገኙ ይሙሉ።",
"A name or a phone number is enough to start.": "ለመጀመር ስም ወይም ስልክ ቁጥር በቂ ነው።",
"A second person reviews the whole file: is everything there, correct, consistent, authentic, translated and legalised?": "ሁለተኛ ሰው ፋይሉን በሙሉ ይገመግማል፦ ሁሉም አለ? ትክክል ነው? የተጣጣመ፣ ዋናና የተተረጎመ እንዲሁም የተረጋገጠ ነው?",
"APS certificate": "APS ሰርተፊኬት",
"ATAS certificate (if required)": "ATAS ሰርተፊኬት (አስፈላጊ ከሆነ)",
"Academic background": "የትምህርት ዝግጅት",
"Academic documents (legalised)": "የትምህርት ሰነዶች (የተረጋገጡ)",
"Academic qualifications on CAS": "በCAS ላይ ያሉ የትምህርት ማስረጃዎች",
"Academic transcripts & certificates": "የትምህርት ውጤት ማስረጃዎችና ሰርተፊኬቶች",
"Academic transcripts & certificates (legalised)": "የትምህርት ውጤት ማስረጃዎችና ሰርተፊኬቶች (የተረጋገጡ)",
"Academic transcripts & degree certificates": "የትምህርት ውጤት ማስረጃዎችና የዲግሪ ሰርተፊኬቶች",
"Academic, financial and visa profile, and how well the country fits.": "የትምህርት፣ የገንዘብና የቪዛ ሁኔታ፣ እንዲሁም አገሩ ምን ያህል እንደሚስማማ።",
"Accommodation": "መኖሪያ",
"Accommodation proof": "የመኖሪያ ማስረጃ",
"Accommodation proof in Italy": "በጣሊያን የመኖሪያ ማስረጃ",
"Action": "ተግባር",
"Active cases": "ንቁ ጉዳዮች",
"Activity": "እንቅስቃሴ",
"Add": "ጨምር",
"Add a call": "ጥሪ ጨምር",
"Add a country": "አገር ጨምር",
"Add a name or phone number.": "ስም ወይም ስልክ ቁጥር ያስገቡ።",
"Add a note: a call, a document received, a decision…": "ማስታወሻ ያክሉ፦ ጥሪ፣ የደረሰ ሰነድ፣ ውሳኔ…",
"Add a username.": "የተጠቃሚ ስም ያስገቡ።",
"Add lead": "ጠያቂ ጨምር",
"Add note": "ማስታወሻ ጨምር",
"Add the person’s full name.": "የሰውየውን ሙሉ ስም ያስገቡ።",
"Add the student’s name to create the case.": "ጉዳዩን ለመፍጠር የተማሪውን ስም ያስገቡ።",
"Add the universities this student is applying to.": "ተማሪው የሚያመለክትባቸውን ዩኒቨርሲቲዎች ያክሉ።",
"Add university": "ዩኒቨርሲቲ ጨምር",
"Admission": "ቅበላ",
"Admission route": "የቅበላ መንገድ",
"Age": "ዕድሜ",
"Agree the study plan: destination, university and programme.": "የትምህርት ዕቅዱን ይስማሙ፦ አገር፣ ዩኒቨርሲቲና የትምህርት ዘርፍ።",
"Airport guidance": "የአውሮፕላን ማረፊያ መመሪያ",
"All": "ሁሉም",
"All on schedule": "ሁሉም በሰዓቱ ነው",
"Amount": "መጠን",
"An honest read of the profile, not a promise to the student.": "የተማሪውን ሁኔታ በታማኝነት መገምገም እንጂ ቃል መግባት አይደለም።",
"Another country (type it)": "ሌላ አገር (ይጻፉት)",
"Answered": "ስልኩን አንስቷል",
"Any {x}": "ማንኛውም {x}",
"Anything useful for the first call": "ለመጀመሪያው ጥሪ የሚጠቅም ማንኛውም ነገር",
"Application fee": "የማመልከቻ ክፍያ",
"Application removed": "ማመልከቻው ተወግዷል",
"Applied": "አመልክቷል",
"Applied on": "ያመለከተበት ቀን",
"Apply to universities and wait for offers.": "ለዩኒቨርሲቲዎች ያመልክቱና የቅበላ ውሳኔ ይጠብቁ።",
"Applying to {n} universities": "ለ{n} ዩኒቨርሲቲዎች በማመልከት ላይ",
"Appointment and lodging": "ቀጠሮና ፋይል ማስገባት",
"Appointment booked": "ቀጠሮ ተይዟል",
"Appointment confirmed": "ቀጠሮ ተረጋግጧል",
"Appointment date": "የቀጠሮ ቀን",
"Appointment requested": "ቀጠሮ ተጠይቋል",
"Appointment {d}": "ቀጠሮ {d}",
"Approved": "ጸድቋል",
"Archive": "ወደ ማህደር",
"Archived": "በማህደር የተቀመጡ",
"Arrival orientation": "የመድረሻ ገለጻ",
"Assessment": "ግምገማ",
"Assessment notes": "የግምገማ ማስታወሻ",
"At the embassy": "ኤምባሲ ላይ",
"Australia": "አውስትራሊያ",
"Austria": "ኦስትሪያ",
"Awaiting decision": "ውሳኔ በመጠበቅ ላይ",
"Bachelor / Master / PhD": "የመጀመሪያ ዲግሪ / ሁለተኛ ዲግሪ / ሦስተኛ ዲግሪ",
"Back to list": "ወደ ዝርዝሩ ተመለስ",
"Back to {s}": "ወደ {s} ተመለስ",
"Bank balance": "የባንክ ቀሪ ሂሳብ",
"Bank statements": "የባንክ ሂሳብ መግለጫዎች",
"Became paying cases": "ከፋይ ጉዳዮች የሆኑ",
"Before they fly": "ከመብረራቸው በፊት",
"Belgium": "ቤልጂየም",
"Biometrics appointment": "የባዮሜትሪክ ቀጠሮ",
"Biometrics done": "ባዮሜትሪክ ተሰጥቷል",
"Blocked": "ታግዷል",
"Blocked account (Sperrkonto) funded": "የታገደ ሂሳብ (Sperrkonto) ገንዘብ ገብቶበታል",
"Blocks start": "ሥራ እንዳይጀመር ያግዳል",
"Book the appointment and lodge the file.": "ቀጠሮ ይያዙና ፋይሉን ያስገቡ።",
"Book the appointment, lodge the file, prepare for the interview.": "ቀጠሮ ይያዙ፣ ፋይሉን ያስገቡ፣ ለቃለ መጠይቅ ይዘጋጁ።",
"Both packages start with a non-refundable registration fee. Payment 1 and Payment 2 are set per destination.": "ሁለቱም ፓኬጆች የማይመለስ የምዝገባ ክፍያ አላቸው። ክፍያ 1 እና ክፍያ 2 በእያንዳንዱ አገር ይወሰናሉ።",
"Budget": "በጀት",
"Build one consistent financial story, not just a pile of documents.": "የሰነድ ክምር ሳይሆን አንድ የተጣጣመ የገንዘብ ታሪክ ይገንቡ።",
"Build the financial story and documents, then get QC sign-off.": "የገንዘብ ታሪኩንና ሰነዶቹን ያዘጋጁ፣ ከዚያ የጥራት ፍተሻ ፊርማ ያግኙ።",
"Building visa file": "የቪዛ ፋይል በመዘጋጀት ላይ",
"Business": "ድርጅት",
"Business name": "የድርጅቱ ስም",
"CAS from licensed sponsor": "ፈቃድ ካለው ስፖንሰር CAS",
"CIMEA statement / Declaration of Value": "CIMEA መግለጫ / Declaration of Value",
"CV": "የሥራ ልምድ (CV)",
"Call": "ደውል",
"Call history": "የጥሪ ታሪክ",
"Call logged, follow-up booked": "ጥሪው ተመዝግቧል፣ ቀጣይ ጥሪ ተይዟል",
"Call now": "አሁን ይደውሉ",
"Call plan: {p}. A lead closes after {n} unanswered calls.": "የጥሪ ዕቅድ፦ {p}። ጠያቂው ከ{n} ያልተመለሱ ጥሪዎች በኋላ ይዘጋል።",
"Call today": "ዛሬ ይደውሉ",
"Call {n}": "ጥሪ {n}",
"Call {n}, the last one": "ጥሪ {n}፣ የመጨረሻው",
"Calls": "ጥሪዎች",
"Calls due today": "ዛሬ የሚደረጉ ጥሪዎች",
"Calls on day {d}. Save changes to apply the new plan to open leads.": "ጥሪዎች በቀን {d}። አዲሱን ዕቅድ ለክፍት ጠያቂዎች ለመተግበር ለውጦቹን ያስቀምጡ።",
"Calls that should already have happened": "ቀደም ብለው መደረግ የነበረባቸው ጥሪዎች",
"Calls to make": "የሚደረጉ ጥሪዎች",
"Can sign in": "መግባት ይችላል",
"Canada": "ካናዳ",
"Cancel": "ሰርዝ",
"Capture an enquiry in seconds. The first call is due today.": "ጥያቄን በሰከንዶች ይመዝግቡ። የመጀመሪያው ጥሪ ዛሬ ነው።",
"Case archived": "ጉዳዩ ወደ ማህደር ገብቷል",
"Case created": "ጉዳዩ ተፈጥሯል",
"Case deleted": "ጉዳዩ ተሰርዟል",
"Case restored": "ጉዳዩ ተመልሷል",
"Case {id} created": "ጉዳይ {id} ተፈጥሯል",
"Checklist updated": "የማረጋገጫ ዝርዝሩ ተዘምኗል",
"China": "ቻይና",
"Choose a country…": "አገር ይምረጡ…",
"Choose a package to see which payments apply.": "የትኞቹ ክፍያዎች እንደሚመለከቱ ለማየት ፓኬጅ ይምረጡ።",
"Choose a package to set which payments apply.": "የትኞቹ ክፍያዎች እንደሚመለከቱ ለመወሰን ፓኬጅ ይምረጡ።",
"Clear filters": "ማጣሪያዎችን አጽዳ",
"Clear search": "ፍለጋውን አጽዳ",
"Close": "ዝጋ",
"Closed": "ተዘግቷል",
"Collect the registration fee. Nothing else can start until it’s recorded.": "የምዝገባ ክፍያውን ይሰብስቡ። እስኪመዘገብ ድረስ ምንም ነገር መጀመር አይቻልም።",
"Collect the registration fee. Work starts once it’s paid.": "የምዝገባ ክፍያውን ይሰብስቡ። ሥራው የሚጀምረው ከተከፈለ በኋላ ነው።",
"Conditions": "ቅድመ ሁኔታዎች",
"Consistency across documents": "በሰነዶች መካከል መጣጣም",
"Consulting, applying & university admission": "ምክር፣ ማመልከቻና የዩኒቨርሲቲ ቅበላ",
"Contact": "መገኛ",
"Converted from lead {c}": "ከጠያቂ {c} የተመዘገበ",
"Country": "አገር",
"Country checklist": "የአገር ማረጋገጫ ዝርዝር",
"Country name": "የአገር ስም",
"Country, then university and programme, then how they’ll get in, pay and get the visa.": "መጀመሪያ አገር፣ ከዚያ ዩኒቨርሲቲና የትምህርት ዘርፍ፣ ከዚያ እንዴት እንደሚገቡ፣ እንደሚከፍሉና ቪዛ እንደሚያገኙ።",
"Create a login": "መግቢያ ፍጠር",
"Create case": "ጉዳይ ፍጠር",
"Create login": "መግቢያ ፍጠር",
"Create the first case, or register one from a lead.": "የመጀመሪያውን ጉዳይ ይፍጠሩ ወይም ከጠያቂ ይመዝግቡ።",
"Currency": "የገንዘብ ዓይነት",
"Current step": "የአሁኑ ደረጃ",
"Cyprus": "ቆጵሮስ",
"Czech Republic": "ቼክ ሪፐብሊክ",
"DS-160 confirmation": "DS-160 ማረጋገጫ",
"Date": "ቀን",
"Day": "ቀን",
"Deadline": "የመጨረሻ ቀን",
"Deadline {d}": "የመጨረሻ ቀን {d}",
"Decision: {d}": "ውሳኔ፦ {d}",
"Delete case": "ጉዳዩን ሰርዝ",
"Delete lead": "ጠያቂውን ሰርዝ",
"Delete this case": "ይህን ጉዳይ ሰርዝ",
"Delete {id} for good? This can’t be undone. Archive keeps the record instead.": "{id}ን በቋሚነት ይሰርዙ? ይህ ሊመለስ አይችልም። ማህደር ግን መዝገቡን ይይዛል።",
"Destination": "መዳረሻ",
"Destination prices": "የመዳረሻ ዋጋዎች",
"Destination updated": "መዳረሻው ተዘምኗል",
"Destination: {c}": "መዳረሻ፦ {c}",
"Destinations": "መዳረሻዎች",
"Details": "ዝርዝሮች",
"Difficult-question session": "የከባድ ጥያቄዎች ልምምድ",
"Digital photo": "ዲጂታል ፎቶ",
"Done": "ተጠናቋል",
"Done, move to {s}": "ተጠናቋል፣ ወደ {s} አዛውር",
"Dubai (UAE)": "ዱባይ (ተ.አ.ኤ.)",
"Due": "የሚከፈል",
"Due now. Admission stage reached.": "አሁን የሚከፈል። የቅበላ ደረጃ ደርሷል።",
"Due now. Blocks the start of work.": "አሁን የሚከፈል። ሥራ እንዳይጀመር ያግዳል።",
"Due now. Case is at visa outcome.": "አሁን የሚከፈል። ጉዳዩ የቪዛ ውጤት ላይ ነው።",
"Due once the visa is completed": "ቪዛው ሲጠናቀቅ የሚከፈል",
"Due once university admission is received": "የዩኒቨርሲቲ ቅበላ ሲገኝ የሚከፈል",
"ETB": "ብር",
"Edit on the Profile tab": "በመገለጫ ገጹ ላይ ያስተካክሉ",
"Education": "ትምህርት",
"Education level": "የትምህርት ደረጃ",
"Email": "ኢሜይል",
"Embassy asked for more": "ኤምባሲው ተጨማሪ ጠይቋል",
"Emergency contacts": "የአደጋ ጊዜ አድራሻዎች",
"Employment / business evidence": "የሥራ / የንግድ ማስረጃ",
"English (SELT/approved)": "እንግሊዝኛ (SELT/የጸደቀ)",
"English level": "የእንግሊዝኛ ደረጃ",
"English/Italian proficiency certificate": "የእንግሊዝኛ/ጣሊያንኛ ብቃት ሰርተፊኬት",
"Enquiry": "ጥያቄ",
"Enrolled": "ተመዝግቧል",
"Estonia": "ኢስቶኒያ",
"Every enquiry, newest first": "ሁሉም ጥያቄዎች፣ አዲሱ መጀመሪያ",
"Every student’s journey, from first call to arrival.": "የእያንዳንዱ ተማሪ ጉዞ፣ ከመጀመሪያው ጥሪ እስከ መድረሻ።",
"Everyone gets their own username and password. Partners can open Settings; staff work leads and cases. Changes here save straight away.": "ሁሉም የራሱ የተጠቃሚ ስምና የይለፍ ቃል ያገኛል። አጋሮች ቅንብሮችን መክፈት ይችላሉ፤ ሠራተኞች ጠያቂዎችንና ጉዳዮችን ይሠራሉ። እዚህ ያሉ ለውጦች ወዲያውኑ ይቀመጣሉ።",
"Facebook / Instagram": "ፌስቡክ / ኢንስታግራም",
"Fee not recorded yet": "ክፍያው ገና አልተመዘገበም",
"Field of study": "የትምህርት ዘርፍ",
"File is signed off. Book the visa appointment.": "ፋይሉ ጸድቋል። የቪዛ ቀጠሮ ይያዙ።",
"File lodged": "ፋይሉ ገብቷል",
"Final readiness assessment": "የመጨረሻ ዝግጁነት ግምገማ",
"Financial file": "የገንዘብ ፋይል",
"Financial story and flags": "የገንዘብ ታሪክና ስጋቶች",
"Finland": "ፊንላንድ",
"First call": "የመጀመሪያ ጥሪ",
"First call, today": "የመጀመሪያ ጥሪ፣ ዛሬ",
"First step": "የመጀመሪያ ደረጃ",
"Flight planning": "የበረራ ዕቅድ",
"Forgot your password? Ask a partner to show or reset it in Settings.": "የይለፍ ቃልዎን ረሱት? አጋር በቅንብሮች ውስጥ እንዲያሳይዎ ወይም እንዲቀይርልዎ ይጠይቁ።",
"Form I-20 (SEVIS registered)": "ቅጽ I-20 (በSEVIS የተመዘገበ)",
"France": "ፈረንሳይ",
"Fresh enquiries with no call logged": "ገና ጥሪ ያልተደረገላቸው አዳዲስ ጥያቄዎች",
"Full journey through visa completion": "ቪዛ እስኪጠናቀቅ ሙሉ ጉዞ",
"Full name": "ሙሉ ስም",
"Funding": "የገንዘብ ምንጭ",
"Funding updated": "የገንዘብ ምንጩ ተዘምኗል",
"GIC certificate": "GIC ሰርተፊኬት",
"GPA / grade": "GPA / ውጤት",
"General checklist": "አጠቃላይ ማረጋገጫ ዝርዝር",
"Generate a new password": "አዲስ የይለፍ ቃል ፍጠር",
"Germany": "ጀርመን",
"Go to home": "ወደ መነሻ ገጽ ሂድ",
"Go to leads": "ወደ ጠያቂዎች ሂድ",
"Go to settings": "ወደ ቅንብሮች ሂድ",
"Go to students": "ወደ ተማሪዎች ሂድ",
"Goal": "ግብ",
"Good afternoon": "እንደምን ዋሉ",
"Good evening": "እንደምን አመሹ",
"Good morning": "እንደምን አደሩ",
"Graduation year": "የምረቃ ዓመት",
"Greece": "ግሪክ",
"Health insurance": "የጤና መድን",
"Health insurance (travel + confirmation)": "የጤና መድን (የጉዞ + ማረጋገጫ)",
"Health insurance (valid in Italy)": "የጤና መድን (በጣሊያን የሚሠራ)",
"Hide": "ደብቅ",
"High risk": "ከፍተኛ ስጋት",
"Highest education": "ከፍተኛ የትምህርት ደረጃ",
"Home": "መነሻ",
"How they found us": "ስለ እኛ እንዴት ሰሙ",
"Hungary": "ሀንጋሪ",
"IELTS 6.5 / none yet": "IELTS 6.5 / ገና የለም",
"IHS surcharge paid": "IHS ክፍያ ተከፍሏል",
"In review": "በግምገማ ላይ",
"Income source": "የገቢ ምንጭ",
"India": "ህንድ",
"Intake": "የመግቢያ ጊዜ",
"Intended intake": "የታቀደ የመግቢያ ጊዜ",
"Interview preparation": "የቃለ መጠይቅ ዝግጅት",
"Ireland": "አየርላንድ",
"Italy": "ጣሊያን",
"Japan": "ጃፓን",
"Journey": "ጉዞ",
"Keep": "አቆይ",
"Keep it": "ይቆይ",
"Language certificate": "የቋንቋ ሰርተፊኬት",
"Language certificate (German/English)": "የቋንቋ ሰርተፊኬት (ጀርመንኛ/እንግሊዝኛ)",
"Language test (IELTS/PTE)": "የቋንቋ ፈተና (IELTS/PTE)",
"Late, {d}": "ዘግይቷል፣ {d}",
"Latvia": "ላትቪያ",
"Lead": "ጠያቂ",
"Lead closed": "ጠያቂው ተዘግቷል",
"Lead deleted": "ጠያቂው ተሰርዟል",
"Lead follow-up": "የጠያቂ ክትትል",
"Lead reopened": "ጠያቂው እንደገና ተከፍቷል",
"Lead {c} added": "ጠያቂ {c} ተጨምሯል",
"Leads": "ጠያቂዎች",
"Leads, cases, payments and visa files for the Yimaru team.": "ለይማሩ ቡድን ጠያቂዎች፣ ጉዳዮች፣ ክፍያዎችና የቪዛ ፋይሎች።",
"Letter of acceptance (DLI)": "የቅበላ ደብዳቤ (DLI)",
"Lithuania": "ሊትዌኒያ",
"Loading": "በመጫን ላይ",
"Loading cases": "ጉዳዮች በመጫን ላይ",
"Lodged with the embassy": "ለኤምባሲው ገብቷል",
"Lodged with the embassy. Waiting for a decision.": "ለኤምባሲው ገብቷል። ውሳኔ በመጠበቅ ላይ።",
"Log call {n}": "ጥሪ {n} መዝግብ",
"Login created for {n}": "ለ{n} መግቢያ ተፈጥሯል",
"Login removed": "መግቢያው ተወግዷል",
"Malaysia": "ማሌዢያ",
"Malta": "ማልታ",
"Manage": "አስተዳድር",
"Master’s, Bachelor’s, scholarship…": "ሁለተኛ ዲግሪ፣ የመጀመሪያ ዲግሪ፣ ስኮላርሺፕ…",
"Me": "እኔ",
"Medical exam (panel physician)": "የሕክምና ምርመራ (የተፈቀደ ሐኪም)",
"Mock interview 1": "የልምምድ ቃለ መጠይቅ 1",
"Mock interview 2": "የልምምድ ቃለ መጠይቅ 2",
"More documents": "ተጨማሪ ሰነዶች",
"Motivation / SOP letter": "የፍላጎት / SOP ደብዳቤ",
"Move to {s}": "ወደ {s} አዛውር",
"Moved from {a} to {b}": "ከ{a} ወደ {b} ተዛውሯል",
"Moved to {s}": "ወደ {s} ተዛውሯል",
"National visa application form (VIDEX)": "የብሔራዊ ቪዛ ማመልከቻ ቅጽ (VIDEX)",
"Needs action": "እርምጃ ያስፈልጋል",
"Needs improvement": "መሻሻል ያስፈልገዋል",
"Netherlands": "ኔዘርላንድ",
"New": "አዲስ",
"New Zealand": "ኒውዚላንድ",
"New case": "አዲስ ጉዳይ",
"New enquiries": "አዳዲስ ጥያቄዎች",
"New enquiries show up under All and Call today straight away.": "አዳዲስ ጥያቄዎች ወዲያውኑ በ«ሁሉም» እና «ዛሬ ይደውሉ» ስር ይታያሉ።",
"New lead": "አዲስ ጠያቂ",
"Next action": "ቀጣይ እርምጃ",
"Next call on": "የቀጣይ ጥሪ ቀን",
"No active students yet.": "እስካሁን ንቁ ተማሪ የለም።",
"No activity yet. Notes and stage changes will appear here.": "እስካሁን እንቅስቃሴ የለም። ማስታወሻዎችና የደረጃ ለውጦች እዚህ ይታያሉ።",
"No answer": "ስልኩን አላነሳም",
"No answer logged, next call booked": "አለማንሳቱ ተመዝግቧል፣ ቀጣይ ጥሪ ተይዟል",
"No applications yet": "እስካሁን ማመልከቻ የለም",
"No applications yet. Add each university the student applies to.": "እስካሁን ማመልከቻ የለም። ተማሪው የሚያመለክትበትን እያንዳንዱን ዩኒቨርሲቲ ያክሉ።",
"No appointment yet": "እስካሁን ቀጠሮ የለም",
"No calls due today": "ዛሬ የሚደረግ ጥሪ የለም",
"No calls logged yet.": "እስካሁን የተመዘገበ ጥሪ የለም።",
"No decision yet": "እስካሁን ውሳኔ የለም",
"No destinations yet. Add the countries you send students to.": "እስካሁን መዳረሻ የለም። ተማሪዎችን የሚልኩባቸውን አገሮች ያክሉ።",
"No enquiries {r}.": "{r} ጥያቄ የለም።",
"No leads match": "የሚመሳሰል ጠያቂ የለም",
"No phone": "ስልክ የለም",
"No response": "ምላሽ የለም",
"No response after all calls": "ከሁሉም ጥሪዎች በኋላ ምላሽ የለም",
"No response, not interested, or out of scope": "ምላሽ የለም፣ ፍላጎት የለውም፣ ወይም ከአገልግሎታችን ውጭ",
"No students match": "የሚመሳሰል ተማሪ የለም",
"No study plan yet": "እስካሁን የትምህርት ዕቅድ የለም",
"Non-refundable — starts the whole process": "የማይመለስ፣ ሂደቱን በሙሉ ያስጀምራል",
"Non-refundable. Nothing starts until it’s recorded.": "የማይመለስ። እስኪመዘገብ ድረስ ምንም አይጀመርም።",
"None / country and year": "የለም / አገርና ዓመት",
"Not assessed": "አልተገመገመም",
"Not called yet": "ገና ያልተደወለላቸው",
"Not given": "አልተሰጠም",
"Not interested": "ፍላጎት የለውም",
"Not set": "አልተወሰነም",
"Not signed off": "አልጸደቀም",
"Not started": "አልተጀመረም",
"Not sure yet": "ገና አልወሰኑም",
"Note added": "ማስታወሻ ተጨምሯል",
"Notes": "ማስታወሻዎች",
"Nothing in this list": "በዚህ ዝርዝር ውስጥ ምንም የለም",
"Nothing matches “{q}”.": "ከ«{q}» ጋር የሚመሳሰል የለም።",
"Nothing waiting here. New calls and payments will show up as they fall due.": "እዚህ የሚጠብቅ ነገር የለም። አዳዲስ ጥሪዎችና ክፍያዎች ጊዜያቸው ሲደርስ ይታያሉ።",
"Offer": "ቅበላ ተገኝቷል",
"Offer received": "ቅበላ ተገኝቷል",
"Offer received. Collect Payment 1, then start the visa file.": "ቅበላ ተገኝቷል። ክፍያ 1ን ይሰብስቡ፣ ከዚያ የቪዛ ፋይሉን ይጀምሩ።",
"Offer received. Move on to the visa file.": "ቅበላ ተገኝቷል። ወደ ቪዛ ፋይል ይቀጥሉ።",
"Officer": "ኃላፊ",
"Officer updated": "ኃላፊው ተዘምኗል",
"Onboarding": "የዕቅድ ዝግጅት",
"Open case {id}": "ጉዳይ {id}ን ክፈት",
"Opened": "የተከፈተበት ቀን",
"Optional, for reference": "አማራጭ፣ ለማጣቀሻ",
"Other": "ሌላ",
"Out of scope": "ከአገልግሎታችን ውጭ",
"Outcome": "ውጤት",
"Overdue": "ያለፈበት",
"Package": "ፓኬጅ",
"Package 1": "ፓኬጅ 1",
"Package 2": "ፓኬጅ 2",
"Package interest": "የሚፈልጉት ፓኬጅ",
"Package total ({c})": "የፓኬጁ ጠቅላላ ({c})",
"Package updated": "ፓኬጁ ተዘምኗል",
"Packages": "ፓኬጆች",
"Page": "ገጽ",
"Paid": "ተከፍሏል",
"Paid {a} on {d}": "{a} ተከፍሏል፣ {d}",
"Partner": "አጋር",
"Partners only. Prices, logins and how leads are followed up.": "ለአጋሮች ብቻ። ዋጋዎች፣ መግቢያዎችና የጠያቂ ክትትል።",
"Passed": "አልፏል",
"Passport": "ፓስፖርት",
"Passport photos": "የፓስፖርት ፎቶዎች",
"Password": "የይለፍ ቃል",
"Payment": "ክፍያ",
"Payment 1": "ክፍያ 1",
"Payment 1 (admission)": "ክፍያ 1 (ቅበላ)",
"Payment 1, after admission": "ክፍያ 1፣ ከቅበላ በኋላ",
"Payment 2": "ክፍያ 2",
"Payment 2 (visa)": "ክፍያ 2 (ቪዛ)",
"Payment 2, after visa": "ክፍያ 2፣ ከቪዛ በኋላ",
"Payment reopened": "ክፍያው እንደገና ተከፍቷል",
"Payments": "ክፍያዎች",
"Payments due": "የሚጠበቁ ክፍያዎች",
"Phone": "ስልክ",
"Photo (per spec)": "ፎቶ (በመስፈርቱ መሠረት)",
"Photographs": "ፎቶግራፎች",
"Pick a lead to see their details and log a call.": "ዝርዝሩን ለማየትና ጥሪ ለመመዝገብ ጠያቂ ይምረጡ።",
"Pick the package first so the right fees apply.": "ትክክለኛዎቹ ክፍያዎች እንዲመለከቱ መጀመሪያ ፓኬጁን ይምረጡ።",
"Pipeline": "የሂደት ደረጃዎች",
"Planned": "የታቀደ",
"Planning applications": "ማመልከቻዎችን በማቀድ ላይ",
"Poland": "ፖላንድ",
"Portal": "ፖርታል",
"Portugal": "ፖርቱጋል",
"Practise their real story: why this course, the university, the money, the sponsor and their plans after.": "እውነተኛ ታሪካቸውን ይለማመዱ፦ ለምን ይህ ትምህርት፣ ዩኒቨርሲቲው፣ ገንዘቡ፣ ስፖንሰሩና ከዚያ በኋላ ያላቸው ዕቅድ።",
"Pre-enrolment on Universitaly": "በUniversitaly ቅድመ ምዝገባ",
"Previous refusals": "ቀደም ሲል የተከለከሉ ቪዛዎች",
"Previous visas": "ቀደም ያሉ ቪዛዎች",
"Profile": "መገለጫ",
"Profile at a glance": "መገለጫው በአጭሩ",
"Profile being assessed": "መገለጫው በመገምገም ላይ",
"Programme": "የትምህርት ዘርፍ",
"Progress": "ሂደት",
"Proof of accommodation": "የመኖሪያ ማስረጃ",
"Proof of funds": "የገንዘብ ማስረጃ",
"Proof of funds (first year + evidence beyond)": "የገንዘብ ማስረጃ (የመጀመሪያ ዓመት + ተጨማሪ ማስረጃ)",
"Proof of funds (tuition + 1 year living + travel)": "የገንዘብ ማስረጃ (ትምህርት + 1 ዓመት ኑሮ + ጉዞ)",
"Proof of funds / scholarship letter": "የገንዘብ ማስረጃ / የስኮላርሺፕ ደብዳቤ",
"Proof of funds held 28 consecutive days": "ለ28 ተከታታይ ቀናት የተያዘ የገንዘብ ማስረጃ",
"Proof of means of subsistence": "የመተዳደሪያ ማስረጃ",
"Property / assets": "ንብረት / ሀብት",
"Provincial Attestation Letter (PAL)": "የክፍለ ሀገር ማረጋገጫ ደብዳቤ (PAL)",
"QC not signed off": "የጥራት ፍተሻ አልጸደቀም",
"QC notes": "የጥራት ፍተሻ ማስታወሻ",
"QC passed": "የጥራት ፍተሻ አልፏል",
"QC reopened": "የጥራት ፍተሻ እንደገና ተከፍቷል",
"QC signed off": "የጥራት ፍተሻ ጸድቋል",
"Quality check": "የጥራት ፍተሻ",
"Record the decision and support departure.": "ውሳኔውን ይመዝግቡና ለጉዞው ድጋፍ ያድርጉ።",
"Record the registration fee before moving this case on.": "ጉዳዩን ከማዛወርዎ በፊት የምዝገባ ክፍያውን ይመዝግቡ።",
"Record the registration fee first": "መጀመሪያ የምዝገባ ክፍያውን ይመዝግቡ",
"Record the registration fee to move on.": "ለመቀጠል የምዝገባ ክፍያውን ይመዝግቡ።",
"Record the visa decision.": "የቪዛ ውሳኔውን ይመዝግቡ።",
"Referral": "በሰው ጥቆማ",
"Refused": "ውድቅ ተደርጓል",
"Register as a case": "እንደ ጉዳይ መዝግብ",
"Registered": "ተመዝግቧል",
"Registered as {id}": "እንደ {id} ተመዝግቧል",
"Registered, ready to start": "ተመዝግቧል፣ ለመጀመር ዝግጁ",
"Registration": "ምዝገባ",
"Registration fee": "የምዝገባ ክፍያ",
"Registration fee ({c})": "የምዝገባ ክፍያ ({c})",
"Registration fee due": "የምዝገባ ክፍያ ይጠበቃል",
"Registration fee is recorded. Move the case to Assessment.": "የምዝገባ ክፍያው ተመዝግቧል። ጉዳዩን ወደ ግምገማ ያዛውሩ።",
"Rejected": "ተቀባይነት አላገኘም",
"Relationship to student": "ከተማሪው ጋር ያለው ዝምድና",
"Remove": "አስወግድ",
"Remove application": "ማመልከቻውን አስወግድ",
"Remove call {n}": "ጥሪ {n}ን አስወግድ",
"Remove {c}": "{c}ን አስወግድ",
"Reopen": "እንደገና ክፈት",
"Reopen file": "ፋይሉን እንደገና ክፈት",
"Residence permit": "የመኖሪያ ፈቃድ",
"Residence-permit (type-D) application": "የመኖሪያ ፈቃድ (ዓይነት-D) ማመልከቻ",
"Restore": "ከማህደር መልስ",
"Review the profile and set a risk level.": "መገለጫውን ይገምግሙና የስጋት ደረጃ ይወስኑ።",
"Risk": "ስጋት",
"Risk level": "የስጋት ደረጃ",
"Risk level is set. Agree the study plan next.": "የስጋት ደረጃው ተወስኗል። ቀጥሎ የትምህርት ዕቅዱን ይስማሙ።",
"Risk level not set": "የስጋት ደረጃ አልተወሰነም",
"Risk updated": "ስጋቱ ተዘምኗል",
"Risk: {r}": "ስጋት፦ {r}",
"Role": "ሚና",
"Round-trip flight reservation": "የደርሶ መልስ በረራ ቦታ ማስያዣ",
"Russia": "ሩሲያ",
"Rwanda": "ሩዋንዳ",
"SEVIS I-901 fee receipt": "SEVIS I-901 የክፍያ ደረሰኝ",
"Same day": "በዚያው ቀን",
"Save call": "ጥሪውን አስቀምጥ",
"Save changes": "ለውጦቹን አስቀምጥ",
"Saving isn’t available in this preview, so changes last only until you close it. Open the CRM from Claude to save and share with your team.": "በዚህ ቅድመ እይታ ማስቀመጥ አይቻልም፤ ለውጦች የሚቆዩት እስኪዘጉት ድረስ ብቻ ነው። ለማስቀመጥና ከቡድንዎ ጋር ለመጋራት CRMን ከClaude ይክፈቱ።",
"Scholarship": "ስኮላርሺፕ",
"Scholarship campaign": "የስኮላርሺፕ ዘመቻ",
"Search": "ፈልግ",
"Search by name, case ID or country": "በስም፣ በጉዳይ ቁጥር ወይም በአገር ይፈልጉ",
"Search name, phone, lead number or country": "በስም፣ በስልክ፣ በጠያቂ ቁጥር ወይም በአገር ይፈልጉ",
"Search students, leads, or type a command": "ተማሪዎችን፣ ጠያቂዎችን ይፈልጉ ወይም ትዕዛዝ ይጻፉ",
"Select…": "ይምረጡ…",
"Self / parent / relative": "ራሱ / ወላጅ / ዘመድ",
"Self-sponsored": "በራስ ወጪ",
"Settings": "ቅንብሮች",
"Settings saved": "ቅንብሮቹ ተቀምጠዋል",
"Share the username and password with the person directly. You can show it again here any time.": "የተጠቃሚ ስሙንና የይለፍ ቃሉን ለሰውየው በቀጥታ ያጋሩ። በማንኛውም ጊዜ እዚህ እንደገና ማሳየት ይችላሉ።",
"Show": "አሳይ",
"Show all {n}": "ሁሉንም {n} አሳይ",
"Show fewer": "ጥቂት አሳይ",
"Showing archived": "በማህደር ያሉትን በማሳየት ላይ",
"Shown on the CRM and used for amounts.": "በCRM ላይ ይታያል፤ ለገንዘብ መጠኖችም ያገለግላል።",
"Sign in": "ግባ",
"Sign off, file is ready": "ፋይሉ ዝግጁ ነው፣ አጽድቅ",
"Sign out": "ውጣ",
"Sign the contract and agree the study plan.": "ውሉን ይፈርሙና የትምህርት ዕቅዱን ይስማሙ።",
"Signing in…": "በመግባት ላይ…",
"Source": "ምንጭ",
"Source of funds": "የገንዘብ ምንጭ",
"Source of funds, consistency between documents, anything an officer would question.": "የገንዘብ ምንጭ፣ በሰነዶች መካከል መጣጣም፣ የቪዛ ኃላፊ ሊጠይቀው የሚችል ማንኛውም ነገር።",
"South Korea": "ደቡብ ኮሪያ",
"Spain": "ስፔን",
"Sponsor": "ስፖንሰር",
"Sponsor affidavit & bank letters": "የስፖንሰር ቃለ መሐላና የባንክ ደብዳቤዎች",
"Sponsor and visa history": "ስፖንሰርና የቪዛ ታሪክ",
"Sponsor bank statements (last 6 months)": "የስፖንሰር የባንክ መግለጫ (ያለፉት 6 ወራት)",
"Sponsor documents": "የስፖንሰር ሰነዶች",
"Sponsor identity": "የስፖንሰር መታወቂያ",
"Sponsor income / employment proof": "የስፖንሰር ገቢ / የሥራ ማስረጃ",
"Sponsor relationship": "ከስፖንሰሩ ጋር ያለው ዝምድና",
"Staff": "ሠራተኛ",
"Standardised test scores (IELTS/TOEFL/GRE)": "የደረጃውን የጠበቀ ፈተና ውጤት (IELTS/TOEFL/GRE)",
"Statement of Purpose": "የዓላማ መግለጫ",
"Status": "ሁኔታ",
"Step {a} of {b}": "ደረጃ {a} ከ{b}",
"Step {a} of {b}: {s}": "ደረጃ {a} ከ{b}፦ {s}",
"Strong": "ጠንካራ",
"Student": "ተማሪ",
"Student name": "የተማሪው ስም",
"Students": "ተማሪዎች",
"Study goal": "የትምህርት ግብ",
"Study interest": "የትምህርት ፍላጎት",
"Study level sought": "የሚፈለገው የትምህርት ደረጃ",
"Study permit application (IMM1294)": "የትምህርት ፈቃድ ማመልከቻ (IMM1294)",
"Study plan": "የትምህርት ዕቅድ",
"Study plan is in place. Start the university applications.": "የትምህርት ዕቅዱ ተዘጋጅቷል። የዩኒቨርሲቲ ማመልከቻዎችን ይጀምሩ።",
"Study plan saved": "የትምህርት ዕቅዱ ተቀምጧል",
"Submitted": "ለኤምባሲ ገብቷል",
"Sweden": "ስዊድን",
"TB test certificate": "የቲቢ ምርመራ ሰርተፊኬት",
"Talked, call again": "ተነጋግረናል፣ እንደገና መደወል",
"Tax documents": "የግብር ሰነዶች",
"Team and logins": "ቡድንና መግቢያዎች",
"Telegram": "ቴሌግራም",
"That username and password don’t match an active login. Check both and try again.": "የተጠቃሚ ስሙና የይለፍ ቃሉ ከንቁ መግቢያ ጋር አይዛመዱም። ሁለቱንም አረጋግጠው እንደገና ይሞክሩ።",
"The case can’t move past Registration until the fee is marked paid.": "ክፍያው እንደተከፈለ እስኪመዘገብ ድረስ ጉዳዩ ከምዝገባ ማለፍ አይችልም።",
"The embassy asked for more documents. Send them and note it here.": "ኤምባሲው ተጨማሪ ሰነዶችን ጠይቋል። ይላኩና እዚህ ይመዝግቡ።",
"The username “{u}” is already taken.": "የተጠቃሚ ስም «{u}» ቀድሞ ተይዟል።",
"This case is archived. Restore it to keep working on it.": "ይህ ጉዳይ በማህደር ውስጥ ነው። ሥራውን ለመቀጠል ይመልሱት።",
"This is the final step.": "ይህ የመጨረሻው ደረጃ ነው።",
"This page isn’t available.": "ይህ ገጽ አይገኝም።",
"This step hasn’t started. You can fill things in early; they’ll be here when the case gets to it.": "ይህ ደረጃ ገና አልተጀመረም። አስቀድመው መሙላት ይችላሉ፤ ጉዳዩ እዚህ ሲደርስ ይጠብቅዎታል።",
"Ties-to-home evidence": "ከአገር ጋር ያለ ትስስር ማስረጃ",
"TikTok": "ቲክቶክ",
"Today": "ዛሬ",
"Total": "ጠቅላላ",
"Travel checklist": "የጉዞ ማረጋገጫ ዝርዝር",
"Try a different name or number.": "ሌላ ስም ወይም ቁጥር ይሞክሩ።",
"Try removing a filter or picking another stage.": "ማጣሪያ ያስወግዱ ወይም ሌላ ደረጃ ይምረጡ።",
"Tuition & maintenance evidence": "የትምህርትና የኑሮ ወጪ ማስረጃ",
"Tuition payment": "የትምህርት ክፍያ",
"Tuition payment proof": "የትምህርት ክፍያ ማስረጃ",
"Tuition payment receipt": "የትምህርት ክፍያ ደረሰኝ",
"Turkey": "ቱርክ",
"Type-D visa application form": "የዓይነት-D ቪዛ ማመልከቻ ቅጽ",
"UK": "እንግሊዝ",
"USA": "አሜሪካ",
"Unassigned": "ያልተመደበ",
"University": "ዩኒቨርሲቲ",
"University admission (Zulassung)": "የዩኒቨርሲቲ ቅበላ (Zulassung)",
"University admission / Stipendium award": "የዩኒቨርሲቲ ቅበላ / የStipendium ሽልማት",
"University admission / acceptance letter": "የዩኒቨርሲቲ ቅበላ / የመቀበያ ደብዳቤ",
"University admission letter": "የዩኒቨርሲቲ ቅበላ ደብዳቤ",
"University applications": "የዩኒቨርሲቲ ማመልከቻዎች",
"University name": "የዩኒቨርሲቲ ስም",
"University registration": "የዩኒቨርሲቲ ምዝገባ",
"Unknown": "ያልታወቀ",
"Unnamed": "ስም የሌለው",
"Unnamed student": "ስም የሌለው ተማሪ",
"Unsaved changes": "ያልተቀመጡ ለውጦች",
"Updated": "የተዘመነ",
"Use the username and password a partner set up for you.": "አጋር ያዘጋጀልዎትን የተጠቃሚ ስምና የይለፍ ቃል ይጠቀሙ።",
"Used to judge which universities fit.": "የትኞቹ ዩኒቨርሲቲዎች እንደሚስማሙ ለመገምገም ያገለግላል።",
"Username": "የተጠቃሚ ስም",
"VFS appointment booked": "የVFS ቀጠሮ ተይዟል",
"Valid / applying": "የሚሠራ / በማውጣት ላይ",
"Valid passport": "የሚሠራ ፓስፖርት",
"Valid passport (+ old passports)": "የሚሠራ ፓስፖርት (+ የቆዩ ፓስፖርቶች)",
"Valid passport (6+ months)": "የሚሠራ ፓስፖርት (6+ ወራት)",
"Visa application form": "የቪዛ ማመልከቻ ቅጽ",
"Visa appointment (OFC + consular)": "የቪዛ ቀጠሮ (OFC + ቆንስላ)",
"Visa approved": "ቪዛ ጸድቋል",
"Visa approved. Collect Payment 2.": "ቪዛ ጸድቋል። ክፍያ 2ን ይሰብስቡ።",
"Visa approved. Help with travel and arrival.": "ቪዛ ጸድቋል። በጉዞና በመድረሻ ያግዙ።",
"Visa decision": "የቪዛ ውሳኔ",
"Visa documents": "የቪዛ ሰነዶች",
"Visa file": "የቪዛ ፋይል",
"Visa file needs QC sign-off": "የቪዛ ፋይሉ የጥራት ፍተሻ ፊርማ ይፈልጋል",
"Visa file ready": "የቪዛ ፋይሉ ዝግጁ ነው",
"Visa files": "የቪዛ ፋይሎች",
"Visa refused": "ቪዛ ውድቅ ተደርጓል",
"Visa refused. Review the reasons and decide whether to reapply.": "ቪዛ ውድቅ ተደርጓል። ምክንያቶቹን ይገምግሙና እንደገና ማመልከት እንዳለበት ይወስኑ።",
"Visa type": "የቪዛ ዓይነት",
"Waiting": "በመጠበቅ ላይ",
"Waiting on fee": "ክፍያ በመጠበቅ ላይ",
"Waiting on the embassy": "ኤምባሲውን በመጠበቅ ላይ",
"Waiting on {n} applications.": "{n} ማመልከቻዎችን በመጠበቅ ላይ።",
"Walk-in": "በአካል የመጣ",
"Website": "ድረ ገጽ",
"What a student pays per destination. These fill in automatically on each student’s payments.": "ተማሪ በየመዳረሻው የሚከፍለው። እነዚህ በእያንዳንዱ ተማሪ ክፍያዎች ላይ በራሳቸው ይሞላሉ።",
"What happened? (optional)": "ምን ሆነ? (አማራጭ)",
"What the embassy will look at most closely.": "ኤምባሲው በጥብቅ የሚመለከታቸው።",
"What the reviewer checked and any fixes needed.": "ገምጋሚው ያረጋገጠውና የሚያስፈልጉ ማስተካከያዎች።",
"Whatever they shared on the first contact.": "በመጀመሪያው ግንኙነት ያጋሩት ማንኛውም መረጃ።",
"WhatsApp": "ዋትስአፕ",
"When each call is due, counted in days from the enquiry. If nobody answers the last call, the lead closes as “No response”.": "እያንዳንዱ ጥሪ መቼ እንደሚደረግ፣ ከጥያቄው ቀን ጀምሮ በቀናት ይቆጠራል። የመጨረሻው ጥሪ ካልተመለሰ ጠያቂው «ምላሽ የለም» ተብሎ ይዘጋል።",
"Where enquiries come from": "ጥያቄዎች ከየት ይመጣሉ",
"Where they want to go and which package they’re on.": "የት መሄድ እንደሚፈልጉና የትኛው ፓኬጅ ላይ እንዳሉ።",
"Who the student is and how to reach them.": "ተማሪው ማን እንደሆነና እንዴት እንደሚገኝ።",
"Work experience": "የሥራ ልምድ",
"Yesterday": "ትናንት",
"a case": "ጉዳይ",
"all time": "ከመጀመሪያው ጀምሮ",
"day {n}": "ቀን {n}",
"e.g. 10000": "ለምሳሌ 10000",
"e.g. 400,000 ETB": "ለምሳሌ 400,000 ብር",
"e.g. BSc": "ለምሳሌ BSc",
"e.g. BSc, Grade 12": "ለምሳሌ BSc፣ 12ኛ ክፍል",
"e.g. Sept 2026": "ለምሳሌ ሴፕቴምበር 2026",
"e.g. Slovakia": "ለምሳሌ ስሎቫኪያ",
"e.g. amman": "ለምሳሌ amman",
"in the last 12 months": "ባለፉት 12 ወራት",
"in the last 30 days": "ባለፉት 30 ቀናት",
"in the last 7 days": "ባለፉት 7 ቀናት",
"same day": "በዚያው ቀን",
"today": "ዛሬ",
"yesterday": "ትናንት",
"tomorrow": "ነገ",
"{a} (default)": "{a} (ነባሪ)",
"{a} of {b} calls made": "ከ{b} ጥሪዎች {a} ተደርገዋል",
"{a} of {b} documents": "ከ{b} ሰነዶች {a}",
"{a} of {b} documents ready. Finish the file and get QC sign-off.": "ከ{b} ሰነዶች {a} ዝግጁ ናቸው። ፋይሉን ይጨርሱና የጥራት ፍተሻ ፊርማ ያግኙ።",
"{a} outstanding": "{a} ያልተከፈለ",
"{a} registration, {b} milestone": "{a} ምዝገባ፣ {b} የደረጃ ክፍያ",
"{c} on {d}": "{c}፣ {d}",
"{c}, logged {d}": "{c}፣ የተመዘገበው {d}",
"{c}, today": "{c}፣ ዛሬ",
"{c}, tomorrow": "{c}፣ ነገ",
"{c}, was due {d}": "{c}፣ {d} መደረግ ነበረበት",
"{n} active cases": "{n} ንቁ ጉዳዮች",
"{n} applications, {o} offers": "{n} ማመልከቻዎች፣ {o} ቅበላዎች",
"{n} can no longer sign in": "{n} ከእንግዲህ መግባት አይችልም",
"{n} can sign in": "{n} መግባት ይችላል",
"{n} is now {r}": "{n} አሁን {r} ነው",
"{n} lead": "{n} ጠያቂ",
"{n} leads": "{n} ጠያቂዎች",
"{n} opened {r}": "{r} {n} ተከፍተዋል",
"{n} overdue": "{n} ያለፈባቸው",
"{n} payments": "{n} ክፍያዎች",
"{n} received": "{n} ተቀብለናል",
"{n} registered": "{n} ተመዝግበዋል",
"{n} registered as {id}": "{n} እንደ {id} ተመዝግቧል",
"{n} registered so far": "እስካሁን {n} ተመዝግበዋል",
"{n} student": "{n} ተማሪ",
"{n} students": "{n} ተማሪዎች",
"{n}d ago": "ከ{n} ቀን በፊት",
"{n}w ago": "ከ{n} ሳምንት በፊት",
"{p} marked paid": "{p} እንደተከፈለ ተመዝግቧል",
"Add universities": "ዩኒቨርሲቲዎችን ያክሉ",
"Agree the study plan": "የትምህርት ዕቅዱን ይስማሙ",
"Albania": "አልባኒያ",
"Any funding": "ማንኛውም የገንዘብ ምንጭ",
"Any package": "ማንኛውም ፓኬጅ",
"Any risk": "ማንኛውም ስጋት",
"Anyone": "ማንኛውም ሰው",
"Archived only": "በማህደር ያሉ ብቻ",
"Book appointment, lodge file": "ቀጠሮ ይያዙ፣ ፋይሉን ያስገቡ",
"Book the visa appointment": "የቪዛ ቀጠሮ ይያዙ",
"Clear all": "ሁሉንም አጽዳ",
"Collect Payment 1": "ክፍያ 1ን ይሰብስቡ",
"Collect Payment 2": "ክፍያ 2ን ይሰብስቡ",
"Collect the registration fee": "የምዝገባ ክፍያውን ይሰብስቡ",
"Custom": "የራስ ምርጫ",
"Decide whether to reapply": "እንደገና ማመልከት እንዳለበት ይወስኑ",
"Every student moves through 7 steps, from registration to the visa decision. Open a student to see their steps.": "እያንዳንዱ ተማሪ ከምዝገባ እስከ ቪዛ ውሳኔ 7 ደረጃዎችን ያልፋል። ደረጃዎቹን ለማየት ተማሪውን ይክፈቱ።",
"Filters": "ማጣሪያዎች",
"Finish visa documents ({a}/{b})": "የቪዛ ሰነዶችን ይጨርሱ ({a}/{b})",
"From": "ከ",
"Furthest along": "ብዙ የተጓዙ መጀመሪያ",
"Help with travel": "በጉዞ ያግዙ",
"Move to Assessment": "ወደ ግምገማ ያዛውሩ",
"Move to Onboarding": "ወደ ዕቅድ ዝግጅት ያዛውሩ",
"Name (A–Z)": "ስም (A–Z)",
"Needs attention": "ትኩረት ይፈልጋል",
"Next step": "ቀጣይ እርምጃ",
"No student is at this step right now.": "አሁን በዚህ ደረጃ ላይ ያለ ተማሪ የለም።",
"No student matches these filters. Remove one to see more.": "ከእነዚህ ማጣሪያዎች ጋር የሚመሳሰል ተማሪ የለም። ተጨማሪ ለማየት አንዱን ያስወግዱ።",
"No students here": "እዚህ ተማሪ የለም",
"Recently updated": "በቅርቡ የተዘመኑ",
"Record the visa decision": "የቪዛ ውሳኔውን ይመዝግቡ",
"Reset": "ወደ መጀመሪያው መልስ",
"Review the profile": "መገለጫውን ይገምግሙ",
"Search by name, case ID, phone or country": "በስም፣ በጉዳይ ቁጥር፣ በስልክ ወይም በአገር ይፈልጉ",
"Send the extra documents": "ተጨማሪ ሰነዶቹን ይላኩ",
"Set price": "ዋጋ ያስገቡ",
"Show archived students instead": "በማህደር ያሉ ተማሪዎችን አሳይ",
"Show {n} students": "{n} ተማሪዎችን አሳይ",
"Sort": "ደርድር",
"Start applications": "ማመልከቻዎችን ይጀምሩ",
"Start the visa file": "የቪዛ ፋይሉን ይጀምሩ",
"To": "እስከ",
"To do": "የሚሠሩ ሥራዎች",
"Type any country. Suggestions appear as you type.": "ማንኛውንም አገር ይጻፉ። ሲጽፉ ጥቆማዎች ይታያሉ።",
"Waiting for the embassy": "ኤምባሲውን በመጠበቅ ላይ",
"Waiting on {n} universities": "{n} ዩኒቨርሲቲዎችን በመጠበቅ ላይ",
"Where they are": "ያሉበት ደረጃ",
"from {a} to {b}": "ከ{a} እስከ {b}",
"{c} is already in the list.": "{c} ቀድሞውኑ በዝርዝሩ ውስጥ አለ።",
"{n} at step {i}: {s}": "{n} በደረጃ {i}፦ {s}",
"All leads": "ሁሉም ጠያቂዎች",
"All students": "ሁሉም ተማሪዎች",
"Became cases": "ጉዳይ የሆኑ",
"Board": "ሰሌዳ",
"Call these first": "እነዚህን መጀመሪያ ይደውሉ",
"Documents and QC": "ሰነዶችና የጥራት ፍተሻ",
"Due today": "ዛሬ የሚደረግ",
"Every enquiry": "ሁሉም ጥያቄዎች",
"Every student moves through 7 steps, from registration to the visa decision.": "እያንዳንዱ ተማሪ ከምዝገባ እስከ ቪዛ ውሳኔ 7 ደረጃዎችን ያልፋል።",
"Fee and sign-up": "ክፍያና ምዝገባ",
"Fresh enquiries": "አዳዲስ ጥያቄዎች",
"Group by": "በቡድን ከፋፍል",
"List": "ዝርዝር",
"More filters": "ተጨማሪ ማጣሪያዎች",
"No destination yet": "መዳረሻ ገና የለም",
"No grouping": "ያለ ቡድን",
"No longer active": "ንቁ ያልሆኑ",
"No one at this step": "በዚህ ደረጃ ማንም የለም",
"Profile review": "የመገለጫ ግምገማ",
"Search students": "ተማሪዎችን ይፈልጉ",
"University offers": "የዩኒቨርሲቲ ቅበላዎች",
"{n} application": "{n} ማመልከቻ",
"{n} applications": "{n} ማመልከቻዎች",
"{o} offer": "{o} ቅበላ",
"{o} offers": "{o} ቅበላዎች",
"Student decided to pause until next year.": "ተማሪው እስከሚቀጥለው ዓመት ለማቆየት ወስኗል።",
"First meeting at the office. Explained both packages.": "በቢሮ የመጀመሪያ ስብሰባ። ሁለቱንም ፓኬጆች አብራርተናል።",
"Sent the registration fee details on Telegram.": "የምዝገባ ክፍያ ዝርዝሩን በቴሌግራም ልከናል።",
"Reviewed transcripts. GPA is solid for most programmes.": "የትምህርት ማስረጃዎችን ገምግመናል። GPA ለአብዛኞቹ ዘርፎች ጥሩ ነው።",
"English score below 6.0; suggested IELTS prep with Yimaru.": "የእንግሊዝኛ ውጤት ከ6.0 በታች ነው፤ ከይማሩ ጋር የIELTS ዝግጅት ጠቁመናል።",
"Contract signed. Agreed on the destination and two backup universities.": "ውሉ ተፈርሟል። በመዳረሻውና በሁለት ተጠባባቂ ዩኒቨርሲቲዎች ተስማምተናል።",
"Application submitted through the university portal.": "ማመልከቻው በዩኒቨርሲቲው ፖርታል ገብቷል።",
"University asked for a translated transcript.": "ዩኒቨርሲቲው የተተረጎመ የውጤት ማስረጃ ጠይቋል።",
"Sponsor bank statements received. Need 6 months, have 4.": "የስፖንሰር የባንክ መግለጫዎች ደርሰዋል። 6 ወር ያስፈልጋል፤ 4 አለ።",
"Started the financial story with the sponsor.": "ከስፖንሰሩ ጋር የገንዘብ ታሪኩን ጀምረናል።",
"Mock interview went well. Practise the sponsor questions again.": "የልምምድ ቃለ መጠይቁ ጥሩ ነበር። የስፖንሰር ጥያቄዎችን እንደገና ይለማመዱ።",
"Embassy result received today.": "የኤምባሲው ውጤት ዛሬ ደርሷል።",
"Pick a date": "ቀን ይምረጡ",
"Previous month": "ያለፈው ወር",
"Next month": "የሚቀጥለው ወር",
"Clear": "አጽዳ",
"Already in your list": "ቀድሞውኑ በዝርዝርዎ ውስጥ አለ",
"Add “{c}”": "«{c}» ጨምር",
"Waiting on 1 application.": "1 ማመልከቻ በመጠበቅ ላይ።",
"Waiting on 1 university": "1 ዩኒቨርሲቲ በመጠበቅ ላይ",
" and {n} more": " እና ሌሎች {n}",
"A summary sheet, then one sheet per part": "መጀመሪያ ማጠቃለያ፣ ከዚያ ለእያንዳንዱ ክፍል አንድ ሉህ",
"Activity report": "የሥራ ሪፖርት",
"Amount (ETB)": "መጠን (ብር)",
"Approved, refused, or more documents asked for": "የጸደቀ፣ ውድቅ የሆነ ወይም ተጨማሪ ሰነድ የተጠየቀበት",
"Attach the Excel file to the message for the full details.": "ሙሉ ዝርዝሩን ለማካፈል የኤክሴል ፋይሉን ከመልዕክቱ ጋር ያያይዙ።",
"Back to reports": "ወደ ሪፖርቶች ተመለስ",
"Build your own report": "የራስዎን ሪፖርት ያዘጋጁ",
"CSV": "CSV",
"CSV file downloaded.": "የCSV ፋይል ወርዷል።",
"Calls made": "የተደረጉ ጥሪዎች",
"Calls made: {n}, answered: {a}": "የተደረጉ ጥሪዎች፦ {n}፣ የተነሱ፦ {a}",
"Case": "ጉዳይ",
"Cases opened: destination, university, package, funding and officer": "የተከፈቱ ጉዳዮች፦ መዳረሻ፣ ዩኒቨርሲቲ፣ ፓኬጅ፣ የገንዘብ ምንጭ እና ኃላፊ",
"Chart": "ገበታ",
"Collected": "የተሰበሰበ",
"Collected (ETB)": "የተሰበሰበ (ብር)",
"Copied. Paste it into Excel or Google Sheets.": "ተቀድቷል። በኤክሴል ወይም በጉግል ሺትስ ውስጥ ይለጥፉት።",
"Copy for Telegram": "ለቴሌግራም ቅዳ",
"Copy table": "ሰንጠረዡን ቅዳ",
"Couldn’t copy here.": "እዚህ መቅዳት አልተቻለም።",
"Couldn’t copy here. Select the text and copy it.": "እዚህ መቅዳት አልተቻለም። ጽሑፉን መርጠው ይቅዱት።",
"Couldn’t create the Excel file. Check the internet connection and try again.": "የኤክሴል ፋይሉን መፍጠር አልተቻለም። የኢንተርኔት ግንኙነቱን አረጋግጠው እንደገና ይሞክሩ።",
"Couldn’t download here. Try again from the published CRM.": "እዚህ ማውረድ አልተቻለም። ከታተመው CRM እንደገና ይሞክሩ።",
"Count": "ብዛት",
"Daily report": "የዕለቱ ሪፖርት",
"Download CSV": "CSV አውርድ",
"Download Excel": "ኤክሴል አውርድ",
"Download cancelled.": "ማውረዱ ተሰርዟል።",
"Download page": "ገጹን አውርድ",
"Enquiries": "ጥያቄዎች",
"Enquiries by source": "ጥያቄዎች በምንጭ",
"Enquiries, new students and visas approved, month by month": "ጥያቄዎች፣ አዲስ ተማሪዎች እና የጸደቁ ቪዛዎች በየወሩ",
"Every follow-up call: when, outcome, note and who called": "እያንዳንዱ የክትትል ጥሪ፦ መቼ፣ ውጤቱ፣ ማስታወሻ እና የደወለው ሰው",
"Every new lead logged: name, phone, source, interest, status and calls made": "የተመዘገበ እያንዳንዱ አዲስ ጠያቂ፦ ስም፣ ስልክ፣ ምንጭ፣ ፍላጎት፣ ሁኔታ እና ጥሪዎች",
"Every time a case moved to a new step, and who moved it": "ጉዳይ ወደ አዲስ ደረጃ በተሸጋገረ ቁጥር እና ያሸጋገረው ሰው",
"Excel": "ኤክሴል",
"Excel file downloaded.": "የኤክሴል ፋይል ወርዷል።",
"Key figures": "ዋና ቁጥሮች",
"Last 6 months": "ያለፉት 6 ወራት",
"Last month": "ያለፈው ወር",
"Last week": "ያለፈው ሳምንት",
"Leads closed: {n}": "የተዘጉ ጠያቂዎች፦ {n}",
"Logged": "የተመዘገበበት ቀን",
"Message to send": "የሚላከው መልዕክት",
"Money received": "የተቀበልነው ገንዘብ",
"Month": "ወር",
"Monthly": "ወርሃዊ",
"Monthly report": "ወርሃዊ ሪፖርት",
"New enquiries: {n}": "አዲስ ጥያቄዎች፦ {n}",
"New students": "አዲስ ተማሪዎች",
"New students by destination": "አዲስ ተማሪዎች በመዳረሻ",
"New students: {n}": "አዲስ ተማሪዎች፦ {n}",
"None in this period.": "በዚህ ጊዜ ውስጥ ምንም የለም።",
"Not assigned": "ያልተመደበ",
"One sheet follows for each part of the report.": "ለእያንዳንዱ የሪፖርቱ ክፍል አንድ ሉህ ይከተላል።",
"Open in a browser, print or save as PDF": "በብራውዘር ይክፈቱ፣ ያትሙ ወይም PDF አድርገው ያስቀምጡ",
"Page downloaded. Open it and choose Print to save a PDF.": "ገጹ ወርዷል። ከፍተው PDF ለማስቀመጥ «አትም»ን ይምረጡ።",
"Payments received": "የተቀበልናቸው ክፍያዎች",
"Payments received: {n}": "የተቀበልናቸው ክፍያዎች፦ {n}",
"Pick dates": "ቀናትን ይምረጡ",
"Pick the day, week or month. The summary fills itself in, ready to send.": "ቀኑን፣ ሳምንቱን ወይም ወሩን ይምረጡ። ማጠቃለያው ራሱ ይሞላል፣ ለመላክ ዝግጁ ነው።",
"Plain table that opens anywhere": "በየትኛውም ቦታ የሚከፈት ቀላል ሰንጠረዥ",
"Prepared by {name}": "ያዘጋጀው፦ {name}",
"Prepared by {name} on {date}": "ያዘጋጀው፦ {name}፣ {date}",
"Preparing…": "በማዘጋጀት ላይ…",
"Preview on screen": "በስክሪን ይመልከቱት",
"Print or save as PDF": "ያትሙ ወይም PDF አድርገው ያስቀምጡ",
"Printable page": "የሚታተም ገጽ",
"Ready to paste": "ለመለጠፍ ዝግጁ",
"Registration fees and milestone payments received": "የተቀበልናቸው የምዝገባ ክፍያዎች እና የደረጃ ክፍያዎች",
"Report copied. Paste it in the partners’ Telegram group.": "ሪፖርቱ ተቀድቷል። በአጋሮቹ የቴሌግራም ግሩፕ ውስጥ ይለጥፉት።",
"Report period": "የሪፖርት ጊዜ",
"Report to partners": "ለአጋሮች ሪፖርት",
"Reports": "ሪፖርቶች",
"Right now: {a} calls overdue, {b} payments due": "አሁን፦ {a} ያለፈባቸው ጥሪዎች፣ {b} የሚጠበቁ ክፍያዎች",
"Send on WhatsApp": "በዋትስአፕ ላክ",
"Send the team update to the partners, or download any report you need.": "የቡድኑን ሪፖርት ለአጋሮች ይላኩ ወይም የሚፈልጉትን ማንኛውንም ሪፖርት ያውርዱ።",
"Step moves": "የደረጃ ሽግግሮች",
"Step moves: {n}": "የደረጃ ሽግግሮች፦ {n}",
"Summary": "ማጠቃለያ",
"Table": "ሰንጠረዥ",
"Team member": "የቡድን አባል",
"This month": "በዚህ ወር",
"This week": "በዚህ ሳምንት",
"This year": "በዚህ ዓመት",
"Three steps: what, when, and the file type.": "ሦስት ደረጃዎች፦ ምን፣ መቼ እና የፋይል ዓይነት።",
"Tick at least one thing in step 1.": "በደረጃ 1 ቢያንስ አንድ ነገር ይምረጡ።",
"Tick one or more. The number is how many rows each part has for the dates you pick.": "አንድ ወይም ከዚያ በላይ ይምረጡ። ቁጥሩ በመረጡት ቀናት ውስጥ እያንዳንዱ ክፍል ያለውን የረድፍ ብዛት ያሳያል።",
"Time": "ሰዓት",
"View": "ክፈት",
"View full report": "ሙሉ ሪፖርቱን ክፈት",
"Visa decisions": "የቪዛ ውሳኔዎች",
"Visas approved": "የጸደቁ ቪዛዎች",
"Visas: {a} approved, {r} refused, {m} asked for more": "ቪዛ፦ {a} ጸድቋል፣ {r} ውድቅ ሆኗል፣ {m} ተጨማሪ ተጠይቋል",
"Weekly": "ሳምንታዊ",
"Weekly report": "ሳምንታዊ ሪፖርት",
"What kind of file?": "ምን ዓይነት ፋይል?",
"What should the report include?": "ሪፖርቱ ምን ይያዝ?",
"Which dates?": "የትኞቹ ቀናት?",
"Work by team member": "ሥራ በቡድን አባል",
"Yearly": "ዓመታዊ",
"Yimaru report": "የይማሩ ሪፖርት",
"{biz}: {title}": "{biz}፦ {title}",
"Call no.": "የጥሪ ቁ.",
"Called by": "የደወለው",
"Closed because": "የተዘጋበት ምክንያት",
"Code": "ኮድ",
"Date paid": "የተከፈለበት ቀን",
"Decision": "ውሳኔ",
"Interested in": "የሚፈልገው አገር",
"Moved by": "ያሸጋገረው",
"Name": "ስም",
"Note": "ማስታወሻ",
"Open": "ክፍት",
"All dates are in the Ethiopian calendar.": "ሁሉም ቀኖች በኢትዮጵያ ዘመን አቆጣጠር ናቸው።",
"Ethiopian calendar": "የኢትዮጵያ ዘመን አቆጣጠር",
"Afghanistan": "አፍጋኒስታን",
"Algeria": "አልጄሪያ",
"Andorra": "አንዶራ",
"Angola": "አንጎላ",
"Antigua and Barbuda": "አንቲጓና ባርቡዳ",
"Argentina": "አርጀንቲና",
"Armenia": "አርሜኒያ",
"Azerbaijan": "አዘርባጃን",
"Bahamas": "ባሃማስ",
"Bahrain": "ባህሬን",
"Bangladesh": "ባንግላዲሽ",
"Barbados": "ባርባዶስ",
"Belarus": "ቤላሩስ",
"Belize": "ቤሊዝ",
"Benin": "ቤኒን",
"Bhutan": "ቡታን",
"Bolivia": "ቦሊቪያ",
"Bosnia and Herzegovina": "ቦስኒያና ሄርዞጎቪና",
"Botswana": "ቦትስዋና",
"Brazil": "ብራዚል",
"Brunei": "ብሩኔይ",
"Bulgaria": "ቡልጋሪያ",
"Burkina Faso": "ቡርኪና ፋሶ",
"Burundi": "ብሩንዲ",
"Cambodia": "ካምቦዲያ",
"Cameroon": "ካሜሩን",
"Cape Verde": "ኬፕ ቨርዴ",
"Central African Republic": "የመካከለኛው አፍሪካ ሪፐብሊክ",
"Chad": "ቻድ",
"Chile": "ቺሊ",
"Colombia": "ኮሎምቢያ",
"Comoros": "ኮሞሮስ",
"Congo": "ኮንጎ",
"Costa Rica": "ኮስታ ሪካ",
"Croatia": "ክሮኤሽያ",
"Cuba": "ኩባ",
"Democratic Republic of the Congo": "ዴሞክራቲክ ሪፐብሊክ ኮንጎ",
"Denmark": "ዴንማርክ",
"Djibouti": "ጅቡቲ",
"Dominica": "ዶሚኒካ",
"Dominican Republic": "ዶሚኒካን ሪፐብሊክ",
"Ecuador": "ኢኳዶር",
"Egypt": "ግብፅ",
"El Salvador": "ኤል ሳልቫዶር",
"Equatorial Guinea": "ኢኳቶሪያል ጊኒ",
"Eritrea": "ኤርትራ",
"Eswatini": "ኢስዋቲኒ",
"Ethiopia": "ኢትዮጵያ",
"Fiji": "ፊጂ",
"Gabon": "ጋቦን",
"Gambia": "ጋምቢያ",
"Georgia": "ጆርጂያ",
"Ghana": "ጋና",
"Grenada": "ግሬናዳ",
"Guatemala": "ጓቲማላ",
"Guinea": "ጊኒ",
"Guinea-Bissau": "ጊኒ ቢሳው",
"Guyana": "ጉያና",
"Haiti": "ሄይቲ",
"Honduras": "ሆንዱራስ",
"Hong Kong": "ሆንግ ኮንግ",
"Iceland": "አይስላንድ",
"Indonesia": "ኢንዶኔዢያ",
"Iran": "ኢራን",
"Iraq": "ኢራቅ",
"Israel": "እስራኤል",
"Ivory Coast": "ኮት ዲቯር",
"Jamaica": "ጃማይካ",
"Jordan": "ዮርዳኖስ",
"Kazakhstan": "ካዛኪስታን",
"Kenya": "ኬንያ",
"Kiribati": "ኪሪባቲ",
"Kosovo": "ኮሶቮ",
"Kuwait": "ኩዌት",
"Kyrgyzstan": "ኪርጊስታን",
"Laos": "ላኦስ",
"Lebanon": "ሊባኖስ",
"Lesotho": "ሌሶቶ",
"Liberia": "ላይቤሪያ",
"Libya": "ሊቢያ",
"Liechtenstein": "ሊችተንስታይን",
"Luxembourg": "ሉክሰምበርግ",
"Madagascar": "ማዳጋስካር",
"Malawi": "ማላዊ",
"Maldives": "ማልዲቭስ",
"Mali": "ማሊ",
"Marshall Islands": "ማርሻል ደሴቶች",
"Mauritania": "ሞሪታኒያ",
"Mauritius": "ሞሪሸስ",
"Mexico": "ሜክሲኮ",
"Micronesia": "ማይክሮኔዢያ",
"Moldova": "ሞልዶቫ",
"Monaco": "ሞናኮ",
"Mongolia": "ሞንጎሊያ",
"Montenegro": "ሞንቴኔግሮ",
"Morocco": "ሞሮኮ",
"Mozambique": "ሞዛምቢክ",
"Myanmar": "ምያንማር",
"Namibia": "ናሚቢያ",
"Nauru": "ናውሩ",
"Nepal": "ኔፓል",
"Nicaragua": "ኒካራጓ",
"Niger": "ኒጀር",
"Nigeria": "ናይጄሪያ",
"North Korea": "ሰሜን ኮሪያ",
"North Macedonia": "ሰሜን መቄዶንያ",
"Norway": "ኖርዌይ",
"Oman": "ኦማን",
"Pakistan": "ፓኪስታን",
"Palau": "ፓላው",
"Palestine": "ፍልስጤም",
"Panama": "ፓናማ",
"Papua New Guinea": "ፓፑዋ ኒው ጊኒ",
"Paraguay": "ፓራጓይ",
"Peru": "ፔሩ",
"Philippines": "ፊሊፒንስ",
"Qatar": "ኳታር",
"Romania": "ሩማንያ",
"Saint Kitts and Nevis": "ሴንት ኪትስና ኔቪስ",
"Saint Lucia": "ሴንት ሉሲያ",
"Saint Vincent and the Grenadines": "ሴንት ቪንሰንትና ግሬናዲንስ",
"Samoa": "ሳሞአ",
"San Marino": "ሳን ማሪኖ",
"Sao Tome and Principe": "ሳኦ ቶሜና ፕሪንሲፔ",
"Saudi Arabia": "ሳውዲ አረቢያ",
"Senegal": "ሴኔጋል",
"Serbia": "ሰርቢያ",
"Seychelles": "ሲሼልስ",
"Sierra Leone": "ሴራ ሊዮን",
"Singapore": "ሲንጋፖር",
"Slovakia": "ስሎቫኪያ",
"Slovenia": "ስሎቬኒያ",
"Solomon Islands": "ሰሎሞን ደሴቶች",
"Somalia": "ሶማሊያ",
"South Africa": "ደቡብ አፍሪካ",
"South Sudan": "ደቡብ ሱዳን",
"Sri Lanka": "ስሪ ላንካ",
"Sudan": "ሱዳን",
"Suriname": "ሱሪናም",
"Switzerland": "ስዊዘርላንድ",
"Syria": "ሶሪያ",
"Taiwan": "ታይዋን",
"Tajikistan": "ታጂኪስታን",
"Tanzania": "ታንዛኒያ",
"Thailand": "ታይላንድ",
"Timor-Leste": "ምሥራቅ ቲሞር",
"Togo": "ቶጎ",
"Tonga": "ቶንጋ",
"Trinidad and Tobago": "ትሪኒዳድና ቶቤጎ",
"Tunisia": "ቱኒዚያ",
"Turkmenistan": "ቱርክሜኒስታን",
"Tuvalu": "ቱቫሉ",
"Uganda": "ዩጋንዳ",
"Ukraine": "ዩክሬን",
"United Arab Emirates": "የተባበሩት አረብ ኤሚሬቶች",
"Uruguay": "ኡራጓይ",
"Uzbekistan": "ኡዝቤኪስታን",
"Vanuatu": "ቫኑአቱ",
"Vatican City": "ቫቲካን",
"Venezuela": "ቬኔዝዌላ",
"Vietnam": "ቬትናም",
"Yemen": "የመን",
"Zambia": "ዛምቢያ",
"Zimbabwe": "ዚምባብዌ"
};
