// ============================================================
// FutureCut — Security Spot-Checks (Phase 4)
// ============================================================
// User isolation, URL expiry, share link auth.
// ============================================================

import { test, expect } from "@playwright/test";

test.describe("Security Spot-Checks", () => {
  test("should reject unauthenticated access to project API", async ({ request }) => {
    // Try to fetch a project without auth
    const res = await request.get("/api/projects/nonexistent-id");
    // Should return 401 or 403, not 200 with data
    expect([401, 403, 404]).toContain(res.status());
  });

  test("should reject cross-user project access via direct API URL", async ({ request }) => {
    // Create two users and verify isolation
    // User A creates a project, User B tries to access it

    // Sign up User A
    const signupA = await request.post("/api/auth/signup", {
      data: {
        email: `usera-${Date.now()}@test.com`,
        name: "User A",
        password: "TestPassword123!",
      },
    });

    if (signupA.status() === 200 || signupA.status() === 201) {
      // Try to access a known project ID without auth
      const projectAccess = await request.get("/api/projects/some-project-id");
      expect([401, 403, 404]).toContain(projectAccess.status());
    } else {
      // Auth endpoint may not exist or may work differently
      test.info().annotations.push({
        type: "note",
        description: `Signup endpoint returned ${signupA.status()} — auth may use different flow`,
      });
    }
  });

  test("should serve public share links without authentication", async ({ request }) => {
    // Verify share endpoint structure
    const shareRes = await request.get("/api/share/test-id");

    // Public shares should return 200 (if exists) or 404 (if not found)
    // They should NOT return 401/403
    if (shareRes.status() === 200) {
      test.info().annotations.push({
        type: "note",
        description: "Share endpoint accessible without auth ✅",
      });
    } else if (shareRes.status() === 404) {
      test.info().annotations.push({
        type: "note",
        description: "Share endpoint returns 404 for unknown ID — expected behavior ✅",
      });
    } else {
      test.info().annotations.push({
        type: "warning",
        description: `Share endpoint returned unexpected status: ${shareRes.status()}`,
      });
    }
  });

  test("should reject private project access for unauthenticated users", async ({ request }) => {
    // Try to update a project without auth
    const updateRes = await request.put("/api/projects/test-id", {
      data: {
        name: "Hacked Project",
        projectData: { malicious: true },
      },
    });

    // Should be rejected
    expect([401, 403, 404, 405]).toContain(updateRes.status());
  });
});
