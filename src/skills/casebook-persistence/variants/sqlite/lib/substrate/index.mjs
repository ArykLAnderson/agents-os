import { unsupported } from "../../../../shared/protocol.mjs";

// Owner-neutral substrate skeleton. L01-W01 exposes no store operation.
export function invokeSubstrateOperation(operation) {
  return unsupported(operation);
}
