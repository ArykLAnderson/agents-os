import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (file, args) => new Promise((resolve, reject) => execFile(file, args, { cwd: root, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stdout, stderr })) : resolve(stdout)));

export async function packageSteward() {
  const destination = path.join(root, "dist");
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const packed = JSON.parse(await run(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", destination]));
  const filename = packed?.[0]?.filename;
  if (typeof filename !== "string" || path.basename(filename) !== filename) throw Error("steward_package_assembly_invalid");
  return path.join(destination, filename);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageSteward().then((archive) => process.stdout.write(`${archive}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  });
}
