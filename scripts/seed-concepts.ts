/**
 * Composes seed concepts for the initial library.
 *
 * This is the agent's brain running in "curated" mode: each concept selects a
 * category, subject and art direction, then the same prompt grammar used by the
 * live pipeline builds the final generation prompt. The resulting manifest is
 * fulfilled by an image generator and ingested through the real publication
 * pipeline (`scripts/seed.ts`).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_BY_ID, NEGATIVE_BASE, PALETTE_AFFINITY, PALETTES, PHOTO_DETAILS, PRINT_CATEGORIES, PRINT_DETAILS, RATIOS } from "../src/lib/taxonomy";
import { composeDescription, composePrompt } from "../src/lib/agent/brain";
import { hash32, mulberry32, pick } from "../src/lib/agent/random";
import type { Idea } from "../src/lib/types";

interface Spec {
  cat: string;
  subject: string;
  aesthetic: string;
  ratio: string;
  title: string;
  extra?: string;
}

const SPECS: Spec[] = [
  { cat: "architecture", subject: "a brutalist concrete chapel cantilevered over a sea cliff", aesthetic: "tectonic minimalism", ratio: "4:5", title: "Cliff Chapel, Low Sun", extra: "dusk, single warm interior light, sea mist" },
  { cat: "architecture", subject: "a sunken travertine courtyard house with a single olive tree", aesthetic: "new Mediterranean", ratio: "3:2", title: "Travertine Courtyard", extra: "raking afternoon light, deep shadow" },
  { cat: "architecture", subject: "a rammed-earth winery half buried in red soil", aesthetic: "regional brutalism", ratio: "16:9", title: "Earth Cellar", extra: "golden hour, dust in air" },
  { cat: "interior-design", subject: "a sunken living room wrapped in bouclé and limewash plaster", aesthetic: "quiet luxury", ratio: "4:5", title: "Sunken Stillness", extra: "late afternoon light through sheer linen" },
  { cat: "interior-design", subject: "a chef's kitchen in olive lacquer and unlacquered brass", aesthetic: "warm minimalism", ratio: "3:2", title: "Olive & Brass", extra: "warm interior light, one lit candle" },
  { cat: "interior-design", subject: "a Japanese-inspired bathing room in hinoki and stone", aesthetic: "japandi restraint", ratio: "2:3", title: "Hinoki Bath", extra: "steam, low warm light" },
  { cat: "graphic-design", subject: "a modernist exhibition catalogue with overprinted color fields on a strict grid", aesthetic: "contemporary editorial", ratio: "4:5", title: "Overprint Index", extra: "flat-lay on a warm grey field, paper texture visible" },
  { cat: "graphic-design", subject: "a risograph zine of overlapping concrete poetry", aesthetic: "post-digital print", ratio: "3:4", title: "Riso Poem", extra: "fluorescent pink and deep teal misregistration" },
  { cat: "web-design", subject: "a sculptor's portfolio website with oversized serif typography and a full-bleed image", aesthetic: "warm editorial modernism", ratio: "16:9", title: "Sculptor, Online", extra: "desktop hero, generous negative space, dark warm UI" },
  { cat: "web-design", subject: "a fashion label homepage built on full-bleed imagery and hairline rules", aesthetic: "quiet luxury commerce", ratio: "4:5", title: "Label Homepage", extra: "editorial layout, warm paper tones" },
  { cat: "ui-ux", subject: "a music analytics dashboard with dense charts in a warm dark interface", aesthetic: "warm dark UI", ratio: "16:9", title: "Listening Data", extra: "glass panels, one vivid orange data point" },
  { cat: "ui-ux", subject: "a travel planner app with map-first navigation and tactile cards", aesthetic: "soft neumorphic depth", ratio: "4:5", title: "Map First", extra: "two phones floating on a warm paper backdrop" },
  { cat: "ui-ux", subject: "a developer console with an open command palette", aesthetic: "precision data design", ratio: "16:9", title: "Command Palette", extra: "dark matte UI with warm accent, mono labels" },
  { cat: "typography", subject: "extruded 3D letterforms catching warm light", aesthetic: "expressive modernism", ratio: "4:5", title: "Letter as Object", extra: "single lowercase 'a', shallow depth of field" },
  { cat: "typography", subject: "a modular alphabet built from one shape, printed letterpress", aesthetic: "optical minimalism", ratio: "3:4", title: "One Shape, 26 Letters", extra: "deep impression in cotton stock, raking light" },
  { cat: "branding", subject: "a specialty coffee roaster's identity across kraft packaging and cards", aesthetic: "artisanal craft", ratio: "3:2", title: "Roaster Identity", extra: "overhead flat-lay, hand-stamped details" },
  { cat: "branding", subject: "a boutique hotel identity across key cards, matchbooks and stationery", aesthetic: "quiet luxury branding", ratio: "4:5", title: "Hotel Collateral", extra: "blind emboss, warm tungsten light" },
  { cat: "logo-concepts", subject: "a monogram of interlocking geometric strokes, embossed on heavy paper", aesthetic: "precision minimalism", ratio: "1:1", title: "Interlock", extra: "single mark with generous margin, soft studio gradient" },
  { cat: "posters", subject: "a jazz festival poster built from one giant numeral", aesthetic: "Swiss poster tradition", ratio: "2:3", title: "Festival Numeral", extra: "screen print, deep oxblood on cream" },
  { cat: "posters", subject: "an art-house film poster with a single still and italic credits", aesthetic: "neo-noir", ratio: "2:3", title: "Late Screening", extra: "warm dust tones, hairline frame" },
  { cat: "editorial-design", subject: "a slow-living magazine cover with a kitchen still life", aesthetic: "quiet editorial luxury", ratio: "3:4", title: "Issue 04: Kitchen", extra: "masthead in elegant serif, matte paper" },
  { cat: "editorial-design", subject: "an architecture magazine fold-out section drawing", aesthetic: "archival revival", ratio: "16:9", title: "Fold-Out Elevation", extra: "duotone print, thin technical lines" },
  { cat: "photography", subject: "a lone swimmer in an empty tiled pool at dawn", aesthetic: "cinematic naturalism", ratio: "3:2", title: "First Length", extra: "35mm grain, turquoise water, warm light" },
  { cat: "photography", subject: "a still life of bruised fruit on a marble ledge", aesthetic: "editorial minimalism", ratio: "4:5", title: "Late Fruit", extra: "window light, deep matte shadows" },
  { cat: "photography", subject: "a rain-slicked city street at 2am with a lone silhouette", aesthetic: "nocturnal sensuality", ratio: "16:9", title: "Two in the Morning", extra: "sodium streetlights, reflections" },
  { cat: "cinematic-art", subject: "a lone astronaut standing in a wheat field at dusk", aesthetic: "sun-drenched Americana", ratio: "16:9", title: "Visitor, Harvest", extra: "anamorphic flare, 35mm grain, letterboxed frame" },
  { cat: "cinematic-art", subject: "a hotel corridor lit by one flickering sconce", aesthetic: "neo-noir", ratio: "16:9", title: "Corridor, Room 9", extra: "deep shadow, green-amber palette" },
  { cat: "product-design", subject: "a portable speaker in die-cast aluminum and wool felt", aesthetic: "warm industrial design", ratio: "1:1", title: "Speaker No. 1", extra: "on a warm plaster pedestal, soft shadow" },
  { cat: "product-design", subject: "a desk lamp with a single pivoting arm in brushed metal", aesthetic: "braun-inspired functionalism", ratio: "4:5", title: "Pivot Lamp", extra: "studio backdrop, hard sun and long shadow" },
  { cat: "product-design", subject: "a pair of running shoes dissected into layered materials", aesthetic: "soft futurism", ratio: "3:2", title: "Anatomy of a Run", extra: "exploded view on warm grey, precise lighting" },
  { cat: "industrial-design", subject: "a compact electric utility vehicle for narrow streets", aesthetic: "technical brutalism", ratio: "3:2", title: "Narrow Utility", extra: "industrial studio, rim light, dark background" },
  { cat: "fashion", subject: "an oversized wool coat on a windswept rooftop", aesthetic: "quiet luxury fashion", ratio: "2:3", title: "Wool, Wind", extra: "overcast light, fabric drape, muted city behind" },
  { cat: "fashion", subject: "a bias-cut silk dress catching low evening sun", aesthetic: "romantic maximalism", ratio: "4:5", title: "Bias Cut, Late Light", extra: "hard sunlight, crisp shadow on plaster" },
  { cat: "streetwear", subject: "a boxy heavyweight hoodie with an oversized back print, in a parking structure", aesthetic: "90s skate nostalgia", ratio: "4:5", title: "Parking Structure Look", extra: "on-camera flash at night, concrete" },
  { cat: "illustration", subject: "a fox curled inside a teacup, gouache on textured paper", aesthetic: "folk-art warmth", ratio: "1:1", title: "Teacup Fox", extra: "limited warm palette, visible brush strokes" },
  { cat: "digital-art", subject: "a cathedral grown from coral, luminous and vast", aesthetic: "cosmic surrealism", ratio: "16:9", title: "Coral Cathedral", extra: "bioluminescent glow, volumetric haze" },
  { cat: "3d-art", subject: "inflatable chrome shapes arranged in a warm studio", aesthetic: "soft CGI surrealism", ratio: "1:1", title: "Chrome Bloom", extra: "softbox reflections, physical accuracy" },
  { cat: "experimental-design", subject: "a book whose pages are made of thin glass, documented in a gallery", aesthetic: "speculative design", ratio: "3:4", title: "Glass Pages", extra: "gallery light, label beside the object" },
  { cat: "minimalism", subject: "one chair in an enormous empty concrete room, a pool of light on the floor", aesthetic: "monastic restraint", ratio: "16:9", title: "One Chair", extra: "vast negative space, single shadow" },
  { cat: "brutalism", subject: "a raw concrete housing estate at dawn, balconies cutting hard shadows", aesthetic: "raw brutalism", ratio: "4:5", title: "Estate at Dawn", extra: "hard overcast light, orange streetlights" },
  { cat: "futurism", subject: "a lunar greenhouse with mirrored petals unfolding", aesthetic: "quiet sci-fi", ratio: "16:9", title: "Lunar Greenhouse", extra: "harsh sun, long shadows, dust" },
  { cat: "retro-aesthetics", subject: "a 1970s travel brochure for an imaginary island, flat color printing", aesthetic: "70s earth tones", ratio: "4:5", title: "Isle of Elsewhere", extra: "halftone print, burnt orange and avocado" },
  { cat: "nature", subject: "a single fern unfurling in fog, macro", aesthetic: "quiet macro", ratio: "4:5", title: "Unfurl", extra: "morning mist, dew, shallow depth of field" },
  { cat: "landscapes", subject: "salt flats cracked into a geometric grid, seen from altitude", aesthetic: "aerial abstraction", ratio: "16:9", title: "Salt Grid", extra: "first light, tiny scale cues" },
  { cat: "abstract-art", subject: "pigment blooming in water, warm tones", aesthetic: "color-field lyricism", ratio: "1:1", title: "Bloom Study", extra: "macro, translucent layers" },
  { cat: "color-palettes", subject: "five paint swatches arranged with precision, sampled from dusk light", aesthetic: "chromatic minimalism", ratio: "3:2", title: "Dusk, Five Ways", extra: "visible brush edges, paper tooth" },
  { cat: "packaging", subject: "a ceramic bottle in a molded pulp shell", aesthetic: "quiet luxury packaging", ratio: "4:5", title: "Pulp & Ceramic", extra: "soft daylight, gentle shadow" },
  { cat: "creative-advertising", subject: "a running shoe so light it floats on still water", aesthetic: "conceptual advertising", ratio: "3:2", title: "Weightless", extra: "studio key light, copy space, immaculate retouching" },
  { cat: "motion-design", subject: "a kinetic typography frame where letters become architecture", aesthetic: "kinetic modernism", ratio: "16:9", title: "Type in Motion", extra: "directional blur trails, warm glow" },
  { cat: "conceptual-art", subject: "a dictionary with every noun removed, displayed on a plinth", aesthetic: "poetic systems", ratio: "4:5", title: "Missing Nouns", extra: "institutional lighting, small museum label" },
];

/** Hand-tuned art direction for individual seeds. */
const OVERRIDES: Record<string, { pal?: string; mat?: string; light?: string; comp?: string }> = {
  "Cliff Chapel, Low Sun": { pal: "Ember Dusk", mat: "board-formed concrete", light: "dusk, one warm interior light glowing through the opening", comp: "extreme low angle looking up the cliff face" },
  "Travertine Courtyard": { pal: "Saffron Concrete", mat: "honeyed travertine", light: "low winter sun raking across the facade" },
  "Earth Cellar": { pal: "Terra Firma", mat: "rammed earth", light: "golden hour with dust in the air" },
  "Sunken Stillness": { pal: "Warm Concrete", mat: "bouclé upholstery and limewash plaster", light: "late afternoon light through sheer linen" },
  "Olive & Brass": { pal: "Olive Studio", mat: "olive lacquer and unlacquered brass", light: "pooled warm lamplight at dusk" },
  "Hinoki Bath": { pal: "Warm Concrete", mat: "hinoki wood and honed stone", light: "low warm light with steam" },
  "Overprint Index": { pal: "Oxblood Paper", mat: "uncoated paper and spot color overprint", light: "flat even studio light" },
  "Riso Poem": { pal: "Citrus Static", mat: "risograph ink on newsprint", light: "flat scan light" },
  "Listening Data": { pal: "Ember Dusk", mat: "frosted glass panels over matte dark surfaces", light: "soft screen glow in a dark studio" },
  "Command Palette": { pal: "Sodium Night", mat: "matte dark surfaces with 1px hairline borders", light: "soft glow of the interface in a dim room" },
  "Letter as Object": { pal: "Blood Orange", mat: "extruded matte clay letterform", light: "raking light revealing depth" },
  "One Shape, 26 Letters": { pal: "Paper Brutal", mat: "cut steel type and cotton stock", light: "raking light across deep impression" },
  "Roaster Identity": { pal: "Terra Firma", mat: "kraft board and letterpress card stock", light: "warm tungsten on packaging" },
  "Hotel Collateral": { pal: "Copper Verdigris", mat: "blind-embossed cotton stock and foil", light: "soft daylight flat-lay" },
  Interlock: { pal: "Bone & Graphite", mat: "debossed heavy paper", light: "single soft studio gradient" },
  "Festival Numeral": { pal: "Oxblood Paper", mat: "screen print on cream stock", light: "gallery wall light with soft shadow" },
  "Issue 04: Kitchen": { pal: "Olive Studio", mat: "matte coated stock", light: "soft daylight on the page" },
  "First Length": { pal: "Teal Cinema", mat: "water and glazed tile", light: "golden hour backlight" },
  "Late Fruit": { pal: "Saffron Concrete", mat: "marble and bruised skin", light: "single window light with deep matte shadows" },
  "Visitor, Harvest": { pal: "Amber Dusk", mat: "dust, wheat and matte visor glass", light: "dusk backlight with volumetric haze" },
  "Chrome Bloom": { pal: "Mauve Domino", mat: "inflatable chrome and matte felt", light: "warm HDRI studio with large softboxes" },
  "Salt Grid": { pal: "Ice & Rust", mat: "cracked salt crust", light: "first light grazing the surface" },
  "Dusk, Five Ways": { pal: "Ember Dusk", mat: "painted paper swatches", light: "controlled neutral studio light" },
  "Pulp & Ceramic": { pal: "Sand & Ink", mat: "molded pulp and glazed stoneware", light: "soft daylight with gentle shadow" },
  "Coral Cathedral": { pal: "Teal Cinema", mat: "translucent coral and mineral", light: "bioluminescent glow with volumetric haze" },
  "Lunar Greenhouse": { pal: "Slate Bloom", mat: "mirrored petals and regolith dust", light: "harsh unfiltered sun with long shadow" },
  "Glass Pages": { pal: "Ice & Rust", mat: "thin glass pages", light: "controlled gallery lighting" },
  "Bloom Study": { pal: "Rose Clay", mat: "pigment blooming in water", light: "macro backlight through the liquid" },
  "Unfurl": { pal: "Forest Glass", mat: "translucent fern frond and dew", light: "morning mist with soft backlight" },
  "Teacup Fox": { pal: "Terra Firma", mat: "gouache on textured paper", light: "flat illustrative light" },
  "One Chair": { pal: "Bone & Graphite", mat: "raw plaster and pale concrete", light: "one soft pool of daylight on the floor" },
  "Estate at Dawn": { pal: "Warm Concrete", mat: "raw board-formed concrete", light: "hard overcast dawn with orange streetlights" },
  "Narrow Utility": { pal: "Ice & Rust", mat: "milled aluminum and matte composite", light: "rim light on a dark industrial set" },
  "Wool, Wind": { pal: "Moss & Milk", mat: "heavy wool and raw silk", light: "overcast diffusion with a pale city behind" },
  "Bias Cut, Late Light": { pal: "Rose Clay", mat: "bias-cut silk", light: "hard low sunlight with crisp shadows" },
  "Parking Structure Look": { pal: "Paper Brutal", mat: "heavyweight fleece and concrete", light: "on-camera flash at night" },
    "Missing Nouns": { pal: "Bone & Graphite", mat: "paper, ink and museum board", light: "institutional gallery lighting" },
};

const TEXTLESS = new Set([
  "architecture", "interior-design", "photography", "cinematic-art", "product-design",
  "industrial-design", "fashion", "streetwear", "nature", "landscapes", "abstract-art",
  "digital-art", "3d-art", "minimalism", "brutalism", "futurism", "color-palettes",
]);

function build(spec: Spec, index: number): Idea {
  const def = CATEGORY_BY_ID.get(spec.cat);
  if (!def) throw new Error(`Unknown category ${spec.cat}`);
  const rng = mulberry32(hash32(spec.title) + index * 7919);
  const ratio = RATIOS.find((r) => r.label === spec.ratio) ?? RATIOS[0];
  const over = OVERRIDES[spec.title] ?? {};
  const medium = pick(rng, def.media);
  const affinity = PALETTE_AFFINITY[def.id];
  const palettePool = affinity ? PALETTES.filter((p) => affinity.includes(p.name)) : PALETTES;
  const palette = palettePool.length ? palettePool[(index * 3) % palettePool.length] : PALETTES[index % PALETTES.length];
  const idea: Idea = {
    categoryId: def.id,
    subcategory: spec.aesthetic,
    subject: spec.subject,
    medium,
    aesthetic: spec.aesthetic,
    lighting: over.light ?? pick(rng, def.lighting),
    palette: { name: over.pal ?? palette.name, hex: (PALETTES.find((p) => p.name === over.pal) ?? palette).hex },
    composition: over.comp ?? pick(rng, def.compositions),
    material: over.mat ?? pick(rng, def.materials),
    mood: pick(rng, def.moods),
    details: [pick(rng, def.details), pick(rng, PRINT_CATEGORIES.has(def.id) ? PRINT_DETAILS : PHOTO_DETAILS)],
    ratio: { label: ratio.label, w: ratio.w, h: ratio.h },
    prompt: "",
    negativePrompt: NEGATIVE_BASE,
    title: spec.title,
    description: "",
    tags: [],
    novelty: 1,
    fingerprint: `seed-${hash32(spec.title).toString(16)}`,
  };
  const suffix = TEXTLESS.has(def.id) ? ", no legible text, no watermark, no signage" : ", no watermark, no signature";
  idea.prompt = `${composePrompt(idea)}${spec.extra ? `, ${spec.extra}` : ""}${suffix}`;
  idea.description = composeDescription(idea);
  const words = spec.subject
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  idea.tags = [...new Set([def.label.toLowerCase(), ...words.slice(0, 7), ...spec.aesthetic.split(" ").filter((w) => w.length > 3), palette.name.toLowerCase(), ...(spec.extra ?? "").split(/[, ]+/).filter((w) => w.length > 3).slice(0, 4)])].slice(0, 14);
  return idea;
}

const dir = path.resolve(process.cwd(), ".seed");
fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
const items = SPECS.map((spec, i) => {
  const idea = build(spec, i);
  return {
    file: `${String(i + 1).padStart(2, "0")}-${spec.cat}.jpg`,
    idea,
  };
});
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), items }, null, 2));
console.log(`✔ Wrote ${items.length} curated concepts → .seed/manifest.json`);
for (const item of items) {
  console.log(`${item.file}\t${item.idea.title}\t${item.idea.ratio.label}`);
}
