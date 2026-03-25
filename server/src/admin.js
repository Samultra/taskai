import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";
import bcrypt from "bcryptjs";

const router = express.Router();

router.use(authMiddleware);

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

const ALLOWED_ROLES = ["user", "moderator", "admin"];

function normalizeOptionalString(v) {
  if (v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function assertRole(role) {
  if (!role || !ALLOWED_ROLES.includes(role)) return false;
  return true;
}

router.get("/overview", requireAdmin, async (_req, res) => {
  try {
    const [users, requests, logs, departments, projects, projectMembers, projectDepartments] = await Promise.all([
      query(
        `SELECT id, email, full_name, role, is_blocked, created_at
         FROM profiles
         ORDER BY created_at ASC`,
      ),
      query(
        `SELECT id, email, full_name, role_requested, status, created_at
         FROM registration_requests
         WHERE status = 'pending'
         ORDER BY created_at DESC`,
      ),
      query(
        `SELECT id, actor_email, action, target_type, target_id, details, created_at
         FROM activity_logs
         ORDER BY created_at DESC
         LIMIT 50`,
      ),
      query(`SELECT id, name, description FROM departments ORDER BY name ASC`),
      query(
        `SELECT id, name, code, description, color, owner_profile_id, is_archived, created_at
         FROM projects
         ORDER BY created_at DESC`,
      ),
      query(`SELECT project_id, profile_id, role FROM project_members`),
      query(`SELECT project_id, department_id FROM project_departments`),
    ]);

    res.json({
      users: users.rows,
      requests: requests.rows,
      logs: logs.rows,
      departments: departments.rows,
      projects: projects.rows,
      projectMembers: projectMembers.rows,
      projectDepartments: projectDepartments.rows,
    });
  } catch (err) {
    console.error("Admin overview error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Админ: создать пользователя (+ опционально создать заявку на повышенную роль)
router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { email, password, full_name, requestedRole } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const roleReq = requestedRole ?? "user";
    if (!assertRole(roleReq)) {
      return res.status(400).json({ error: "invalid requestedRole" });
    }

    const fullNameNorm = normalizeOptionalString(full_name);

    const existing = await query("SELECT id FROM profiles WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO profiles (email, full_name, role, is_blocked, password_hash)
       VALUES ($1, $2, 'user', false, $3)
       RETURNING id, email, full_name, role, is_blocked, created_at`,
      [email, fullNameNorm, passwordHash],
    );

    let requestId = null;
    if (roleReq !== "user") {
      // Если есть такая же pending-заявка — просто обновим full_name.
      const existingReq = await query(
        `SELECT id FROM registration_requests
         WHERE email = $1 AND role_requested = $2 AND status = 'pending'`,
        [email, roleReq],
      );

      if (existingReq.rowCount > 0) {
        requestId = existingReq.rows[0].id;
        await query(`UPDATE registration_requests SET full_name = $1 WHERE id = $2`, [fullNameNorm, requestId]);
      } else {
        const ins = await query(
          `INSERT INTO registration_requests (email, full_name, role_requested, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id`,
          [email, fullNameNorm, roleReq],
        );
        requestId = ins.rows[0]?.id ?? null;
      }
    }

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_create_user', 'user', $3::text, $4::jsonb)`,
      [req.user.id, req.user.email, result.rows[0].id, JSON.stringify({ requested_role: roleReq, request_id: requestId })],
    );

    return res.status(201).json({ profile: result.rows[0], request_id: requestId });
  } catch (err) {
    console.error("Admin create user error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Админ: создать заявку на роль (pending)
router.post("/requests", requireAdmin, async (req, res) => {
  try {
    const { email, full_name, role_requested } = req.body || {};
    if (!email || !role_requested) {
      return res.status(400).json({ error: "email and role_requested are required" });
    }
    if (!assertRole(role_requested) || role_requested === "user") {
      return res.status(400).json({ error: "role_requested must be moderator/admin" });
    }

    const fullNameNorm = normalizeOptionalString(full_name);

    const existingReq = await query(
      `SELECT id FROM registration_requests
       WHERE email = $1 AND role_requested = $2 AND status = 'pending'`,
      [email, role_requested],
    );

    let requestId = null;
    if (existingReq.rowCount > 0) {
      requestId = existingReq.rows[0].id;
      await query(`UPDATE registration_requests SET full_name = $1 WHERE id = $2`, [fullNameNorm, requestId]);
    } else {
      const ins = await query(
        `INSERT INTO registration_requests (email, full_name, role_requested, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id`,
        [email, fullNameNorm, role_requested],
      );
      requestId = ins.rows[0]?.id ?? null;
    }

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_create_role_request', 'registration_request', $3::text, $4::jsonb)`,
      [req.user.id, req.user.email, requestId, JSON.stringify({ email, role_requested })],
    );

    res.status(201).json({ ok: true, id: requestId });
  } catch (err) {
    console.error("Admin create request error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Админ: редактировать заявку на роль (только pending)
router.put("/requests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, full_name, role_requested } = req.body || {};
    if (!email || !role_requested) {
      return res.status(400).json({ error: "email and role_requested are required" });
    }
    if (!assertRole(role_requested) || role_requested === "user") {
      return res.status(400).json({ error: "role_requested must be moderator/admin" });
    }

    const fullNameNorm = normalizeOptionalString(full_name);

    const updated = await query(
      `UPDATE registration_requests
       SET email = $1, full_name = $2, role_requested = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING id`,
      [email, fullNameNorm, role_requested, id],
    );

    if (updated.rowCount === 0) {
      return res.status(404).json({ error: "Pending request not found" });
    }

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_update_role_request', 'registration_request', $3::text, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ email, role_requested })],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin update request error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profiles/:id/role", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ error: "role is required" });

    await query(`UPDATE profiles SET role = $1 WHERE id = $2`, [role, id]);

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'change_role', 'user', $3, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ new_role: role })],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin change role error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profiles/:id/block", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_blocked } = req.body || {};
    if (typeof is_blocked !== "boolean") {
      return res.status(400).json({ error: "is_blocked must be boolean" });
    }
    await query(`UPDATE profiles SET is_blocked = $1 WHERE id = $2`, [is_blocked, id]);
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'user', $4, $5::jsonb)`,
      [
        req.user.id,
        req.user.email,
        is_blocked ? "block_user" : "unblock_user",
        id,
        JSON.stringify({}),
      ],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin block user error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/profiles/:id/name", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name } = req.body || {};
    await query(`UPDATE profiles SET full_name = $1 WHERE id = $2`, [full_name ?? null, id]);
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'update_full_name', 'user', $3, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ full_name })],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin update name error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/requests/:id/decision", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, requestedRole, email } = req.body || {};
    if (!action || !requestedRole || !email) {
      return res.status(400).json({ error: "action, requestedRole, email are required" });
    }
    const status = action === "approve" ? "approved" : "rejected";
    const processedAt = new Date().toISOString();

    await query(
      `UPDATE registration_requests
       SET status = $1, processed_at = $2
       WHERE id = $3`,
      [status, processedAt, id],
    );

    if (action === "approve") {
      const prof = await query(`SELECT id FROM profiles WHERE email = $1`, [email]);
      if (prof.rowCount > 0) {
        await query(`UPDATE profiles SET role = $1 WHERE id = $2`, [requestedRole, prof.rows[0].id]);
      }
    }

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'registration_request', $4, $5::jsonb)`,
      [
        req.user.id,
        req.user.email,
        action === "approve" ? "approve_request" : "reject_request",
        String(id),
        JSON.stringify({ requested_role: requestedRole, email }),
      ],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Admin request decision error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/departments", requireAdmin, async (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = await query(
      `INSERT INTO departments (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description`,
      [name.trim(), description?.trim() || null],
    );
    res.status(201).json({ department: result.rows[0] });
  } catch (err) {
    console.error("Admin create department error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/departments/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const result = await query(
      `UPDATE departments SET name = $1, description = $2 WHERE id = $3 RETURNING id, name, description`,
      [String(name).trim(), description?.trim() || null, id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Department not found" });
    }
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_update_department', 'department', $3, $4::jsonb)`,
      [req.user.id, req.user.email, String(id), JSON.stringify({ name: result.rows[0].name })],
    );
    res.json({ department: result.rows[0] });
  } catch (err) {
    console.error("Admin update department error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/departments/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const del = await query(`DELETE FROM departments WHERE id = $1`, [id]);
    if (del.rowCount === 0) {
      return res.status(404).json({ error: "Department not found" });
    }
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_delete_department', 'department', $3, '{}'::jsonb)`,
      [req.user.id, req.user.email, String(id)],
    );
    res.status(204).send();
  } catch (err) {
    console.error("Admin delete department error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects", requireAdmin, async (req, res) => {
  try {
    const { name, code, description, color, owner_profile_id } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });
    const result = await query(
      `INSERT INTO projects (name, code, description, color, owner_profile_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, code, description, color, owner_profile_id, is_archived, created_at`,
      [name.trim(), code?.trim() || null, description?.trim() || null, color || null, owner_profile_id || null],
    );
    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    console.error("Admin create project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description, color, owner_profile_id } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const result = await query(
      `UPDATE projects
       SET name = $1,
           code = $2,
           description = $3,
           color = $4,
           owner_profile_id = $5
       WHERE id = $6
       RETURNING id, name, code, description, color, owner_profile_id, is_archived, created_at`,
      [
        String(name).trim(),
        code?.trim() || null,
        description?.trim() || null,
        color || null,
        owner_profile_id || null,
        id,
      ],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_update_project', 'project', $3, $4::jsonb)`,
      [req.user.id, req.user.email, String(id), JSON.stringify({ name: result.rows[0].name })],
    );
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error("Admin update project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/projects/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const del = await query(`DELETE FROM projects WHERE id = $1`, [id]);
    if (del.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'admin_delete_project', 'project', $3, '{}'::jsonb)`,
      [req.user.id, req.user.email, String(id)],
    );
    res.status(204).send();
  } catch (err) {
    console.error("Admin delete project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/archive", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_archived } = req.body || {};
    if (typeof is_archived !== "boolean") {
      return res.status(400).json({ error: "is_archived must be boolean" });
    }
    await query(`UPDATE projects SET is_archived = $1 WHERE id = $2`, [is_archived, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin archive project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/members", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email is required" });

    const prof = await query(`SELECT id FROM profiles WHERE email = $1`, [email.trim()]);
    if (prof.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const profileId = prof.rows[0].id;
    await query(
      `INSERT INTO project_members (project_id, profile_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [id, profileId],
    );
    res.json({ project_id: Number(id), profile_id: profileId, role: "member" });
  } catch (err) {
    console.error("Admin add member error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/projects/:id/members/:profileId", requireAdmin, async (req, res) => {
  try {
    const { id, profileId } = req.params;
    await query(`DELETE FROM project_members WHERE project_id = $1 AND profile_id = $2`, [id, profileId]);
    res.status(204).send();
  } catch (err) {
    console.error("Admin remove member error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/departments", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { department_id } = req.body || {};
    if (!department_id) return res.status(400).json({ error: "department_id is required" });
    await query(
      `INSERT INTO project_departments (project_id, department_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, department_id],
    );
    res.json({ project_id: Number(id), department_id });
  } catch (err) {
    console.error("Admin add department to project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/projects/:id/departments/:departmentId", requireAdmin, async (req, res) => {
  try {
    const { id, departmentId } = req.params;
    await query(`DELETE FROM project_departments WHERE project_id = $1 AND department_id = $2`, [id, departmentId]);
    res.status(204).send();
  } catch (err) {
    console.error("Admin remove department from project error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

