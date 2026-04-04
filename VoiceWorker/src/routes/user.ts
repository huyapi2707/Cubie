import type { FastifyPluginAsync } from "fastify";
import type { UserService } from "../services/index.js";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { authenticate, authorize } from "../middlewares/auth.js";

export interface UserOptions {
  userService: UserService;
}

const userCreateSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
  name: z.string().optional(),
});

const userUpdateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  name: z.string().optional(),
});

export const userRoutes: FastifyPluginAsync<UserOptions> = async (app, opts) => {
  const { userService } = opts;

  // ─── List Users (ADMIN only) ─────────────────────────────────────────
  app.get("/users", { preHandler: [authenticate, authorize(["ADMIN"])] }, async () => {
    const users = await userService.findAll();
    return { users };
  });

  // ─── Get Single User (ADMIN or Self) ───────────────────────────────────
  app.get("/users/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = req.user!;
    
    // RBAC check: allow if admin or if the user is fetching their own profile
    if (authUser.role !== "ADMIN" && authUser.userId !== id) {
      return reply.status(403).send({ error: "Forbidden: You cannot view other user profiles" });
    }

    const user = await userService.findById(id);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }
    return { user };
  });

  // ─── Create User (ADMIN only) ─────────────────────────────────────────
  app.post("/users", { preHandler: [authenticate, authorize(["ADMIN"])] }, async (req, reply) => {
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid data", details: parsed.error.format() });
    }
    
    const existing = await userService.findByEmail(parsed.data.email);
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
    const user = await userService.create({ 
      ...parsed.data, 
      password: hashedPassword 
    });
    return reply.status(201).send({ user });
  });

  // ─── Update User (ADMIN or Self) ─────────────────────────────────────
  app.put("/users/:id", { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const authUser = req.user!;
    
    if (authUser.role !== "ADMIN" && authUser.userId !== id) {
      return reply.status(403).send({ error: "Forbidden: You cannot update other user profiles" });
    }

    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid data", details: parsed.error.format() });
    }
    
    const updateData: any = { ...parsed.data };

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    try {
      const user = await userService.update(id, updateData);
      return { user };
    } catch {
      return reply.status(404).send({ error: "User not found or update failed" });
    }
  });

  // ─── Delete User (ADMIN only) ────────────────────────────────────────
  app.delete("/users/:id", { preHandler: [authenticate, authorize(["ADMIN"])] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await userService.delete(id);
      return { message: "User deleted" };
    } catch {
      return reply.status(404).send({ error: "User not found" });
    }
  });
};
