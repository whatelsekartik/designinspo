import "dotenv/config";
import { getDb } from "@/lib/db";
import { getCategories } from "@/lib/repo/images";
import { providerStatus } from "@/lib/agent/providers";

const db = getDb();
const cats = getCategories();
console.log(`✔ Schema ready — ${cats.length} categories in the taxonomy`);
console.log(`  Database: ${process.env.DATA_DIR || "./data"}/infinite.db`);
const counts = db.prepare("SELECT COUNT(*) AS n FROM images").get() as { n: number };
console.log(`  Images: ${counts.n}`);
const provider = providerStatus();
console.log(provider.configured ? `✔ Provider: ${provider.label} (${provider.model})` : `✖ Provider not configured — missing ${provider.missing.join(", ")}`);
