export type AgentEventKind =
  | "idea"
  | "queue"
  | "generate"
  | "publish"
  | "error"
  | "control"
  | "campaign"
  | "classify"
  | "system";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface Category {
  id: string;
  label: string;
  description: string;
  accent: string;
  target_share: number;
  is_emerging: number;
  parent_id: string | null;
  image_count: number;
  created_at: string;
}

export interface ImageRow {
  id: string;
  title: string;
  description: string;
  prompt: string;
  negative_prompt: string;
  category_id: string;
  aesthetic: string;
  medium: string;
  seed: number | null;
  palette_json: string;
  tags_json: string;
  width: number;
  height: number;
  aspect: number;
  ratio_label: string;
  storage_key: string;
  medium_key: string;
  thumb_key: string;
  original_url: string;
  blur_data: string;
  bytes: number;
  phash: string;
  avg_color: string;
  brightness: number;
  saturation: number;
  provider: string;
  model: string;
  cost_cents: number;
  status: string;
  source: string;
  job_id: string | null;
  campaign_id: string | null;
  batch_id: string | null;
  views: number;
  saves: number;
  trending_score: number;
  created_at: string;
  published_at: string;
}

export interface FeedImage {
  id: string;
  title: string;
  description: string;
  prompt: string;
  categoryId: string;
  categoryLabel: string;
  categoryAccent: string;
  aesthetic: string;
  medium: string;
  tags: string[];
  palette: string[];
  width: number;
  height: number;
  aspect: number;
  ratioLabel: string;
  urls: { full: string; medium: string; thumb: string };
  blurData: string;
  avgColor: string;
  provider: string;
  model: string;
  source: string;
  saves: number;
  views: number;
  trendingScore: number;
  createdAt: string;
  publishedAt: string;
  saved: boolean;
  collections: { id: string; name: string }[];
}

export interface GenerationJob {
  id: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  category_id: string | null;
  brief: string;
  idea_json: string;
  prompt: string;
  negative_prompt: string;
  aspect: number;
  provider: string;
  model: string;
  campaign_id: string | null;
  batch_id: string | null;
  image_id: string | null;
  error: string | null;
  cost_cents: number;
  duration_ms: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Campaign {
  id: string;
  title: string;
  direction: string;
  categories_json: string;
  target_count: number;
  completed_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  finished_at: string | null;
}

export interface AgentEvent {
  id: string;
  kind: AgentEventKind;
  level: "info" | "warn" | "error" | "success";
  message: string;
  meta_json: string;
  created_at: string;
}

export interface Collection {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  accent: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
  preview?: string[];
}

export interface Idea {
  categoryId: string;
  subcategory: string;
  subject: string;
  medium: string;
  aesthetic: string;
  lighting: string;
  palette: { name: string; hex: string[] };
  composition: string;
  material: string;
  mood: string;
  details: string[];
  ratio: { label: string; w: number; h: number };
  prompt: string;
  negativePrompt: string;
  title: string;
  description: string;
  tags: string[];
  novelty: number;
  fingerprint: string;
}

export interface AgentStatus {
  runtime: "running" | "paused" | "awaiting_provider" | "idle";
  provider: {
    configured: boolean;
    id: string;
    label: string;
    model: string;
    missing: string[];
    supported: { id: string; label: string; env: string[]; models: string[] }[];
  };
  counts: {
    total: number;
    published: number;
    generating: number;
    queued: number;
    failed: number;
    saved: number;
    collections: number;
    today: number;
    lastHour: number;
    campaigns: number;
  };
  rate: { perHour: number; perDay: number; series: { t: string; n: number }[] };
  spend: { spentCents: number; budgetCents: number; costPerImageCents: number };
  settings: AgentSettings;
  categories: { id: string; label: string; accent: string; count: number; share: number; targetShare: number; isEmerging: boolean; priority: number }[];
  queue: GenerationJob[];
  recent: FeedImage[];
  events: AgentEvent[];
  campaigns: Campaign[];
  pausedReason?: string | null;
}

export interface AgentSettings {
  running: boolean;
  batchSize: number;
  frequencySeconds: number;
  budgetCents: number;
  concurrency: number;
  noveltyThreshold: number;
  priorityCategories: string[];
  allowEmerging: boolean;
  customDirection: string;
}
