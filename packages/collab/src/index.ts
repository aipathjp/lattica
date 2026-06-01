/** @lattica/collab — realtime collaboration primitives for Lattica. */

export { keyBetween, keysBetween, isOrderKey } from './order-key.js';
export {
  TableDocument,
  type CellOp,
  type SiteId,
  type DocumentListener,
} from './crdt.js';
export {
  PresenceRegistry,
  type PresenceState,
  type PresenceListener,
} from './presence.js';
export {
  InMemoryNetwork,
  type CollabTransport,
  type CollabMessage,
  type MessageHandler,
} from './transport.js';
export {
  CollabSession,
  type CollabSessionOptions,
} from './session.js';
