import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { loadTrendDigestExamples } from "@/src/server/trend-digest-examples";
import { scoreTrendDigestText } from "@/src/server/trend-quality";

interface TrendEvalCliOptions {
  text: string | null;
  filePath: string | null;
  exampleId: string | null;
  outPath: string;
  json: boolean;
  help: boolean;
}

const HELP_TEXT = `Score trend-digest tweet quality with the dedicated rubric.

Usage:
  npm run eval:trend-quality -- --example ai-chaos-window
  npm run eval:trend-quality -- --file tmp/draft.txt
  x-media-analyst eval trend-quality --text "Do you understand what happened..."

Flags:
  --example <id>   Score one checked-in example by id.
  --file <path>    Read the candidate text from a file.
  --text <text>    Score the provided text directly.
  --out <path>     JSON report path. Default: tmp/trend-quality-eval.json
  --json           Print full JSON output.
  -h, --help       Show help.
`;

export function parseTrendEvalCliArgs(argv: string[]): TrendEvalCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      text: { type: "string" },
      file: { type: "string" },
      example: { type: "string" },
      out: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" }
    }
  });

  return {
    text: values.text?.trim() || null,
    filePath: values.file ? path.resolve(values.file) : null,
    exampleId: values.example?.trim() || null,
    outPath: path.resolve(values.out ?? path.join(process.cwd(), "tmp", "trend-quality-eval.json")),
    json: values.json ?? false,
    help: values.help ?? false
  };
}

function resolveInputText(options: TrendEvalCliOptions): { source: string; text: string } {
  if (options.text) {
    return {
      source: "inline_text",
      text: options.text
    };
  }

  if (options.filePath) {
    return {
      source: options.filePath,
      text: fs.readFileSync(options.filePath, "utf8").trim()
    };
  }

  if (options.exampleId) {
    const example = loadTrendDigestExamples().find((item) => item.id === options.exampleId);
    if (!example) {
      throw new Error(`Unknown trend example "${options.exampleId}".`);
    }

    return {
      source: `example:${example.id}`,
      text: example.tweetText
    };
  }

  const examples = loadTrendDigestExamples();
  if (examples.length === 0) {
    throw new Error("No checked-in trend examples were found.");
  }

  return {
    source: "example-set",
    text: examples.map((example) => `# ${example.id}\n${example.tweetText}`).join("\n\n")
  };
}

function buildDefaultExampleReport() {
  return loadTrendDigestExamples().map((example) => ({
    id: example.id,
    title: example.title,
    whyItWorks: example.whyItWorks,
    summary: scoreTrendDigestText(example.tweetText)
  }));
}

async function main(argv: string[]): Promise<void> {
  const options = parseTrendEvalCliArgs(argv);

  if (options.help) {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  const payload =
    !options.text && !options.filePath && !options.exampleId
      ? {
          generatedAt: new Date().toISOString(),
          mode: "example_set",
          results: buildDefaultExampleReport()
        }
      : (() => {
          const input = resolveInputText(options);
          return {
            generatedAt: new Date().toISOString(),
            mode: "single",
            source: input.source,
            text: input.text,
            summary: scoreTrendDigestText(input.text)
          };
        })();

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, `${JSON.stringify(payload, null, 2)}\n`);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

const entryScriptPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (entryScriptPath && import.meta.url === entryScriptPath) {
  void main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
