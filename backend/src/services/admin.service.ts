import { UserRole, AuditStatus } from '@prisma/client';
import { adminRepository } from '../repositories/admin.repository';
import { AppError } from '../utils/helpers';
import { paginate, buildPaginationMeta } from '../utils/formatter';

export const adminService = {
  async stats() {
    const { userCount, bookCount, auditCount, creativeCount, newUsersLast7d, byPlan, byRole } =
      await adminRepository.stats();

    return {
      userCount,
      bookCount,
      auditCount,
      creativeCount,
      newUsersLast7d,
      subscriptionsByPlan: byPlan.map((p) => ({ plan: p.plan, count: p._count._all })),
      usersByRole: byRole.map((r) => ({ role: r.role, count: r._count._all })),
    };
  },

  async listUsers(search: string | undefined, page: number, limit: number) {
    const { skip, take } = paginate(page, limit);
    const [users, total] = await adminRepository.findUsers(search, skip, take);
    return { users, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async updateUser(
    actingAdmin: { id: string; role: UserRole },
    targetId: string,
    input: { role?: UserRole; credits?: number }
  ) {
    if (input.role !== undefined) {
      if (targetId === actingAdmin.id) {
        throw AppError.badRequest("You can't change your own role", 'CANNOT_MODIFY_SELF');
      }
      if (input.role === 'SUPER_ADMIN' && actingAdmin.role !== 'SUPER_ADMIN') {
        throw AppError.forbidden('Only a super admin can grant super admin access');
      }
    }

    const existing = await adminRepository.findUserById(targetId);
    if (!existing) {
      throw AppError.notFound('User not found');
    }

    // A regular admin demoting/editing another admin's role is reserved for super admins.
    if (
      input.role !== undefined &&
      existing.role !== 'AUTHOR' &&
      actingAdmin.role !== 'SUPER_ADMIN'
    ) {
      throw AppError.forbidden('Only a super admin can change another admin\u2019s role');
    }

    return adminRepository.updateUser(targetId, input);
  },

  async deleteUser(actingAdminId: string, targetId: string) {
    if (targetId === actingAdminId) {
      throw AppError.badRequest("You can't delete your own account", 'CANNOT_MODIFY_SELF');
    }

    const existing = await adminRepository.findUserById(targetId);
    if (!existing) {
      throw AppError.notFound('User not found');
    }

    await adminRepository.deleteUser(targetId);
  },

  async listBooks(search: string | undefined, page: number, limit: number) {
    const { skip, take } = paginate(page, limit);
    const [books, total] = await adminRepository.findBooks(search, skip, take);
    return { books, meta: buildPaginationMeta(total, page ?? 1, take) };
  },

  async deleteBook(id: string) {
    const existing = await adminRepository.findBookById(id);
    if (!existing) {
      throw AppError.notFound('Book not found');
    }
    await adminRepository.deleteBook(id);
  },

  async listAudits(status: AuditStatus | undefined, page: number, limit: number) {
    const { skip, take } = paginate(page, limit);
    const [audits, total] = await adminRepository.findAudits(status, skip, take);
    return { audits, meta: buildPaginationMeta(total, page ?? 1, take) };
  },
};
