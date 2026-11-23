import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Student, Lead, Settings, DestinationPrice, Activity, Payment, Application, Stage } from '../types';
import { buildSamples, STAGES_LIST, STAGE_INDEX } from '../lib/sample-data';
import { nextCaseId, nextLeadCode, applyLeadCall } from '../lib/leads';
import { useAuth } from './AuthContext';
import { todayIso } from '../lib/ethiopian-calendar';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'success' | 'warn' | 'error' | 'info';
}

interface DataContextType {
  students: Student[];
  leads: Lead[];
  settings: Settings;
  destinationPrices: DestinationPrice[];
  activities: Activity[];
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastItem['type']) => void;
  removeToast: (id: string) => void;

  // Student actions
  getStudent: (id: string) => Student | undefined;
  createStudent: (partial: Partial<Student>) => Student;
  updateStudent: (id: string, updates: Partial<Student>, expectedUpdatedAt?: string) => { success: boolean; conflict?: boolean };
  moveStudentStage: (id: string, targetStage: Stage) => { success: boolean; error?: string };
  recordPayment: (studentId: string, kind: 'registration' | 'payment1' | 'payment2', amount: number, paidOn?: string) => void;
  reopenPayment: (studentId: string, kind: 'registration' | 'payment1' | 'payment2') => void;
  archiveStudent: (id: string) => void;
  restoreStudent: (id: string) => void;
  deleteStudent: (id: string) => void; // soft delete
  addStudentActivity: (studentId: string, text: string, kind?: Activity['kind']) => void;
  addStudentApplication: (studentId: string, app: Partial<Application>) => void;
  updateStudentApplication: (studentId: string, appId: string, app: Partial<Application>) => void;
  removeStudentApplication: (studentId: string, appId: string) => void;

  // Lead actions
  getLead: (id: string) => Lead | undefined;
  createLead: (partial: Partial<Lead>) => Lead;
  updateLead: (id: string, updates: Partial<Lead>) => void;
  logCall: (leadId: string, outcome: 'no_answer' | 'answered' | 'not_interested' | 'out_of_scope', note?: string, answeredNextDate?: string) => void;
  convertLeadToCase: (leadId: string) => Student | undefined;
  reopenLead: (leadId: string) => void;
  deleteLead: (leadId: string) => void;

  // Settings
  updateSettings: (newSettings: Partial<Settings>) => void;
  updateDestinationPrices: (prices: DestinationPrice[]) => void;
  addDestinationPrice: (country: string, p1?: number, p2?: number) => { success: boolean; error?: string };
  removeDestinationPrice: (id: string) => void;

  // Staging / Demo data management
  removeSampleData: () => void;
  resetSampleData: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  id: 'settings-1',
  business_name: 'Yimaru Consulting',
  currency: 'ETB',
  cadence: [0, 1, 3, 7, 14],
  p1_registration: 10000,
  p1_total: 160000,
  p2_registration: 10000,
  p2_total: 310000,
  updated_at: new Date().toISOString(),
  updated_by: 'system'
};

const DEFAULT_DESTINATIONS: DestinationPrice[] = [
  { id: 'dp-1', country: 'Italy', payment1: 150000, payment2: 150000, sort_order: 1 },
  { id: 'dp-2', country: 'Germany', payment1: 150000, payment2: 150000, sort_order: 2 },
  { id: 'dp-3', country: 'Hungary', payment1: 150000, payment2: 150000, sort_order: 3 },
  { id: 'dp-4', country: 'Austria', payment1: 150000, payment2: 150000, sort_order: 4 },
  { id: 'dp-5', country: 'Canada', payment1: 150000, payment2: 150000, sort_order: 5 },
  { id: 'dp-6', country: 'USA', payment1: 150000, payment2: 150000, sort_order: 6 },
  { id: 'dp-7', country: 'UK', payment1: 150000, payment2: 150000, sort_order: 7 },
  { id: 'dp-8', country: 'Cyprus', payment1: 150000, payment2: 150000, sort_order: 8 }
];

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Initialize students and leads from localStorage or empty (NO fake data)
  const [students, setStudents] = useState<Student[]>(() => {
    try {
      const saved = localStorage.getItem('yim:students');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [leads, setLeads] = useState<Lead[]>(() => {
    try {
      const saved = localStorage.getItem('yim:leads');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem('yim:settings');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [destinationPrices, setDestinationPrices] = useState<DestinationPrice[]>(() => {
    try {
      const saved = localStorage.getItem('yim:destinationPrices');
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_DESTINATIONS;
  });

  const [activities, setActivities] = useState<Activity[]>(() => {
    try {
      const saved = localStorage.getItem('yim:activities');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('yim:students', JSON.stringify(students));
    } catch {}
  }, [students]);

  useEffect(() => {
    try {
      localStorage.setItem('yim:leads', JSON.stringify(leads));
    } catch {}
  }, [leads]);

  useEffect(() => {
    try {
      localStorage.setItem('yim:settings', JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem('yim:destinationPrices', JSON.stringify(destinationPrices));
    } catch {}
  }, [destinationPrices]);

  useEffect(() => {
    try {
      localStorage.setItem('yim:activities', JSON.stringify(activities));
    } catch {}
  }, [activities]);

  const addStudentActivity = useCallback((studentId: string, text: string, kind: Activity['kind'] = 'note') => {
    const act: Activity = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      student_id: studentId,
      ts: new Date().toISOString(),
      author_id: currentUser?.id || 'system',
      author_name: currentUser?.full_name || 'System',
      kind,
      text
    };
    setActivities(prev => [act, ...prev]);
  }, [currentUser]);

  const getStudent = useCallback((id: string) => {
    return students.find(s => s.id === id && !s.deleted_at);
  }, [students]);

  const createStudent = useCallback((partial: Partial<Student>): Student => {
    const year = new Date().getFullYear();
    const existingIds = students.map(s => s.case_id);
    const newCaseIdStr = nextCaseId(year, existingIds);
    const now = new Date().toISOString();

    const regFee = settings.p1_registration || 10000;
    const initialPayments: Payment[] = [
      {
        id: `pay-${newCaseIdStr}-reg`,
        student_id: newCaseIdStr,
        kind: 'registration',
        paid: false,
        amount: regFee,
        created_at: now,
        updated_at: now,
        updated_by: currentUser?.full_name || 'System'
      },
      {
        id: `pay-${newCaseIdStr}-p1`,
        student_id: newCaseIdStr,
        kind: 'payment1',
        paid: false,
        amount: 150000,
        created_at: now,
        updated_at: now,
        updated_by: currentUser?.full_name || 'System'
      },
      {
        id: `pay-${newCaseIdStr}-p2`,
        student_id: newCaseIdStr,
        kind: 'payment2',
        paid: false,
        amount: 150000,
        created_at: now,
        updated_at: now,
        updated_by: currentUser?.full_name || 'System'
      }
    ];

    const student: Student = {
      id: newCaseIdStr,
      case_id: newCaseIdStr,
      full_name: partial.full_name?.trim() || 'New Student',
      phone: partial.phone || '',
      email: partial.email || '',
      source: partial.source || '',
      target_countries: partial.target_countries || (partial.strategy_country ? [partial.strategy_country] : []),
      strategy_country: partial.strategy_country || '',
      strategy_university: partial.strategy_university || '',
      strategy_program: partial.strategy_program || '',
      stage: 'registration',
      officer: partial.officer || currentUser?.full_name || '',
      archived: false,
      risk: '',
      sponsor_type: partial.sponsor_type || '',
      package_type: partial.package_type || '',
      financial: {},
      visa: {},
      interview: {},
      decision: '',
      qc_passed: false,
      appt_requested: false,
      appt_confirmed: false,
      appt_biometrics: false,
      appt_submitted: false,
      is_sample: false,
      created_at: now,
      updated_at: now,
      updated_by: currentUser?.full_name || 'System',
      payments: initialPayments,
      applications: [],
      ...partial
    };

    setStudents(prev => [student, ...prev]);
    addStudentActivity(student.id, 'Case created', 'stage');
    addToast(`Case ${student.case_id} created`, 'success');
    return student;
  }, [students, settings, currentUser, addStudentActivity, addToast]);

  const updateStudent = useCallback((id: string, updates: Partial<Student>, expectedUpdatedAt?: string) => {
    let conflict = false;
    setStudents(prev => {
      return prev.map(s => {
        if (s.id !== id) return s;
        // Optimistic concurrency check (§2)
        if (expectedUpdatedAt && s.updated_at !== expectedUpdatedAt) {
          conflict = true;
          return s;
        }
        return {
          ...s,
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.full_name || s.updated_by
        };
      });
    });

    if (conflict) {
      addToast('This record changed, reload', 'warn');
      return { success: false, conflict: true };
    }
    return { success: true };
  }, [currentUser, addToast]);

  const moveStudentStage = useCallback((id: string, targetStage: Stage) => {
    const stu = students.find(s => s.id === id);
    if (!stu) return { success: false, error: 'Student not found' };

    // Registration fee gate (§5.1)
    const regPaid = stu.payments?.find(p => p.kind === 'registration')?.paid;
    if (stu.stage === 'registration' && targetStage !== 'registration' && !regPaid) {
      const msg = 'Record the registration fee to move on.';
      addToast(msg, 'warn');
      return { success: false, error: msg };
    }

    const fromLabel = STAGES_LIST[STAGE_INDEX[stu.stage]]?.label || stu.stage;
    const toLabel = STAGES_LIST[STAGE_INDEX[targetStage]]?.label || targetStage;

    updateStudent(id, { stage: targetStage });
    addStudentActivity(id, `Moved from ${fromLabel} to ${toLabel}`, 'stage');
    addToast(`Moved to ${toLabel}`, 'success');
    return { success: true };
  }, [students, updateStudent, addStudentActivity, addToast]);

  const recordPayment = useCallback((studentId: string, kind: 'registration' | 'payment1' | 'payment2', amount: number, paidOn?: string) => {
    const paidDate = paidOn || todayIso();
    setStudents(prev => {
      return prev.map(s => {
        if (s.id !== studentId) return s;
        const payments = (s.payments || []).map(p => {
          if (p.kind === kind) {
            return {
              ...p,
              paid: true,
              amount,
              paid_on: paidDate,
              updated_at: new Date().toISOString()
            };
          }
          return p;
        });
        return {
          ...s,
          payments,
          updated_at: new Date().toISOString()
        };
      });
    });
    addStudentActivity(studentId, `Payment ${kind === 'registration' ? 'Registration fee' : kind === 'payment1' ? 'Payment 1' : 'Payment 2'} recorded (${amount} ETB)`, 'money');
    addToast(`Payment recorded`, 'success');
  }, [addStudentActivity, addToast]);

  const reopenPayment = useCallback((studentId: string, kind: 'registration' | 'payment1' | 'payment2') => {
    setStudents(prev => {
      return prev.map(s => {
        if (s.id !== studentId) return s;
        const payments = (s.payments || []).map(p => {
          if (p.kind === kind) {
            return {
              ...p,
              paid: false,
              paid_on: undefined,
              updated_at: new Date().toISOString()
            };
          }
          return p;
        });
        return {
          ...s,
          payments,
          updated_at: new Date().toISOString()
        };
      });
    });
    addStudentActivity(studentId, `Payment reopened`, 'money');
    addToast(`Payment reopened`, 'info');
  }, [addStudentActivity, addToast]);

  const archiveStudent = useCallback((id: string) => {
    updateStudent(id, { archived: true });
    addStudentActivity(id, 'Case archived', 'note');
    addToast('Case archived', 'info');
  }, [updateStudent, addStudentActivity, addToast]);

  const restoreStudent = useCallback((id: string) => {
    updateStudent(id, { archived: false });
    addStudentActivity(id, 'Case restored from archive', 'note');
    addToast('Case restored', 'success');
  }, [updateStudent, addStudentActivity, addToast]);

  const deleteStudent = useCallback((id: string) => {
    updateStudent(id, { deleted_at: new Date().toISOString() });
    addToast('Case deleted', 'info');
  }, [updateStudent, addToast]);

  const addStudentApplication = useCallback((studentId: string, app: Partial<Application>) => {
    const newApp: Application = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      student_id: studentId,
      university: app.university?.trim() || '',
      program: app.program?.trim() || '',
      portal: app.portal || '',
      conditions: app.conditions || '',
      result: app.result || '',
      fee: app.fee,
      deadline: app.deadline,
      applied_on: app.applied_on || todayIso(),
      status: app.status || 'Planned',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: currentUser?.full_name || 'System'
    };

    setStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          applications: [...(s.applications || []), newApp],
          updated_at: new Date().toISOString()
        };
      })
    );
    addStudentActivity(studentId, `Added university application: ${newApp.university} (${newApp.program})`, 'note');
  }, [currentUser, addStudentActivity]);

  const updateStudentApplication = useCallback((studentId: string, appId: string, app: Partial<Application>) => {
    setStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        const updated = (s.applications || []).map(a => (a.id === appId ? { ...a, ...app, updated_at: new Date().toISOString() } : a));
        return {
          ...s,
          applications: updated,
          updated_at: new Date().toISOString()
        };
      })
    );
  }, []);

  const removeStudentApplication = useCallback((studentId: string, appId: string) => {
    setStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        return {
          ...s,
          applications: (s.applications || []).filter(a => a.id !== appId),
          updated_at: new Date().toISOString()
        };
      })
    );
  }, []);

  // Lead actions
  const getLead = useCallback((id: string) => {
    return leads.find(l => l.id === id && !l.deleted_at);
  }, [leads]);

  const createLead = useCallback((partial: Partial<Lead>): Lead => {
    const existingCodes = leads.map(l => l.code);
    const code = nextLeadCode(existingCodes);
    const id = `lead-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const today = todayIso();

    const lead: Lead = {
      id,
      code,
      name: partial.name?.trim() || '',
      phone: partial.phone?.trim() || '',
      telegram: partial.telegram?.trim() || '',
      source: partial.source || 'Walk-in',
      interest_country: partial.interest_country || '',
      interest_package: partial.interest_package || '',
      education: partial.education || '',
      intake: partial.intake || '',
      goal: partial.goal || '',
      notes: partial.notes || '',
      status: 'open',
      call_attempts: 0,
      next_call_on: today,
      is_sample: false,
      created_at: now,
      updated_at: now,
      updated_by: currentUser?.full_name || 'System',
      calls: []
    };

    setLeads(prev => [lead, ...prev]);
    addToast(`Lead ${lead.code} created`, 'success');
    return lead;
  }, [leads, currentUser, addToast]);

  const updateLead = useCallback((id: string, updates: Partial<Lead>) => {
    setLeads(prev =>
      prev.map(l => {
        if (l.id !== id) return l;
        return {
          ...l,
          ...updates,
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.full_name || l.updated_by
        };
      })
    );
  }, [currentUser]);

  const logCall = useCallback((leadId: string, outcome: 'no_answer' | 'answered' | 'not_interested' | 'out_of_scope', note?: string, answeredNextDate?: string) => {
    const target = leads.find(l => l.id === leadId);
    if (!target) return;

    const partialUpdates = applyLeadCall(target, outcome, settings.cadence, answeredNextDate, todayIso());
    const callEntry = {
      id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      lead_id: leadId,
      ts: new Date().toISOString(),
      attempt: target.call_attempts + 1,
      outcome,
      note: note || '',
      author_id: currentUser?.id || 'system',
      author_name: currentUser?.full_name || 'System'
    };

    setLeads(prev =>
      prev.map(l => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          ...partialUpdates,
          calls: [...(l.calls || []), callEntry],
          updated_at: new Date().toISOString()
        };
      })
    );
    addToast('Call logged', 'success');
  }, [leads, settings.cadence, currentUser, addToast]);

  const convertLeadToCase = useCallback((leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return undefined;

    // Spec §5.5: register as a case
    const student = createStudent({
      full_name: lead.name || 'New Student',
      phone: lead.phone,
      source: lead.source,
      education: lead.education,
      intended_intake: lead.intake,
      package_type: lead.interest_package || 'p1',
      target_countries: lead.interest_country ? [lead.interest_country] : [],
      strategy_country: lead.interest_country || '',
      converted_from_lead: lead.id,
      officer: currentUser?.full_name || 'System'
    });

    addStudentActivity(student.id, `Converted from lead ${lead.code}`, 'stage');

    setLeads(prev =>
      prev.map(l => {
        if (l.id !== leadId) return l;
        return {
          ...l,
          status: 'converted',
          converted_case_id: student.id,
          updated_at: new Date().toISOString()
        };
      })
    );

    addToast(`${student.full_name} registered as ${student.case_id}`, 'success');
    return student;
  }, [leads, createStudent, addStudentActivity, currentUser, addToast]);

  const reopenLead = useCallback((leadId: string) => {
    updateLead(leadId, { status: 'open', next_call_on: todayIso(), close_reason: undefined });
    addToast('Lead reopened', 'info');
  }, [updateLead, addToast]);

  const deleteLead = useCallback((leadId: string) => {
    updateLead(leadId, { deleted_at: new Date().toISOString() });
    addToast('Lead deleted', 'info');
  }, [updateLead, addToast]);

  // Settings
  const updateSettings = useCallback((newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings, updated_at: new Date().toISOString() }));
    addToast('Settings saved', 'success');
  }, [addToast]);

  const updateDestinationPrices = useCallback((prices: DestinationPrice[]) => {
    setDestinationPrices(prices);
    addToast('Destination prices saved', 'success');
  }, [addToast]);

  const addDestinationPrice = useCallback((country: string, p1: number = 150000, p2: number = 150000) => {
    const cleanCountry = country.trim();
    if (destinationPrices.some(dp => dp.country.toLowerCase() === cleanCountry.toLowerCase())) {
      return { success: false, error: `${cleanCountry} is already in the list.` };
    }
    const newDp: DestinationPrice = {
      id: `dp-${Date.now()}`,
      country: cleanCountry,
      payment1: p1,
      payment2: p2,
      sort_order: destinationPrices.length + 1
    };
    setDestinationPrices(prev => [...prev, newDp]);
    addToast(`Added ${cleanCountry}`, 'success');
    return { success: true };
  }, [destinationPrices, addToast]);

  const removeDestinationPrice = useCallback((id: string) => {
    setDestinationPrices(prev => prev.filter(dp => dp.id !== id));
    addToast('Destination price removed', 'info');
  }, [addToast]);

  // Staging sample data controls
  const removeSampleData = useCallback(() => {
    setStudents(prev => prev.filter(s => !s.is_sample));
    setLeads(prev => prev.filter(l => !l.is_sample));
    addToast('All sample records removed', 'info');
  }, [addToast]);

  const resetSampleData = useCallback(() => {
    const sample = buildSamples();
    setStudents(Object.values(sample.students));
    setLeads(Object.values(sample.leads));
    addToast('Reset to 50 sample students and 50 sample leads', 'success');
  }, [addToast]);

  return (
    <DataContext.Provider
      value={{
        students,
        leads,
        settings,
        destinationPrices,
        activities,
        toasts,
        addToast,
        removeToast,
        getStudent,
        createStudent,
        updateStudent,
        moveStudentStage,
        recordPayment,
        reopenPayment,
        archiveStudent,
        restoreStudent,
        deleteStudent,
        addStudentActivity,
        addStudentApplication,
        updateStudentApplication,
        removeStudentApplication,
        getLead,
        createLead,
        updateLead,
        logCall,
        convertLeadToCase,
        reopenLead,
        deleteLead,
        updateSettings,
        updateDestinationPrices,
        addDestinationPrice,
        removeDestinationPrice,
        removeSampleData,
        resetSampleData
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}
