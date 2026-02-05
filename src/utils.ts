export function hashStringToInt(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		hash = (hash << 5) - hash + str.charCodeAt(i);
		hash |= 0;
	}
	return hash;
}

export function truncateWithoutBreakingWords(str: string, n: number): string {
	str = str.replace(/\n/g, " ");
	str = str.replace(/\[(.*?)\]\((.*?)\)/g, "$1");

	if (str.length <= n) return str;

	const firstSentenceEnd = str.indexOf(".");
	const firstSentence = firstSentenceEnd === -1 ? str : str.slice(0, firstSentenceEnd + 1);

	if (firstSentence.length <= n) return firstSentence;

	const truncatedStr = firstSentence.substr(0, n);
	const lastSpaceIndex = truncatedStr.lastIndexOf(" ");

	return lastSpaceIndex === -1 ? truncatedStr + "..." : truncatedStr.substr(0, lastSpaceIndex) + "...";
}

export function base36ToInt(str: string): string {
	let result = BigInt(0);
	for (const char of str) {
		const digit = parseInt(char, 36);
		result = result * BigInt(36) + BigInt(digit);
	}
	return result.toString();
}

export function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
