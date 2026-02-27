/**
 * Pure SVG generator for Tendance share cards.
 * Produces a 1080×1080 SVG that designers can edit in Figma, Illustrator, etc.
 * All elements are true SVG — text, rects, gradients — no foreignObject.
 */

interface SvgCourseEntry {
  cours_topic: string;
  question_count: number;
}

interface SvgSubDiscGroup {
  sub_discipline: string;
  entries: SvgCourseEntry[];
}

interface SvgExportOptions {
  moduleName: string;
  totalQuestions: number;
  examYearsRange: string;
  totalExamYears: number;
  subDiscGroups: SvgSubDiscGroup[];
}

// ── Colors ────────────────────────────────────────────────────────────
const SUB_DISC_ACCENT: Record<string, string> = {
  Anatomie: "#f43f5e",
  Histologie: "#a855f7",
  Physiologie: "#3b82f6",
  Biochimie: "#10b981",
  Biophysique: "#f59e0b",
};

const SUB_DISC_ICONS: Record<string, string> = {
  Anatomie: "🫀",
  Histologie: "🔬",
  Physiologie: "⚡",
  Biochimie: "🧪",
  Biophysique: "📐",
};

const BRAND_COLOR = "#09b2ac";
const MAX_COURSES = 5;

// ── Helpers ───────────────────────────────────────────────────────────

/** Escape text for safe XML embedding */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Truncate text to fit approx width (rough char estimate for font-size 13) */
function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

// ── Main Generator ───────────────────────────────────────────────────

export function generateTendanceSVG(opts: SvgExportOptions): string {
  const { moduleName, totalQuestions, examYearsRange, totalExamYears, subDiscGroups } = opts;

  const W = 1080;
  const H = 1080;
  const PAD = 48;

  let y = PAD; // running y cursor

  // ── Defs (gradients, filters) ──────────────────────────────────────
  const defs = `
    <defs>
      <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="50%" stop-color="#16213e"/>
        <stop offset="100%" stop-color="#0f3460"/>
      </linearGradient>
      <radialGradient id="glow-tr" cx="85%" cy="15%" r="40%">
        <stop offset="0%" stop-color="${BRAND_COLOR}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${BRAND_COLOR}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow-bl" cx="15%" cy="85%" r="30%">
        <stop offset="0%" stop-color="#9941ff" stop-opacity="0.1"/>
        <stop offset="100%" stop-color="#9941ff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="divider-grad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${BRAND_COLOR}"/>
        <stop offset="60%" stop-color="#9941ff" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#9941ff" stop-opacity="0"/>
      </linearGradient>
      ${subDiscGroups.map((g, i) => {
        const accent = SUB_DISC_ACCENT[g.sub_discipline] || BRAND_COLOR;
        return `
      <linearGradient id="bar-grad-${i}" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.13"/>
      </linearGradient>`;
      }).join("")}
    </defs>`;

  // ── Background ─────────────────────────────────────────────────────
  const bgElements = `
    <rect width="${W}" height="${H}" fill="url(#bg-grad)"/>
    <rect width="${W}" height="${H}" fill="url(#glow-tr)"/>
    <rect width="${W}" height="${H}" fill="url(#glow-bl)"/>`;

  // ── Header ─────────────────────────────────────────────────────────
  const headerParts: string[] = [];

  // Brand badge
  headerParts.push(`
    <rect x="${PAD}" y="${y}" width="100" height="32" rx="8" fill="${BRAND_COLOR}"/>
    <text x="${PAD + 50}" y="${y + 21}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="18" font-weight="800" fill="#262626" text-anchor="middle">FMC App</text>
  `);

  // "Tendance des Cours" label
  headerParts.push(`
    <text x="${PAD + 116}" y="${y + 21}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="14" font-weight="500" fill="rgba(255,255,255,0.5)">Tendance des Cours</text>
  `);

  y += 44;

  // Module name
  headerParts.push(`
    <text x="${PAD}" y="${y + 30}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="36" font-weight="800" fill="#ffffff">${esc(moduleName)}</text>
  `);

  // Stats badge (right-aligned)
  const statsX = W - PAD;
  headerParts.push(`
    <rect x="${statsX - 160}" y="${y - 12}" width="160" height="36" rx="10" fill="rgba(9,178,172,0.15)" stroke="rgba(9,178,172,0.3)" stroke-width="1"/>
    <text x="${statsX - 80}" y="${y + 12}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="14" font-weight="600" fill="${BRAND_COLOR}" text-anchor="middle">${totalQuestions} Questions</text>
  `);

  // Promos label
  headerParts.push(`
    <text x="${statsX}" y="${y + 40}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="13" font-weight="500" fill="rgba(255,255,255,0.5)" text-anchor="end">${totalExamYears} promos · ${esc(examYearsRange)}</text>
  `);

  y += 60;

  // ── Divider ────────────────────────────────────────────────────────
  const divider = `
    <rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="2" rx="1" fill="url(#divider-grad)"/>
  `;
  y += 28;

  // ── Sub-discipline groups ──────────────────────────────────────────
  const bodyParts: string[] = [];
  const contentW = W - PAD * 2;

  // Calculate available vertical space for groups
  const footerReserve = 60;
  const availableHeight = H - y - footerReserve;

  // Determine how many courses to show per group based on space
  const numGroups = subDiscGroups.length;
  const groupHeaderH = 32;
  const courseRowH = 36;
  const groupGap = 20;

  // Calculate max courses that fit
  const totalGroupHeaders = numGroups * groupHeaderH;
  const totalGaps = Math.max(0, numGroups - 1) * groupGap;
  const spaceForCourses = availableHeight - totalGroupHeaders - totalGaps;
  const totalCourseSlots = subDiscGroups.reduce(
    (sum, g) => sum + Math.min(g.entries.length, MAX_COURSES),
    0,
  );
  const dynamicMaxCourses = totalCourseSlots > 0
    ? Math.max(2, Math.floor(spaceForCourses / courseRowH / numGroups))
    : MAX_COURSES;
  const effectiveMax = Math.min(MAX_COURSES, dynamicMaxCourses);

  subDiscGroups.forEach((group, gi) => {
    const accent = SUB_DISC_ACCENT[group.sub_discipline] || BRAND_COLOR;
    const icon = SUB_DISC_ICONS[group.sub_discipline] || "📖";
    const displayEntries = group.entries.slice(0, effectiveMax);
    const maxQ = displayEntries[0]?.question_count || 1;

    // Group header
    bodyParts.push(`
      <text x="${PAD}" y="${y + 20}" font-size="22">${icon}</text>
      <text x="${PAD + 34}" y="${y + 20}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="16" font-weight="700" fill="${accent}" letter-spacing="0.5">${esc(group.sub_discipline)}</text>
      <text x="${PAD + 34 + group.sub_discipline.length * 10 + 12}" y="${y + 20}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="12" font-weight="500" fill="rgba(255,255,255,0.35)">— Top ${displayEntries.length}</text>
    `);
    y += groupHeaderH;

    // Course rows
    displayEntries.forEach((entry, idx) => {
      const barPct = Math.max(8, (entry.question_count / maxQ) * 100);
      const barW = Math.round((contentW - 80) * (barPct / 100));
      const rowX = PAD + 32;
      const barAreaW = contentW - 80;
      const truncated = truncateText(entry.cours_topic, 50);

      // Rank number
      bodyParts.push(`
        <text x="${PAD + 24}" y="${y + 20}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="13" font-weight="700" fill="rgba(255,255,255,0.4)" text-anchor="end">${idx + 1}.</text>
      `);

      // Bar background
      bodyParts.push(`
        <rect x="${rowX}" y="${y + 2}" width="${barAreaW}" height="28" rx="6" fill="rgba(255,255,255,0.05)"/>
      `);

      // Colored bar fill
      bodyParts.push(`
        <rect x="${rowX}" y="${y + 2}" width="${barW}" height="28" rx="6" fill="url(#bar-grad-${gi})"/>
      `);

      // Course name text
      bodyParts.push(`
        <text x="${rowX + 12}" y="${y + 21}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="13" font-weight="600" fill="#ffffff">${esc(truncated)}</text>
      `);

      // Question count
      bodyParts.push(`
        <text x="${W - PAD}" y="${y + 21}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="14" font-weight="700" fill="${accent}" text-anchor="end">${entry.question_count}Q</text>
      `);

      y += courseRowH;
    });

    // Gap between groups
    if (gi < subDiscGroups.length - 1) {
      y += groupGap;
    }
  });

  // ── Footer ─────────────────────────────────────────────────────────
  const footerY = H - PAD;
  const footer = `
    <line x1="${PAD}" y1="${footerY - 24}" x2="${W - PAD}" y2="${footerY - 24}" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
    <text x="${PAD}" y="${footerY}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="12" font-weight="500" fill="rgba(255,255,255,0.35)">Classement basé sur ${totalExamYears} promos (${esc(examYearsRange)})</text>
    <text x="${W - PAD - 90}" y="${footerY}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="12" font-weight="500" fill="rgba(255,255,255,0.35)">Généré par</text>
    <rect x="${W - PAD - 80}" y="${footerY - 14}" width="80" height="22" rx="6" fill="${BRAND_COLOR}"/>
    <text x="${W - PAD - 40}" y="${footerY}" font-family="'Manrope','Inter','Segoe UI',sans-serif" font-size="12" font-weight="800" fill="#262626" text-anchor="middle">FMC App</text>
  `;

  // ── Assemble SVG ───────────────────────────────────────────────────
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${defs}
  ${bgElements}
  ${headerParts.join("")}
  ${divider}
  ${bodyParts.join("")}
  ${footer}
</svg>`;
}

/**
 * Triggers a browser download of the SVG string as a .svg file.
 */
export function downloadSVG(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
