import { PrismaClient, Prisma, User } from '@prisma/client';
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger({ module: "user-service" });

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  maxQuota: true,
  createdAt: true,
  updatedAt: true,
};

// Return type without password for public endpoints
export type SafeUser = Omit<User, "password">;

export class UserService {
  constructor(private prisma: PrismaClient) {}

  async getUserMaxQuota(userId: string): Promise<number> {
    try {
      const userRecord = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { maxQuota: true }
      });
      return userRecord?.maxQuota || 0;
    } catch (err) {
      log.error({ err, userId }, "Database error fetching user quota");
      return 0;
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
