import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Home } from "../site/home";
import { startFoundation } from "../foundation";

export const Route = createFileRoute("/")({ component: HomePage });

function HomePage() {
  // The foundation's dialog, menu and inquiry-form helpers (src/foundation.ts), started once this page is mounted.
  useEffect(() => startFoundation(), []);
  return <Home />;
}
