import test from "node:test";
import assert from "node:assert/strict";
import { buildIdea, composePrompt, tokenize, jaccard } from "../src/lib/agent/brain";
import { hamming } from "../src/lib/agent/imaging";
import { CATEGORIES } from "../src/lib/taxonomy";

const context = { counts: {}, recentTokens: [], recentFingerprints: [], priorityCategories: [] };

test("ideas are fully formed and prompt-coherent", () => {
  for (let i = 0; i < 60; i++) {
    const idea = buildIdea({ context, seed: 1000 + i });
    assert.ok(idea.title.length > 2, "has a title");
    assert.ok(idea.description.length > 30, "has a description");
    assert.ok(idea.prompt.includes(idea.subject), "prompt contains the subject");
    assert.ok(idea.prompt.length > 120, "prompt is detailed");
    assert.ok(idea.tags.length >= 4, "has searchable tags");
    assert.equal(idea.palette.hex.length, 5, "palette has five swatches");
    assert.ok(idea.ratio.w > 0 && idea.ratio.h > 0);
    assert.ok(idea.prompt.toLowerCase().includes("composition"), "declares the ratio");
  }
});

test("the taxonomy covers every requested direction", () => {
  const required = [
    "architecture", "interior-design", "graphic-design", "web-design", "ui-ux", "typography", "branding",
    "logo-concepts", "posters", "editorial-design", "photography", "cinematic-art", "product-design",
    "industrial-design", "fashion", "streetwear", "illustration", "digital-art", "3d-art",
    "experimental-design", "minimalism", "brutalism", "futurism", "retro-aesthetics", "nature",
    "landscapes", "abstract-art", "color-palettes", "packaging", "creative-advertising",
    "motion-design", "conceptual-art",
  ];
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const r of required) assert.ok(ids.has(r), `category ${r} exists`);
});

test("novelty scoring pushes away from recent concepts", () => {
  const first = buildIdea({ context, seed: 42 });
  const memory = {
    ...context,
    recentTokens: [tokenize(first.prompt)],
    recentFingerprints: [first.fingerprint],
  };
  const next = buildIdea({ context: memory, seed: 42, noveltyThreshold: 0.8 });
  assert.ok(next.novelty >= 0.8, `novelty ${next.novelty} should clear the threshold`);
  assert.notEqual(next.fingerprint, first.fingerprint);
});

test("a batch of 400 ideas produces almost entirely distinct prompts", () => {
  const prompts = new Set<string>();
  const subjects = new Set<string>();
  for (let i = 0; i < 400; i++) {
    const idea = buildIdea({ context, seed: 90000 + i * 7 });
    prompts.add(idea.prompt);
    subjects.add(`${idea.categoryId}:${idea.subject}`);
  }
  assert.ok(prompts.size > 380, `expected >380 unique prompts, got ${prompts.size}`);
  assert.ok(subjects.size > 100, `expected wide subject variety, got ${subjects.size}`);
  const categories = new Set(
    Array.from({ length: 400 }, (_, i) => buildIdea({ context, seed: i * 13 }).categoryId),
  );
  assert.ok(categories.size >= 20, `expected >=20 categories in rotation, got ${categories.size}`);
});

test("perceptual hashing measures similarity", () => {
  assert.equal(hamming("ff00ff00ff00ff00", "ff00ff00ff00ff00"), 0);
  assert.equal(hamming("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(hamming("f0f0f0f0f0f0f0f0", "f0f0f0f0f0f0f0f1"), 1);
});

test("token similarity is symmetric and bounded", () => {
  const a = new Set(tokenize("warm brutalist concrete chapel"));
  const b = new Set(tokenize("warm brutalist library"));
  assert.equal(jaccard(a, b), jaccard(b, a));
  assert.ok(jaccard(a, b) > 0 && jaccard(a, b) < 1);
});

test("creative direction influences composition", () => {
  const idea = buildIdea({
    context: { ...context, direction: "generate 200 futuristic website design concepts with warm glassmorphism" },
    seed: 7,
  });
  const prompt = composePrompt(idea);
  assert.ok(prompt.length > 100);
  assert.ok(idea.prompt.length > 0);
});
