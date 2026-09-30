import "server-only";

import { processSesEventWithStore } from "./sesEventCore";
import { mongoMailEventStore } from "./sesEventStore";
import type { SnsEnvelope } from "./snsEnvelope";
import type { SesTopicContract } from "./sesEventTypes";

export function processSesEvent(input: {
  envelope: SnsEnvelope;
  topic: SesTopicContract;
  hashSecret: string;
  receivedAt?: Date;
}) {
  return processSesEventWithStore({ ...input, store: mongoMailEventStore });
}

export { processSesEventWithStore } from "./sesEventCore";
