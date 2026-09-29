import { z } from 'zod';

export const snowflakeSchema = z
  .string()
  .regex(/^\d{17,20}$/, 'Must be a valid Discord snowflake ID');

export const uuidSchema = z
  .string()
  .uuid('Must be a valid UUID');

export const apiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.any().optional(),
});

export const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: apiErrorDetailSchema,
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const createSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export const createPaginatedSuccessSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(itemSchema),
      pagination: paginationMetaSchema,
    }),
  });
