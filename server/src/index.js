import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRouter from "./auth.js";
import { authMiddleware } from "./auth.js";
import tasksRouter from "./tasks.js";
import adminRouter from "./admin.js";
import moderatorRouter from "./moderator.js";
import projectsRouter, { listProjects } from "./projects.js";
import departmentsRouter from "./departments.js";
import { ensureSchema } from "./ensureSchema.js";
import { loadSchemaFeatures } from "./schemaFeatures.js";

dotenv.config();

const app = express();

/** Несколько origin через запятую: прод + локальный dev (например https://samultra.github.io,http://localhost:8080) */
const ALLOWED_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: false,
  }),
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/admin", adminRouter);
app.use("/api/moderator", moderatorRouter);
// Явная регистрация: вложенный router.get("/") не всегда совпадает с GET /api/projects
app.get("/api/projects", authMiddleware, listProjects);
app.use("/api/projects", projectsRouter);
app.use("/api/departments", departmentsRouter);

const port = process.env.PORT || 4000;

async function start() {
  await loadSchemaFeatures();
  await ensureSchema();
  app.listen(port, () => {
    console.log(`TaskAI backend listening on port ${port}`);
  });
}

start();

