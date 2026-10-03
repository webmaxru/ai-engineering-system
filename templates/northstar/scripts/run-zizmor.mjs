import { scanWorkflows } from "./check-sarif.mjs";

const report = scanWorkflows();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = report.exitCode || 1;
