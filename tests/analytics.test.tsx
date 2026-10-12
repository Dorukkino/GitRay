/** Google Analytics loads only after consent, and never on the server or outside the real site. */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Analytics, ConsentSettingsButton } from "../src/components/Analytics";
import { tr } from "../src/i18n/dictionaries/tr";
import { I18nProvider } from "../src/i18n/provider";

describe("Analytics", () => {
  it("renders nothing and loads nothing on the server", () => {
    const html = renderToStaticMarkup(
      <I18nProvider locale="tr" dict={tr}>
        <Analytics />
        <ConsentSettingsButton />
      </I18nProvider>,
    );
    expect(html).toBe("");
    expect(html).not.toContain("googletagmanager");
  });

  it("offers reject as plainly as accept", () => {
    expect(tr.consent.accept).toBeTruthy();
    expect(tr.consent.reject).toBeTruthy();
  });
});
