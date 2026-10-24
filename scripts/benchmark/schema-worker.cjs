// Kept as plain CommonJS so native workers need no TypeScript loader or inherited hooks.
const { parentPort, workerData } = require("node:worker_threads");
const Ajv = require("ajv");

try {
  const ajv = new Ajv({
    strictSchema: true,
    strictTypes: false,
    allErrors: false,
    validateFormats: true,
    logger: false,
  });
  const validate = ajv.compile(JSON.parse(workerData.schema));
  if (validate.$async) parentPort.postMessage("unknown");
  else {
    const valid = validate(JSON.parse(workerData.data));
    parentPort.postMessage(
      valid === true ? "pass" : valid === false ? "fail" : "unknown",
    );
  }
} catch {
  parentPort.postMessage("unknown");
}
