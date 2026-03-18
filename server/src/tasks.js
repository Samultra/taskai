import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const result = await query(
      `SELECT id, title, description, completed, priority, category, due_date, created_at
       FROM tasks
       WHERE project_id IS NULL AND owner_profile_id = $1
       ORDER BY created_at DESC`,
      [req.user.id],
    );
    return res.json({ tasks: result.rows });
  } catch (err) {
    console.error("Get tasks error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, completed, priority, category, due_date, project_id, status, complexity, task_type, assignee_profile_id } =
      req.body || {};

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }

    const result = await query(
      `INSERT INTO tasks (
         title,
         description,
         completed,
         priority,
         category,
         due_date,
         project_id,
         status,
         complexity,
         task_type,
         assignee_profile_id,
         owner_profile_id
       )
       VALUES ($1, $2, COALESCE($3, false), $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, title, description, completed, priority, category, due_date, created_at, project_id, status, complexity, task_type, assignee_profile_id`,
      [
        title,
        description ?? null,
        completed ?? false,
        priority ?? "medium",
        category ?? "Личное",
        due_date ?? null,
        project_id ?? null,
        status ?? "todo",
        complexity ?? null,
        task_type ?? null,
        assignee_profile_id ?? null,
        req.user.id,
      ],
    );

    return res.status(201).json({ task: result.rows[0] });
  } catch (err) {
    console.error("Create task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, completed, priority, category, due_date, status, assignee_profile_id } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    const pushField = (name, value) => {
      fields.push(`${name} = $${idx}`);
      values.push(value);
      idx += 1;
    };

    if (title !== undefined) pushField("title", title);
    if (description !== undefined) pushField("description", description);
    if (completed !== undefined) pushField("completed", completed);
    if (priority !== undefined) pushField("priority", priority);
    if (category !== undefined) pushField("category", category);
    if (due_date !== undefined) pushField("due_date", due_date);
    if (status !== undefined) {
      pushField("status", status);
      pushField("completed", status === "done");
    }
    if (assignee_profile_id !== undefined) pushField("assignee_profile_id", assignee_profile_id);

    if (!fields.length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    values.push(id);

    const result = await query(
      `UPDATE tasks
       SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, title, description, completed, priority, category, due_date, created_at, project_id, status, complexity, task_type, assignee_profile_id`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    return res.json({ task: result.rows[0] });
  } catch (err) {
    console.error("Update task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("DELETE FROM tasks WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error("Delete task error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
