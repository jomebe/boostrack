import type { Controls } from "./engine/vehicle.ts";

export class Input {
  readonly keys = new Set<string>();
  onAction: (key: string) => void = () => {};
  constructor() {
    window.addEventListener("keydown", (e) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.onAction(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    document
      .querySelectorAll<HTMLButtonElement>("[data-key]")
      .forEach((button) => {
        const key = button.dataset.key!;
        button.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          button.setPointerCapture(e.pointerId);
          this.keys.add(key);
        });
        for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
          button.addEventListener(name, () => this.keys.delete(key));
      });
  }
  read(): Controls {
    const has = (...keys: string[]) => keys.some((k) => this.keys.has(k));
    return {
      throttle:
        Number(has("KeyW", "ArrowUp")) - Number(has("KeyS", "ArrowDown")),
      steer:
        Number(has("KeyA", "ArrowLeft")) - Number(has("KeyD", "ArrowRight")),
      brake: has("Space"),
    };
  }
}
