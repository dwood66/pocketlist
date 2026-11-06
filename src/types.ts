// Shared types — one source of truth for the app's shapes.
// In a backend+frontend app these would live in `shared/contract/` and be
// imported by BOTH sides so a renamed field is a compile error, not a bug
// (see ../ARCHITECTURE.md #1). This is a single-page app, so they live here
// and are imported everywhere.

export type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
};

// What an AI command resolves to. A discriminated union means every consumer
// must handle every case (the reducer gets exhaustiveness checking for free).
export type AiAction =
  | { kind: "add"; title: string }
  | { kind: "complete"; id: string }
  | { kind: "reopen"; id: string }
  | { kind: "toggle"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "clearDone" }
  | { kind: "none"; reason: string };

// ---------------------------------------------------------------------------
// Guards
//
// Types are erased at build time. Anything arriving from outside the bundle —
// a fetch response, a localStorage string, a URL param — is genuinely `unknown`
// however the signature describes it. These narrow it once, at the boundary,
// so every consumer downstream can take the contract at its word.
// ---------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isTask(v: unknown): v is Task {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.done === "boolean" &&
    typeof v.createdAt === "number"
  );
}

export function isAiAction(v: unknown): v is AiAction {
  if (!isObject(v)) return false;
  switch (v.kind) {
    case "add":
      return typeof v.title === "string" && v.title.trim() !== "";
    case "complete":
    case "reopen":
    case "toggle":
    case "delete":
      return typeof v.id === "string";
    case "clearDone":
      return true;
    case "none":
      return typeof v.reason === "string";
    default:
      return false;
  }
}
