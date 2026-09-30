import { importWorkflowResults } from "./import-evidence-artifacts.mjs";

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const runId = valueOf("--run");
if (!runId) {
  process.stderr.write("Pass --run <workflow-run-id>.\n");
  process.exit(2);
}

try {
  const records = importWorkflowResults(runId);
  process.stdout.write(
    `imported ${records.length} producer-bound job conclusions from run ${runId}\n`,
  );
} catch (error) {
  process.stderr.write(`Workflow evidence import failed: ${error.message}\n`);
  process.exitCode = 1;
}
