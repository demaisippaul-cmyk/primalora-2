import { Link } from "@tanstack/react-router";
import { Image } from "../image";
import { Chrome, IMG } from "./chrome";
import { ContactForm } from "./contact-form";

const feels = [
  ["Effortless.", "It goes with the white shirt and the quiet Tuesday. It goes with the dress and the big night. You put it on and you’re done."],
  ["Noticed, never loud.", "People won’t ask what you’re wearing. They’ll ask where you found it."],
  ["Yours, privately.", "Some jewelry is for being seen. This is for the feeling of knowing it’s there."],
];

export function Home() {
  return (
    <Chrome>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Quiet light,<br />worn close.</h1>
            <p>Fine jewelry shaped by light, texture and form. Made for everyday and extraordinary moments.</p>
            <Link to="/shop" className="btn">Shop now</Link>
          </div>
          <div className="hero-frame">
            <Image src={IMG.model} alt="Woman wearing Primalora pearl earrings and pendant" width={900} height={1125} priority />
          </div>
        </section>

        <section className="block">
          <div className="block-text">
            <h2>Editorial Gallery</h2>
            <p>A closer look at the moments that define our world — where light, texture and form become art.</p>
          </div>
          <div className="ed-grid">
            <Image src={IMG.pearl} alt="Pearl pendant and earrings set" width={800} height={1000} className="ed-tall" />
            <Image src={IMG.pendant} alt="Dark stone pendant with diamond halo" width={640} height={480} />
            <Image src={IMG.cluster} alt="Cluster necklace of round stones" width={640} height={480} />
          </div>
        </section>

        <section className="craft">
          <Image src={IMG.model} alt="Model wearing Primalora jewelry" width={800} height={1000} className="craft-img" />
          <div>
            <h2>Thoughtful materials.<br />Refined details.</h2>
            <p>Every Primalora piece is considered down to the finish: the curve of a setting, the luster of a pearl, the way a stone sits against skin. Nothing is rushed or excessive. Only what earns its place.</p>
          </div>
        </section>

        <section className="feels wrap" aria-labelledby="feels-h">
          <h2 id="feels-h">How it feels.</h2>
          <div className="feels-grid">
            {feels.map(([h, b]) => (
              <article key={h}>
                <h3>{h}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="block">
          <div className="block-text">
            <h2>Collection Preview</h2>
            <p>A curated selection of pieces, crafted for your everyday and your extraordinary moments.</p>
          </div>
          <div className="col-frame">
            <Image src={IMG.pearl} alt="Pearl pendant from the collection" width={900} height={420} />
            <Link to="/shop" className="col-tile">
              <span>The collection</span>
              <svg width="48" height="12" viewBox="0 0 48 12" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true"><path d="M0 6h47M41 1l6 5-6 5" /></svg>
            </Link>
          </div>
        </section>

        <section className="strip" aria-label="Before it’s gone">
          <div className="wrap strip-inner">
            <h2>Curated means limited.</h2>
            <p>We’d rather offer a few pieces worth wearing for years than a hundred you’ll forget. If one is calling to you, don’t wait for “later.”</p>
          </div>
        </section>

        <section id="about" className="about">
          <div>
            <h2>About Us</h2>
            <p>Primalora exists for those who see beauty in the details — for those who value craftsmanship, meaning and lasting elegance.</p>
          </div>
          <Image src={IMG.cluster} alt="Cluster necklace of round stones" width={800} height={800} className="about-img" />
        </section>

        <section className="gift wrap">
          <div>
            <h2>Give something she’ll keep.</h2>
            <p>Wrapped in quiet elegance, ready to become someone’s favorite thing.</p>
          </div>
          <Image src={IMG.pearl} alt="Pearl pendant and earrings set" width={640} height={640} className="gift-img" />
        </section>

        <section id="faqs" className="block">
          <div className="block-text">
            <h2>FAQs</h2>
            <p>Find answers to common questions about our collections, materials, care and more.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>Where can I browse the collection?</summary>
              <p>Every Primalora piece is presented in the <Link to="/shop">Shop</Link>.</p>
            </details>
            <details>
              <summary>How do I ask about a piece?</summary>
              <p>Write to us through the <a href="#contacts">Contacts</a> section — we’re glad to help with questions about collections, materials and care.</p>
            </details>
          </div>
        </section>

        <section id="contacts" className="contact">
          <Image src={IMG.pendant} alt="Dark stone pendant with diamond halo" width={960} height={600} className="contact-img" />
          <div>
            <h2>Let’s talk.</h2>
            <p className="contact-body">Questions, custom thoughts or feedback? We read every message.</p>
            <ContactForm />
          </div>
        </section>
      </main>
    </Chrome>
  );
}
