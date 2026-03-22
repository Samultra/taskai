import express from "express";
import { statusImpliesCompleted } from "./taskStatus.js";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";
import { coerceTaskStatusForDb } from "./schemaFeatures.js";

const router = express.Router();

router.use(authMiddleware);

function requireModerator(req, res, next) {
  if (req.user?.role !== "moderator" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "Moderator or admin only" });
  }
  next();
}

router.get("/overview", requireModerator, async (req, res) => {
  try {
    const userId = req.user.id;

    const [requests, logs, deptRequests] = await Promise.all([
      query(
        `SELECT id, email, full_name, role_requested, status, created_at
         FROM registration_requests
         WHERE status = 'pending'
         ORDER BY created_at DESC`,
      ),
      query(
        `SELECT id, actor_email, action, target_type, target_id, details, created_at
         FROM activity_logs
         WHERE target_type = 'registration_request'
         ORDER BY created_at DESC
         LIMIT 50`,
      ),
      query(
        `SELECT r.id,
                r.department_id,
                d.name AS department_name,
                p.email,
                p.full_name,
                r.status,
                r.created_at
         FROM department_join_requests r
         JOIN departments d ON d.id = r.department_id
         JOIN profiles p ON p.id = r.profile_id
         WHERE r.status = 'pending'
         ORDER BY r.created_at DESC`,
      ),
    ]);

    const [ownedProjects, memberRows] = await Promise.all([
      query(
        `SELECT id, name, code, color, owner_profile_id, is_archived, created_at
         FROM projects
         WHERE owner_profile_id = $1
         ORDER BY created_at DESC`,
        [userId],
      ),
      query(
        `SELECT project_id, profile_id, role
         FROM project_members
         WHERE profile_id = $1`,
        [userId],
      ),
    ]);

    const memberProjectIds = memberRows.rows.map((r) => r.project_id);
    let memberProjects = [];
    if (memberProjectIds.length) {
      const proj = await query(
        `SELECT id, name, code, color, owner_profile_id, is_archived, created_at
         FROM projects
         WHERE id = ANY($1::bigint[])
         ORDER BY created_at DESC`,
        [memberProjectIds],
      );
      memberProjects = proj.rows;
    }

    const merged = [...ownedProjects.rows, ...memberProjects];
    const projectMap = new Map();
    merged.forEach((p) => {
      projectMap.set(p.id, p);
    });
    const projects = Array.from(projectMap.values());

    let members = [];
    let tasks = [];
    let users = [];

    const usersRows = await query(
      `SELECT id, email, full_name, role, is_blocked, created_at
       FROM profiles
       ORDER BY email ASC`,
    );
    users = usersRows.rows;

    if (projects.length) {
      const ids = projects.map((p) => p.id);
      const [allMembers, taskRows] = await Promise.all([
        query(
          `SELECT project_id, profile_id, role
           FROM project_members
           WHERE project_id = ANY($1::bigint[])`,
          [ids],
        ),
        query(
          `SELECT id, project_id, title, status, priority, due_date, assignee_profile_id
           FROM tasks
           WHERE project_id = ANY($1::bigint[])
           ORDER BY due_date ASC
           LIMIT 200`,
          [ids],
        ),
      ]);
      members = allMembers.rows;
      tasks = taskRows.rows;
    }

    res.json({
      requests: requests.rows,
      logs: logs.rows,
      projects,
      members,
      tasks,
      users,
      departmentJoinRequests: deptRequests.rows,
    });
  } catch (err) {
    console.error("Moderator overview error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/requests/:id/decision", requireModerator, async (req, res) => {
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

    if (action === "approve" && requestedRole === "moderator") {
      const prof = await query(`SELECT id FROM profiles WHERE email = $1`, [email]);
      if (prof.rowCount > 0) {
        await query(`UPDATE profiles SET role = 'moderator' WHERE id = $1`, [prof.rows[0].id]);
      }
    }

    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'registration_request', $4, $5::jsonb)`,
      [
        req.user.id,
        req.user.email,
        action === "approve" ? "approve_request_moderator" : "reject_request_moderator",
        String(id),
        JSON.stringify({ requested_role: requestedRole, email }),
      ],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator request decision error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/departments/requests/:id/decision", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body || {};
    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "invalid action" });
    }
    const status = action === "approve" ? "approved" : "rejected";
    const processedAt = new Date().toISOString();

    const reqRow = await query(
      `UPDATE department_join_requests
       SET status = $1, processed_at = $2
       WHERE id = $3
       RETURNING department_id, profile_id`,
      [status, processedAt, id],
    );

    if (reqRow.rowCount === 0) {
      return res.status(404).json({ error: "Request not found" });
    }

    const { department_id, profile_id } = reqRow.rows[0];

    if (action === "approve") {
      await query(
        `INSERT INTO department_members (department_id, profile_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT DO NOTHING`,
        [department_id, profile_id],
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator dept request decision error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/:id/role", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};
    if (!role || role === "admin") return res.status(400).json({ error: "invalid role" });
    const target = await query(`SELECT role FROM profiles WHERE id = $1`, [id]);
    if (target.rowCount === 0) return res.status(404).json({ error: "User not found" });
    if (target.rows[0].role === "admin") {
      return res.status(403).json({ error: "Cannot change admin role" });
    }
    await query(`UPDATE profiles SET role = $1 WHERE id = $2`, [role, id]);
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'moderator_change_role', 'user', $3, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ new_role: role })],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator change user role error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/:id/block", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_blocked } = req.body || {};
    if (typeof is_blocked !== "boolean") {
      return res.status(400).json({ error: "is_blocked must be boolean" });
    }
    const target = await query(`SELECT role FROM profiles WHERE id = $1`, [id]);
    if (target.rowCount === 0) return res.status(404).json({ error: "User not found" });
    // Запрет только на блокировку админа; разблокировать админа можно (например после ошибки)
    if (target.rows[0].role === "admin" && is_blocked) {
      return res.status(403).json({ error: "Cannot block admin" });
    }
    await query(`UPDATE profiles SET is_blocked = $1 WHERE id = $2`, [is_blocked, id]);
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'user', $4, $5::jsonb)`,
      [
        req.user.id,
        req.user.email,
        is_blocked ? "moderator_block_user" : "moderator_unblock_user",
        id,
        JSON.stringify({}),
      ],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator block user error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users/:id/name", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name } = req.body || {};
    const target = await query(`SELECT role FROM profiles WHERE id = $1`, [id]);
    if (target.rowCount === 0) return res.status(404).json({ error: "User not found" });
    if (target.rows[0].role === "admin") {
      return res.status(403).json({ error: "Cannot edit admin profile" });
    }
    await query(`UPDATE profiles SET full_name = $1 WHERE id = $2`, [full_name ?? null, id]);
    await query(
      `INSERT INTO activity_logs (actor_id, actor_email, action, target_type, target_id, details)
       VALUES ($1, $2, 'moderator_update_full_name', 'user', $3, $4::jsonb)`,
      [req.user.id, req.user.email, id, JSON.stringify({ full_name })],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator update user name error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/meta", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, color } = req.body || {};
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) {
      fields.push(`name = $${idx}`);
      values.push(name);
      idx += 1;
    }
    if (code !== undefined) {
      fields.push(`code = $${idx}`);
      values.push(code);
      idx += 1;
    }
    if (color !== undefined) {
      fields.push(`color = $${idx}`);
      values.push(color);
      idx += 1;
    }
    if (!fields.length) {
      return res.status(400).json({ error: "No fields" });
    }
    values.push(id);
    await query(`UPDATE projects SET ${fields.join(", ")} WHERE id = $${idx}`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator update project meta error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/projects/:id/members", requireModerator, async (req, res) => {
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
    console.error("Moderator add member error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/projects/:id/members/:profileId", requireModerator, async (req, res) => {
  try {
    const { id, profileId } = req.params;
    await query(`DELETE FROM project_members WHERE project_id = $1 AND profile_id = $2`, [id, profileId]);
    res.status(204).send();
  } catch (err) {
    console.error("Moderator remove member error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/tasks/:id", requireModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, due_date, assignee_profile_id } = req.body || {};
    const payload = {};
    if (status) {
      const st = coerceTaskStatusForDb(status);
      payload.status = st;
      payload.completed = statusImpliesCompleted(st);
    }
    if (due_date !== undefined) {
      payload.due_date = due_date || null;
    }
    if (assignee_profile_id !== undefined) {
      payload.assignee_profile_id = assignee_profile_id || null;
    }
    const fields = [];
    const values = [];
    let idx = 1;
    Object.entries(payload).forEach(([k, v]) => {
      fields.push(`${k} = $${idx}`);
      values.push(v);
      idx += 1;
    });
    if (!fields.length) {
      return res.status(400).json({ error: "No fields" });
    }
    values.push(id);
    await query(`UPDATE tasks SET ${fields.join(", ")} WHERE id = $${idx}`, values);
    res.json({ ok: true });
  } catch (err) {
    console.error("Moderator update task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

