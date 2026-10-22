import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { startFoundation } from "../foundation";
import { Image } from "../image";
import { Chrome, IMG } from "../site/chrome";

export const Route = createFileRoute("/shop")({
  head: () => ({ meta: [{ title: "Shop — Primalora" }, { name: "description", content: "Now showing: the first Primalora collection. Pieces are curated, and favorites may not return." }] }),
  component: Shop,
});

const photos = [
  [IMG.model, "Model wearing Primalora pearl jewelry"],
  [IMG.pendant, "Dark stone pendant with diamond halo"],
  [IMG.cluster, "Cluster necklace of round stones"],
  [IMG.pearl, "Pearl pendant and earrings set"],
];

function Shop() {
  useEffect(() => startFoundation(), []);
  return (
    <Chrome>
      <main className="page wrap">
        <header className="page-head">
          <h1>The first Primalora collection.</h1>
          <p>Pieces are curated, and favorites may not return. We’d rather offer a few pieces worth wearing for years than a hundred you’ll forget.</p>
          <a href="/#contacts" className="text-link">Enquire about a piece</a>
        </header>
        <div className="gallery">
          {photos.map(([src, alt]) => (
            <Image key={src} src={src} alt={alt} width={640} height={640} />
          ))}
        </div>
      </main>
    </Chrome>
  );
}
