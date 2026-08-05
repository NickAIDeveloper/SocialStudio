'use client';

import { useEffect, useState } from 'react';
import { renderAnswerRow, type AnswerTable } from '@/lib/analytics/answer-render';

interface Answer {
  answered: boolean;
  question?: string;
  label?: string;
  message?: string;
  rows?: Array<Record<string, unknown>>;
  canAnswer?: Array<{ id: string; label: string }>;
}

function ResultTable({ table }: { table: AnswerTable }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-(--line)">
      {table.caption && (
        <div className="border-b border-(--line) px-3 py-2 text-xs font-medium text-(--muted)">
          {table.caption}
        </div>
      )}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-(--line)">
            {table.columns.map((c) => (
              <th key={c} className="px-3 py-2 text-xs font-medium text-(--muted)">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i} className="border-b border-(--line) last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-(--txt)">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AskPanel() {
  const [suggestions, setSuggestions] = useState<Array<{ id: string; label: string }>>([]);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/analytics/ask')
      .then((r) => (r.ok ? r.json() : { questions: [] }))
      .then((d) => setSuggestions(d.questions ?? []))
      .catch(() => setSuggestions([]));
  }, []);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setQuery(q);
    try {
      const res = await fetch('/api/analytics/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      setAnswer(await res.json());
    } catch (e) {
      setAnswer({ answered: false, message: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
        <form
          onSubmit={(e) => { e.preventDefault(); ask(query); }}
          className="flex gap-2"
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about your data — e.g. why did reach drop last week?"
            className="flex-1 rounded-lg border border-(--line) bg-(--bg) px-3 py-2 text-sm text-(--txt) placeholder:text-(--muted-2) focus:border-(--violet) focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="rounded-lg bg-(--violet) hover:bg-(--violet-bright) disabled:bg-(--surface-2) disabled:text-(--muted-2) text-(--txt) text-sm font-medium px-4 transition-colors"
          >
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </form>

        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => ask(s.label)}
                className="text-[11px] text-(--muted) border border-(--line) hover:border-(--violet) rounded-full px-2.5 py-1 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {answer && (
        <div className="rounded-2xl border border-(--line) bg-(--surface)/50 p-5">
          {!answer.answered ? (
            <div className="text-sm text-(--muted)">
              <div className="text-amber-300">{answer.message ?? "I can't answer that one yet."}</div>
              <div className="mt-2 text-xs">
                Rather than guess at a different question, here is what I can answer — tap one above.
              </div>
            </div>
          ) : (
            <>
              <div className="text-sm font-medium text-(--txt)">{answer.label}</div>
              {(answer.rows ?? []).length === 0 ? (
                <div className="mt-2 text-sm text-(--muted)">
                  Nothing to report on that yet. This answer is built from your own
                  published posts and ads, so it fills in once you have some. Try one
                  of the other questions above in the meantime.
                </div>
              ) : (
                <div className="mt-3 space-y-5">
                  {(answer.rows ?? []).map((row, i) => {
                    const rendered = renderAnswerRow(answer.question ?? '', row);
                    return (
                      <div key={i}>
                        {rendered.heading && (
                          <div className="text-xs font-medium uppercase tracking-wider text-(--muted)">
                            {rendered.heading}
                          </div>
                        )}
                        {rendered.sentences.map((s, j) => (
                          <p key={j} className="mt-1 text-sm text-(--txt)">
                            {s}
                          </p>
                        ))}
                        {rendered.tables.map((t, j) => (
                          <ResultTable key={j} table={t} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
