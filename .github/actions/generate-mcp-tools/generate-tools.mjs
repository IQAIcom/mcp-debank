import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const README_PATH = path.join(ROOT, "README.md");
const TOOLS_FILE = path.join(ROOT, "src", "tools", "index.ts");

const START = "<!-- AUTO-GENERATED TOOLS START -->";
const END = "<!-- AUTO-GENERATED TOOLS END -->";

/**
 * Parse tools from TypeScript source
 * This avoids complex module import issues
 */
function parseToolsFromSource() {
	const content = fs.readFileSync(TOOLS_FILE, "utf8");

	// Find the debankTools array content
	const toolsArrayMatch = content.match(
		/export const debankTools = \[([\s\S]*?)\] as const;/,
	);
	if (!toolsArrayMatch) {
		console.warn("Could not find debankTools array");
		return [];
	}

	const toolsArrayContent = toolsArrayMatch[1];
	const tools = [];

	// Split by tool objects using brace matching
	let depth = 0;
	let toolStart = -1;
	let inString = false;
	let stringChar = null;
	let i = 0;

	while (i < toolsArrayContent.length) {
		const char = toolsArrayContent[i];
		const prevChar = i > 0 ? toolsArrayContent[i - 1] : "";

		// Handle escape sequences
		if (prevChar === "\\" && inString) {
			i++;
			continue;
		}

		// Handle string boundaries
		if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
			if (!inString) {
				inString = true;
				stringChar = char;
			} else if (char === stringChar) {
				inString = false;
				stringChar = null;
			}
			i++;
			continue;
		}

		if (inString) {
			i++;
			continue;
		}

		if (char === "{") {
			if (depth === 0) {
				toolStart = i;
			}
			depth++;
		} else if (char === "}") {
			depth--;
			if (depth === 0 && toolStart !== -1) {
				const toolContent = toolsArrayContent.slice(toolStart, i + 1);
				const parsed = parseToolObject(toolContent);
				if (parsed) {
					tools.push(parsed);
				}
				toolStart = -1;
			}
		}
		i++;
	}

	return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse a single tool object string
 */
function parseToolObject(content) {
	// Extract name
	const nameMatch = content.match(/name:\s*"([^"]+)"/);
	if (!nameMatch) return null;
	const name = nameMatch[1];

	// Extract description - handle multi-line strings
	const descMatch = content.match(
		/description:\s*(?:`([^`]*)`|"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/s,
	);
	if (!descMatch) return null;
	const description = (descMatch[1] || descMatch[2] || descMatch[3] || "")
		.replace(/\\n/g, " ")
		.replace(/\\"/g, '"')
		.replace(/\s+/g, " ")
		.trim();

	// Find the parameters: z.object({...}) block
	const paramsStartMatch = content.match(/parameters:\s*z\.object\(\{/);
	if (!paramsStartMatch) {
		return { name, description, parameters: [] };
	}

	const paramsStartIdx = paramsStartMatch.index + paramsStartMatch[0].length;

	// Find matching closing brace
	let depth = 1;
	let idx = paramsStartIdx;
	while (idx < content.length && depth > 0) {
		const char = content[idx];
		if (char === "{") depth++;
		else if (char === "}") depth--;
		idx++;
	}

	const paramsContent = content.slice(paramsStartIdx, idx - 1);
	const params = parseZodParams(paramsContent);

	return { name, description, parameters: params };
}

/**
 * Parse Zod parameters from the object content
 */
function parseZodParams(content) {
	const params = [];

	// Match each parameter: name: z.type()... pattern
	// Need to handle multi-line definitions with method chaining
	const paramRegex =
		/(\w+):\s*z\s*\.\s*(\w+)\s*\(\s*\)([\s\S]*?)(?=(?:\w+:\s*z\s*\.)|$)/g;

	let match = paramRegex.exec(content);
	while (match !== null) {
		const [, paramName, zodType, chainedMethods] = match;

		// Skip internal parameters
		if (paramName.startsWith("_")) {
			match = paramRegex.exec(content);
			continue;
		}

		// Check if optional
		const isOptional =
			chainedMethods.includes(".optional()") ||
			chainedMethods.includes(". optional()");

		// Extract description from .describe("...") or .describe(`...`)
		let description = "";
		const descMatch = chainedMethods.match(
			/\.describe\s*\(\s*(?:`([^`]*)`|"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\.)*)')\s*(?:,|\))/s,
		);
		if (descMatch) {
			description = (descMatch[1] || descMatch[2] || descMatch[3] || "")
				.replace(/\\n/g, " ")
				.replace(/\\"/g, '"')
				.replace(/\s+/g, " ")
				.trim();
		}

		params.push({
			name: paramName,
			type: zodType,
			required: !isOptional,
			description,
		});

		match = paramRegex.exec(content);
	}

	return params;
}

function renderSchema(params) {
	if (!params || params.length === 0) {
		return "_No parameters_";
	}

	// Build table header
	let table =
		"| Parameter | Type | Required | Description |\n|-----------|------|----------|-------------|\n";

	// Build table rows
	for (const param of params) {
		const requiredStr = param.required ? "✅" : "";
		table += `| \`${param.name}\` | ${param.type} | ${requiredStr} | ${param.description} |\n`;
	}

	return table.trim();
}

function renderMarkdown(tools) {
	let md = "";

	for (const tool of tools) {
		md += `### \`${tool.name}\`\n`;
		md += `${tool.description}\n\n`;
		md += `${renderSchema(tool.parameters)}\n\n`;
	}

	return md.trim();
}

function updateReadme({ readme, tools }) {
	if (!readme.includes(START) || !readme.includes(END)) {
		throw new Error("README missing AUTO-GENERATED TOOLS markers");
	}

	const toolsMd = renderMarkdown(tools);

	return readme.replace(
		new RegExp(`${START}[\\s\\S]*?${END}`, "m"),
		`${START}\n\n${toolsMd}\n\n${END}`,
	);
}

async function main() {
	try {
		const readme = fs.readFileSync(README_PATH, "utf8");
		const tools = parseToolsFromSource();

		if (tools.length === 0) {
			console.warn("Warning: No tools found!");
		}

		const updated = updateReadme({ readme, tools });

		fs.writeFileSync(README_PATH, updated);
		console.log(`Synced ${tools.length} MCP tools to README.md`);
	} catch (error) {
		console.error("Error updating README:", error);
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
