import { execFile } from "child_process";
import { mkdtemp, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { z } from "zod";

/**
 * Terugval zonder ANTHROPIC_API_KEY: de Claude Code-CLI (`claude -p`) op het Claude-abonnement van de pc.
 * Alleen bedoeld voor lokaal ontwikkelen en testen; op Vercel bestaat de CLI niet en is de API-sleutel verplicht.
 * Gestructureerde uitvoer via --json-schema; een bestand (bon) gaat als tijdelijk bestand mee dat Claude met Read leest.
 */

export function cliBeschikbaar(): boolean {
  return (process.env.SALDOPLAN_AI_VIA_CLI ?? process.env.ZELFBOEK_AI_VIA_CLI) !== "0" && process.platform !== "linux" && !process.env.VERCEL;
}

function run(args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const kind = execFile("claude", args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`Claude CLI mislukt: ${stderr?.toString().slice(0, 300) || err.message}`));
      resolve(stdout.toString());
    });
    kind.stdin?.end(stdin);
  });
}

export async function viaClaudeCli<T>(opties: {
  schema: z.ZodType<T>;
  systeem: string;
  prompt: string;
  model: string;
  bestand?: { data: Buffer; mimeType: string };
  timeoutMs?: number;
}): Promise<T> {
  // Claude Code accepteert geen $schema-sleutel (draft 2020-12), dus die laten we weg.
  const { $schema: _weg, ...kaal } = z.toJSONSchema(opties.schema) as Record<string, unknown>;
  void _weg;
  const jsonSchema = JSON.stringify(kaal);
  let map: string | null = null;
  let prompt = opties.prompt;
  const args = ["-p", "--output-format", "json", "--json-schema", jsonSchema, "--model", opties.model, "--no-session-persistence", "--system-prompt", opties.systeem];
  try {
    if (opties.bestand) {
      map = await mkdtemp(path.join(os.tmpdir(), "saldoplan-bon-"));
      const ext = opties.bestand.mimeType === "application/pdf" ? "pdf" : opties.bestand.mimeType.split("/")[1] || "jpg";
      const pad = path.join(map, `bon.${ext}`);
      await writeFile(pad, opties.bestand.data);
      prompt = `Lees eerst het bestand ${pad} met de Read-tool. ${prompt}`;
      args.push("--tools", "Read", "--allowedTools", "Read", "--max-turns", "4");
    } else {
      args.push("--tools", "", "--max-turns", "1");
    }
    const uit = await run(args, prompt, opties.timeoutMs ?? 240_000);
    let j: { structured_output?: unknown; result?: string; is_error?: boolean; subtype?: string };
    try { j = JSON.parse(uit); } catch { throw new Error(`Claude CLI gaf geen JSON: ${uit.slice(0, 200)}`); }
    if (j.is_error) throw new Error(`Claude CLI fout: ${j.result ?? j.subtype}`);
    const ruw = j.structured_output ?? (j.result ? JSON.parse(j.result) : null);
    return opties.schema.parse(ruw);
  } finally {
    if (map) await rm(map, { recursive: true, force: true }).catch(() => undefined);
  }
}
