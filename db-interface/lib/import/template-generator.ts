import * as XLSX from 'xlsx';
import { PREDEFINED_MODULES } from '@/lib/predefined-modules';

const EXCEL_HEADERS = [
  { key: 'year', label: 'année', required: true, width: 8 },
  { key: 'module_name', label: 'module', required: true, width: 35 },
  { key: 'sub_discipline', label: 'sous_discipline', required: false, width: 20 },
  { key: 'exam_type', label: "type_examen", required: true, width: 14 },
  { key: 'exam_year', label: 'promo', required: true, width: 8 },
  { key: 'number', label: 'numéro', required: true, width: 8 },
  { key: 'question_text', label: 'question', required: true, width: 50 },
  { key: 'answer_a', label: 'réponse_a', required: true, width: 30 },
  { key: 'answer_b', label: 'réponse_b', required: true, width: 30 },
  { key: 'answer_c', label: 'réponse_c', required: false, width: 30 },
  { key: 'answer_d', label: 'réponse_d', required: false, width: 30 },
  { key: 'answer_e', label: 'réponse_e', required: false, width: 30 },
  { key: 'correct_answers', label: 'réponses_correctes', required: true, width: 18 },
  { key: 'cours', label: 'cours', required: false, width: 25 },
  { key: 'faculty_source', label: 'source', required: false, width: 20 },
  { key: 'explanation', label: 'explication', required: false, width: 40 },
];

const SAMPLE_ROWS = [
  {
    année: 1,
    module: 'Anatomie',
    sous_discipline: '',
    type_examen: 'EMD1',
    promo: 2024,
    numéro: 1,
    question: "Le muscle deltoïde s'insère sur l'acromion, le tiers latéral de la clavicule et le ligament coraco-acromial. Son innervation est assurée par :",
    réponse_a: 'Le nerf radial',
    réponse_b: 'Le nerf axillaire',
    réponse_c: 'Le nerf musculocutané',
    réponse_d: 'Le nerf médian',
    réponse_e: 'Le nerf ulnaire',
    réponses_correctes: 'B',
    cours: 'Myologie',
    source: 'fac_mere',
    explication: "Le deltoïde est innervé par le nerf axillaire (C5, C6).",
  },
  {
    année: 2,
    module: 'Appareil Digestif',
    sous_discipline: 'Anatomie',
    type_examen: 'EMD',
    promo: 2024,
    numéro: 1,
    question: 'Le canal cholédoque passe derrière le premier duodénum et se termine dans :',
    réponse_a: 'Leodenum',
    réponse_b: 'Le duodénum',
    réponse_c: "L'estomac",
    réponse_d: 'La rate',
    réponse_e: 'Le mésentère',
    réponses_correctes: 'A,B',
    cours: 'Anatomie digestive',
    source: 'fac_mere',
    explication: '',
  },
  {
    année: 2,
    module: 'Génétique',
    sous_discipline: '',
    type_examen: 'EMD',
    promo: 2024,
    numéro: 1,
    question: "La loi de Mendel qui stipule que les deux allèles d'un gène se séparent lors de la formation des gamètes s'appelle :",
    réponse_a: 'La dominance',
    réponse_b: 'La ségrégation',
    réponse_c: 'La codominance',
    réponse_d: 'La liaison',
    réponse_e: 'La mutation',
    réponses_correctes: 'B',
    cours: 'Génétique mendélienne',
    source: '',
    explication: "La loi de la ségrégation (1ère loi de Mendel) : chaque individu possède deux exemplaires de chaque facteur (gène) qui se séparent lors de la formation des gamètes.",
  },
];

function getModuleNames(): string[] {
  return PREDEFINED_MODULES.map((m) => m.name);
}

export function downloadExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ──
  const instructionsData = [
    ['Guide d\'utilisation du template d\'importation'],
    [''],
    ['Ce template vous permet d\'importer des questions en masse dans la banque de données.'],
    ['Remplissez la feuille "Questions" avec vos données, puis uploadez le fichier sur la page d\'importation.'],
    [''],
    ['Légende :'],
    ['  ✅ Obligatoire = Colonne requise, l\'import échoue si vide'],
    ['  ⚠️ Conditionnel = Obligatoire uniquement pour les modules UEI (sous_discipline)'],
    ['  📋 Optionnel = Peut rester vide'],
    [''],
    ['Descriptions des colonnes :'],
    [''],
    ['Colonne', 'Obligatoire', 'Description', 'Valeurs possibles', 'Exemple'],
    ['année', '✅ Oui', 'Année d\'étude', '1, 2, 3', '1'],
    ['module', '✅ Oui', 'Nom exact du module (voir liste ci-dessous)', 'Voir liste des modules', 'Anatomie'],
    ['sous_discipline', '⚠️ UEI', 'Requis pour les modules UEI uniquement', 'Anatomie, Histologie, Physiologie, Biochimie, Biophysique, etc.', 'Anatomie'],
    ['type_examen', '✅ Oui', 'Type d\'examen', 'EMD, EMD1, EMD2, Rattrapage', 'EMD1'],
    ['promo', '✅ Oui', 'Année de passage de l\'examen', '2020-2030', '2024'],
    ['numéro', '✅ Oui', 'Numéro de la question (unique par module/examen)', '1, 2, 3, ...', '1'],
    ['question', '✅ Oui', 'Texte de la question', 'Texte libre', 'Le muscle deltoïde s\'insère sur...'],
    ['réponse_a', '✅ Oui', 'Texte de l\'option A', 'Texte libre', 'La clavicule'],
    ['réponse_b', '✅ Oui', 'Texte de l\'option B', 'Texte libre', 'Le sternum'],
    ['réponse_c', '📋 Optionnel', 'Texte de l\'option C', 'Texte libre', 'L\'humérus'],
    ['réponse_d', '📋 Optionnel', 'Texte de l\'option D', 'Texte libre', 'Le radius'],
    ['réponse_e', '📋 Optionnel', 'Texte de l\'option E', 'Texte libre', 'L\'omoplate'],
    ['réponses_correctes', '✅ Oui', 'Lettres des bonnes réponses', 'A, B, C, D, E (combinés avec virgule)', 'A,C'],
    ['cours', '📋 Optionnel', 'Nom(s) du/des cours', 'Séparés par point-virgule (;)', 'Myologie; Ostéologie'],
    ['source', '📋 Optionnel', 'Source de la question', 'fac_mere, annexe_biskra, annexe_oum_el_bouaghi, annexe_khenchela, annexe_souk_ahras', 'fac_mere'],
    ['explication', '📋 Optionnel', 'Explication de la réponse', 'Texte libre', 'Le deltoïde est innervé par...'],
    [''],
    ['─'.repeat(60)],
    ['Liste des modules par année :'],
    [''],
  ];

  // Add module list by year
  for (const year of ['1', '2', '3']) {
    const yearModules = PREDEFINED_MODULES.filter((m) => m.year === year);
    instructionsData.push([`Année ${year} :`]);
    for (const mod of yearModules) {
      const subInfo = mod.hasSubDisciplines ? ' (UEI - sous_discipline requise)' : '';
      instructionsData.push([`  - ${mod.name}${subInfo} (${mod.type})`]);
    }
    instructionsData.push(['']);
  }

  instructionsData.push(['─'.repeat(60)]);
  instructionsData.push(['Notes importantes :']);
  instructionsData.push(['- Le module "Immunologie" existe en année 2 ET année 3. Précisez bien l\'année.']);
  instructionsData.push(['- Les modules UEI nécessitent une sous_discipline valide.']);
  instructionsData.push(['- Les types d\'examen varient selon le type de module :']);
  instructionsData.push(['    Annuel : EMD1, EMD2, Rattrapage']);
  instructionsData.push(['    Semestriel : EMD, Rattrapage']);
  instructionsData.push(['    UEI : EMD, Rattrapage']);
  instructionsData.push(['    Autonome : EMD, Rattrapage']);

  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
  instructionsSheet['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 60 }, { wch: 40 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

  // ── Sheet 2: Questions ──
  const headerRow = EXCEL_HEADERS.map((h) => h.label);
  const sampleRows = SAMPLE_ROWS.map((row) =>
    EXCEL_HEADERS.map((h) => {
      const val = row[h.label as keyof typeof row];
      return val !== undefined ? val : '';
    })
  );

  const questionsData = [headerRow, ...sampleRows];
  const questionsSheet = XLSX.utils.aoa_to_sheet(questionsData);

  // Set column widths
  questionsSheet['!cols'] = EXCEL_HEADERS.map((h) => ({ wch: h.width }));

  // Add data validation dropdowns
  const yearOptions = '"1,2,3"';
  const examTypeOptions = '"EMD,EMD1,EMD2,Rattrapage"';
  const sourceOptions = '"fac_mere,annexe_biskra,annexe_oum_el_bouaghi,annexe_khenchela,annexe_souk_ahras"';
  const moduleOptions = `"${getModuleNames().join(',')}"`;

  const range: XLSX.Range = {
    s: { r: 1, c: 0 },
    e: { r: 1000, c: 0 },
  };

  // Year validation (column A)
  questionsSheet['!dataValidations'] = [
    {
      sqref: `A2:A1000`,
      type: 'list',
      formula1: yearOptions,
    },
    {
      sqref: `D2:D1000`,
      type: 'list',
      formula1: examTypeOptions,
    },
    {
      sqref: `O2:O1000`,
      type: 'list',
      formula1: sourceOptions,
    },
  ];

  XLSX.utils.book_append_sheet(wb, questionsSheet, 'Questions');

  // Download
  XLSX.writeFile(wb, 'template_questions.xlsx', { bookType: 'xlsx' });
}

export function downloadJsonTemplate(): void {
  const template = {
    _README: {
      format: "Ce fichier contient des exemples de questions au format JSON.",
      instructions: "Remplacez les exemples par vos propres questions puis uploadez le fichier.",
      required_fields: ["year", "module_name", "exam_type", "exam_year", "number", "question_text", "answers"],
      answer_format: "Chaque réponse doit avoir: option_label (A-E), answer_text, is_correct (boolean), display_order (1-5)",
    },
    questions: [
      {
        year: "1",
        module_name: "Anatomie",
        exam_type: "EMD1",
        exam_year: 2024,
        number: 1,
        question_text: "Le muscle deltoïde s'insère sur l'acromion, le tiers latéral de la clavicule et le ligament coraco-acromial. Son innervation est assurée par :",
        cours: ["Myologie"],
        faculty_source: "fac_mere",
        explanation: "Le deltoïde est innervé par le nerf axillaire (C5, C6).",
        answers: [
          { option_label: "A", answer_text: "Le nerf radial", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "Le nerf axillaire", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "Le nerf musculocutané", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Le nerf médian", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Le nerf ulnaire", is_correct: false, display_order: 5 },
        ],
      },
      {
        year: "2",
        module_name: "Génétique",
        exam_type: "EMD",
        exam_year: 2024,
        number: 1,
        question_text: "La loi de Mendel qui stipule que les deux allèles d'un gène se séparent lors de la formation des gamètes s'appelle :",
        cours: ["Génétique mendélienne"],
        answers: [
          { option_label: "A", answer_text: "La dominance", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "La ségrégation", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "La codominance", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "La liaison", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "La mutation", is_correct: false, display_order: 5 },
        ],
      },
    ],
  };

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_questions.json';
  a.click();
  URL.revokeObjectURL(url);
}
