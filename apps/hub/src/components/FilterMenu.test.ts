import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import FilterMenu from "./FilterMenu.vue";

enableAutoUnmount(afterEach);

describe("FilterMenu keyboard navigation", () => {
  it("opens at either end, wraps, and returns focus on Escape", async () => {
    const wrapper = mount(FilterMenu, {
      attachTo: document.body,
      slots: {
        default:
          "<button>First</button><button disabled>Disabled</button><button>Last</button>",
      },
    });
    const summary = wrapper.get("summary");
    summary.element.focus();
    await summary.trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get<HTMLDetailsElement>("details").element.open).toBe(true);
    expect(document.activeElement?.textContent).toBe("Last");
    await wrapper.get("details").trigger("keydown", { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("First");
    await wrapper.get("details").trigger("keydown", { key: "Escape" });
    expect(wrapper.get<HTMLDetailsElement>("details").element.open).toBe(false);
    expect(document.activeElement).toBe(summary.element);
  });

  it("keeps input editing intact and dismisses on an outside pointer", async () => {
    const wrapper = mount(FilterMenu, {
      attachTo: document.body,
      slots: { default: "<input /><button>Apply</button>" },
    });
    wrapper.get<HTMLDetailsElement>("details").element.open = true;
    const input = wrapper.get("input");
    input.element.focus();
    await input.trigger("keydown", { key: "Home" });
    expect(document.activeElement).toBe(input.element);
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(wrapper.get<HTMLDetailsElement>("details").element.open).toBe(false);
  });
});
