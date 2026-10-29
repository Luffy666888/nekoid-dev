import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

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
    random = Math.random,
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
  const questionnaireModule = {};
  const questionnaireFilename = new URL("../src/lib/persona-questionnaire.ts", import.meta.url);
  vm.runInNewContext(
    ts.transpileModule(readFileSync(questionnaireFilename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    { exports: questionnaireModule },
    { filename: questionnaireFilename.pathname },
  );
  const source = readFileSync(filename, "utf8") + `\nexport { ${internals.join(", ")} };\n`;
  const voiceAnalysisModule = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/voice-analysis.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: voiceAnalysisModule });
  const voiceStyleModule = {};
  const styleMath = Object.create(Math);
  styleMath.random = random;
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/voice-analysis-style.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports: voiceStyleModule,
    Math: styleMath,
    require: (id) => {
      if (id === "./voice-analysis") return voiceAnalysisModule;
      throw new Error(`Unexpected style import: ${id}`);
    },
  });
  const performanceModule = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/performance-trace.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports: performanceModule, console: logger, crypto: webcrypto, performance });
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
            : id === "@/lib/persona-questionnaire"
              ? questionnaireModule
              : id === "./performance-trace"
                ? performanceModule
                : id === "./voice-analysis"
                  ? voiceAnalysisModule
                  : id === "./voice-analysis-style"
                    ? voiceStyleModule
                    : require(id),
      process: { env, cwd: () => "/__neko_test_no_env_file__" },
      fetch: request,
      console: logger,
      URL,
      AbortController,
      Error,
      Response,
      TextEncoder,
      performance,
      crypto: webcrypto,
      setTimeout,
      clearTimeout,
      ...timers,
    },
    { filename: filename.pathname },
  );
  return exports;
}
