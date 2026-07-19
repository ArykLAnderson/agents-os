import { unsupported } from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";

// Typed Case façade boundary; semantic operations begin in later work items.
export function invokeCaseOperation(operation) {
  void invokeSubstrateOperation;
  return unsupported(`case.${operation}`);
}
