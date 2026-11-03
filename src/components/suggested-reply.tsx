"use client";

import { useState } from "react";

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
    <div className="rounded border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Suggested reply</h2>
        <button
          onClick={copy}
          className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-700">{text}</p>
      <p className="mt-2 text-xs text-gray-400">Nothing is sent from here — copy it into your own email.</p>
    </div>
  );
}
