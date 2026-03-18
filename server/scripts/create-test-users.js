import "dotenv/config";
import bcrypt from "bcryptjs";
import { query } from "../src/db.js";

const PASSWORD = "Test123!";
const USERS = [
  { email: "admin@test.local", full_name: "Admin Demo", role: "admin" },
  { email: "moder@test.local", full_name: "Moderator Demo", role: "moderator" },
  { email: "user@user.local", full_name: "User Demo", role: "user" },
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);

  for (const u of USERS) {
    const existing = await query("SELECT id FROM profiles WHERE email = $1", [u.email]);
    if (existing.rowCount > 0) {
      await query(
        "UPDATE profiles SET password_hash = $1, role = $2, full_name = $3 WHERE email = $4",
        [hash, u.role, u.full_name, u.email],
      );
      console.log("Updated:", u.email, "→", u.role);
    } else {
      await query(
        `INSERT INTO profiles (email, full_name, role, is_blocked, password_hash)
         VALUES ($1, $2, $3, false, $4)`,
        [u.email, u.full_name, u.role, hash],
      );
      console.log("Created:", u.email, "→", u.role);
    }
  }

  console.log("\nГотово! Вход:");
  console.log("  admin:   admin@test.local / " + PASSWORD);
  console.log("  moder:   moder@test.local / " + PASSWORD);
  console.log("  user:    user@user.local / " + PASSWORD);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
