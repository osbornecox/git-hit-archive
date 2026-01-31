import * as fs from "fs";
import * as path from "path";

/**
 * Loads environment variables from .env file in the current working directory.
 * Does not override existing environment variables.
 */
export function loadEnv(): void {
	const envPath = path.join(process.cwd(), ".env");
	if (!fs.existsSync(envPath)) return;

	const envContent = fs.readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const eqIndex = trimmed.indexOf("=");
		if (eqIndex === -1) continue;

		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		if (key && !process.env[key]) {
			process.env[key] = value;
		}
	}
}
