import AdminJS, { ComponentLoader, type AdminJSOptions } from "adminjs";
import AdminJSFastify from "@adminjs/fastify";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import session from "@fastify/session";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import bcrypt from "bcryptjs";
import { config } from "../config/index.js";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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

const componentLoader = new ComponentLoader();
const Components = {
  Metrics: componentLoader.add('Metrics', path.resolve(__dirname, './components/metrics')),
  Dashboard: componentLoader.add('Dashboard', path.resolve(__dirname, './components/dashboard')),
};

componentLoader.override('Login', path.resolve(__dirname, './components/login'));

export const adminjsPlugin: FastifyPluginAsync = fp(async (app) => {
  const prisma = new PrismaClient();

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
      return false;
    },
    cookiePassword: config.AUTH_SECRET,
    cookieName: "adminjs",
  }, app, {
    store: new session.MemoryStore(),
    saveUninitialized: true,
    secret: config.AUTH_SECRET,
    cookie: {
      secure: config.NODE_ENV === "production",
    },
  });
});

export default adminjsPlugin;
