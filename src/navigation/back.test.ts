import { describe, expect, it, vi } from "vitest";

import { goBackOrReplace } from "./back";

function routerWithHistory(canGoBack: boolean) {
  return {
    back: vi.fn(),
    canGoBack: vi.fn(() => canGoBack),
    replace: vi.fn(),
  };
}

describe("goBackOrReplace", () => {
  it("uses the existing navigation history when back can be handled", () => {
    const router = routerWithHistory(true);

    goBackOrReplace(router, "/");

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("replaces with the fallback when the current route is the stack root", () => {
    const router = routerWithHistory(false);

    goBackOrReplace(router, "/");

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/");
  });
});
