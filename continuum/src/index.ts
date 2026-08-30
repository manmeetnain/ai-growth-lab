export const CONTINUUM_VERSION = "0.1.0";

export {
  createLegacyHandshakeResponder,
  isLegacyHandshakeRequest,
  MCP_SESSION_ID_HEADER,
  type LegacyHandshakeOptions,
  type LegacyHandshakeResponder,
} from "./legacy.js";

export {
  createStatelessResponder,
  type StatelessResponderOptions,
  type StatelessResponder,
} from "./modern.js";

export {
  continuum,
  type ContinuumOptions,
  type Continuum,
} from "./continuum.js";

export {
  runLegacyClientProbe,
  type LegacyProbeOptions,
  type LegacyProbeStep,
  type LegacyProbeResult,
} from "./probe.js";
