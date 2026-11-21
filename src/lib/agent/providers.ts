/**
 * Image-generation provider adapters.
 *
 * The agent is provider-agnostic: it composes a prompt plus a target aspect
 * ratio and asks whichever adapter is configured for pixels. Every adapter
 * returns raw bytes, so the rest of the pipeline (quality check, hashing,
 * classification, variants, publication) is identical for all of them.
 */

export type ProviderId = "openai" | "gemini" | "fal" | "replicate" | "stability";

export interface ProviderDef {
  id: ProviderId;
  label: string;
  envKeys: string[];
  models: string[];
  defaultModel: string;
  docs: string;
  costHint: string;
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    label: "OpenAI Images",
    envKeys: ["OPENAI_API_KEY"],
    models: ["gpt-image-1", "gpt-image-1-mini"],
    defaultModel: "gpt-image-1",
    docs: "https://platform.openai.com/docs/guides/image-generation",
    costHint: "≈ $0.02–0.17 per image depending on quality/size",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    models: ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview", "gemini-3-pro-image-preview"],
    defaultModel: "gemini-2.5-flash-image",
    docs: "https://ai.google.dev/gemini-api/docs/image-generation",
    costHint: "≈ $0.03–0.13 per image",
  },
  {
    id: "fal",
    label: "fal.ai (FLUX)",
    envKeys: ["FAL_KEY", "FAL_API_KEY"],
    models: ["fal-ai/flux/dev", "fal-ai/flux/schnell", "fal-ai/flux-pro/v1.1"],
    defaultModel: "fal-ai/flux/dev",
    docs: "https://fal.ai/models/fal-ai/flux/dev",
    costHint: "≈ $0.003–0.05 per image",
  },
  {
    id: "replicate",
    label: "Replicate",
    envKeys: ["REPLICATE_API_TOKEN"],
    models: ["black-forest-labs/flux-schnell", "black-forest-labs/flux-dev", "black-forest-labs/flux-1.1-pro"],
    defaultModel: "black-forest-labs/flux-schnell",
    docs: "https://replicate.com/black-forest-labs/flux-schnell",
    costHint: "≈ $0.003–0.04 per image",
  },
  {
    id: "stability",
    label: "Stability AI",
    envKeys: ["STABILITY_API_KEY"],
    models: ["core", "sd3.5-large"],
    defaultModel: "core",
    docs: "https://platform.stability.ai/docs/api-reference",
    costHint: "≈ $0.01–0.065 per image",
  },
];

export class ProviderError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, retryable: boolean, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.retryable = retryable;
    this.status = status;
  }
}

export interface ProviderStatus {
  configured: boolean;
  id: string;
  label: string;
  model: string;
  missing: string[];
  supported: { id: string; label: string; env: string[]; models: string[]; docs: string; costHint: string }[];
}

export function providerStatus(): ProviderStatus {
  const requested = (process.env.IMAGE_PROVIDER || "").trim().toLowerCase();
  const supported = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    env: p.envKeys,
    models: p.models,
    docs: p.docs,
    costHint: p.costHint,
  }));

  const findByKeys = () => PROVIDERS.find((p) => p.envKeys.some((k) => !!process.env[k]));

  if (requested) {
    const def = PROVIDERS.find((p) => p.id === requested);
    if (!def) {
      return {
        configured: false,
        id: requested,
        label: requested,
        model: "",
        missing: [`IMAGE_PROVIDER="${requested}" is not a known provider (${PROVIDERS.map((p) => p.id).join(", ")})`],
        supported,
      };
    }
    const missing = def.envKeys.filter((k) => !process.env[k]);
    return {
      configured: missing.length === 0,
      id: def.id,
      label: def.label,
      model: process.env.IMAGE_MODEL || def.defaultModel,
      missing,
      supported,
    };
  }

  const auto = findByKeys();
  if (auto) {
    return {
      configured: true,
      id: auto.id,
      label: auto.label,
      model: process.env.IMAGE_MODEL || auto.defaultModel,
      missing: [],
      supported,
    };
  }

  return {
    configured: false,
    id: "",
    label: "No provider configured",
    model: "",
    missing: ["IMAGE_PROVIDER", ...PROVIDERS[0].envKeys],
    supported,
  };
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: string;
  model: string;
  provider: string;
  costCents: number;
  seed?: number;
  revisedPrompt?: string;
}

interface GenerateArgs {
  prompt: string;
  negativePrompt?: string;
  aspect: number;
  seed?: number;
  model?: string;
  quality?: "low" | "medium" | "high";
}

const TIMEOUT_MS = Number(process.env.IMAGE_TIMEOUT_MS || 180_000);

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ProviderError(`Network error calling image provider: ${msg}`, true);
  } finally {
    clearTimeout(timer);
  }
}

async function fail(res: Response): Promise<never> {
  const text = (await res.text().catch(() => "")).slice(0, 600);
  const retryable = res.status === 429 || res.status >= 500;
  throw new ProviderError(`Provider returned ${res.status}: ${text || res.statusText}`, retryable, res.status);
}

function sizeForOpenAI(aspect: number): "1024x1024" | "1536x1024" | "1024x1536" {
  if (aspect > 1.15) return "1536x1024";
  if (aspect < 0.87) return "1024x1536";
  return "1024x1024";
}

function pixelSize(aspect: number, budget = 1_150_000): { width: number; height: number } {
  const height = Math.round(Math.sqrt(budget / aspect));
  const width = Math.round(height * aspect);
  const round8 = (n: number) => Math.max(256, Math.round(n / 8) * 8);
  return { width: round8(width), height: round8(height) };
}

function ratioLabel(aspect: number): string {
  const options: [string, number][] = [
    ["1:1", 1], ["16:9", 16 / 9], ["9:16", 9 / 16], ["4:5", 4 / 5], ["5:4", 5 / 4],
    ["3:4", 3 / 4], ["4:3", 4 / 3], ["2:3", 2 / 3], ["3:2", 3 / 2], ["21:9", 21 / 9],
  ];
  let best = options[0];
  for (const o of options) if (Math.abs(o[1] - aspect) < Math.abs(best[1] - aspect)) best = o;
  return best[0];
}

function costCents(provider: string, quality: string): number {
  const override = Number(process.env.IMAGE_COST_CENTS || 0);
  if (override > 0) return override;
  switch (provider) {
    case "openai":
      return quality === "high" ? 16 : quality === "low" ? 2 : 5;
    case "gemini":
      return 4;
    case "fal":
      return 3;
    case "replicate":
      return 3;
    case "stability":
      return 3;
    default:
      return 4;
  }
}

async function fromUrl(url: string): Promise<{ bytes: Buffer; mime: string }> {
  const res = await request(url, { method: "GET" });
  if (!res.ok) await fail(res);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type") || "image/png",
  };
}

export async function generateImage(args: GenerateArgs): Promise<GeneratedImage> {
  const status = providerStatus();
  if (!status.configured) {
    throw new ProviderError(
      status.missing.length
        ? `Image generation provider is not configured. Missing: ${status.missing.join(", ")}`
        : "Image generation provider is not configured.",
      false,
    );
  }
  const provider = status.id as ProviderId;
  const model = args.model || status.model;
  const quality = args.quality || ((process.env.IMAGE_QUALITY as GenerateArgs["quality"]) ?? "medium");
  const prompt = args.prompt.slice(0, 4000);

  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY!;
    const res = await request("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: sizeForOpenAI(args.aspect),
        quality,
        output_format: "jpeg",
      }),
    });
    if (!res.ok) await fail(res);
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string; revised_prompt?: string }[] };
    const item = json.data?.[0];
    if (!item) throw new ProviderError("OpenAI returned no image data", true);
    const bytes = item.b64_json
      ? Buffer.from(item.b64_json, "base64")
      : (await fromUrl(item.url!)).bytes;
    return { bytes, mime: "image/jpeg", model, provider, costCents: costCents(provider, quality), revisedPrompt: item.revised_prompt };
  }

  if (provider === "gemini") {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY!;
    const body = (withImageConfig: boolean) => ({
      contents: [{ role: "user", parts: [{ text: `${prompt}${args.negativePrompt ? `\n\nAvoid: ${args.negativePrompt}` : ""}` }] }],
      generationConfig: withImageConfig
        ? { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: ratioLabel(args.aspect) } }
        : { responseModalities: ["IMAGE"] },
    });
    const call = async (withImageConfig: boolean) =>
      request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(withImageConfig)),
      });
    let res = await call(true);
    if (res.status === 400) res = await call(false);
    if (!res.ok) await fail(res);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
    };
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part?.inlineData?.data) throw new ProviderError("Gemini returned no inline image data", true);
    return {
      bytes: Buffer.from(part.inlineData.data, "base64"),
      mime: part.inlineData.mimeType || "image/png",
      model,
      provider,
      costCents: costCents(provider, quality),
    };
  }

  if (provider === "fal") {
    const key = process.env.FAL_KEY || process.env.FAL_API_KEY!;
    const res = await request(`https://fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image_size: pixelSize(args.aspect),
        num_images: 1,
        enable_safety_checker: false,
        seed: args.seed,
      }),
    });
    if (!res.ok) await fail(res);
    const json = (await res.json()) as { images?: { url?: string; content_type?: string }[] };
    const url = json.images?.[0]?.url;
    if (!url) throw new ProviderError("fal returned no image URL", true);
    const img = await fromUrl(url);
    return { bytes: img.bytes, mime: img.mime, model, provider, costCents: costCents(provider, quality), seed: args.seed };
  }

  if (provider === "replicate") {
    const key = process.env.REPLICATE_API_TOKEN!;
    const res = await request(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "wait=90" },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: ratioLabel(args.aspect),
          output_format: "jpg",
          num_outputs: 1,
          ...(args.seed ? { seed: args.seed } : {}),
        },
      }),
    });
    if (!res.ok) await fail(res);
    let json = (await res.json()) as { output?: string | string[]; status?: string; urls?: { get?: string }; error?: string };
    // Poll if the prediction is still running after the wait window.
    for (let i = 0; i < 40 && json.status && ["starting", "processing"].includes(json.status); i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const poll = await request(json.urls?.get || "", { headers: { Authorization: `Bearer ${key}` } });
      if (!poll.ok) await fail(poll);
      json = (await poll.json()) as typeof json;
    }
    if (json.error) throw new ProviderError(`Replicate failed: ${json.error}`, true);
    const out = Array.isArray(json.output) ? json.output[0] : json.output;
    if (!out) throw new ProviderError("Replicate returned no output", true);
    const img = await fromUrl(out);
    return { bytes: img.bytes, mime: img.mime, model, provider, costCents: costCents(provider, quality) };
  }

  // stability
  const key = process.env.STABILITY_API_KEY!;
  const form = new FormData();
  form.append("prompt", prompt);
  if (args.negativePrompt) form.append("negative_prompt", args.negativePrompt.slice(0, 1000));
  form.append("aspect_ratio", ratioLabel(args.aspect));
  form.append("output_format", "webp");
  form.append("mode", "text-to-image");
  const endpoint = model === "core" ? "core" : "sd3";
  const res = await request(`https://api.stability.ai/v2beta/stable-image/generate/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, Accept: "image/*" },
    body: form as unknown as BodyInit,
  });
  if (!res.ok) await fail(res);
  return {
    bytes: Buffer.from(await res.arrayBuffer()),
    mime: res.headers.get("content-type") || "image/webp",
    model,
    provider,
    costCents: costCents(provider, quality),
  };
}
