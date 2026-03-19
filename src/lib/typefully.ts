import { z } from "zod";

export const typefullyDraftModeSchema = z.enum(["new_post", "reply", "quote_post"]);

export const typefullySocialSetSchema = z.object({
  id: z.number().int().min(1),
  username: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  profileImageUrl: z.string().nullable().optional(),
  xUsername: z.string().nullable().optional(),
  xName: z.string().nullable().optional(),
  xProfileUrl: z.string().nullable().optional()
});

export type TypefullySocialSet = z.infer<typeof typefullySocialSetSchema>;

export const createTypefullyDraftRequestSchema = z.object({
  mode: typefullyDraftModeSchema.default("reply"),
  text: z.string().trim().min(1),
  mediaFilePath: z.string().trim().min(1).optional().nullable(),
  replyToTweetUrl: z.string().trim().min(1).optional().nullable(),
  socialSetId: z.coerce.number().int().min(1).optional().nullable(),
  draftTitle: z.string().trim().optional().nullable(),
  scratchpadText: z.string().trim().optional().nullable(),
  draftId: z.string().trim().min(1).optional().nullable(),
  outputIndex: z.coerce.number().int().min(0).optional().nullable()
}).superRefine((value, ctx) => {
  if ((value.mode === "reply" || value.mode === "quote_post") && !value.replyToTweetUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "replyToTweetUrl is required when mode is reply or quote_post",
      path: ["replyToTweetUrl"]
    });
  }
});

export type CreateTypefullyDraftRequest = z.infer<typeof createTypefullyDraftRequestSchema>;

export const createTypefullyDraftResultSchema = z.object({
  ok: z.literal(true),
  mode: typefullyDraftModeSchema,
  completedAt: z.string().min(1),
  socialSetId: z.number().int().min(1),
  typefullyDraftId: z.number().int().min(1),
  status: z.string().min(1),
  preview: z.string().nullable(),
  privateUrl: z.string().trim().min(1).nullable(),
  shareUrl: z.string().trim().min(1).nullable(),
  mediaId: z.string().trim().min(1).nullable(),
  draftId: z.string().trim().min(1).nullable(),
  outputIndex: z.number().int().min(0).nullable()
});

export type CreateTypefullyDraftResult = z.infer<typeof createTypefullyDraftResultSchema>;
