import { assertReviewExecutionConfigV7 } from "./reviewExecutionConfigV7";
import { assertReviewExecutionConfigV8 } from "./reviewExecutionConfigV8";
import { assertReviewExecutionConfigV9 } from "./reviewExecutionConfigV9";

// Version implementations depend only on earlier protocols. Dispatch belongs
// outside that dependency chain so native ESM can initialize every version.
export function assertPinnedReviewConfig(value: unknown) {
  const version = (value as { version?: number })?.version;
  if (version === 4) return assertReviewExecutionConfigV9(value);
  if (version === 3) return assertReviewExecutionConfigV8(value);
  return assertReviewExecutionConfigV7(value);
}
