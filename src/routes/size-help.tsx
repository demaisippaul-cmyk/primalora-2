import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { startFoundation } from "../foundation";
import { Chrome } from "../site/chrome";

export const Route = createFileRoute("/size-help")({
  head: () => ({ meta: [{ title: "Size help — Primalora" }, { name: "description", content: "Simple ways to find a comfortable fit for Primalora rings and necklaces." }] }),
  component: SizeHelp,
});

function SizeHelp() {
  useEffect(() => startFoundation(), []);
  return (
    <Chrome>
      <main className="page wrap narrow">
        <header className="page-head">
          <h1>Size help.</h1>
          <p>A few simple ways to find a comfortable fit.</p>
        </header>
        <details>
          <summary>How do I find my ring size?</summary>
          <p>Wrap a strip of paper around the base of your finger, mark where it meets and measure the length. Measure at the end of the day, when fingers are slightly larger.</p>
        </details>
        <details>
          <summary>How do I choose a necklace length?</summary>
          <p>Lay a string around your neck where you’d like the piece to sit, then measure it end to end.</p>
        </details>
        <details>
          <summary>Still unsure?</summary>
          <p>Send us a message through the <a href="/#contacts">contact form</a> and we’ll help you find the right fit. We read every message.</p>
        </details>
      </main>
    </Chrome>
  );
}
