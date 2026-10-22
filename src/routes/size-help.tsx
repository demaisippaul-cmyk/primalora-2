import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { startFoundation } from "../foundation";
import { Chrome } from "../site/chrome";

export const Route = createFileRoute("/size-help")({
  head: () => ({ meta: [{ title: "Size help — Primalora" }, { name: "description", content: "A thoughtful fit starts with the right measurement." }] }),
  component: SizeHelp,
});

function SizeHelp() {
  useEffect(() => startFoundation(), []);
  return (
    <Chrome>
      <main className="page wrap narrow prose">
        <header className="page-head">
          <p className="eyebrow">Size help</p>
          <h1>Find your ring fit</h1>
          <p>A thoughtful fit starts with the right measurement.</p>
        </header>
        <h2>Measuring, step by step</h2>
        <ol>
          <li>Choose the exact finger, and the hand, where you will wear the ring. Fingers differ in size, so measure the one that matters.</li>
          <li>Have your finger measured by a jeweler using finger gauges, or use a purpose-made ring sizer. Check that the size slides over your knuckle and then sits comfortably at the base of the finger.</li>
          <li>Write down both the size and the sizing system it belongs to. Different countries use different scales, so a number on its own can be misleading.</li>
          <li>Before ordering, compare your measurement with the sizing information given for the particular ring you have in mind.</li>
        </ol>
        <h2>Already have a ring that fits?</h2>
        <p>Bring a ring that you wear on that same finger and hand to a jeweler. They can measure it on a ring mandrel to find its size. Wide bands deserve extra attention: they tend to feel snugger than narrow ones, so make sure the fit is checked with the width in mind.</p>
        <h2>Why not paper or string?</h2>
        <p>Paper and string can stretch, tear or crease as you wrap them, and they only measure around the base of the finger, missing whether the ring will pass over your knuckle. The result is often inaccurate.</p>
        <h2>Questions</h2>
        <h3>Can I use the size from my other hand?</h3>
        <p>It is best not to assume both hands are the same size. Measure the hand and finger where you intend to wear the ring.</p>
        <h3>Is every ring resized easily?</h3>
        <p>No. Some settings and styles are difficult to resize, so do not assume resizing will be possible later.</p>
        <p className="further">
          <a className="text-link" href="https://4cs.gia.edu/en-us/blog/how-to-determine-ring-size-tips-and-ring-size-chart/" target="_blank" rel="noopener noreferrer">Further reading: GIA ring sizing guide</a>
        </p>
      </main>
    </Chrome>
  );
}
