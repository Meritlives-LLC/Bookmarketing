import { z } from 'zod';

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Invalid identifier',
  );

const shortText = (
  max: number,
) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max);

const optionalText = (
  max: number,
) =>
  z
    .string()
    .trim()
    .max(max)
    .optional();

export const createVideoProjectSchema =
  z
    .object({
      name: optionalText(200),

      visualStyle: z
        .enum([
          'CINEMATIC_REALISM',
          'ANIMATION',
          'ANIME',
          'DOCUMENTARY',
          'FANTASY',
          'CUSTOM',
        ])
        .optional(),

      aspectRatio: z
        .enum([
          'RATIO_16_9',
          'RATIO_9_16',
          'RATIO_1_1',
        ])
        .optional(),

      resolution: optionalText(20),

      videoModel:
        optionalText(100),

      subtitleEnabled:
        z.boolean().optional(),

      subtitleMode: z
        .enum([
          'OFF',
          'SOFT',
          'BURNED_IN',
        ])
        .optional(),

      subtitleStyle: z
        .enum([
          'CLASSIC',
          'MODERN',
          'CINEMATIC',
          'MINIMAL',
          'BOLD',
          'CUSTOM',
        ])
        .optional(),

      subtitleConfig:
        z
          .record(
            z.string().max(100),
            z.unknown(),
          )
          .optional(),

      narrationWordsPerMinute:
        z
          .number()
          .int()
          .min(60)
          .max(300)
          .optional(),
    })
    .strict();

export const sceneIdSchema =
  z
    .object({
      sceneId:
        idSchema.optional(),
    })
    .strict();

export const updateScenePromptSchema =
  z
    .object({
      prompt:
        shortText(20_000),
    })
    .strict();

export const updateShotPromptSchema =
  z
    .object({
      prompt:
        shortText(20_000),
    })
    .strict();

export const subtitleSettingsSchema =
  z
    .object({
      enabled:
        z.boolean().optional(),

      mode: z
        .enum([
          'OFF',
          'SOFT',
          'BURNED_IN',
        ])
        .optional(),

      style: z
        .enum([
          'CLASSIC',
          'MODERN',
          'CINEMATIC',
          'MINIMAL',
          'BOLD',
          'CUSTOM',
        ])
        .optional(),

      config:
        z
          .record(
            z.string().max(100),
            z.unknown(),
          )
          .optional(),
    })
    .strict();

export function parseVideoBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): T {
  const result =
    schema.safeParse(
      body ?? {},
    );

  if (!result.success) {
    throw new Error(
      result.error.issues
        .map(
          (issue) =>
            `${issue.path.join('.')}: ${issue.message}`,
        )
        .join('; '),
    );
  }

  return result.data;
}