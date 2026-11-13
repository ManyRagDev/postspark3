import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import dotenv from "dotenv";

const execFileAsync = promisify(execFile);
let fileEnv = {};
try {
  fileEnv = dotenv.parse(readFileSync(".env"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const setting = name => process.env[name] ?? fileEnv[name];
const tunnelOnly = process.argv[2] === "--tunnel-only";
const useVpsWorker = tunnelOnly || setting("POSTSPARK_DEV_VPS_TUNNEL") === "true";
const sshHost = setting("POSTSPARK_DEV_VPS_SSH_HOST") || "postspark-vps";
const container = setting("POSTSPARK_DEV_VPS_WORKER_CONTAINER") || "platform-app-trial-postspark-worker-1";
const network = setting("POSTSPARK_DEV_VPS_WORKER_NETWORK") || "platform-app-trial_app-private";
const sshOptions = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8"];

if (useVpsWorker && (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(sshHost) ||
  !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) ||
  !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(network))) {
  throw new Error("Configuração inválida do túnel privado da VPS.");
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

function createTunnel(port) {
  let stopped = false;
  let connecting = false;
  let ssh;
  let retry;
  let attempts = 0;

  function retryLater() {
    if (stopped || retry) return;
    const ms = [1000, 2000, 5000, 10000, 30000][Math.min(attempts++, 4)];
    retry = setTimeout(() => { retry = undefined; void connect(); }, ms);
  }

  async function connect() {
    if (stopped || connecting || ssh) return;
    connecting = true;
    let candidate;
    try {
      // Docker networks are inspected on the VPS; the worker is never published
      // to the internet. Re-resolve the address whenever SSH reconnects.
      const command = `docker inspect --format '{{json .NetworkSettings.Networks}}' ${container}`;
      const { stdout } = await execFileAsync("ssh", [...sshOptions, sshHost, command], {
        timeout: 10000, maxBuffer: 65536,
      });
      if (stopped) return;
      const address = JSON.parse(stdout)?.[network]?.IPAddress;
      if (net.isIP(address) !== 4) throw new Error("worker sem endereço na rede privada");
      candidate = spawn("ssh", [
        ...sshOptions, "-o", "ExitOnForwardFailure=yes",
        "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
        "-N", "-L", `127.0.0.1:${port}:${address}:9465`, sshHost,
      ], { stdio: ["ignore", "ignore", "inherit"] });
      ssh = candidate;
      let spawnError;
      candidate.once("error", error => { spawnError = error; });
      candidate.once("exit", () => {
        if (ssh === candidate) ssh = undefined;
        if (!stopped) {
          console.warn("[dev] Túnel da VPS interrompido; tentando reconectar.");
          retryLater();
        }
      });
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (spawnError || candidate.exitCode !== null || candidate.signalCode !== null)
          throw spawnError ?? new Error("SSH encerrou antes de abrir o túnel");
        if (await portIsOpen(port)) {
          attempts = 0;
          console.log("[dev] Túnel privado para o worker da VPS conectado.");
          return;
        }
        await delay(150);
      }
      throw new Error("tempo esgotado ao abrir o túnel SSH");
    } catch (error) {
      if (candidate && ssh === candidate) {
        ssh = undefined;
        candidate.kill("SIGTERM");
      }
      if (!stopped) {
        console.warn(`[dev] Worker da VPS indisponível: ${error.message}. Tentaremos reconectar.`);
        retryLater();
      }
    } finally {
      connecting = false;
    }
  }

  return {
    connect,
    close() {
      stopped = true;
      if (retry) clearTimeout(retry);
      if (ssh) ssh.kill("SIGTERM");
    },
  };
}

if (tunnelOnly) {
  const port = Number(process.argv[3]);
  const watchPid = Number(process.argv[4]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !Number.isInteger(watchPid) || watchPid < 1)
    throw new Error("Uso: node scripts/dev.mjs --tunnel-only <porta> <pid>");
  const tunnel = createTunnel(port);
  const monitor = setInterval(() => {
    try { process.kill(watchPid, 0); }
    catch { clearInterval(monitor); tunnel.close(); }
  }, 3000);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
    clearInterval(monitor);
    tunnel.close();
  });
  await tunnel.connect();
} else {
  const port = useVpsWorker ? await freePort() : undefined;
  const tunnel = port ? createTunnel(port) : undefined;
  if (tunnel) await tunnel.connect();
  const child = spawn("cross-env", ["NODE_ENV=development", "tsx", "watch", "server/_core/index.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(port ? {
        GENERATION_WORKER_MODE: "external",
        GENERATION_LOCAL_DEMAND_ENABLED: "false",
        GENERATION_WORKER_READINESS_URL: `http://127.0.0.1:${port}/readyz`,
      } : {}),
    },
  });
  let stopping = false;
  function stop(signal) {
    if (stopping) return;
    stopping = true;
    tunnel?.close();
    if (signal) child.kill(signal);
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop(signal));
  child.once("error", error => { console.error("[dev]", error.message); stop(); process.exitCode = 1; });
  child.once("exit", (code, signal) => { stop(); process.exitCode = code ?? (signal ? 1 : 0); });
}
