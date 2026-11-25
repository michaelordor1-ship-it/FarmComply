"use client";

import { useState } from "react";

export default function ShareReport({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const message = `${text}\n\nFull report: ${url}`;
  return (
    <div className="share-row">
      <a className="primary-btn wa-btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
        Share on WhatsApp
      </a>
      <button
        type="button"
        className="secondary-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? "Copied" : "Copy message"}
      </button>
    </div>
  );
}
