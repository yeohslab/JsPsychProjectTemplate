import { disposeEditor, mountEditor } from "./editor/EditorView";
import { disposeRunner, mountRunner } from "./runner/RunnerView";

function route(): void {
  disposeEditor();
  disposeRunner();

  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = "";

  const raw = location.hash.replace(/^#/, "").split("?")[0] || "/editor";
  const path = raw.startsWith("/") ? raw : `/${raw}`;

  if (path === "/runner") {
    mountRunner(app);
  } else {
    mountEditor(app);
  }
}

export function initRouter(): void {
  window.addEventListener("hashchange", route);
  route();
}
