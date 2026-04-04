import { PrismaClient, Prisma, User } from '@prisma/client';
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "user-service" });

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

// Return type without password for public endpoints
export type SafeUser = Omit<User, "password">;

// Client-safe plan info
export interface ActivePlanInfo {
  name: string;
  description: string | null;
  registeredAt: string;
  expiresAt: string;
}

export class UserService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get max quota from the user's active (non-expired) plan.
   * Returns 0 if no active plan exists.
   */
  async getUserMaxQuota(userId: string): Promise<number> {
    try {
      const activePlan = await this.prisma.userPlan.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { registeredAt: 'desc' },
        include: { plan: true },
      });
      return activePlan?.plan.maxQuota || 0;
    } catch (err) {
      log.error({ err, userId }, "Database error fetching user quota");
      return 0;
    }
  }

  /**
   * Get the user's active plan info for client display.
   * Returns null if no active plan.
   */
  async getActivePlan(userId: string): Promise<ActivePlanInfo | null> {
    try {
      const activePlan = await this.prisma.userPlan.findFirst({
        where: {
          userId,
          expiresAt: { gt: new Date() },
        },
        orderBy: { registeredAt: 'desc' },
        include: { plan: true },
      });

      if (!activePlan) return null;

      return {
        name: activePlan.plan.name,
        description: activePlan.plan.description,
        registeredAt: activePlan.registeredAt.toISOString(),
        expiresAt: activePlan.expiresAt.toISOString(),
      };
    } catch (err) {
      log.error({ err, userId }, "Database error fetching active plan");
      return null;
    }
  }

  async findAll(): Promise<SafeUser[]> {
    return this.prisma.user.findMany({ select: userSelect });
  }

  async findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({ where: { id }, select: userSelect });
  }

  async findByEmail(email: string): Promise<User | null> {
    // This returns the full user including password for authentication.
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: Prisma.UserCreateInput): Promise<SafeUser> {
    return this.prisma.user.create({ data, select: userSelect });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<SafeUser> {
    return this.prisma.user.update({ where: { id }, data, select: userSelect });
  }

  async delete(id: string): Promise<SafeUser> {
    return this.prisma.user.delete({ where: { id }, select: userSelect });
  }
}
