import "server-only";

import { TUTORS_NAMESPACE_KEY } from "consts/app";
import { getConversationModel } from "libs/database/conversations";

export async function applyTutorSessionIntimacy(args: {
  serverUserId: string;
  personaId: string;
  eventKey: string;
  intimacyDelta: number;
}) {
  if (args.intimacyDelta <= 0) return false;
  const Model = await getConversationModel(args.serverUserId);
  const now = new Date();
  const result = await Model.updateOne(
    {
      userId: args.serverUserId,
      personaId: args.personaId,
      userPersonaId: TUTORS_NAMESPACE_KEY,
      "relationship.specialEvents.eventType": { $ne: args.eventKey },
    },
    [
      {
        $set: {
          updatedAt: now,
          relationship: {
            $let: {
              vars: {
                current: { $ifNull: ["$relationship", {}] },
                nextIntimacy: {
                  $min: [999, { $max: [0, { $add: [{ $ifNull: ["$relationship.intimacy", 0] }, args.intimacyDelta] }] }],
                },
              },
              in: {
                $mergeObjects: [
                  "$$current",
                  {
                    intimacy: "$$nextIntimacy",
                    intimacyLevel: {
                      $switch: {
                        branches: [
                          { case: { $gte: ["$$nextIntimacy", 900] }, then: "soulmate" },
                          { case: { $gte: ["$$nextIntimacy", 700] }, then: "best_friend" },
                          { case: { $gte: ["$$nextIntimacy", 400] }, then: "close_friend" },
                          { case: { $gte: ["$$nextIntimacy", 200] }, then: "friend" },
                          { case: { $gte: ["$$nextIntimacy", 100] }, then: "acquaintance" },
                          { case: { $gte: ["$$nextIntimacy", 50] }, then: "familiar_face" },
                        ],
                        default: "stranger",
                      },
                    },
                    lastInteraction: now,
                    intimacyHistory: {
                      $concatArrays: [
                        { $ifNull: ["$$current.intimacyHistory", []] },
                        [{ change: args.intimacyDelta, reason: "tutors_session_complete", timestamp: now }],
                      ],
                    },
                    specialEvents: {
                      $concatArrays: [
                        { $ifNull: ["$$current.specialEvents", []] },
                        [{ eventType: args.eventKey, date: now, description: "Tutors valid session reward" }],
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  ).exec();
  return result.modifiedCount > 0;
}
