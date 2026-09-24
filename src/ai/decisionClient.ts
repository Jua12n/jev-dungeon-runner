import { decisionSchema } from './decisionSchema';
import { chooseMockAction } from './mockBrain';
import type { JevDecision, JevGameState } from './types';

export async function requestJevDecision(state: JevGameState): Promise<JevDecision> {
  try {
    const response = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error(`Decision API returned ${response.status}`);
    }

    const payload: unknown = await response.json();
    return decisionSchema.parse(payload);
  } catch (error) {
    console.warn('Using local fallback decision:', error);
    return {
      action: chooseMockAction(state),
      confidence: 0.55,
      source: 'fallback',
    };
  }
}
