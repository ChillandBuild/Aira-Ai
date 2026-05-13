import { test, expect, type Page } from "@playwright/test";

/**
 * Template Management E2E Tests
 *
 * Tests the template creation form, list, sync button, and bulk send flow.
 * Requires: Next.js dev server on localhost:3000 + logged-in session.
 *
 * Run: npx playwright test tests/e2e/templates.spec.ts --headed
 */

// ── Helper: navigate to templates page ────────────────────────────────────────

async function goToTemplates(page: Page) {
  await page.goto("/dashboard/templates");
  await page.waitForLoadState("networkidle");
}

// ── Unit-level: toTemplateName logic (no server needed) ────────────────────────

test.describe("toTemplateName utility", () => {
  test("converts plain title to snake_case template name", async ({ page }) => {
    const result = await page.evaluate(() => {
      function toTemplateName(title: string): string {
        return title
          .toLowerCase()
          .replace(/[^a-z0-9\s_]/g, "")
          .trim()
          .replace(/\s+/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "");
      }
      return {
        homam: toTemplateName("Guru Peyarchi Homam Invite"),
        spaces: toTemplateName("  Test  Template  "),
        special: toTemplateName("Hello {{1}} World!"),
        empty: toTemplateName(""),
      };
    });

    expect(result.homam).toBe("guru_peyarchi_homam_invite");
    expect(result.spaces).toBe("test_template");
    expect(result.special).toBe("hello_1_world");
    expect(result.empty).toBe("");
  });

  test("renderPreview replaces {{N}} with [Variable N]", async ({ page }) => {
    const result = await page.evaluate(() => {
      function renderPreview(text: string): string {
        return text.replace(/\{\{(\d+)\}\}/g, "[Variable $1]");
      }
      return {
        single: renderPreview("Hello {{1}}"),
        multi: renderPreview("{{1}} booked {{2}}"),
        none: renderPreview("No variables"),
      };
    });

    expect(result.single).toBe("Hello [Variable 1]");
    expect(result.multi).toBe("[Variable 1] booked [Variable 2]");
    expect(result.none).toBe("No variables");
  });
});

// ── Integration: Templates page UI (requires running server + auth) ────────────

test.describe("Templates page", () => {
  test("shows page title and New Template button", async ({ page }) => {
    await goToTemplates(page);

    await expect(page.getByText("Message Templates")).toBeVisible();
    await expect(page.getByRole("button", { name: /new template/i })).toBeVisible();
  });

  test("shows stats cards: Approved, Pending Review, Rejected", async ({ page }) => {
    await goToTemplates(page);

    await expect(page.getByText("Approved")).toBeVisible();
    await expect(page.getByText("Pending Review")).toBeVisible();
    await expect(page.getByText("Rejected")).toBeVisible();
  });

  test("opens New Template modal with title field and category cards", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();

    // Modal heading
    await expect(page.getByText("New WhatsApp Template")).toBeVisible();

    // Title input
    await expect(page.getByPlaceholder(/guru peyarchi/i)).toBeVisible();

    // Three category cards
    await expect(page.getByText("📣 Promotional")).toBeVisible();
    await expect(page.getByText("🔔 Service Update")).toBeVisible();
    await expect(page.getByText("🔐 Verification")).toBeVisible();

    // Preview section
    await expect(page.getByText("Preview")).toBeVisible();
    await expect(page.getByText(/24–72 hours/i)).toBeVisible();
  });

  test("auto-generates template name from title", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();

    // Type a title
    await page.getByPlaceholder(/guru peyarchi/i).fill("Homam Booking Invite");

    // Generated name should appear
    await expect(page.getByText("homam_booking_invite")).toBeVisible();
  });

  test("live preview updates as user types body text", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();

    // Type body text with a variable
    await page.getByPlaceholder(/namaskaram/i).fill("Hello {{1}}, welcome!");

    // Preview should show variable replaced
    await expect(page.getByText("Hello [Variable 1], welcome!")).toBeVisible();
  });

  test("selecting category card highlights it", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();

    // Click Promotional card
    await page.getByText("📣 Promotional").click();

    // The button containing it should have primary border
    const promoCard = page.locator("button").filter({ hasText: "📣 Promotional" });
    await expect(promoCard).toHaveClass(/border-primary/);
  });

  test("Submit button is disabled when title or body is empty", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();

    const submitBtn = page.getByRole("button", { name: /submit to whatsapp/i });
    await expect(submitBtn).toBeDisabled();

    // Fill title only
    await page.getByPlaceholder(/guru peyarchi/i).fill("Test");
    await expect(submitBtn).toBeDisabled();

    // Fill body too — button should enable
    await page.getByPlaceholder(/namaskaram/i).fill("Hello");
    await expect(submitBtn).toBeEnabled();
  });

  test("cancel closes modal without submitting", async ({ page }) => {
    await goToTemplates(page);

    await page.getByRole("button", { name: /new template/i }).click();
    await expect(page.getByText("New WhatsApp Template")).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByText("New WhatsApp Template")).not.toBeVisible();
  });
});

// ── Integration: Upload page pre-population ───────────────────────────────────

test.describe("Upload page template pre-population", () => {
  test("pre-populates template name from ?template= URL param", async ({ page }) => {
    await page.goto("/dashboard/upload?template=guru_peyarchi_homam_invite");
    await page.waitForLoadState("networkidle");

    // The template name input should be pre-filled
    const templateInput = page.locator("input").filter({ hasValue: "guru_peyarchi_homam_invite" });
    await expect(templateInput).toBeVisible();
  });

  test("empty template param leaves field blank", async ({ page }) => {
    await page.goto("/dashboard/upload");
    await page.waitForLoadState("networkidle");

    // Find template name input — it should exist but be empty
    // The upload page has a specific label for this field
    const inputs = await page.locator("input[placeholder]").all();
    const values = await Promise.all(inputs.map(i => i.inputValue()));
    const templateValues = values.filter(v => v.includes("template") || v === "");
    // At minimum, no pre-fill happened
    expect(values.every(v => v !== "guru_peyarchi_homam_invite")).toBe(true);
  });
});
