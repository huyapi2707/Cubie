import type { FastifyPluginAsync } from "fastify";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "../config/index.js";
import type { UserService, QuotaService } from "../services/index.js";
import { authenticate } from "../middlewares/auth.js";
import { z } from "zod";

export interface AuthOptions {
  userService: UserService;
  quotaService: QuotaService;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const authRoutes: FastifyPluginAsync<AuthOptions> = async (app, opts) => {
  const { userService, quotaService } = opts;

  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.format() });
    }

    const { email, password } = parsed.data;

    const user = await userService.findByEmail(email);

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.AUTH_SECRET,
      { expiresIn: "7d" }
    );

    return { token, user };
  });

  /** Verify token and return the current user profile + quota */
  app.get("/auth/me", { preHandler: [authenticate] }, async (req, reply) => {
    const user = await userService.findById(req.user!.userId);
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const quota = await quotaService.getClientQuota(req.user!.userId);

    return { user, quota };
  });
};
