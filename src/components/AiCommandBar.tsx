import { useState } from "react";
import { Sparkles } from "lucide-react";
import { interpret } from "@/lib/ai";
import type { AiAction, Task } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AiCommandBar({ tasks, onAction }: { tasks: Task[]; onAction: (a: AiAction) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    const input = value.trim();
    if (!input) return;
    setBusy(true);
    setMessage("");
    try {
      const action = await interpret(input, tasks);
      onAction(action);
      // `none` is the union's way of reporting "understood nothing." Show the
      // reason and keep the text so it can be edited into something that
      // works; an emptied box reads as success and hides the miss.
      if (action.kind === "none") setMessage(action.reason);
      else setValue("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="ai" className="text-sm font-medium">Tell the app what to do</label>
      <div className="flex gap-2">
        <Input
          id="ai"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          placeholder={'e.g. "add ship my portfolio" or "complete groceries"'}
          disabled={busy}
          aria-describedby="ai-hint"
          aria-invalid={message ? true : undefined}
        />
        <Button onClick={run} disabled={busy} className="shrink-0">
          <Sparkles className="h-4 w-4" />
          {busy ? "Thinking…" : "Do it"}
        </Button>
      </div>
      {/* aria-live so a screen reader hears the miss; the element is always in
          the DOM because live regions inserted at announce time get skipped. */}
      <p role="status" aria-live="polite" className="min-h-0 text-xs text-muted-foreground empty:hidden">
        {message}
      </p>
      <p id="ai-hint" className="text-xs text-muted-foreground">
        Natural language becomes a typed action the app performs. Wire a real LLM in <code>src/lib/ai.ts</code>.
      </p>
    </div>
  );
}
