import {
  CATEGORIES,
  CATEGORY_BY_ID,
  NEGATIVE_BASE,
  PALETTE_AFFINITY,
  PALETTES,
  PHOTO_DETAILS,
  PRINT_CATEGORIES,
  PRINT_DETAILS,
  RATIO_WEIGHTS,
  RATIOS,
  UNIVERSAL_AESTHETICS,
  type CategoryDef,
  type Palette,
} from "@/lib/taxonomy";
import type { Idea } from "@/lib/types";
import { hash32, mulberry32, pick, sample, weightedPick, type Rng } from "./random";

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "with", "and", "by", "for", "to", "into", "from", "at",
  "its", "their", "that", "this", "as", "is", "are", "be", "made", "reimagined", "converted",
]);

const TITLE_ADJECTIVES = [
  "Quiet", "Warm", "Slow", "Sunken", "Luminous", "Raw", "Soft", "Monolithic", "Pale",
  "Ember", "Dusk", "Salt", "Honeyed", "Still", "Tactile", "Nightfall", "Paper", "Hollow",
  "Amber", "Low", "Long", "Sodium", "Clay", "Felted", "Burnished", "Faded", "Deep",
];

const TITLE_TAILS = [
  "Study", "Notes", "Still", "Fragment", "Ritual", "System", "Memory", "Surface",
  "Interval", "Sequence", "Object", "Composition", "Index", "Field", "Language", "Exercise",
];

export interface BrainContext {
  /** How many published images exist per category id. */
  counts: Record<string, number>;
  /** Token sets of recently generated concepts, newest first. */
  recentTokens: string[][];
  /** Fingerprints of recent concepts. */
  recentFingerprints: string[];
  /** Category ids the operator wants prioritised. */
  priorityCategories: string[];
  /** A free-form creative direction, e.g. "200 futuristic website concepts". */
  direction?: string;
  /** Emerging categories discovered by earlier runs. */
  emerging?: { id: string; label: string; description: string; accent: string; targetShare: number }[];
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function categoryDefs(ctx: BrainContext): { def: CategoryDef; emergingId?: string }[] {
  const base = CATEGORIES.map((def) => ({ def }));
  const extra = (ctx.emerging ?? [])
    .filter((e) => !CATEGORY_BY_ID.has(e.id))
    .map((e) => ({
      def: {
        id: e.id,
        label: e.label,
        description: e.description,
        accent: e.accent,
        targetShare: e.targetShare,
        media: ["editorial visual concept", "art-directed composition", "conceptual rendering"],
        subjects: [e.description, `${e.label.toLowerCase()} environment`, `${e.label.toLowerCase()} artefact`],
        aesthetics: ["speculative art direction", "emergent visual language"],
        materials: ["mixed media", "rendered surfaces"],
        lighting: ["soft directional light", "ambient glow"],
        compositions: ["centered concept", "wide atmospheric frame"],
        details: ["emerging visual vocabulary", "unexpected material pairing"],
        moods: ["curious", "unexpected"],
      } as CategoryDef,
    }));
  return [...base, ...extra];
}

/** Bias category choice towards under-represented categories + operator priorities. */
function chooseCategory(rng: Rng, ctx: BrainContext) {
  const defs = categoryDefs(ctx);
  const total = Object.values(ctx.counts).reduce((a, b) => a + b, 0) || 1;
  const weights = defs.map(({ def }) => {
    const share = (ctx.counts[def.id] ?? 0) / total;
    const deficit = Math.max(0.0005, def.targetShare - share);
    const emphasis = ctx.priorityCategories.includes(def.id) ? 1.9 : 1;
    // Inverse-root keeps rare categories in rotation without starving big ones.
    return Math.pow(deficit / def.targetShare, 0.55) * emphasis * def.targetShare;
  });
  return weightedPick(rng, defs, weights).def;
}

function directionHint(ctx: BrainContext): { phrase: string; aesthetics: string[]; subjects: string[] } | null {
  if (!ctx.direction) return null;
  const d = ctx.direction.toLowerCase();
  const aesthetics: string[] = [];
  const subjects: string[] = [];
  const phrases = [
    "glassmorphism", "warm", "dark", "minimal", "brutalist", "editorial", "futuristic",
    "experimental", "luxury", "japanese", "retro", "soft", "monumental", "playful",
    "monochrome", "iridescent", "tactile", "cinematic", "organic", "geometric",
  ];
  for (const p of phrases) if (d.includes(p)) aesthetics.push(p);
  for (const cat of CATEGORIES) {
    if (d.includes(cat.id) || d.includes(cat.label.toLowerCase())) {
      subjects.push(cat.subjects[0]);
    }
  }
  return { phrase: ctx.direction, aesthetics, subjects };
}

function ratioFor(rng: Rng, categoryId: string) {
  const tall = ["graphic-design", "typography", "editorial-design", "posters", "fashion", "streetwear", "logo-concepts"];
  const wide = ["cinematic-art", "landscapes", "web-design", "architecture", "industrial-design"];
  if (tall.includes(categoryId)) {
    return weightedPick(rng, [RATIOS[0], RATIOS[1], RATIOS[2], RATIOS[3], RATIOS[4], RATIOS[6]], [0.3, 0.22, 0.14, 0.16, 0.12, 0.06]);
  }
  if (wide.includes(categoryId)) {
    return weightedPick(rng, [RATIOS[3], RATIOS[4], RATIOS[5], RATIOS[6], RATIOS[0]], [0.2, 0.28, 0.28, 0.12, 0.12]);
  }
  return weightedPick(rng, [RATIOS[0], RATIOS[1], RATIOS[2], RATIOS[3], RATIOS[4], RATIOS[5], RATIOS[6], RATIOS[7]], RATIO_WEIGHTS);
}

function paletteName(p: Palette) {
  return p.name.toLowerCase();
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

const SUBJECT_NOUN_RE =
  /\b(chapel|courtyard|tower|apartment|reservoir|station|library|museum|pavilion|walkway|room|kitchen|nook|bathroom|studio|lobby|bedroom|salon|conservatory|poster|spread|catalogue|grid|identity|site|homepage|dashboard|panel|app|letters?|alphabet|mark|monogram|seal|logotype|cover|feature|photograph|still|portrait|pool|street|motel|dancer|greenhouse|film|frame|corridor|train|cathedral|planet|diner|rocket|forest|house|speaker|lamp|set|keyboard|chair|watch|shelving|bottle|shoe|grill|case|vehicle|robot|turbine|hand|helmet|machine|ferry|stool|airframe|centrifuge|bike|coat|dress|jacket|gown|look|editorial|hoodie|sneaker|beanie|fox|whale|moth|astronaut|island|portal|bloom|figure|chair|book|room|concrete|paper|lantern|altar|stair|facade|bench)\b/i;

function subjectNoun(subject: string): string {
  const m = subject.match(SUBJECT_NOUN_RE);
  if (m) return m[1];
  const tokens = subject.split(/\s+/).filter((t) => !STOPWORDS.has(t.toLowerCase()));
  return tokens[Math.min(tokens.length - 1, 3)]?.replace(/[^a-zA-Z-]/g, "") || "Concept";
}

export function buildIdea(opts: {
  seed?: number;
  context: BrainContext;
  categoryId?: string;
  direction?: string;
  noveltyThreshold?: number;
}): Idea {
  const rng = mulberry32(opts.seed ?? hash32(String(Date.now()) + Math.random()));
  const ctx = { ...opts.context, direction: opts.direction ?? opts.context.direction };
  const hint = directionHint(ctx);

  let def = opts.categoryId ? categoryDefs(ctx).find((d) => d.def.id === opts.categoryId)?.def : undefined;
  if (!def) def = chooseCategory(rng, ctx);

  const aestheticPool = [...def.aesthetics, ...UNIVERSAL_AESTHETICS];
  if (hint?.aesthetics.length) aestheticPool.push(...hint.aesthetics.map((a) => `${a} art direction`));

  const memorySets = ctx.recentTokens.map((t) => new Set(t));
  const fingerprints = new Set(ctx.recentFingerprints);
  const threshold = opts.noveltyThreshold ?? 0.5;

  let best: { idea: Idea; novelty: number } | null = null;

  for (let attempt = 0; attempt < 28; attempt++) {
    const subject =
      hint?.subjects.length && attempt < 4
        ? `${pick(rng, hint.subjects)}, ${pick(rng, def.subjects)}`
        : pick(rng, def.subjects);
    const medium = pick(rng, def.media);
    const aesthetic = pick(rng, aestheticPool);
    const lighting = pick(rng, def.lighting);
    const composition = pick(rng, def.compositions);
    const material = pick(rng, def.materials);
    const affinity = PALETTE_AFFINITY[def.id];
    const palettePool = affinity ? PALETTES.filter((p) => affinity.includes(p.name)) : PALETTES;
    const palette = palettePool.length ? pick(rng, palettePool) : pick(rng, PALETTES);
    const mood = pick(rng, def.moods);
    const texturePool = PRINT_CATEGORIES.has(def.id) ? PRINT_DETAILS : PHOTO_DETAILS;
    const details = sample(rng, [...def.details, ...texturePool], 2 + Math.floor(rng() * 2));
    const ratio = ratioFor(rng, def.id);
    const subcategory = titleCase(aesthetic);

    const conceptKey = [def.id, subject, medium, aesthetic, composition].join("|");
    const fingerprint = `c${hash32(conceptKey).toString(16)}`;
    const tokens = tokenize([subject, medium, aesthetic, material, lighting, composition, ...details, mood, def.label].join(" "));
    const tokenSet = new Set(tokens);

    let maxSim = 0;
    for (const prev of memorySets) maxSim = Math.max(maxSim, jaccard(tokenSet, prev));
    const exact = fingerprints.has(fingerprint) ? 1 : 0;
    const novelty = Math.max(0, 1 - Math.max(maxSim, exact * 0.9));
    const result = {
      novelty,
      idea: {
        categoryId: def.id,
        subcategory,
        subject,
        medium,
        aesthetic,
        lighting,
        palette: { name: palette.name, hex: palette.hex },
        composition,
        material,
        mood,
        details,
        ratio: { label: ratio.label, w: ratio.w, h: ratio.h },
        prompt: "",
        negativePrompt: NEGATIVE_BASE,
        title: "",
        description: "",
        tags: [],
        fingerprint,
        novelty,
      } as Idea,
    };
    if (!best || novelty > best.novelty) best = result;
    if (novelty >= threshold) break;
  }

  const idea = best!.idea;
  idea.prompt = composePrompt(idea);
  idea.title = composeTitle(rng, idea);
  idea.description = composeDescription(idea);
  idea.tags = composeTags(idea, def);
  return idea;
}

export function composePrompt(idea: Idea): string {
  const ratioPhrase: Record<string, string> = {
    "4:5": "vertical 4:5 portrait composition",
    "2:3": "tall 2:3 portrait composition",
    "3:4": "vertical 3:4 composition",
    "1:1": "square 1:1 composition",
    "3:2": "horizontal 3:2 composition",
    "16:9": "wide 16:9 composition",
    "5:4": "landscape 5:4 composition",
    "9:16": "extreme vertical 9:16 composition",
  };
  const clauses = [
    `${idea.medium} of ${idea.subject}`,
    idea.composition,
    idea.lighting,
    idea.material,
    `${idea.aesthetic} art direction`,
    idea.mood,
    `${idea.palette.name.toLowerCase()} palette (${idea.palette.hex.slice(0, 4).join(", ")})`,
    ...idea.details,
    ratioPhrase[idea.ratio.label] ?? "considered composition",
    "gallery-grade execution, extremely high detail, masterful lighting",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const clause of clauses) {
    for (const piece of clause.split(",").map((c) => c.trim()).filter(Boolean)) {
      const key = piece.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(piece);
    }
  }
  return out.join(", ");
}

export function composeTitle(rng: Rng, idea: Idea): string {
  const noun = titleCase(subjectNoun(idea.subject));
  const style = rng();
  if (style < 0.34) return `${pick(rng, TITLE_ADJECTIVES)} ${noun}`;
  if (style < 0.58) return `${noun} ${pick(rng, TITLE_TAILS)}`;
  if (style < 0.76) return `${pick(rng, TITLE_ADJECTIVES)} ${noun}, ${pick(rng, ["No. 2", "in Amber", "at Dusk", "in Winter", "Alone", "at Rest"])}`;
  if (style < 0.9) return `${noun} / ${titleCase(idea.aesthetic.split(" ")[0])}`;
  return `${pick(rng, TITLE_ADJECTIVES)} ${noun} ${pick(rng, TITLE_TAILS)}`;
}

export function composeDescription(idea: Idea): string {
  const palette = idea.palette.hex.slice(0, 3).join(" · ");
  const subject = idea.subject.charAt(0).toUpperCase() + idea.subject.slice(1);
  const mood = idea.mood.charAt(0).toUpperCase() + idea.mood.slice(1);
  const detail = idea.details[0] ? ` ${idea.details[0].charAt(0).toUpperCase() + idea.details[0].slice(1)}.` : "";
  return `${subject} — ${idea.aesthetic} art direction, ${idea.material}, ${idea.lighting}. Palette: ${paletteName(idea.palette)} (${palette}). ${mood}${detail}`;
}

function composeTags(idea: Idea, def: CategoryDef): string[] {
  const base = tokenize(idea.subject).slice(0, 6);
  const tags = new Set<string>([
    def.label.toLowerCase(),
    ...base,
    ...idea.aesthetic.split(" ").filter((w) => w.length > 3),
    ...idea.material.split(" ").filter((w) => w.length > 3),
    idea.palette.name.toLowerCase(),
    ...idea.mood.split(" ").filter((w) => w.length > 3),
    idea.ratio.label,
  ]);
  return [...tags].slice(0, 14);
}

/** Cheap semantic expansion for search: adds synonyms + category labels. */
export function expandQuery(query: string): string[] {
  const q = query.toLowerCase().trim();
  const out = new Set<string>([q]);
  for (const w of q.split(/\s+/)) if (w.length > 2) out.add(w);
  return [...out];
}
