import { unsupported } from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";

// Typed Frame façade boundary; semantic operations begin in later work items.
export function invokeFrameOperation(operation) {
  void invokeSubstrateOperation;
  return unsupported(`frame.${operation}`);
}
