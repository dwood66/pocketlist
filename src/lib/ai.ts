import { isAiAction, type AiAction, type Task } from "@/types";

// Turn a natural-language command into a typed action over the current tasks.
// It tries a real backend first (which holds the LLM key — never ship keys to
// the browser, see ARCHITECTURE.md #2), then falls back to a local heuristic so
// the demo runs anywhere with no server. Replace the fallback with the server
// call once you deploy the backend (see HANDOFF-CLAUDE-CODE.md).
export async function interpret(input: string, tasks: Task[]): Promise<AiAction> {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, tasks }),
    });
    if (res.ok) {
      // A model returns text, and text can be the wrong shape, a `kind` the
      // app has never heard of, or prose where JSON belongs. The guard is what
      // makes this function's return type honest — the boundary is the one
      // place a Promise<AiAction> can be checked rather than merely declared.
      const data: unknown = await res.json();
      if (isAiAction(data)) return data;
    }
  } catch (_) {
    // No backend yet — fall through to the offline stand-in.
  }
  return localInterpret(input, tasks);
}

// A tiny offline stand-in for the model so the demo works with zero setup.
function localInterpret(input: string, tasks: Task[]): AiAction {
  const t = input.trim().toLowerCase();
  if (!t) return { kind: "none", reason: "Type a command to get started." };

  if (/(clear|remove|delete)\b.*\b(done|complete|completed|finished)\b/.test(t)) return { kind: "clearDone" };

  const find = (re: RegExp) =>
    re.test(t) ? tasks.find((task) => t.includes(task.title.toLowerCase())) : undefined;

  // Negations first, whole words only. "uncheck" contains "check" and "not
  // done" contains "done", so with substring matching the order of these tests
  // decides the answer rather than the user's intent.
  const reopen = find(/\b(reopen|undo|uncheck|not done|unfinish)\b/);
  if (reopen) return { kind: "reopen", id: reopen.id };

  const done = find(/\b(complete|completed|done|finish|finished|check|mark)\b/);
  if (done) return { kind: "complete", id: done.id };

  const del = find(/\b(delete|remove|drop)\b/);
  if (del) return { kind: "delete", id: del.id };

  const add = t.match(/^(?:add|new|create)\s+(.+)/);
  if (add) return { kind: "add", title: capitalize(add[1]) };

  // A question is the user talking TO the app rather than handing it work.
  // Without this test the catch-all below files "what can you do?" as a task.
  if (/^(what|who|when|where|why|how|can|could|do|does|is|are)\b/.test(t) || t.endsWith("?")) {
    return { kind: "none", reason: `I can add, complete, reopen and delete tasks — I couldn't turn "${input.trim()}" into one of those.` };
  }

  // Default: treat the whole phrase as a new task.
  return { kind: "add", title: capitalize(input.trim()) };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
