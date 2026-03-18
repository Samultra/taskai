import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/:id/detail", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });

    const [proj, users, tasks] = await Promise.all([
      query(
        `SELECT id, name, code, color, owner_profile_id
         FROM projects
         WHERE id = $1`,
        [projectId],
      ),
      query(`SELECT id, email FROM profiles ORDER BY email ASC`),
      query(
        `SELECT t.id,
                t.title,
                t.description,
                t.task_type,
                t.complexity,
                t.status,
                t.priority,
                t.due_date,
                t.assignee_profile_id,
                p.email AS assignee_email
         FROM tasks t
         LEFT JOIN profiles p ON p.id = t.assignee_profile_id
         WHERE t.project_id = $1
         ORDER BY t.due_date ASC`,
        [projectId],
      ),
    ]);

    if (proj.rowCount === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      project: proj.rows[0],
      users: users.rows,
      tasks: tasks.rows,
    });
  } catch (err) {
    console.error("Project detail error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/tasks", async (req, res) => {
  try {
    const projectId = Number(req.params.id);
    if (Number.isNaN(projectId)) return res.status(400).json({ error: "Invalid project id" });
    const {
      title,
      description,
      task_type,
      complexity,
      status,
      priority,
      due_date,
      assignee_profile_id,
    } = req.body || {};

    if (!title) return res.status(400).json({ error: "title is required" });

    const result = await query(
      `INSERT INTO tasks (
         project_id,
         title,
         description,
         task_type,
         complexity,
         status,
         priority,
         due_date,
         assignee_profile_id,
         completed,
         category
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Проект')
       RETURNING id, title, description, task_type, complexity, status, priority, due_date, assignee_profile_id`,
      [
        projectId,
        title.trim(),
        description?.trim() || null,
        task_type || null,
        complexity || null,
        status || "todo",
        priority || "medium",
        due_date || null,
        assignee_profile_id || null,
        status === "done",
      ],
    );

    const created = result.rows[0];
    let assigneeEmail = null;
    if (created.assignee_profile_id) {
      const prof = await query(`SELECT email FROM profiles WHERE id = $1`, [created.assignee_profile_id]);
      assigneeEmail = prof.rows[0]?.email ?? null;
    }

    res.status(201).json({
      task: {
        ...created,
        assignee_email: assigneeEmail,
      },
    });
  } catch (err) {
    console.error("Project create task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignee_profile_id, due_date } = req.body || {};
    const payload = {};
    if (status) {
      payload.status = status;
      payload.completed = status === "done";
    }
    if (assignee_profile_id !== undefined) {
      payload.assignee_profile_id = assignee_profile_id || null;
    }
    if (due_date !== undefined) {
      payload.due_date = due_date || null;
    }
    const fields = [];
    const values = [];
    let idx = 1;
    Object.entries(payload).forEach(([k, v]) => {
      fields.push(`${k} = $${idx}`);
      values.push(v);
      idx += 1;
    });
    if (!fields.length) return res.status(400).json({ error: "No fields" });
    values.push(id);
    const result = await query(
      `UPDATE tasks
       SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, title, description, task_type, complexity, status, priority, due_date, assignee_profile_id`,
      values,
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Task not found" });
    const updated = result.rows[0];
    let assigneeEmail = null;
    if (updated.assignee_profile_id) {
      const prof = await query(`SELECT email FROM profiles WHERE id = $1`, [updated.assignee_profile_id]);
      assigneeEmail = prof.rows[0]?.email ?? null;
    }
    res.json({
      task: {
        ...updated,
        assignee_email: assigneeEmail,
      },
    });
  } catch (err) {
    console.error("Project update task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await query(`DELETE FROM tasks WHERE id = $1`, [id]);
    res.status(204).send();
  } catch (err) {
    console.error("Project delete task error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

