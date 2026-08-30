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
  LEGACY_SAFE_ERROR_CODE,
  toLegacyCompatibleError,
  wrapForLegacyErrors,
} from "./errors.js";

export {
  authenticateBearerRequest,
  type AuthInfo,
  type AuthVerifier,
  type BearerAuthOptions,
} from "./auth.js";

export {
  runLegacyClientProbe,
  type LegacyProbeOptions,
  type LegacyProbeStep,
  type LegacyProbeResult,
  runModernClientProbe,
  type ModernProbeOptions,
  type ModernProbeStep,
  type ModernProbeResult,
} from "./probe.js";
