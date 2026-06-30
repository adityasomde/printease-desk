import { spawn } from "node:child_process";

export function runCommand(command, args = [], { timeoutMs = 8000, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true, env: env || process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ success: false, code: null, stdout, stderr: `${stderr}\nTimed out`, command });
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ success: false, code: null, stdout, stderr: error.message, command });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, code, stdout, stderr, command });
    });
  });
}
