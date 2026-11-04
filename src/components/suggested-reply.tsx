"use client";

import { useState } from "react";

/** Suggested reply text, marked as agent-written inside the AI panel. */
export function SuggestedReply({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Suggested reply</h3>
        <button
          onClick={copy}
          className="rounded border border-violet-300 bg-white px-2 py-0.5 text-xs text-gray-700 hover:bg-violet-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded border border-violet-200 bg-white p-3 text-sm text-gray-700">{text}</p>
      <p className="mt-2 text-xs text-gray-500">Nothing is sent from here — copy it into your own email.</p>
    </div>
  );
}
