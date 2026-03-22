import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";

const router = express.Router();

router.use(authMiddleware);

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
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

