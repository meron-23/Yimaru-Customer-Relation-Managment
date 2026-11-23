/**
 * Sample data generator (spec §10.1).
 * Generates 50 students and 50 leads spread across every step and bucket.
 * Deterministic RNG with fixed seed.
 */
import type { Student, Lead, LeadCall, Application, Stage } from '../types';
import { todayIso } from './ethiopian-calendar';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SF = [
  'Abel', 'Selam', 'Kaleab', 'Hanna', 'Yonas', 'Mekdes', 'Dawit', 'Rahel', 'Biruk', 'Liya',
  'Nahom', 'Saba', 'Eyob', 'Hewan', 'Fitsum', 'Bethlehem', 'Samuel', 'Meron', 'Natnael', 'Tsion',
  'Robel', 'Kidist', 'Michael', 'Ruth', 'Dagmawi', 'Lidya', 'Abenezer', 'Mahlet', 'Henok', 'Sara',
  'Yared', 'Feven', 'Bereket', 'Eden', 'Mikiyas', 'Hiwot', 'Kirubel', 'Betelhem', 'Amanuel', 'Rediet',
  'Ermias', 'Blen', 'Tewodros', 'Hermela', 'Leul', 'Yeabsira', 'Nardos', 'Surafel', 'Selamawit', 'Kalkidan',
  'Elias', 'Martha', 'Bemnet', 'Gelila', 'Haileab', 'Tigist', 'Fikir', 'Daniel', 'Lulit'
];

const SL = [
  'Tesfaye', 'Girma', 'Bekele', 'Alemu', 'Haile', 'Tadesse', 'Assefa', 'Worku', 'Getachew', 'Mengistu',
  'Solomon', 'Desta', 'Tsegaye', 'Negash', 'Kebede', 'Abera', 'Fikru', 'Tadele', 'Ayele', 'Girmay',
  'Mamo', 'Tola', 'Abebe', 'Wolde', 'Gebre', 'Hailu', 'Mekonnen', 'Demissie', 'Berhane', 'Yohannes',
  'Lemma', 'Asfaw', 'Kassa', 'Teshome', 'Woldemariam', 'Mulugeta', 'Shiferaw', 'Gebremedhin', 'Ayalew', 'Zewdu'
];

export const UNI: Record<string, [string, string][]> = {
  Italy: [
    ['Univ. of Bologna', 'MSc Computer Science'],
    ['Politecnico di Milano', 'MSc Civil Engineering'],
    ['Sapienza Univ. of Rome', 'MSc Public Health'],
    ['Univ. of Padua', 'BSc Biology'],
    ['Univ. of Pisa', 'MSc Data Science']
  ],
  Germany: [
    ['TU Munich', 'MSc Electrical Engineering'],
    ['RWTH Aachen', 'MSc Mechanical Engineering'],
    ['Univ. of Freiburg', 'MSc Renewable Energy'],
    ['Hochschule Bremen', 'BSc Computer Science']
  ],
  Hungary: [
    ['Univ. of Debrecen', 'MD Medicine'],
    ['Semmelweis Univ.', 'Pharmacy'],
    ['Univ. of Szeged', 'BSc Nursing']
  ],
  Austria: [
    ['Univ. of Vienna', 'MSc Economics'],
    ['TU Graz', 'MSc Software Engineering']
  ],
  Canada: [
    ['Univ. of Toronto', 'MSc Public Health'],
    ['Conestoga College', 'Diploma Business'],
    ['Univ. of Manitoba', 'MSc Agriculture']
  ],
  USA: [
    ['Arizona State Univ.', 'MS Computer Science'],
    ['Univ. of Houston', 'MBA'],
    ['Purdue Univ.', 'MS Industrial Engineering']
  ],
  UK: [
    ['Univ. of Leeds', 'MSc Finance'],
    ['Coventry Univ.', 'MSc Project Management'],
    ['Univ. of Hertfordshire', 'MSc Nursing']
  ],
  Cyprus: [
    ['Univ. of Nicosia', 'BSc Hospitality'],
    ['European Univ. Cyprus', 'MBA']
  ],
  Poland: [['Warsaw Univ. of Technology', 'MSc Architecture']],
  Malta: [['Univ. of Malta', 'MSc Tourism']]
};

export const NOTE_BANK: Record<string, string[]> = {
  registration: [
    'First meeting at the office. Explained both packages.',
    'Sent the registration fee details on Telegram.'
  ],
  assessment: [
    'Reviewed transcripts. GPA is solid for most programmes.',
    'English score below 6.0; suggested IELTS prep with Yimaru.'
  ],
  onboarding: [
    'Contract signed. Agreed on the destination and two backup universities.'
  ],
  admission: [
    'Application submitted through the university portal.',
    'University asked for a translated transcript.'
  ],
  visafile: [
    'Sponsor bank statements received. Need 6 months, have 4.',
    'Started the financial story with the sponsor.'
  ],
  submitted: [
    'Mock interview went well. Practise the sponsor questions again.'
  ],
  outcome: ['Embassy result received today.']
};

export const FINANCIAL_ITEMS = [
  'Sponsor identity', 'Relationship to student', 'Bank statements', 'Bank balance',
  'Income source', 'Employment / business evidence', 'Tax documents',
  'Property / assets', 'Tuition payment', 'Scholarship', 'Source of funds',
  'Consistency across documents'
];

export const VISA_PRESETS: Record<string, string[]> = {
  Italy: [
    'Valid passport (+ old passports)', 'Type-D visa application form', 'Pre-enrolment on Universitaly',
    'University admission / acceptance letter', 'CIMEA statement / Declaration of Value', 'Proof of means of subsistence',
    'Sponsor bank statements (last 6 months)', 'Sponsor income / employment proof', 'Tuition payment receipt',
    'Accommodation proof in Italy', 'Health insurance (valid in Italy)', 'Academic transcripts & certificates (legalised)',
    'English/Italian proficiency certificate', 'Round-trip flight reservation', '2 passport photos (ICAO)', 'VFS appointment booked'
  ],
  Germany: [
    'Valid passport (+ old passports)', 'National visa application form (VIDEX)', 'University admission (Zulassung)',
    'Blocked account (Sperrkonto) funded', 'APS certificate', 'Health insurance (travel + confirmation)',
    'Academic transcripts & degree certificates', 'Motivation / SOP letter', 'CV', 'Proof of accommodation',
    'Language certificate (German/English)', '2 biometric photos', 'Appointment booked'
  ],
  Canada: [
    'Valid passport', 'Study permit application (IMM1294)', 'Provincial Attestation Letter (PAL)',
    'Letter of acceptance (DLI)', 'Proof of funds (tuition + 1 year living + travel)', 'GIC certificate',
    'Statement of Purpose', 'Academic transcripts & certificates', 'Language test (IELTS/PTE)', 'Medical exam (panel physician)',
    'Digital photo', 'Biometrics appointment'
  ],
  USA: [
    'Valid passport (6+ months)', 'Form I-20 (SEVIS registered)', 'SEVIS I-901 fee receipt', 'DS-160 confirmation',
    'Visa appointment (OFC + consular)', 'Proof of funds (first year + evidence beyond)', 'Sponsor affidavit & bank letters',
    'Academic transcripts & certificates', 'Standardised test scores (IELTS/TOEFL/GRE)', 'Ties-to-home evidence', 'Photo (per spec)'
  ],
  UK: [
    'Valid passport', 'CAS from licensed sponsor', 'Proof of funds held 28 consecutive days', 'Tuition & maintenance evidence',
    'Academic qualifications on CAS', 'English (SELT/approved)', 'ATAS certificate (if required)', 'TB test certificate',
    'IHS surcharge paid', 'Appointment booked'
  ],
  Hungary: [
    'Valid passport', 'Residence-permit (type-D) application', 'University admission / Stipendium award',
    'Proof of funds / scholarship letter', 'Accommodation proof', 'Health insurance', 'Academic documents (legalised)',
    'Language certificate', 'Photographs', 'Appointment booked'
  ],
  Default: [
    'Valid passport', 'Visa application form', 'University admission letter', 'Proof of funds',
    'Sponsor documents', 'Tuition payment proof', 'Accommodation proof', 'Health insurance',
    'Academic transcripts & certificates', 'Language certificate', 'Passport photos', 'Appointment booked'
  ]
};

export const INTERVIEW_STEPS = [
  ['mock1', 'Mock interview 1'],
  ['difficult', 'Difficult-question session'],
  ['mock2', 'Mock interview 2'],
  ['ready', 'Final readiness assessment']
];

export const SOURCES = [
  'Facebook / Instagram', 'TikTok', 'Telegram', 'WhatsApp', 'Referral',
  'Scholarship campaign', 'Website', 'Walk-in'
];

export const STAGES_LIST: { key: Stage; label: string; hint: string }[] = [
  { key: 'registration', label: 'Registration', hint: 'Collect the registration fee. Work starts once it’s paid.' },
  { key: 'assessment', label: 'Assessment', hint: 'Review the profile and set a risk level.' },
  { key: 'onboarding', label: 'Onboarding', hint: 'Sign the contract and agree the study plan.' },
  { key: 'admission', label: 'Admission', hint: 'Apply to universities and wait for offers.' },
  { key: 'visafile', label: 'Visa file', hint: 'Build the financial story and documents, then get QC sign-off.' },
  { key: 'submitted', label: 'Submitted', hint: 'Book the appointment, lodge the file, prepare for the interview.' },
  { key: 'outcome', label: 'Outcome', hint: 'Record the decision and support departure.' }
];

export const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  STAGES_LIST.map((s, i) => [s.key, i])
);

function addDaysStr(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildSamples(usedCaseIds: string[] = [], usedLeadCodes: string[] = []) {
  const r = rng(2026);
  const pick = <T>(a: T[]): T => a[Math.floor(r() * a.length)];
  const int = (lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));
  const today = todayIso();
  const nowMs = Date.now() - 60000;

  const dayISO = (daysAgo: number, h?: number): string => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h ?? int(8, 18), int(0, 59));
    return new Date(Math.min(d.getTime(), nowMs - int(5, 240) * 60000 * (daysAgo === 0 ? 1 : 0))).toISOString();
  };

  const year = new Date().getFullYear();
  const used = new Set(usedCaseIds);
  let nCase = 0;
  const nextId = () => {
    let id: string;
    do {
      nCase++;
      id = `YIM-${year}-${String(nCase).padStart(4, '0')}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };

  const usedL = new Set(usedLeadCodes);
  let nLead = 0;
  const nextCode = () => {
    let c: string;
    do {
      nLead++;
      c = `L-${String(nLead).padStart(3, '0')}`;
    } while (usedL.has(c));
    usedL.add(c);
    return c;
  };

  const names: string[] = [];
  const seen = new Set<string>();
  while (names.length < 100) {
    const n = `${pick(SF)} ${pick(SL)}`;
    if (!seen.has(n)) {
      seen.add(n);
      names.push(n);
    }
  }

  const phone = () => `09${int(10, 99)}${String(int(100000, 999999))}`;
  const officers = ['Ammanuel Esrael', 'Endrias'];

  const plan: [Stage, number][] = [
    ['registration', 6],
    ['assessment', 7],
    ['onboarding', 7],
    ['admission', 9],
    ['visafile', 8],
    ['submitted', 6],
    ['outcome', 7]
  ];

  const ages: Record<Stage, [number, number]> = {
    registration: [1, 9],
    assessment: [7, 20],
    onboarding: [15, 32],
    admission: [28, 65],
    visafile: [55, 95],
    submitted: [80, 120],
    outcome: [100, 160]
  };

  const countryPool = [
    'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy', 'Italy',
    'Germany', 'Germany', 'Germany', 'Germany', 'Germany', 'Germany', 'Germany',
    'Hungary', 'Hungary', 'Hungary', 'Hungary', 'Hungary', 'Hungary',
    'Canada', 'Canada', 'Canada', 'Canada', 'Canada', 'Canada',
    'USA', 'USA', 'USA', 'USA', 'USA',
    'UK', 'UK', 'UK', 'UK', 'UK',
    'Austria', 'Austria', 'Austria', 'Austria',
    'Cyprus', 'Cyprus', 'Cyprus', 'Poland', 'Malta'
  ];

  for (let k = countryPool.length - 1; k > 0; k--) {
    const m = Math.floor(r() * (k + 1));
    [countryPool[k], countryPool[m]] = [countryPool[m], countryPool[k]];
  }

  const decisions: ('approved' | 'additional' | 'refused' | '')[] = [
    'approved', 'approved', 'approved', 'additional', 'additional', 'refused', ''
  ];

  interface StudentPlanRow {
    stage: Stage;
    n: number;
    name: string;
    country: string;
    age: number;
  }

  const rows: StudentPlanRow[] = [];
  let ci = 0;
  plan.forEach(([stage, count]) => {
    for (let n = 0; n < count; n++) {
      rows.push({ stage, n, name: names[ci], country: countryPool[ci++], age: 0 });
    }
  });

  rows.forEach(x => {
    const [lo, hi] = ages[x.stage];
    x.age = int(lo, hi);
  });
  rows.sort((a, b) => b.age - a.age);

  const students: Record<string, Student> = {};

  rows.forEach((x, i) => {
    const { stage, n, name, country } = x;
    const idx = STAGE_INDEX[stage];
    const id = nextId();
    const created = dayISO(x.age);
    const updated = dayISO(Math.max(0, Math.min(x.age, int(0, idx >= 4 ? 12 : 6))));
    const pkg = idx >= STAGE_INDEX.visafile ? 'p2' : r() < 0.55 ? 'p1' : 'p2';
    const funding: 'scholarship' | 'self' = r() < 0.24 ? 'scholarship' : 'self';
    const officer = r() < 0.07 ? undefined : officers[i % 2];
    const [uni, prog] = pick(UNI[country] || UNI.Italy);

    const regPaid = idx >= 1 || n < 2;
    const offerAtAdmission = stage === 'admission' && n % 3 !== 0;
    const p1Paid = idx >= STAGE_INDEX.visafile || (offerAtAdmission && n % 2 === 0);
    const decision = stage === 'outcome' ? decisions[n] : '';
    const p2Paid = pkg === 'p2' && decision === 'approved' && n !== 2;

    const visaKey = VISA_PRESETS[country] ? country : '';
    const docs = VISA_PRESETS[visaKey || 'Default'];
    const docsDone =
      idx > STAGE_INDEX.visafile
        ? docs.length
        : stage === 'visafile'
        ? Math.min(docs.length, [2, 5, 8, 10, 12, 3, 7, 11][n % 8])
        : 0;

    const finDone =
      idx > STAGE_INDEX.visafile
        ? FINANCIAL_ITEMS.length
        : stage === 'visafile'
        ? int(3, FINANCIAL_ITEMS.length - 1)
        : 0;

    const apps: Application[] = [];
    if (idx >= STAGE_INDEX.admission) {
      const howMany = stage === 'admission' ? int(1, 3) : int(1, 2);
      const alts = (UNI[country] || UNI.Italy).filter(u => u[0] !== uni);
      for (let a = 0; a < howMany; a++) {
        const [u, pr] = a === 0 ? [uni, prog] : alts[a - 1] || [uni, prog];
        let status: Application['status'] = 'Applied';
        if (stage === 'admission') {
          status = a === 0 && offerAtAdmission ? 'Offer' : pick(['Applied', 'In review', 'In review', 'Planned']);
        } else {
          status = a === 0 ? (idx >= STAGE_INDEX.outcome && decision === 'approved' ? 'Enrolled' : 'Offer') : pick(['Rejected', 'In review', 'Offer']);
        }
        apps.push({
          id: `app-${id}-${a}`,
          student_id: id,
          university: u,
          program: pr,
          portal: country === 'Italy' ? 'Universitaly + uni portal' : 'University portal',
          fee: country === 'Italy' ? 30 : country === 'USA' ? 75 : undefined,
          deadline: addDaysStr(today, int(-40, 60)),
          applied_on: addDaysStr(today, -int(5, 40)),
          status,
          conditions: status === 'Offer' && r() < 0.3 ? 'Final transcript' : undefined,
          created_at: created,
          updated_at: updated,
          updated_by: officer || 'Ammanuel Esrael'
        });
      }
    }

    const fin: Record<string, boolean> = {};
    FINANCIAL_ITEMS.slice(0, finDone).forEach(f => { fin[f] = true; });

    const visa: Record<string, boolean> = {};
    docs.slice(0, docsDone).forEach(d => { visa[d] = true; });

    const qc = idx > STAGE_INDEX.visafile || (stage === 'visafile' && docsDone >= docs.length - 1);

    const ap = { requested: false, confirmed: false, biometrics: false, submitted: false, date: '' };
    if (stage === 'submitted') {
      const lvl = n % 4;
      ap.requested = true;
      ap.confirmed = lvl >= 1;
      ap.biometrics = lvl >= 2;
      ap.submitted = lvl >= 2;
      ap.date = lvl >= 2 ? addDaysStr(today, -int(5, 25)) : addDaysStr(today, int(3, 21));
    }
    if (stage === 'outcome') {
      ap.requested = ap.confirmed = ap.biometrics = ap.submitted = true;
      ap.date = addDaysStr(today, -int(25, 60));
    }

    const iv: Record<string, boolean> = {};
    if (stage === 'submitted') {
      INTERVIEW_STEPS.slice(0, n % 5).forEach(([k]) => { iv[k] = true; });
    }
    if (stage === 'outcome') {
      INTERVIEW_STEPS.forEach(([k]) => { iv[k] = true; });
      if (decision === 'approved') {
        ['Flight planning', 'Accommodation', 'Travel checklist'].slice(0, n + 1).forEach(p => {
          iv['pv_' + p] = true;
        });
      }
    }

    const riskSet = idx >= 2 || (stage === 'assessment' && n % 2 === 0);
    const risk = riskSet ? pick(['strong', 'strong', 'improve', 'improve', 'high'] as const) : '';

    students[id] = {
      id,
      case_id: id,
      is_sample: true,
      created_at: created,
      updated_at: updated,
      updated_by: officer || 'Ammanuel Esrael',
      full_name: name,
      phone: phone(),
      email: r() < 0.6 ? `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1].toLowerCase()}@gmail.com` : '',
      source: pick(SOURCES),
      age: String(int(19, 31)),
      education: pick(['BSc', 'BA', 'Grade 12', 'Diploma', 'MSc', 'BSc']),
      gpa: pick(['3.1', '3.4', '3.6', '2.9', '3.8', '3.2']),
      graduation_year: String(int(2019, 2025)),
      field_of_study: pick(['Computer Science', 'Civil Engineering', 'Nursing', 'Economics', 'Biology', 'Accounting', 'Public Health']),
      english_proficiency: pick(['IELTS 6.5', 'IELTS 6.0', 'IELTS 7.0', 'Duolingo 115', 'None yet', 'IELTS 5.5']),
      work_experience: pick(['', '1 year', '2 years', '3 years', '']),
      study_level: prog.startsWith('B') || prog.startsWith('Diploma') || prog.startsWith('MD') || prog === 'Pharmacy' ? 'Bachelor' : 'Master',
      target_countries: [country],
      budget: `${int(25, 90) * 10},000 ETB`,
      sponsor: pick(['Parent', 'Self', 'Uncle', 'Sibling', 'Parent']),
      sponsor_relationship: pick(['Father', 'Mother', 'Brother', 'Uncle', '']),
      passport_status: pick(['Valid', 'Valid', 'Applying', 'Valid']),
      previous_visa_history: pick(['None', 'UAE tourist', 'None', 'Kenya', '']),
      previous_refusals: r() < 0.15 ? 'Germany, 2023' : 'None',
      intended_intake: pick(['Sept 2026', 'Feb 2027', 'Sept 2027', 'Jan 2027']),
      risk,
      assessment_notes: riskSet && r() < 0.6 ? 'Good academic record. Sponsor income needs a clear paper trail.' : '',
      strategy_country: country,
      strategy_university: idx >= 3 || (stage === 'onboarding' && n % 2 === 0) ? uni : '',
      strategy_program: idx >= 3 || (stage === 'onboarding' && n % 2 === 0) ? prog : '',
      strategy_admission_route: idx >= 3 ? 'Direct application' : '',
      strategy_funding: funding === 'scholarship' ? 'Scholarship' : 'Self-funded',
      strategy_visa_route: idx >= 3 ? 'National D-visa (study)' : '',
      stage,
      officer,
      archived: false,
      sponsor_type: funding,
      package_type: pkg,
      payments: [
        {
          id: `pay-${id}-reg`,
          student_id: id,
          kind: 'registration',
          paid: regPaid,
          amount: regPaid ? 10000 : 0,
          paid_on: regPaid ? created.slice(0, 10) : undefined,
          created_at: created,
          updated_at: updated,
          updated_by: officer || 'Ammanuel Esrael'
        },
        {
          id: `pay-${id}-p1`,
          student_id: id,
          kind: 'payment1',
          paid: p1Paid,
          amount: p1Paid ? 150000 : 0,
          paid_on: p1Paid ? updated.slice(0, 10) : undefined,
          created_at: created,
          updated_at: updated,
          updated_by: officer || 'Ammanuel Esrael'
        },
        {
          id: `pay-${id}-p2`,
          student_id: id,
          kind: 'payment2',
          paid: p2Paid,
          amount: p2Paid ? 150000 : 0,
          paid_on: p2Paid ? updated.slice(0, 10) : undefined,
          created_at: created,
          updated_at: updated,
          updated_by: officer || 'Ammanuel Esrael'
        }
      ],
      applications: apps,
      financial: fin,
      financial_notes: finDone ? 'Sponsor is the father; salary plus rental income. Statements are consistent.' : '',
      visa_country: idx >= STAGE_INDEX.visafile ? visaKey : '',
      visa,
      qc_passed: qc,
      qc_notes: qc ? 'Checked by a second officer. All translations stamped.' : '',
      appt_requested: ap.requested,
      appt_confirmed: ap.confirmed,
      appt_biometrics: ap.biometrics,
      appt_submitted: ap.submitted,
      appt_date: ap.date || undefined,
      interview: iv,
      decision: decision as any,
      decided_at: decision ? updated : undefined
    };
  });

  // Archive two cases as in prototype
  const arch = Object.values(students)
    .filter(s => s.stage === 'registration' && !(s.payments ?? [])[0]?.paid)
    .slice(-1)
    .concat(Object.values(students).filter(s => s.stage === 'assessment').slice(0, 1));

  arch.forEach(s => {
    s.archived = true;
  });

  /* ----- Leads ----- */
  const leads: Record<string, Lead> = {};
  const cadence = [0, 1, 3, 7, 14];
  const lplan = [
    ...Array(6).fill('new'),
    ...Array(6).fill('today'),
    ...Array(8).fill('overdue'),
    ...Array(12).fill('upcoming'),
    ...Array(10).fill('converted'),
    ...Array(4).fill('closed_nr'),
    ...Array(2).fill('closed_ni'),
    ...Array(2).fill('closed_os')
  ];

  const convertible = Object.values(students)
    .filter(s => !s.archived && STAGE_INDEX[s.stage] <= STAGE_INDEX.admission)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 10);

  interface LeadPlanItem {
    kind: string;
    age: number;
    stu?: Student;
  }

  const items: LeadPlanItem[] = lplan.map((kind, k) => {
    let age = 0;
    if (kind === 'new') age = k < 3 ? 0 : 1;
    else if (kind === 'today') age = [1, 3, 7, 3, 1, 7][k % 6];
    else if (kind === 'overdue') age = int(4, 18);
    else if (kind === 'upcoming') age = int(1, 10);
    else if (kind === 'converted') age = 0;
    else age = int(16, 45);
    return { kind, age };
  });

  let conv = 0;
  items.forEach(it => {
    if (it.kind === 'converted') {
      const stu = convertible[conv++];
      it.stu = stu;
      it.age = Math.max(
        0,
        Math.round((Date.now() - new Date(stu.created_at).getTime()) / 86400000) + int(2, 6)
      );
    }
  });
  items.sort((a, b) => b.age - a.age);

  let nm = 50;
  items.forEach(it => {
    const id = `lead-${Math.random().toString(36).slice(2, 11)}`;
    const code = nextCode();
    const createdD = addDaysStr(today, -it.age);
    const created = dayISO(it.age);
    const name = it.stu ? it.stu.full_name : names[nm++];
    const country = it.stu ? it.stu.strategy_country : pick(['Italy', 'Italy', 'Germany', 'Canada', 'Hungary', 'USA', 'UK', 'Austria', 'Cyprus', '']);
    const src = it.stu ? it.stu.source : pick(SOURCES);

    let attempts = 0;
    let status: Lead['status'] = 'open';
    let closeReason: Lead['close_reason'] = undefined;
    let nextCallAt = today;
    const calls: LeadCall[] = [];

    const callAt = (j: number) => {
      const d = addDaysStr(createdD, cadence[Math.min(j, cadence.length - 1)]);
      return d > today ? today : d;
    };

    const addCall = (j: number, outcome: LeadCall['outcome'], note?: string) => {
      const cts = new Date(
        callAt(j) + 'T' + String(int(6, 14)).padStart(2, '0') + ':' + String(int(0, 59)).padStart(2, '0') + ':00.000Z'
      ).getTime();
      calls.push({
        id: `call-${id}-${j}`,
        lead_id: id,
        ts: new Date(Math.min(cts, nowMs)).toISOString(),
        attempt: j + 1,
        outcome,
        note: note || '',
        author_id: 'officer-1',
        author_name: officers[j % 2]
      });
    };

    if (it.kind === 'new') {
      attempts = 0;
      nextCallAt = today;
    } else if (it.kind === 'today') {
      attempts = { 1: 1, 3: 2, 7: 3 }[it.age] || 1;
      for (let j = 0; j < attempts; j++) addCall(j, 'no_answer');
      nextCallAt = today;
    } else if (it.kind === 'overdue') {
      attempts = int(1, 3);
      for (let j = 0; j < attempts; j++) {
        addCall(j, j === attempts - 1 && r() < 0.4 ? 'answered' : 'no_answer', 'Asked us to call back later.');
      }
      nextCallAt = addDaysStr(today, -int(1, 4));
    } else if (it.kind === 'upcoming') {
      attempts = int(1, 2);
      for (let j = 0; j < attempts; j++) {
        addCall(
          j,
          j === attempts - 1 ? 'answered' : 'no_answer',
          j === attempts - 1
            ? pick([
                'Interested in Italy. Wants the scholarship list.',
                'Parents want to visit the office first.',
                'Waiting for exam results.',
                'Will send transcripts on Telegram.'
              ])
            : ''
        );
      }
      nextCallAt = addDaysStr(today, int(1, 6));
    } else if (it.kind === 'converted') {
      attempts = int(1, 3);
      for (let j = 0; j < attempts; j++) {
        addCall(j, j === attempts - 1 ? 'answered' : 'no_answer', j === attempts - 1 ? 'Came to the office and registered.' : '');
      }
      status = 'converted';
    } else if (it.kind === 'closed_nr') {
      attempts = 5;
      for (let j = 0; j < 5; j++) addCall(j, 'no_answer');
      status = 'closed';
      closeReason = 'no_response';
    } else if (it.kind === 'closed_ni') {
      attempts = 1;
      addCall(0, 'not_interested', 'Decided to study locally.');
      status = 'closed';
      closeReason = 'not_interested';
    } else {
      attempts = 1;
      addCall(0, 'out_of_scope', 'Looking for a work visa, not study.');
      status = 'closed';
      closeReason = 'out_of_scope';
    }

    leads[id] = {
      id,
      code,
      is_sample: true,
      created_at: created,
      updated_at: calls.length ? calls[calls.length - 1].ts : created,
      updated_by: officers[0],
      name,
      phone: it.stu ? it.stu.phone : phone(),
      telegram: r() < 0.35 ? '@' + name.split(' ')[0].toLowerCase() + int(1, 99) : '',
      source: src,
      interest_country: country,
      interest_package: it.stu ? it.stu.package_type : pick(['p1', 'p2', '']),
      education: pick(['BSc', 'Grade 12', 'Diploma', 'BA', 'MSc']),
      intake: pick(['Sept 2026', 'Feb 2027', 'Sept 2027']),
      goal: pick(['Master’s', 'Bachelor’s', 'Scholarship', 'Master’s', 'Medicine']),
      notes: r() < 0.3 ? 'Prefers calls after 5pm.' : '',
      status,
      call_attempts: attempts,
      next_call_on: nextCallAt,
      close_reason: closeReason,
      converted_case_id: it.stu ? it.stu.id : undefined,
      calls
    };
  });

  return { students, leads };
}
