import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import "../foundation.css";
import "../styles.css";

// Link previews read the Open Graph and X tags below; og:title and og:description repeat the page's own title and description.
const title = "Primalora — Quiet light, worn close.";
const description = "Fine jewelry shaped by light, texture and form. Made for everyday and extraordinary moments.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { name: "author", content: "Foundable" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@joinfoundable" },
    ],
    links: [
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..900;1,6..96,400..900&family=Jost:ital,wght@0,300..700;1,300..700&display=swap" },
      { rel: "icon", href: "/generated-assets/9b04f10d403456a5dc17495d1e558b3c412862e34be805faae06e263a2668920.png", type: "image/png" },
    ],
  }),
  component: WebsiteDocument,
  notFoundComponent: () => (
    <main className="not-found">
      <h1>Page not found</h1>
      <Link to="/">Return home</Link>
    </main>
  ),
});

function WebsiteDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
