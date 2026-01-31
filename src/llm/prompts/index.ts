import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const promptCache: Map<string, string> = new Map();

/**
 * Loads a prompt template from the prompts directory.
 * Templates use Mustache-style placeholders: {{variable}}
 * The prompt body starts after the "---" separator (metadata header is skipped).
 */
export function loadPromptTemplate(name: string): string {
	if (promptCache.has(name)) {
		return promptCache.get(name)!;
	}

	const filePath = path.join(__dirname, `${name}.md`);
	const content = fs.readFileSync(filePath, "utf-8");

	// Extract prompt body after "---" separator (skip metadata header)
	const parts = content.split(/^---$/m);
	const promptBody = parts.length > 1 ? parts.slice(1).join("---").trim() : content.trim();

	promptCache.set(name, promptBody);
	return promptBody;
}
