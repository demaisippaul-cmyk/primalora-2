// Ordinary editable browser code; no dependencies, remote calls, or submission service. A page starts these helpers from a
// useEffect once it is mounted, and what this returns stops them.
export function startFoundation(): () => void {
  const dialogTriggers = new WeakMap<HTMLDialogElement, HTMLElement>();
  const mobile = matchMedia("(max-width: 48rem)");
  const menuButtons = () => [...document.querySelectorAll<HTMLElement>("[data-menu-toggle][aria-controls]")];
  // A menu that mounts after the helpers start, as a page whose route loads later does, is set up as it appears, and a menu
  // already set up keeps its state while the rest of the page renders.
  const setUp = new WeakSet<HTMLElement>();
  function setMenu(button: HTMLElement, expanded: boolean): boolean {
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    if (!panel) return false;
    button.setAttribute("aria-expanded", String(expanded));
    panel.hidden = mobile.matches && !expanded;
    return true;
  }
  function resetMenus() {
    for (const button of menuButtons()) if (setMenu(button, !mobile.matches)) setUp.add(button);
  }
  function setUpMenus() {
    for (const button of menuButtons()) if (!setUp.has(button) && setMenu(button, !mobile.matches)) setUp.add(button);
  }
  function click(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;
    const openButton = event.target.closest<HTMLElement>("[data-dialog-open]");
    if (openButton) {
      const dialog = document.getElementById(openButton.dataset.dialogOpen ?? "");
      if (dialog instanceof HTMLDialogElement && !dialog.open) {
        dialogTriggers.set(dialog, openButton);
        dialog.showModal();
      }
    }
    const closeButton = event.target.closest("[data-dialog-close]");
    if (closeButton) closeButton.closest("dialog")?.close();
    const menuButton = event.target.closest<HTMLElement>("[data-menu-toggle][aria-controls]");
    if (menuButton) setMenu(menuButton, menuButton.getAttribute("aria-expanded") !== "true");
    if (mobile.matches && event.target.closest("[data-menu-panel] a")) {
      for (const button of menuButtons()) setMenu(button, false);
    }
    if (event.target instanceof HTMLDialogElement && event.target.open) {
      const rect = event.target.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close();
    }
  }
  function close(event: Event) {
    if (!(event.target instanceof HTMLDialogElement)) return;
    const trigger = dialogTriggers.get(event.target);
    if (trigger?.isConnected) trigger.focus();
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || !mobile.matches || document.querySelector("dialog[open]")) return;
    const expanded = menuButtons().find((button) => button.getAttribute("aria-expanded") === "true");
    if (expanded) {
      setMenu(expanded, false);
      expanded.focus();
    }
  }
  function submit(event: SubmitEvent) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-demo-form]")) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    let status = form.querySelector<HTMLElement>("[data-demo-status]");
    if (!status) {
      status = document.createElement("p");
      status.dataset.demoStatus = "";
      form.append(status);
    }
    status.setAttribute("role", "status");
    status.tabIndex = -1;
    status.hidden = false;
    status.textContent = "Thanks! We’ll be in touch soon.";
    status.focus();
  }
  const mounted = new MutationObserver(setUpMenus);
  resetMenus();
  mounted.observe(document.body, { childList: true, subtree: true });
  mobile.addEventListener("change", resetMenus);
  document.addEventListener("click", click);
  document.addEventListener("close", close, true);
  document.addEventListener("keydown", keydown);
  document.addEventListener("submit", submit);
  return () => {
    mounted.disconnect();
    mobile.removeEventListener("change", resetMenus);
    document.removeEventListener("click", click);
    document.removeEventListener("close", close, true);
    document.removeEventListener("keydown", keydown);
    document.removeEventListener("submit", submit);
  };
}
