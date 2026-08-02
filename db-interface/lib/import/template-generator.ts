import * as XLSX from '@e965/xlsx';
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
    réponse_a: 'Le duodénum',
    réponse_b: "L'estomac",
    réponse_c: 'La rate',
    réponse_d: 'Le mésentère',
    réponse_e: 'Le foie',
    réponses_correctes: 'A',
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

  // ── Helper Sheet: Module Names (for dropdown validation) ──
  const moduleNames = getModuleNames();
  const moduleSheetData = moduleNames.map((name) => [name]);
  const moduleSheet = XLSX.utils.aoa_to_sheet(moduleSheetData);
  moduleSheet['!cols'] = [{ wch: 50 }];
  XLSX.utils.book_append_sheet(wb, moduleSheet, 'Modules');

  // ── Sheet 3: Questions ──
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
  // Module dropdown references the Modules helper sheet (avoids 255-char inline limit)
  const moduleLastRow = moduleNames.length;
  const moduleFormula = `Modules!$A$1:$A$${moduleLastRow}`;

  questionsSheet['!dataValidations'] = [
    {
      sqref: `A2:A1000`,
      type: 'list',
      formula1: yearOptions,
    },
    {
      sqref: `B2:B1000`,
      type: 'list',
      formula1: moduleFormula,
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
      conditional_fields: {
        sub_discipline: "OBLIGATOIRE pour les modules UEI (ex: Appareil Digestif, Appareil Cardio-vasculaire, etc.). Exemples de sous-disciplines: Anatomie, Histologie, Physiologie, Biochimie, Biophysique."
      },
      optional_fields: ["sub_discipline", "unity_name", "cours", "faculty_source", "explanation", "speciality"],
      field_aliases: {
        sub_discipline: ["sub_discipline", "sous_discipline", "sub_module", "sous_module", "qst_sub_module"],
        unity_name: ["unity_name", "unite", "unity", "nom_unite", "qst_unite"],
        module_name: ["module_name", "module"],
        exam_type: ["exam_type", "type_examen"],
        exam_year: ["exam_year", "promo"]
      },
      answer_format: "Chaque réponse doit avoir: option_label (A-E), answer_text, is_correct (boolean), display_order (1-5)",
    },
    questions: [
      {
        year: "1",
        module_name: "Anatomie",
        exam_type: "EMD1",
        exam_year: 2024,
        number: 1,
        question_text: "Le muscle deltoïde s'insère sur l'acromion, le tiers latéral de la clavicule et l'épine de la scapula. Son innervation principale est assurée par :",
        cours: ["Myologie du membre supérieur"],
        faculty_source: "fac_mere",
        explanation: "Le muscle deltoïde est innervé par le nerf axillaire (C5-C6), branche terminale du faisceau postérieur du plexus brachial.",
        answers: [
          { option_label: "A", answer_text: "Le nerf radial", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "Le nerf axillaire", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "Le nerf musculocutané", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Le nerf médian", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Le nerf ulnaire", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "1",
        module_name: "Histologie",
        exam_type: "EMD",
        exam_year: 2024,
        number: 2,
        question_text: "Concernant les épithéliums de revêtement simples pavimenteux, quelle est la proposition exacte ?",
        cours: ["Tissu épithélial"],
        faculty_source: "fac_mere",
        explanation: "L'endothélium vasculaire et le mésothélium des séreuses sont des épithéliums pavimenteux simples.",
        answers: [
          { option_label: "A", answer_text: "Ils bordent la lumière de l'estomac", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "Ils constituent l'endothélium des vaisseaux sanguins", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "Ils possèdent des cils vibratiles à leur pôle apical", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Ils sont formés de plusieurs couches de cellules superposées", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Ils sont caractéristiques des voies urinaires", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "2",
        module_name: "Appareil Digestif",
        sub_discipline: "Anatomie",
        unity_name: "Appareil Digestif",
        exam_type: "EMD",
        exam_year: 2024,
        number: 1,
        question_text: "Le canal cholédoque s'abouche au niveau du duodénum en s'unissant au canal pancréatique principal au niveau de :",
        cours: ["Anatomie du foie et des voies biliaires"],
        faculty_source: "fac_mere",
        explanation: "Le canal cholédoque rejoint le canal de Wirsung au niveau de l'ampoule de Vater dans le deuxième duodénum (D2).",
        answers: [
          { option_label: "A", answer_text: "La papille duodénale majeure (ampoule de Vater) dans D2", is_correct: true, display_order: 1 },
          { option_label: "B", answer_text: "La papille duodénale mineure dans D1", is_correct: false, display_order: 2 },
          { option_label: "C", answer_text: "L'angle de Treitz", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Le genu inferius dans D3", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Le sphincter de Cardia", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "2",
        module_name: "Appareil Digestif",
        sub_discipline: "Physiologie",
        unity_name: "Appareil Digestif",
        exam_type: "EMD",
        exam_year: 2024,
        number: 2,
        question_text: "Quelle hormone digestive est sécrétée par les cellules G antrales en réponse à la présence de peptides dans l'estomac ?",
        cours: ["Physiologie de la sécrétion gastrique"],
        faculty_source: "annexe_biskra",
        explanation: "La gastrine est produite par les cellules G antrales et stimule la sécrétion d'acide chlorhydrique par les cellules pariétales.",
        answers: [
          { option_label: "A", answer_text: "La sécrétine", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "La cholécystokinine (CCK)", is_correct: false, display_order: 2 },
          { option_label: "C", answer_text: "La gastrine", is_correct: true, display_order: 3 },
          { option_label: "D", answer_text: "Le somatostatine", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Le motiline", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "2",
        module_name: "Appareil Cardio-vasculaire et Respiratoire",
        sub_discipline: "Physiologie",
        unity_name: "Appareil Cardio-vasculaire et Respiratoire",
        exam_type: "EMD",
        exam_year: 2023,
        number: 5,
        question_text: "Au cours du cycle cardiaque, la fermeture des valves atrioventriculaires (mitrale et tricuspide) correspond à :",
        cours: ["Physiologie cardiaque et révolution cardiaque"],
        faculty_source: "fac_mere",
        explanation: "La fermeture des valves atrioventriculaires au début de la systole ventriculaire produit le premier bruit cardiaque (B1).",
        answers: [
          { option_label: "A", answer_text: "Le premier bruit cardiaque (B1)", is_correct: true, display_order: 1 },
          { option_label: "B", answer_text: "Le deuxième bruit cardiaque (B2)", is_correct: false, display_order: 2 },
          { option_label: "C", answer_text: "La fin de la systole ventriculaire", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "L'ouverture des valves sigmoïdes aortique et pulmonaire", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "La relaxation isovolumétrique", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "2",
        module_name: "Immunologie",
        exam_type: "EMD",
        exam_year: 2024,
        number: 10,
        question_text: "Quelle classe d'immunoglobulines est la seule capable de traverser la barrière placentaire chez l'Homme ?",
        cours: ["Structure et fonctions des immunoglobulines"],
        faculty_source: "fac_mere",
        explanation: "Les IgG sont les seules immunoglobulines qui traversent le placenta grâce au récepteur néonatal FcRn.",
        answers: [
          { option_label: "A", answer_text: "IgM", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "IgA", "is_correct": false, display_order: 2 },
          { option_label: "C", answer_text: "IgG", "is_correct": true, display_order: 3 },
          { option_label: "D", answer_text: "IgE", "is_correct": false, display_order: 4 },
          { option_label: "E", answer_text: "IgD", "is_correct": false, display_order: 5 }
        ]
      },
      {
        year: "3",
        module_name: "Appareil Neurologique, Locomoteur et Cutané",
        sub_discipline: "Sémiologie",
        unity_name: "Appareil Neurologique, Locomoteur et Cutané",
        exam_type: "EMD",
        exam_year: 2024,
        number: 3,
        question_text: "Le signe de Babinski (réflexe cutané-plantaire en extension du gros orteil) est pathognomique d'une atteinte de :",
        cours: ["Sémiologie du syndrome pyramidal"],
        faculty_source: "fac_mere",
        explanation: "Le signe de Babinski traduit un syndrome pyramidal (atteinte du faisceau cortico-spinal).",
        answers: [
          { option_label: "A", answer_text: "La voie cérébelleuse", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "Le faisceau pyramidal (voie cortico-spinale)", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "Les cordons postérieurs de la moelle", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Le nerf sciatique poplité externe", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Le système extrapyramidal", is_correct: false, display_order: 5 }
        ]
      },
      {
        year: "3",
        module_name: "Pharmacologie",
        exam_type: "EMD",
        exam_year: 2024,
        number: 1,
        question_text: "Parmi les familles d'antibiotiques suivantes, laquelle agit en inhibant la synthèse de la paroi bactérienne par fixation aux PLP (Protéines Liant la Pénicilline) ?",
        cours: ["Pharmacologie des bêta-lactamines"],
        faculty_source: "annexe_khenchela",
        explanation: "Les bêta-lactamines (pénicillines, céphalosporines) bloquent la transpeptidation de la paroi peptidoglycane en se fixant aux PLP.",
        answers: [
          { option_label: "A", answer_text: "Les Aminosides", is_correct: false, display_order: 1 },
          { option_label: "B", answer_text: "Les Bêta-lactamines", is_correct: true, display_order: 2 },
          { option_label: "C", answer_text: "Les Fluoroquinolones", is_correct: false, display_order: 3 },
          { option_label: "D", answer_text: "Les Macrolides", is_correct: false, display_order: 4 },
          { option_label: "E", answer_text: "Les Phénicolés", is_correct: false, display_order: 5 }
        ]
      }
    ],
  };

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_questions.json';
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}
