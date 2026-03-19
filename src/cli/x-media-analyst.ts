import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

type CommandHandler = (args: string[]) => Promise<number>;

interface CommandNode {
  summary: string;
  handler?: CommandHandler;
  children?: Record<string, CommandNode>;
}

const cliFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(cliFilePath), "..", "..");

function write(text: string): void {
  process.stdout.write(text);
}

function writeError(text: string): void {
  process.stderr.write(text);
}

function spawnWithRepoRoot(command: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        X_TREND_PROJECT_ROOT: repoRoot
      },
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

function runNpmScript(scriptName: string, extraArgs: string[] = []): Promise<number> {
  return spawnWithRepoRoot("npm", ["run", scriptName, ...(extraArgs.length > 0 ? ["--", ...extraArgs] : [])]);
}

function runTsCli(scriptName: string, extraArgs: string[] = []): Promise<number> {
  return spawnWithRepoRoot(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "cli", scriptName), ...extraArgs]);
}

const ROOT_HELP = `x-media-analyst

Agent-friendly CLI for the local X media index. This command resolves the repo root from the installed binary,
so it works from any current directory after linking or installing the package.

Usage:
  x-media-analyst <noun> <verb> [args...]

Core commands:
  x-media-analyst search facets --query "<query>" [--facet <name>] [--media-kind <kind[,kind]>] [--all] [--limit <n>] [--format json|jsonl]
  x-media-analyst search tweets [--query "<query>"] [--filter all|with_media|without_media] [--page <n>] [--limit <n>] [--format json|jsonl]
  x-media-analyst search topics --query "<query>" [--limit <n>] [--format json|jsonl]
  x-media-analyst facet list [--format json|jsonl]
  x-media-analyst crawl x-api
  x-media-analyst crawl openclaw
  x-media-analyst crawl timeline
  x-media-analyst capture x-api-timeline
  x-media-analyst capture x-api-tweet
  x-media-analyst capture x-api-tweet-and-compose-replies
  x-media-analyst capture openclaw-current
  x-media-analyst capture openclaw-current-tweet
  x-media-analyst capture openclaw-current-tweet-and-compose-replies
  x-media-analyst analyze missing
  x-media-analyst analyze tweet -- <tweetId> <mediaIndex>
  x-media-analyst eval compose-quality [--case reply|topic|media|all]
  x-media-analyst eval trend-quality [--example <id>|--file <path>|--text <text>]
  x-media-analyst eval search-quality [--fixture <id>]
  x-media-analyst media rebuild
  x-media-analyst media backfill-native-types
  x-media-analyst wishlist list
  x-media-analyst wishlist status --key <key> --status collected
  x-media-analyst wishlist import --key <key>
  x-media-analyst run scheduler
  x-media-analyst run stack
  x-media-analyst app dev
  x-media-analyst app start

Utility commands:
  x-media-analyst build
  x-media-analyst check
  x-media-analyst lint
  x-media-analyst test unit|integration|e2e
  x-media-analyst repo root

Examples:
  x-media-analyst facet list
  x-media-analyst search facets --query "reaction image" --video-only
  x-media-analyst search tweets --filter with_media --page 2
  x-media-analyst search topics --query "OpenAI pricing backlash"
  x-media-analyst wishlist list --status pending
  x-media-analyst wishlist import --key scooby-doo-mask-reveal
  x-media-analyst app dev
  x-media-analyst run stack

Install for use from anywhere:
  npm link

Exit codes:
  0  Success
  2  Usage error
  3  Unknown command
`;

const commands: Record<string, CommandNode> = {
  search: {
    summary: "Search saved analyses and related retrieval indexes.",
    children: {
      facets: {
        summary: "Search usage-analysis facets with structured output.",
        handler: (args) => runTsCli("search-facets.ts", args)
      },
      tweets: {
        summary: "List captured tweets with filtering and pagination.",
        handler: (args) => runTsCli("search-tweets.ts", args)
      },
      topics: {
        summary: "Search topic analyses with opinion and topic-level signals.",
        handler: (args) => runTsCli("search-topics.ts", args)
      }
    }
  },
  facet: {
    summary: "Inspect analysis facet metadata.",
    children: {
      list: {
        summary: "List facet names, value types, and descriptions.",
        handler: (args) => runTsCli("search-facets.ts", ["--list-facets", ...args])
      }
    }
  },
  crawl: {
    summary: "Run capture crawls against X sources.",
    children: {
      "x-api": {
        summary: "Run the X API home-timeline crawl.",
        handler: (args) => runTsCli("crawl-x-api.ts", args)
      },
      openclaw: {
        summary: "Legacy alias for the X API home-timeline crawl.",
        handler: (args) => runTsCli("crawl-x-api.ts", args)
      },
      timeline: {
        summary: "Run the Playwright timeline crawl.",
        handler: (args) => runTsCli("crawl-timeline.ts", args)
      }
    }
  },
  capture: {
    summary: "Run one-off capture commands.",
    children: {
      "x-api-timeline": {
        summary: "Run a bounded X API timeline capture.",
        handler: (args) => runTsCli("capture-x-api-timeline.ts", args)
      },
      "priority-accounts": {
        summary: "Check watched accounts for new posts and save them through the normal capture pipeline.",
        handler: (args) => runTsCli("capture-priority-accounts.ts", args)
      },
      "x-api-tweet": {
        summary: "Look up one tweet by status URL and persist its assets.",
        handler: (args) => runTsCli("capture-x-api-tweet.ts", args)
      },
      "x-api-tweet-and-compose-replies": {
        summary: "Look up one tweet by status URL, then draft replies for every reply goal.",
        handler: (args) => runTsCli("capture-x-api-tweet-and-compose-replies.ts", args)
      },
      "openclaw-current": {
        summary: "Legacy alias for the bounded X API timeline capture.",
        handler: (args) => runTsCli("capture-x-api-timeline.ts", args)
      },
      "openclaw-current-tweet": {
        summary: "Legacy alias for the focused X API tweet lookup.",
        handler: (args) => runTsCli("capture-x-api-tweet.ts", args)
      },
      "openclaw-current-tweet-and-compose-replies": {
        summary: "Legacy alias for the focused X API tweet lookup plus reply drafting.",
        handler: (args) => runTsCli("capture-x-api-tweet-and-compose-replies.ts", args)
      }
    }
  },
  analyze: {
    summary: "Run analysis jobs.",
    children: {
      missing: {
        summary: "Analyze saved usages that are still missing analyses.",
        handler: (args) => runTsCli("analyze-missing.ts", args)
      },
      tweet: {
        summary: "Analyze one tweet/media usage.",
        handler: (args) => runTsCli("analyze-tweet.ts", args)
      },
      "image-prompt": {
        summary: "Render or inspect the Gemini image prompt for a usage.",
        handler: (args) => runTsCli("analyze-image-prompt.ts", args)
      }
    }
  },
  eval: {
    summary: "Run local quality evals and other prompt checks.",
    children: {
      "compose-quality": {
        summary: "Run fixed compose-quality fixtures through Gemini CLI and score the output style.",
        handler: (args) => runTsCli("eval-compose-quality.ts", args)
      },
      "trend-quality": {
        summary: "Score trend-digest tweets against the stacked-breaking-news rubric.",
        handler: (args) => runTsCli("eval-trend-quality.ts", args)
      },
      "search-quality": {
        summary: "Run real-data search fixtures and score retrieval relevance.",
        handler: (args) => runTsCli("eval-search-quality.ts", args)
      }
    }
  },
  media: {
    summary: "Rebuild or backfill media-derived artifacts.",
    children: {
      rebuild: {
        summary: "Rebuild media asset indexes and summaries.",
        handler: (args) => runTsCli("rebuild-media-assets.ts", args)
      },
      "backfill-native-types": {
        summary: "Backfill native media file extensions for saved raw media.",
        handler: (args) => runTsCli("backfill-media-native-types.ts", args)
      }
    }
  },
  wishlist: {
    summary: "Inspect or update the reply asset wishlist.",
    children: {
      list: {
        summary: "List desired asset entries discovered by reply composition.",
        handler: (args) => runTsCli("reply-media-wishlist.ts", ["list", ...args])
      },
      status: {
        summary: "Update the status of one wishlist entry.",
        handler: (args) => runTsCli("reply-media-wishlist.ts", ["status", ...args])
      },
      import: {
        summary: "Find and import one wishlist asset entry with agent research.",
        handler: (args) => runTsCli("import-meme-template.ts", args)
      }
    }
  },
  run: {
    summary: "Run long-lived local services.",
    children: {
      scheduler: {
        summary: "Start the scheduler daemon.",
        handler: (args) => runTsCli("scheduler.ts", args)
      },
      stack: {
        summary: "Start the local stack supervisor.",
        handler: (args) => runTsCli("run-stack.ts", args)
      }
    }
  },
  app: {
    summary: "Control the Next.js app.",
    children: {
      dev: {
        summary: "Start the dev server on the default port.",
        handler: (args) => runNpmScript("dev", args)
      },
      start: {
        summary: "Start the production server on the default port.",
        handler: (args) => runNpmScript("start", args)
      }
    }
  },
  build: {
    summary: "Run the production build.",
    handler: (args) => runNpmScript("build", args)
  },
  check: {
    summary: "Run TypeScript checks.",
    handler: (args) => runNpmScript("check", args)
  },
  lint: {
    summary: "Run ESLint.",
    handler: (args) => runNpmScript("lint", args)
  },
  test: {
    summary: "Run test suites.",
    children: {
      unit: {
        summary: "Run unit tests.",
        handler: (args) => runNpmScript("test", args)
      },
      integration: {
        summary: "Run integration tests.",
        handler: (args) => runNpmScript("test:integration", args)
      },
      e2e: {
        summary: "Run end-to-end tests.",
        handler: (args) => runNpmScript("test:e2e", args)
      }
    }
  },
  repo: {
    summary: "Inspect repository paths used by the CLI.",
    children: {
      root: {
        summary: "Print the resolved repo root.",
        handler: async () => {
          write(`${repoRoot}\n`);
          return 0;
        }
      }
    }
  },
  help: {
    summary: "Show CLI help.",
    handler: async () => {
      write(`${ROOT_HELP}\n`);
      return 0;
    }
  }
};

function renderChildHelp(prefix: string, node: CommandNode): string {
  const lines = [`Usage: ${prefix} <verb> [args...]`, "", "Available commands:"];
  for (const [name, child] of Object.entries(node.children ?? {})) {
    lines.push(`  ${prefix} ${name}  ${child.summary}`);
  }
  return `${lines.join("\n")}\n`;
}

async function dispatch(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    write(`${ROOT_HELP}\n`);
    return 0;
  }

  const topLevel = commands[argv[0]];
  if (!topLevel) {
    writeError(`Unknown command "${argv[0]}".\n`);
    writeError('Run "x-media-analyst help" for usage.\n');
    return 3;
  }

  if (topLevel.handler && (argv.length === 1 || argv[1] === "--help" || argv[1] === "-h")) {
    return topLevel.handler(argv.slice(1));
  }

  if (topLevel.children) {
    if (argv.length === 1 || argv[1] === "--help" || argv[1] === "-h") {
      write(renderChildHelp(`x-media-analyst ${argv[0]}`, topLevel));
      return 0;
    }

    const child = topLevel.children[argv[1]];
    if (!child) {
      writeError(`Unknown subcommand "${argv[0]} ${argv[1]}".\n`);
      writeError(renderChildHelp(`x-media-analyst ${argv[0]}`, topLevel));
      return 3;
    }

    if (!child.handler) {
      writeError(`Command "${argv[0]} ${argv[1]}" is not executable.\n`);
      return 2;
    }

    return child.handler(argv.slice(2));
  }

  if (!topLevel.handler) {
    writeError(`Command "${argv[0]}" is not executable.\n`);
    return 2;
  }

  return topLevel.handler(argv.slice(1));
}

void dispatch(process.argv.slice(2))
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    writeError(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
