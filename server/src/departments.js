import express from "express";
import { authMiddleware } from "./auth.js";
import { query } from "./db.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/with-members", async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT
         d.id,
         d.name,
         d.description,
         EXISTS (
           SELECT 1 FROM department_members dm
           WHERE dm.department_id = d.id AND dm.profile_id = $1
         ) AS is_member,
         EXISTS (
           SELECT 1 FROM department_join_requests r
           WHERE r.department_id = d.id AND r.profile_id = $1 AND r.status = 'pending'
         ) AS has_pending_request,
         COALESCE(
           (
             SELECT json_agg(json_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name))
             FROM department_members dm
             JOIN profiles p ON p.id = dm.profile_id
             WHERE dm.department_id = d.id
           ),
           '[]'::json
         ) AS members
       FROM departments d
       ORDER BY d.name ASC`,
      [userId],
    );

    res.json({ departments: result.rows });
  } catch (err) {
    console.error("Departments with members error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/join", async (req, res) => {
  try {
    const deptId = Number(req.params.id);
    const userId = req.user.id;
    if (Number.isNaN(deptId)) return res.status(400).json({ error: "Invalid department id" });

    const exists = await query(
      `SELECT 1 FROM department_members WHERE department_id = $1 AND profile_id = $2`,
      [deptId, userId],
    );
    if (exists.rowCount > 0) {
      return res.status(400).json({ error: "Вы уже в этом отделе" });
    }

    const pending = await query(
      `SELECT 1 FROM department_join_requests
       WHERE department_id = $1 AND profile_id = $2 AND status = 'pending'`,
      [deptId, userId],
    );
    if (pending.rowCount > 0) {
      return res.status(400).json({ error: "Заявка уже отправлена" });
    }

    await query(
      `INSERT INTO department_join_requests (department_id, profile_id, status)
       VALUES ($1, $2, 'pending')`,
      [deptId, userId],
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Join department error", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

