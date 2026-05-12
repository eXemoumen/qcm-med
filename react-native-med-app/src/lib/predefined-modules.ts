// Predefined modules - These are fixed and cannot be modified by admins
// Based on the French medical curriculum used in Algeria
// Mirror of db-interface/lib/predefined-modules.ts

export interface PredefinedModule {
  name: string;
  year: string;
  type: 'annual' | 'semestrial' | 'uei' | 'standalone';
  hasSubDisciplines: boolean;
}

export const PREDEFINED_MODULES: PredefinedModule[] = [
  // 1ère Année - Modules Annuels
  { name: 'Anatomie', year: '1', type: 'annual', hasSubDisciplines: false },
  { name: 'Biochimie', year: '1', type: 'annual', hasSubDisciplines: false },
  { name: 'Biophysique', year: '1', type: 'annual', hasSubDisciplines: false },
  { name: 'Biostatistique / Informatique', year: '1', type: 'annual', hasSubDisciplines: false },
  { name: 'Chimie', year: '1', type: 'annual', hasSubDisciplines: false },
  { name: 'Cytologie', year: '1', type: 'annual', hasSubDisciplines: false },

  // 1ère Année - Modules Semestriels
  { name: 'Embryologie', year: '1', type: 'semestrial', hasSubDisciplines: false },
  { name: 'Histologie', year: '1', type: 'semestrial', hasSubDisciplines: false },
  { name: 'Physiologie', year: '1', type: 'semestrial', hasSubDisciplines: false },
  { name: 'S.S.H', year: '1', type: 'semestrial', hasSubDisciplines: false },

  // 2ème Année - U.E.I
  { name: 'Appareil Cardio-vasculaire et Respiratoire', year: '2', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Digestif', year: '2', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Urinaire', year: '2', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Endocrinien et de la Reproduction', year: '2', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Nerveux et Organes des Sens', year: '2', type: 'uei', hasSubDisciplines: true },

  // 2ème Année - Modules Autonomes
  { name: 'Génétique', year: '2', type: 'standalone', hasSubDisciplines: false },
  { name: 'Immunologie', year: '2', type: 'standalone', hasSubDisciplines: false },

  // 3ème Année - U.E.I
  { name: 'Appareil Cardio-vasculaire et respiratoire, Psychologie Médicale et Semiologie Générale', year: '3', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Neurologique, Locomoteur et Cutané', year: '3', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Endocrines, Appareil de Reproduction et Appareil Urinaire', year: '3', type: 'uei', hasSubDisciplines: true },
  { name: 'Appareil Digestif et Organes Hématopoïétiques', year: '3', type: 'uei', hasSubDisciplines: true },

  // 3ème Année - Modules Autonomes
  { name: 'Anatomie pathologique', year: '3', type: 'standalone', hasSubDisciplines: false },
  { name: 'Pharmacologie', year: '3', type: 'standalone', hasSubDisciplines: false },
  { name: 'Immunologie', year: '3', type: 'standalone', hasSubDisciplines: false },
  { name: 'Microbiologie', year: '3', type: 'standalone', hasSubDisciplines: false },
  { name: 'Parasitologie', year: '3', type: 'standalone', hasSubDisciplines: false },
];

// Predefined sub-disciplines for U.E.I
export const PREDEFINED_SUBDISCIPLINES: Record<string, string[]> = {
  // 2ème Année U.E.I
  'Appareil Cardio-vasculaire et Respiratoire': ['Anatomie', 'Histologie', 'Physiologie', 'Biophysique'],
  'Appareil Digestif': ['Anatomie', 'Histologie', 'Physiologie', 'Biochimie'],
  'Appareil Urinaire': ['Anatomie', 'Histologie', 'Physiologie', 'Biochimie'],
  'Appareil Endocrinien et de la Reproduction': ['Anatomie', 'Histologie', 'Physiologie', 'Biochimie'],
  'Appareil Nerveux et Organes des Sens': ['Anatomie', 'Histologie', 'Physiologie', 'Biophysique'],

  // 3ème Année U.E.I
  'Appareil Cardio-vasculaire et respiratoire, Psychologie Médicale et Semiologie Générale': ['Psychologie', 'Sémiologie', 'Physiopathologie', 'Radiologie', 'Biochimie'],
  'Appareil Neurologique, Locomoteur et Cutané': ['Sémiologie', 'Physiopathologie', 'Radiologie', 'Biochimie'],
  'Appareil Endocrines, Appareil de Reproduction et Appareil Urinaire': ['Sémiologie', 'Physiopathologie', 'Radiologie', 'Biochimie'],
  'Appareil Digestif et Organes Hématopoïétiques': ['Sémiologie', 'Physiopathologie', 'Radiologie', 'Biochimie'],
};

// Speciality options
export const SPECIALITY_OPTIONS = ['Médecine', 'Pharmacie', 'Médecine dentaire'];

// Grade to year mapping
export const GRADE_TO_YEAR: Record<string, string> = {
  '1ère année': '1',
  '2ème année': '2',
  '3ème année': '3',
};

// Filter grade options (limited to years 1-3)
export const FILTER_GRADE_OPTIONS = ['1ère année', '2ème année', '3ème année'];
