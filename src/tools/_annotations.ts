export const READ_ANNOTATIONS = {
  readOnlyHint: true,
  openWorldHint: true,
  idempotentHint: true,
} as const;

export const WRITE_ANNOTATIONS = { openWorldHint: true } as const;
export const UPDATE_ANNOTATIONS = { openWorldHint: true, idempotentHint: true } as const;
export const DELETE_ANNOTATIONS = { destructiveHint: true, openWorldHint: true } as const;
