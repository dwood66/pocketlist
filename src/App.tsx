import { useEffect, useReducer } from "react";
import { AiCommandBar } from "@/components/AiCommandBar";
import { TaskList } from "@/components/TaskList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isTask, type AiAction, type Task } from "@/types";

const seed: Task[] = [
  { id: crypto.randomUUID(), title: "Get my portfolio online", done: false, createdAt: Date.now() },
  { id: crypto.randomUUID(), title: "Build one AI-native demo", done: false, createdAt: Date.now() },
];

// The reducer takes the SAME AiAction the AI produces. UI clicks and AI commands
// drive one code path — that's the pattern to show off.
function reducer(tasks: Task[], action: AiAction): Task[] {
  switch (action.kind) {
    case "add":
      return [{ id: crypto.randomUUID(), title: action.title, done: false, createdAt: Date.now() }, ...tasks];
    case "complete":
      return tasks.map((t) => (t.id === action.id ? { ...t, done: true } : t));
    case "reopen":
      return tasks.map((t) => (t.id === action.id ? { ...t, done: false } : t));
    case "toggle":
      return tasks.map((t) => (t.id === action.id ? { ...t, done: !t.done } : t));
    case "delete":
      return tasks.filter((t) => t.id !== action.id);
    case "clearDone":
      return tasks.filter((t) => !t.done);
    case "none":
      return tasks;
    default: {
      // Two guarantees, one for each side of the build.
      // Compile time: add a member to AiAction without a case above and this
      // assignment stops compiling, because only `never` is assignable to it.
      // Run time: the union describes what THIS build knows about. A model, a
      // newer server, or a stale tab can still send a kind it has never heard
      // of, and an unrecognised command should be a no-op, not a crash.
      const _exhaustive: never = action;
      void _exhaustive;
      return tasks;
    }
  }
}

// Startup state comes from outside the bundle, so it is validated rather than
// cast: a previous version's shape, a second tab, or a hand-edited devtools
// value all arrive through here. Anything that isn't a Task[] yields the seed,
// so a bad write can't wedge the app into a broken boot.
function load(): Task[] {
  try {
    const raw = localStorage.getItem("tasks");
    if (!raw) return seed;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(isTask)) return parsed;
  } catch (_) {
    // Malformed JSON — fall through to the seed rather than start up broken.
  }
  return seed;
}

export default function App() {
  const [tasks, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try { localStorage.setItem("tasks", JSON.stringify(tasks)); } catch (_) {}
  }, [tasks]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pocketlist</h1>
            <p className="text-sm text-muted-foreground">Who played with whom. Coming soon.</p>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex flex-col gap-6">
          <Card>
            <CardContent className="pt-6">
              <AiCommandBar tasks={tasks} onAction={dispatch} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskList
                tasks={tasks}
                onToggle={(id) => dispatch({ kind: "toggle", id })}
                onDelete={(id) => dispatch({ kind: "delete", id })}
              />
            </CardContent>
          </Card>
        </main>

        <footer className="text-center text-xs text-muted-foreground">
          Pocketlist · React · strict TypeScript · Tailwind v4 tokens · light/dark
        </footer>
      </div>
    </div>
  );
}
