import { z } from 'zod';
export const scenarioInfoSchema = z.strictObject({ id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/), version: z.string().min(1).max(64), label: z.string().min(1).max(80), kind: z.enum(['html', 'text']) });
export type ScenarioInfo = z.infer<typeof scenarioInfoSchema>;
export const artifactSchema = z.strictObject({ kind: z.enum(['html', 'text']), content: z.string().min(1).max(524288), detail: z.string().min(1).max(2000) });
export type Artifact = z.infer<typeof artifactSchema>;
