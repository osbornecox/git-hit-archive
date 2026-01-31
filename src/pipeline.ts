/**
 * git-hit-archive Pipeline
 * Unified orchestrator for all steps
 *
 * Usage:
 *   npm run build-archive           # Run full pipeline
 *   npm run build-archive:dry       # Skip LLM and embeddings
 *
 * Flags:
 *   --skip-llm      Skip scoring and enrichment (steps 3-4)
 *   --skip-embed    Skip embeddings (step 5)
 *   --step=N        Run only step N (1-6)
 */

import { loadEnv } from "./env";
import { posts } from "./db";

loadEnv();

// Import steps
import { runImport } from "./steps/1-import";
import { runFetch } from "./steps/2-fetch";
import { runScore } from "./steps/3-score";
import { runEnrich } from "./steps/4-enrich";
import { runEmbed } from "./steps/5-embed";
import { runExport } from "./steps/6-export";

interface PipelineOptions {
	skipLlm: boolean;
	skipEmbed: boolean;
	stepOnly: number | null;
	fetchDays: number;
}

function parseArgs(): PipelineOptions {
	const args = process.argv.slice(2);

	const options: PipelineOptions = {
		skipLlm: args.includes("--skip-llm"),
		skipEmbed: args.includes("--skip-embed"),
		stepOnly: null,
		fetchDays: 365,
	};

	const stepArg = args.find(a => a.startsWith("--step="));
	if (stepArg) {
		options.stepOnly = parseInt(stepArg.split("=")[1]);
	}

	const daysArg = args.find(a => a.startsWith("--days="));
	if (daysArg) {
		options.fetchDays = parseInt(daysArg.split("=")[1]) || 365;
	}

	return options;
}

async function main(): Promise<void> {
	const options = parseArgs();
	const startTime = Date.now();

	console.log("=".repeat(50));
	console.log("git-hit-archive Pipeline");
	console.log("=".repeat(50));

	if (options.skipLlm) console.log("  --skip-llm: Skipping scoring and enrichment");
	if (options.skipEmbed) console.log("  --skip-embed: Skipping embeddings");
	if (options.stepOnly) console.log(`  --step=${options.stepOnly}: Running only step ${options.stepOnly}`);
	if (options.fetchDays !== 365) console.log(`  --days=${options.fetchDays}: Fetching last ${options.fetchDays} days`);

	const results: Record<string, any> = {};

	try {
		// Step 1: Import
		if (!options.stepOnly || options.stepOnly === 1) {
			results.import = await runImport();
		}

		// Step 2: Fetch
		if (!options.stepOnly || options.stepOnly === 2) {
			results.fetch = await runFetch({ totalDays: options.fetchDays });
		}

		// Step 3: Score
		if (!options.stepOnly || options.stepOnly === 3) {
			if (options.skipLlm) {
				console.log("\n[3/6] Scoring SKIPPED (--skip-llm)");
				results.score = { scored: 0, skipped: true };
			} else {
				results.score = await runScore();
			}
		}

		// Step 4: Enrich
		if (!options.stepOnly || options.stepOnly === 4) {
			if (options.skipLlm) {
				console.log("\n[4/6] Enrichment SKIPPED (--skip-llm)");
				results.enrich = { enriched: 0, skipped: true };
			} else {
				results.enrich = await runEnrich();
			}
		}

		// Step 5: Embed
		if (!options.stepOnly || options.stepOnly === 5) {
			if (options.skipEmbed || options.skipLlm) {
				console.log("\n[5/6] Embeddings SKIPPED (--skip-embed)");
				results.embed = { embedded: 0, skipped: true };
			} else {
				results.embed = await runEmbed();
			}
		}

		// Step 6: Export
		if (!options.stepOnly || options.stepOnly === 6) {
			results.export = await runExport();
		}

		// Summary
		const duration = ((Date.now() - startTime) / 1000).toFixed(1);
		console.log("\n" + "=".repeat(50));
		console.log("PIPELINE COMPLETE");
		console.log("=".repeat(50));
		console.log(`Duration: ${duration}s`);
		console.log("\nResults:");
		console.log(JSON.stringify(results, null, 2));

		// Final stats
		const stats = posts.getStats();
		console.log("\nDatabase stats:");
		console.log(`  Total posts: ${stats.total}`);
		console.log(`  Scored: ${stats.scored}`);
		console.log(`  Enriched: ${stats.enriched}`);
		console.log(`  Embedded: ${stats.embedded}`);

	} catch (error) {
		console.error("\nPipeline failed:", error);
		process.exit(1);
	} finally {
		posts.close();
	}
}

main();
