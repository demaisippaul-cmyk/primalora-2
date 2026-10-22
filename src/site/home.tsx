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
          <Image src={IMG.model} alt="Woman wearing Primalora pearl earrings and pendant" width={900} height={900} className="hero-model" priority />
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-inner wrap">
            <div className="hero-copy">
              <h1>Quiet light,<br />worn close.</h1>
              <p>Fine jewelry shaped by light, texture and form. Made for everyday and extraordinary moments.</p>
              <Link to="/shop" className="text-link light">Shop now</Link>
            </div>
            <div className="hero-grid">
              <Image src={IMG.pendant} alt="Dark stone pendant with diamond halo" width={640} height={640} className="hg-a" />
              <Image src={IMG.cluster} alt="Cluster necklace of round stones" width={640} height={640} className="hg-b" />
              <Image src={IMG.pearl} alt="Pearl pendant and earrings set" width={640} height={640} className="hg-c" />
            </div>
          </div>
        </section>

        <section className="craft wrap">
          <Image src={IMG.pearl} alt="Close view of a pearl pendant" width={800} height={800} className="craft-img" />
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

        <section className="strip" aria-label="Before it’s gone">
          <div className="wrap strip-inner">
            <h2>Curated means limited.</h2>
            <p>We’d rather offer a few pieces worth wearing for years than a hundred you’ll forget. If one is calling to you, don’t wait for “later.”</p>
          </div>
        </section>

        <section className="gift wrap">
          <div>
            <h2>Give something she’ll keep.</h2>
            <p>Wrapped in quiet elegance, ready to become someone’s favorite thing.</p>
          </div>
          <Image src={IMG.pearl} alt="Pearl pendant and earrings set" width={640} height={640} className="gift-img" />
        </section>

        <section id="contacts" className="contact wrap">
          <div className="contact-card">
            <div>
              <h2>Let’s talk.</h2>
              <p>Questions, custom thoughts or feedback? We read every message.</p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
    </Chrome>
  );
}
