import AdminJS, { ComponentLoader, type AdminJSOptions } from "adminjs";
import AdminJSFastify from "@adminjs/fastify";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { Redis } from "ioredis";
import RedisStore from "connect-redis";
import { config } from "../config/index.js";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { logger } from "../utils/logger.js";

if (config.NODE_ENV === "development") {
  const adminJsDir = path.resolve(process.cwd(), ".adminjs");
  if (fs.existsSync(adminJsDir)) {
    fs.rmSync(adminJsDir, { recursive: true, force: true });
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

AdminJS.registerAdapter({
  Resource: Resource,
  Database: Database,
});

/**
 * AdminJS ComponentLoader expects raw .tsx source files — it bundles them
 * internally.  After `tsc` compiles the project, __dirname resolves to
 * `dist/plugins/` where the files are already compiled `.js`.
 * We detect that and remap to the original `src/` tree.
 */
function componentPath(relative: string): string {
  const resolved = path.resolve(__dirname, relative);

  // If we're running from compiled output (dist/), point back to src/
  if (__dirname.includes(`${path.sep}dist${path.sep}`) || __dirname.endsWith(`${path.sep}dist`)) {
    const srcDir = __dirname.replace(
      `${path.sep}dist${path.sep}`,
      `${path.sep}src${path.sep}`
    );
    return path.resolve(srcDir, relative);
  }

  return resolved;
}

const componentLoader = new ComponentLoader();
const Components = {
  Metrics: componentLoader.add('Metrics', componentPath('./components/metrics')),
  Dashboard: componentLoader.add('Dashboard', componentPath('./components/dashboard')),
  QuotaUsage: componentLoader.add('QuotaUsage', componentPath('./components/quota-usage')),
};

componentLoader.override('Login', componentPath('./components/login'));

// NOTE: Do NOT wrap with fp() — AdminJS registers @fastify/cookie, @fastify/session
// and a preHandler hook internally. Using fp() would leak those to all routes.
export const adminjsPlugin: FastifyPluginAsync = async (app) => {
  const prisma = new PrismaClient();

  // ─── Redis Session Store (shared across PM2 cluster workers) ────────
  const redisClient = new Redis(config.REDIS_URL);
  const redisStore = new RedisStore({
    client: redisClient,
    prefix: "adminjs:sess:",
  });

  // Create the adapter configuration
  const adminOptions: AdminJSOptions = {
    resources: [
      {
        resource: { model: getModelByName('User'), client: prisma },
        options: {
          properties: {
            password: { isVisible: false },
          },
        },
      },
    ],
    rootPath: "/admin",
    dashboard: {
      component: Components.Dashboard,
    },
    branding: {
      companyName: "VoiceWorker",
      withMadeWithLove: false,
      logo: false,
    },
    componentLoader,
    pages: {
      metrics: {
        component: Components.Metrics,
        icon: 'Pulse',
      },
      quotaUsage: {
        component: Components.QuotaUsage,
        icon: 'Activity',
      },
    },
  };

  const admin = new AdminJS(adminOptions);

  // Use buildAuthenticatedRouter with Fastify
  await AdminJSFastify.buildAuthenticatedRouter(admin, {
    authenticate: async (email, password) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && user.role === "ADMIN") {
        const matched = await bcrypt.compare(password, user.password);
        if (matched) {
          return { email: user.email, role: user.role };
        }
      }
      logger.info(`Invalid Credential, email: ${email}, password: ${password}`);
      return false;
    },
    cookiePassword: config.AUTH_SECRET,
    cookieName: "adminjs",
  }, app, {
    store: redisStore,
    saveUninitialized: false,
    secret: config.AUTH_SECRET,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
    },
  });
};

export default adminjsPlugin;
