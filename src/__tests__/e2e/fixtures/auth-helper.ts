import { expect, type Page } from "@playwright/test";

/**
 * Signs up a new unique test user and creates a new project.
 * Redirects the page to the editor view for that project.
 */
export async function authenticateAndCreateProject(page: Page): Promise<string> {
  const uniqueId = Date.now() + Math.random().toString(36).substring(2, 5);
  const testEmail = `user-${uniqueId}@test.com`;

  // 1. Visit signup
  await page.goto("/signin");
  await page.waitForLoadState("networkidle");

  const signupLink = page.locator("button:has-text('signup'), button:has-text('Sign up'), a:has-text('Sign up')");
  if (await signupLink.isVisible({ timeout: 2000 }).catch(() => false)) {
    await signupLink.click();
    await page.waitForTimeout(300);
  }

  // 2. Fill in details
  await page.locator("input[type='email'], input[name='email']").fill(testEmail);
  await page.locator("input[type='password'], input[name='password']").fill("TestPassword123!");
  
  const nameInput = page.locator("input[name='name']");
  if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nameInput.fill("Test User");
  }

  // Submit signup
  await page.locator("button[type='submit']").click();
  await page.waitForLoadState("networkidle");

  // 3. Wait for redirect to dashboard
  await expect(page).toHaveURL(/.*dashboard.*/, { timeout: 15_000 });

  // 4. Click "New Project" to create project and redirect to editor
  const newProjectBtn = page.locator("button:has-text('New Project'), button:has-text('Create Project')").first();
  await expect(newProjectBtn).toBeVisible({ timeout: 10_000 });
  await newProjectBtn.click();

  // 5. Wait for redirect to editor
  await expect(page).toHaveURL(/.*editor.*/, { timeout: 15_000 });

  // Extract project ID from URL
  const url = page.url();
  const projectId = url.split("/").pop() || "";
  return projectId;
}
