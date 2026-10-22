import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../lib/backend";

type State = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState("");
  useEffect(() => setReady(true), []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const message = String(data.get("message") ?? "").trim();
    if (!name || !email || !message) return setErr("Please fill in your name, email and message.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr("Please enter a valid email address.");
    if ([...message].length > 5000) return setErr("Please keep your message under 5000 characters.");
    setState("sending");
    setError("");
    const { error: dbError } = await supabase.from("enquiries").insert({ name, email, message });
    if (dbError) return setErr("Sorry, your message could not be sent. Please try again.");
    form.reset();
    setState("sent");
  }
  function setErr(msg: string) {
    setError(msg);
    setState("error");
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate data-ready={ready ? "true" : "false"}>
      <div className="field">
        <label htmlFor="c-name">Name <span aria-hidden="true">*</span></label>
        <input id="c-name" name="name" required maxLength={200} placeholder="Your name" disabled={!ready} />
      </div>
      <div className="field">
        <label htmlFor="c-email">Email <span aria-hidden="true">*</span></label>
        <input id="c-email" name="email" type="email" required maxLength={320} placeholder="you@example.com" disabled={!ready} />
      </div>
      <div className="field full">
        <label htmlFor="c-message">Message <span aria-hidden="true">*</span></label>
        <textarea id="c-message" name="message" required rows={4} placeholder="How can we help you?" disabled={!ready} />
      </div>
      <button className="send full" type="submit" disabled={!ready || state === "sending"}>
        {state === "sending" ? "Sending…" : "Send message"}
      </button>
      <p className={`form-status full ${state}`} role="status" aria-live="polite">
        {state === "sent" ? "Thank you. Your message has been received." : state === "error" ? error : ""}
      </p>
    </form>
  );
}
