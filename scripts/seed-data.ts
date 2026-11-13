// Demo accounts and area ownership (PRD §3, §14). Fictional people at a fictional plant.

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'PlantX-Demo-2026';

export interface SeedUser {
  email: string;
  name: string;
  role: 'worker' | 'supervisor' | 'ehs';
  is_contractor: boolean;
  language: 'en' | 'hi';
  /** Contractors without a completed induction see the check-in quiz. */
  induction_done: boolean;
}

export const USERS: SeedUser[] = [
  // The three demo accounts
  { email: 'worker@safesite.test', name: 'Ravi Kumar', role: 'worker', is_contractor: true, language: 'hi', induction_done: true },
  { email: 'supervisor@safesite.test', name: 'Priya Nair', role: 'supervisor', is_contractor: false, language: 'en', induction_done: true },
  { email: 'ehs@safesite.test', name: 'Anil Deshmukh', role: 'ehs', is_contractor: false, language: 'en', induction_done: true },
  // Second supervisor (owns 3 areas) so RLS is visible: Priya sees 5 zones, EHS sees 8
  { email: 'supervisor2@safesite.test', name: 'Sanjay Patil', role: 'supervisor', is_contractor: false, language: 'hi', induction_done: true },
  // Additional workers, including contractors
  { email: 'meena@safesite.test', name: 'Meena Shinde', role: 'worker', is_contractor: false, language: 'hi', induction_done: true },
  { email: 'arjun@safesite.test', name: 'Arjun Yadav', role: 'worker', is_contractor: true, language: 'hi', induction_done: false },
  { email: 'farhan@safesite.test', name: 'Farhan Shaikh', role: 'worker', is_contractor: false, language: 'en', induction_done: true },
  { email: 'lakshmi@safesite.test', name: 'Lakshmi Iyer', role: 'worker', is_contractor: true, language: 'en', induction_done: true },
  { email: 'deepak@safesite.test', name: 'Deepak Jadhav', role: 'worker', is_contractor: false, language: 'hi', induction_done: true },
  { email: 'suresh@safesite.test', name: 'Suresh Gupta', role: 'worker', is_contractor: true, language: 'hi', induction_done: true },
];

export const AREA_SUPERVISOR: Record<string, string> = {
  TANK: 'supervisor@safesite.test',
  REACT: 'supervisor@safesite.test',
  DIST: 'supervisor@safesite.test',
  LOAD: 'supervisor@safesite.test',
  WARE: 'supervisor@safesite.test',
  UTIL: 'supervisor2@safesite.test',
  ETP: 'supervisor2@safesite.test',
  WKSP: 'supervisor2@safesite.test',
};

export const AREA_CODES = ['TANK', 'REACT', 'DIST', 'LOAD', 'WARE', 'UTIL', 'ETP', 'WKSP'] as const;

export const AREA_NAMES: Record<string, string> = {
  TANK: 'Tank Farm',
  REACT: 'Reactor Block',
  DIST: 'Distillation Unit',
  LOAD: 'Loading Bay',
  WARE: 'Raw Material Warehouse',
  UTIL: 'Utilities (Boiler House)',
  ETP: 'Effluent Treatment Plant',
  WKSP: 'Maintenance Workshop',
};
