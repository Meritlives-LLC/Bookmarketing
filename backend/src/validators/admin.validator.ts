import { z } from 'zod';

export const updateUserByAdminSchema = z
  .object({
    role: z.enum(['AUTHOR', 'ADMIN', 'SUPER_ADMIN']).optional(),
    credits: z.coerce.number().int().min(0).max(100_000).optional(),
  })
  .refine((data) => data.role !== undefined || data.credits !== undefined, {
    message: 'Provide at least role or credits',
  });

export const adminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminAuditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['PENDING', 'SCRAPING', 'ANALYZING', 'COMPLETED', 'FAILED']).optional(),
});
