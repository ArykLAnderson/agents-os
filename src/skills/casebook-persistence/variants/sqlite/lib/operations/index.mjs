import { unsupported } from "../../../../shared/protocol.mjs";

// Exceptional operations require separate human authorization and later work items.
export function invokeExceptionalOperation(operation) {
  return unsupported(`operations.${operation}`);
}
