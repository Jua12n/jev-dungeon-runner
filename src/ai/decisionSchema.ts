import { z } from 'zod';
import { JEV_ACTIONS } from './types';

export const decisionSchema = z.object({
  action: z.enum(JEV_ACTIONS),
  confidence: z.number().min(0).max(1),
  source: z.enum(['jev', 'mock', 'fallback']),
  probabilities: z.partialRecord(z.enum(JEV_ACTIONS), z.number().min(0).max(1)).optional(),
});
