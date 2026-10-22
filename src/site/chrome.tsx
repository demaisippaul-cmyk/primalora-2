import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Image } from "../image";

export const LOGO = "/generated-assets/d02d5571bd1055e3a1b8db1e3879a8a173ac4d68b068e682f0452a02b96fc6ed.webp";
export const IMG = {
  model: "/generated-assets/77e09b5e628b39646e248329669724cdebe5cdc06eaf8bc8c2b380550e3ed1f0.webp",
  pendant: "/generated-assets/986effbfc0bcd854cc2290c0091930f8721bc6ce47766415f9a9cff090df2b9c.webp",
  cluster: "/generated-assets/4af1813dcc17da9cda4458ccaabf0fda5c410ff6fca6440ef62a2d23286cbf3f.webp",
  pearl: "/generated-assets/e21b83f73f442f771d6cdac24af8cb8e98a79e31f8f370330938450f5584a3a1.webp",
};

export function Chrome({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="announce">Now showing: the first Primalora collection. Pieces are curated, and favorites may not return.</p>
      <header className="site-header">
        <div className="wrap header-row">
          <Link to="/" className="brand" aria-label="Primalora home">
            <Image src={LOGO} alt="Primalora Jewelry" width={160} height={160} priority />
          </Link>
          <button type="button" className="menu-btn" data-menu-toggle aria-controls="site-menu" aria-expanded="false">
            <span className="visually-hidden">Menu</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          </button>
          <nav id="site-menu" className="nav" data-menu-panel aria-label="Main">
            <Link to="/shop">Shop</Link>
            <Link to="/size-help">Size Help</Link>
            <a href="/#contacts">Contact</a>
            <Link to="/shop" className="nav-cta">Shop now</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <Image src={LOGO} alt="Primalora Jewelry" width={150} height={150} className="footer-logo" />
          <p className="footer-line">Primalora. Quiet light, worn close.</p>
          <nav className="footer-nav" aria-label="Footer">
            <Link to="/shop">Shop</Link>
            <Link to="/size-help">Size Help</Link>
            <a href="/#contacts">Contact</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
