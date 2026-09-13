import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

// Run the actual server implementation in isolation. Only TanStack's RPC registration
// is stubbed; requests, prompts, parsers, deadlines and fallback loops are unchanged.
export function loadAIServer(
  name,
  {
    env = {},
    fetch: request = globalThis.fetch,
    logger = console,
    timers = {},
    internals = [],
  } = {},
) {
  const filename = new URL(`../src/lib/${name}.functions.ts`, import.meta.url);
  const behaviorFilename = new URL("../src/lib/neko-behavior-profile.ts", import.meta.url);
  const behaviorModule = {};
  const behaviorOutput = ts.transpileModule(readFileSync(behaviorFilename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(
    behaviorOutput,
    { exports: behaviorModule },
    { filename: behaviorFilename.pathname },
  );
  const source = readFileSync(filename, "utf8") + `\nexport { ${internals.join(", ")} };\n`;
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (id) =>
        id === "@tanstack/react-start"
          ? { createServerFn: () => ({ inputValidator: () => ({ handler: (fn) => fn }) }) }
          : id === "@/lib/neko-behavior-profile"
            ? behaviorModule
            : require(id),
      process: { env, cwd: () => "/__neko_test_no_env_file__" },
      fetch: request,
      console: logger,
      URL,
      AbortController,
      Error,
      Response,
      setTimeout,
      clearTimeout,
      ...timers,
    },
    { filename: filename.pathname },
  );
  return exports;
}
