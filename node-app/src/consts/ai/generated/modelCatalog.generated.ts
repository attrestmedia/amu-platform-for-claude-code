// GENERATED FILE — DO NOT EDIT
// Source: config/ai-model-catalog.yaml
// Generator: scripts/build/generateAiModelCatalog.mjs

export const AI_MODEL_CATALOG = {
  "manifestSchemaVersion": 1,
  "pricingPolicy": {
    "coinPriceKrw": 1,
    "vatIncludedInCoinPrice": false,
    "paymentFeeRate": 0.0374,
    "fxKrwPerUsd": {
      "value": 1500,
      "reviewedAt": "2026-10-11",
      "source": "Frankfurter v2 USD/KRW 90일 최고치 10원 올림 — SSOT-114 W1 fx-baseline (rateDate 2026-07-14)",
      "provisional": false
    },
    "targetMargin": 0.4,
    "overheadRate": 0.05,
    "minMargin": 0.35,
    "enforcement": "enforce"
  },
  "models": [
    {
      "id": "claude:claude-fable-5-1",
      "entryKind": "model",
      "provider": "claude",
      "modelName": "claude-fable-5-1",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.anthropic.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 11,
          "displayName": "claude-fable-5-1",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "always_on",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 35,
                "output": 7
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 10,
                "output": 50
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-27",
              "sourceUrl": "https://platform.claude.com/docs/en/models/fable-5-1/overview",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "claude:claude-haiku-5-5",
      "entryKind": "model",
      "provider": "claude",
      "modelName": "claude-haiku-5-5",
      "upstreamModelName": "claude-haiku-5-5",
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.anthropic.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 16,
          "displayName": "claude-haiku-5-5",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": 1000000,
            "maxOutputTokens": 128000,
            "maxReferenceImages": null,
            "source": "https://platform.claude.com/docs/en/models/haiku-5-5/overview",
            "verifiedAt": "2026-10-13T00:00:00.000Z"
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "adaptive",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 3529,
                "output": 705
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "long",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 705,
                    "output": 141
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 3529,
                    "output": 705
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.1,
                "output": 0.5
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "5729baa1-84a5-4c58-b050-b657bfd9fb38"
              },
              "verifiedAt": "2026-10-13",
              "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
              "variants": [
                {
                  "id": "long",
                  "tokenUsdPerMTok": {
                    "input": 0.5,
                    "output": 2.5
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "0ca3c5bc-9257-4ea1-8e63-33bc1dfc3145"
                  },
                  "verifiedAt": "2026-10-13",
                  "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "tokenUsdPerMTok": {
                    "input": 0.1,
                    "output": 0.5
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "0ca3c5bc-9257-4ea1-8e63-33bc1dfc3145"
                  },
                  "verifiedAt": "2026-10-13",
                  "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "claude:claude-opus-5-5",
      "entryKind": "model",
      "provider": "claude",
      "modelName": "claude-opus-5-5",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.anthropic.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 13,
          "displayName": "claude-opus-5-5",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "always_on",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 88,
                "output": 17
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 4,
                "output": 20
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-27",
              "sourceUrl": "https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "claude:claude-sonnet-5-5",
      "entryKind": "model",
      "provider": "claude",
      "modelName": "claude-sonnet-5-5",
      "upstreamModelName": "claude-sonnet-5-5",
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.anthropic.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 15,
          "displayName": "claude-sonnet-5-5",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": 1000000,
            "maxOutputTokens": 128000,
            "maxReferenceImages": null,
            "source": "https://platform.claude.com/docs/en/models/sonnet-5-5/overview",
            "verifiedAt": "2026-10-13T00:00:00.000Z"
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "adaptive",
            "thinkingOff": "between_tools",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 176,
                "output": 35
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 2,
                "output": 10
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "5729baa1-84a5-4c58-b050-b657bfd9fb38"
              },
              "verifiedAt": "2026-10-13",
              "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "deepseek:deepseek-v4-flash",
      "entryKind": "model",
      "provider": "deepseek",
      "modelName": "deepseek-v4-flash",
      "upstreamModelName": "deepseek-flash",
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.deepseek.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 17,
          "displayName": "deepseek-v4-flash",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 1176,
                "output": 294
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.3,
                "output": 1.2
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:39.888878Z",
              "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "deepseek:deepseek-v4-pro",
      "entryKind": "model",
      "provider": "deepseek",
      "modelName": "deepseek-v4-pro",
      "upstreamModelName": "deepseek-v4-pro",
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.deepseek.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 18,
          "displayName": "deepseek-v4-pro",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 267,
                "output": 89
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 1.32,
                "output": 3.96
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:39.888878Z",
              "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "elevenlabs:eleven-flash-v2-5",
      "entryKind": "model",
      "provider": "elevenlabs",
      "modelName": "eleven-flash-v2-5",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.elevenlabs.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 9,
          "displayName": "eleven-flash-v2-5",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_tts"
            ],
            "capabilities": [
              "tts_http",
              "tts_websocket"
            ],
            "readiness": "observed",
            "upstreamCertainty": "unverified",
            "billingUnit": "character",
            "billingUnitUnknownReason": null,
            "documentedModelId": "eleven_flash_v2_5",
            "note": null
          },
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "thousand_characters",
                  "coinsPerUnit": 114
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "thousand_characters",
                  "usdPerUnit": 0.04,
                  "verifiedAt": "2026-10-13",
                  "sourceUrl": "https://elevenlabs.io/pricing/api"
                }
              ],
              "certainty": "verified",
              "verifiedAt": "2026-10-13",
              "sourceUrl": "https://elevenlabs.io/pricing/api",
              "trackerEvidence": {
                "trackerRunId": "68a3897e-0ff1-4fc0-8aa7-026761686643"
              },
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": [
              {
                "unit": "character",
                "perQuantity": 1000,
                "usd": 0.05,
                "source": "elevenlabs pricing/api 2026-09-06"
              }
            ],
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "elevenlabs:eleven-multilingual-v2",
      "entryKind": "model",
      "provider": "elevenlabs",
      "modelName": "eleven-multilingual-v2",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.elevenlabs.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 10,
          "displayName": "eleven-multilingual-v2",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_tts"
            ],
            "capabilities": [
              "tts_http",
              "tts_websocket"
            ],
            "readiness": "observed",
            "upstreamCertainty": "unverified",
            "billingUnit": "character",
            "billingUnitUnknownReason": null,
            "documentedModelId": "eleven_multilingual_v2",
            "note": null
          },
          "pricing": {
            "sell": null,
            "providerCost": null,
            "referencePrice": [
              {
                "unit": "character",
                "perQuantity": 1000,
                "usd": 0.1,
                "source": "elevenlabs pricing/api 2026-09-06"
              }
            ],
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "elevenlabs:eleven-v3",
      "entryKind": "model",
      "provider": "elevenlabs",
      "modelName": "eleven-v3",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.elevenlabs.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 11,
          "displayName": "eleven-v3",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_tts"
            ],
            "capabilities": [
              "tts_http"
            ],
            "readiness": "observed",
            "upstreamCertainty": "unverified",
            "billingUnit": "character",
            "billingUnitUnknownReason": null,
            "documentedModelId": "eleven_v3",
            "note": "표현력 우선 모델. 실시간 대화 기본값으로 쓰지 않는다(ADR-EL-001 D4)."
          },
          "pricing": {
            "sell": null,
            "providerCost": null,
            "referencePrice": [
              {
                "unit": "character",
                "perQuantity": 1000,
                "usd": 0.1,
                "source": "elevenlabs pricing/api 2026-09-06"
              }
            ],
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "elevenlabs:eleven-v3-conversational",
      "entryKind": "model",
      "provider": "elevenlabs",
      "modelName": "eleven-v3-conversational",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.elevenlabs.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 13,
          "displayName": "eleven-v3-conversational",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_tts"
            ],
            "capabilities": [
              "dialogue_websocket"
            ],
            "readiness": "observed",
            "upstreamCertainty": "unverified",
            "billingUnit": null,
            "billingUnitUnknownReason": "Text-to-Dialogue 단가를 공식 가격표에서 확인하지 못했다.",
            "documentedModelId": "eleven_v3_conversational",
            "note": "단가 단위 미확정. 단위 없는 가격은 SPEECH_PRICING_UNVERIFIED로 거부한다(ADR-EL-001 D5)."
          },
          "pricing": {
            "sell": null,
            "providerCost": null,
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "elevenlabs:scribe-v2",
      "entryKind": "model",
      "provider": "elevenlabs",
      "modelName": "scribe-v2",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.elevenlabs.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 12,
          "displayName": "scribe-v2",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": true,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_stt"
            ],
            "capabilities": [
              "stt_file"
            ],
            "readiness": "observed",
            "upstreamCertainty": "unverified",
            "billingUnit": "audio_second",
            "billingUnitUnknownReason": null,
            "documentedModelId": "scribe_v2",
            "note": null
          },
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "minute",
                  "coinsPerUnit": 11
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "minute",
                  "usdPerUnit": 0.0036666667,
                  "verifiedAt": "2026-10-13",
                  "sourceUrl": "https://elevenlabs.io/pricing/api"
                }
              ],
              "certainty": "verified",
              "verifiedAt": "2026-10-13",
              "sourceUrl": "https://elevenlabs.io/pricing/api",
              "trackerEvidence": {
                "trackerRunId": "68a3897e-0ff1-4fc0-8aa7-026761686643"
              },
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": [
              {
                "unit": "audio_second",
                "perQuantity": 3600,
                "usd": 0.22,
                "source": "elevenlabs pricing/api 2026-09-06"
              }
            ],
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:gemini-2.5-flash-image",
      "entryKind": "model",
      "provider": "google",
      "modelName": "gemini-2.5-flash-image",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [
        {
          "modelId": "google:gemini-2.5-flash-image/image",
          "route": "elevenlabs",
          "elModelId": "gemini-2.5-flash-image",
          "equivalence": "same_model",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 0,
          "displayName": "Nano Banana",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 14,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "fixed"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [
                "1:1",
                "2:3",
                "3:2",
                "3:4",
                "4:3",
                "4:5",
                "5:4",
                "9:16",
                "16:9",
                "21:9"
              ],
              "supportedSizes": [
                "1K"
              ],
              "sizeByAspectRatio": {},
              "displayAliases": {
                "gemini-2.5-flash-image": "Nano Banana"
              }
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 111
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.039,
                  "verifiedAt": "2026-10-11T04:23:36.521845Z",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                }
              ],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:23:36.521845Z",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:gemini-3.1-flash-image-preview",
      "entryKind": "model",
      "provider": "google",
      "modelName": "gemini-3.1-flash-image-preview",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [
        {
          "modelId": "google:gemini-3.1-flash-image-preview/image",
          "route": "elevenlabs",
          "elModelId": "gemini-3.1-flash-image",
          "equivalence": "ga_of_preview",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 1,
          "displayName": "Nano Banana 2",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 14,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "fixed"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [
                "1:4",
                "1:8",
                "4:1",
                "8:1",
                "1:1",
                "2:3",
                "3:2",
                "3:4",
                "4:3",
                "4:5",
                "5:4",
                "9:16",
                "16:9",
                "21:9"
              ],
              "supportedSizes": [
                "512",
                "1K",
                "2K",
                "4K"
              ],
              "sizeByAspectRatio": {},
              "displayAliases": {
                "gemini-3.1-flash-image-preview": "Nano Banana 2"
              }
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 160
                }
              ],
              "variants": [
                {
                  "id": "1K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "image",
                      "coinsPerUnit": 190
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "2K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "image",
                      "coinsPerUnit": 240
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "image",
                      "coinsPerUnit": 321
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "512",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "image",
                      "coinsPerUnit": 105
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-03-14",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
              "variants": [
                {
                  "id": "1K",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "image",
                      "usdPerUnit": 0.067,
                      "verifiedAt": "2026-03-14",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "9af8bede4514"
                  },
                  "verifiedAt": "2026-03-14",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "image",
                      "usdPerUnit": 0.113,
                      "verifiedAt": "2026-10-11T04:23:36.521845Z",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
                  },
                  "verifiedAt": "2026-10-11T04:23:36.521845Z",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:gemini-3.1-flash-lite",
      "entryKind": "model",
      "provider": "google",
      "modelName": "gemini-3.1-flash-lite",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 27,
          "displayName": "gemini-3.1-flash-lite",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "supported",
            "thinkingBudget": "supported",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": null,
            "providerCost": null,
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:gemini-3.8-flash",
      "entryKind": "model",
      "provider": "google",
      "modelName": "gemini-3.8-flash",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 0,
          "displayName": "gemini-3.8-flash",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "unsupported",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 470,
                "output": 94
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.75,
                "output": 3.75
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-27",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/latest-model?hl=en",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:veo-3.1-fast-generate-preview",
      "entryKind": "model",
      "provider": "google",
      "modelName": "veo-3.1-fast-generate-preview",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [
        {
          "modelId": "google:veo-3.1-fast-generate-preview/video",
          "route": "elevenlabs",
          "elModelId": "veo-3.1-fast-generate-001",
          "equivalence": "ga_of_preview",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "video",
          "displayOrder": 1,
          "displayName": "veo-3.1-fast-generate-preview",
          "recommended": true,
          "launchState": "internal",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 1,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": {
              "modes": [
                "text-to-video",
                "image-to-video",
                "reference-to-video"
              ],
              "durationsSeconds": [
                4,
                6,
                8
              ],
              "resolutions": [
                "720p",
                "1080p"
              ],
              "aspectRatios": [
                "16:9",
                "9:16",
                "1:1"
              ],
              "audio": true,
              "maxReferenceImages": 1,
              "pricingVariant": "720p"
            }
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "1080p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 340
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 850
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 284
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "variants": [
                {
                  "id": "1080p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.12,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.3,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.1,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:veo-3.1-generate-preview",
      "entryKind": "model",
      "provider": "google",
      "modelName": "veo-3.1-generate-preview",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [
        {
          "modelId": "google:veo-3.1-generate-preview/video",
          "route": "elevenlabs",
          "elModelId": "veo-3.1-generate-001",
          "equivalence": "ga_of_preview",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "video",
          "displayOrder": 0,
          "displayName": "veo-3.1-generate-preview",
          "recommended": false,
          "launchState": "internal",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 1,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": {
              "modes": [
                "text-to-video",
                "image-to-video"
              ],
              "durationsSeconds": [
                4,
                6,
                8
              ],
              "resolutions": [
                "720p",
                "1080p",
                "4K"
              ],
              "aspectRatios": [
                "16:9",
                "9:16"
              ],
              "audio": true,
              "maxReferenceImages": 1,
              "pricingVariant": "720p"
            }
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "1080p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 1134
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 1700
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 1134
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "variants": [
                {
                  "id": "1080p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.4,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "4K",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.6,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.4,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "google:veo-3.1-lite-generate-preview",
      "entryKind": "model",
      "provider": "google",
      "modelName": "veo-3.1-lite-generate-preview",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.google.gemini",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "video",
          "displayOrder": 2,
          "displayName": "veo-3.1-lite-generate-preview",
          "recommended": false,
          "launchState": "internal",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 1,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": {
              "modes": [
                "text-to-video",
                "image-to-video"
              ],
              "durationsSeconds": [
                4,
                6,
                8
              ],
              "resolutions": [
                "720p",
                "1080p"
              ],
              "aspectRatios": [
                "16:9",
                "9:16"
              ],
              "audio": false,
              "maxReferenceImages": 1,
              "pricingVariant": "720p"
            }
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "1080p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 227
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 142
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "variants": [
                {
                  "id": "1080p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.08,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.05,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-4o-transcribe-diarize",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-4o-transcribe-diarize",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 14,
          "displayName": "gpt-4o-transcribe-diarize",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "hybrid",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {
                "audio": {
                  "input": 141,
                  "output": 35
                },
                "text": {
                  "input": null,
                  "output": 35
                }
              },
              "fixedRates": [
                {
                  "unit": "minute",
                  "coinsPerUnit": 12
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {
                "audio": {
                  "input": 2.5,
                  "output": 10
                }
              },
              "fixedRatesUsd": [],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize",
              "trackerEvidence": {
                "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
              },
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-6-astra",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-6-astra",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 7,
          "displayName": "gpt-6-astra",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": true,
            "levels": [
              "low",
              "medium",
              "high",
              "xhigh",
              "max"
            ],
            "default": "low"
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 35,
                "output": 7
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "long",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 17,
                    "output": 4
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 35,
                    "output": 7
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 10,
                "output": 50
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
              "variants": [
                {
                  "id": "long",
                  "tokenUsdPerMTok": {
                    "input": 20,
                    "output": 75
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "tokenUsdPerMTok": {
                    "input": 10,
                    "output": 50
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-6-luna",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-6-luna",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 9,
          "displayName": "gpt-6-luna",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": true,
            "levels": [
              "none",
              "low",
              "medium",
              "high",
              "xhigh",
              "max"
            ],
            "default": "low"
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 3529,
                "output": 705
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "long",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 1764,
                    "output": 470
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 3529,
                    "output": 705
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.1,
                "output": 0.5
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
              "variants": [
                {
                  "id": "long",
                  "tokenUsdPerMTok": {
                    "input": 0.2,
                    "output": 0.75
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "tokenUsdPerMTok": {
                    "input": 0.1,
                    "output": 0.5
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-6-sol",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-6-sol",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 8,
          "displayName": "gpt-6-sol",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "unsupported",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": true,
            "levels": [
              "none",
              "low",
              "medium",
              "high",
              "xhigh",
              "max"
            ],
            "default": "low"
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 176,
                "output": 35
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "long",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 88,
                    "output": 23
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 176,
                    "output": 35
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 2,
                "output": 10
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
              "variants": [
                {
                  "id": "long",
                  "tokenUsdPerMTok": {
                    "input": 4,
                    "output": 15
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "tokenUsdPerMTok": {
                    "input": 2,
                    "output": 10
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
                  },
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-audio-1.5",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-audio-1.5",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": "gpt-audio"
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 5,
          "displayName": "gpt-audio-1.5",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": true,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_analysis"
            ],
            "capabilities": [
              "stt_file"
            ],
            "readiness": "policy_approved",
            "upstreamCertainty": "verified",
            "billingUnit": null,
            "billingUnitUnknownReason": "text/audio 모달리티별 generic token 정산을 사용한다. 고정 SpeechBillingUnit은 적용하지 않는다.",
            "documentedModelId": null,
            "note": "text 160/35, audio 12/5 tokens/coin을 기존 gpt-audio 요율 키로 정산한다. usage modality breakdown 누락·무효 시 fail-closed."
          },
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {
                "text": {
                  "input": 141,
                  "output": 35
                },
                "audio": {
                  "input": 11,
                  "output": 5
                }
              },
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 2.5,
                "output": 10
              },
              "tokenUsdPerMTokByModality": {
                "audio": {
                  "input": 32,
                  "output": 64
                }
              },
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-28",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-audio-1.5",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-image-2.5-flare",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-image-2.5-flare",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [
        {
          "modelId": "openai:gpt-image-2.5-flare/image",
          "route": "elevenlabs",
          "elModelId": "gpt-image-2.5-flare",
          "equivalence": "same_model",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 3,
          "displayName": "Flare",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 16,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "flexible"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [],
              "supportedSizes": [],
              "sizeByAspectRatio": {},
              "displayAliases": {
                "gpt-image-2.5-flare": "Flare"
              }
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "hybrid",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {
                "text": {
                  "input": 80,
                  "output": null
                },
                "image": {
                  "input": 50,
                  "output": 8
                }
              },
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 150
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.221,
                  "verifiedAt": "2026-09-09",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare"
                }
              ],
              "certainty": "estimated",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-09",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-image-2.5-sunburst",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-image-2.5-sunburst",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [
        {
          "modelId": "openai:gpt-image-2.5-sunburst/image",
          "route": "elevenlabs",
          "elModelId": "gpt-image-2.5-sunburst",
          "equivalence": "same_model",
          "state": "candidate",
          "capability": {
            "modes": [],
            "aspectRatios": [],
            "resolutions": [],
            "durations": [],
            "maxReferenceImages": null,
            "audio": false
          },
          "allowedCallers": [],
          "grantCost": {
            "unit": "request",
            "credits": null
          },
          "verifiedAt": null,
          "evidence": null
        }
      ],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 4,
          "displayName": "Sunburst",
          "recommended": false,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 16,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "flexible"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [],
              "supportedSizes": [],
              "sizeByAspectRatio": {},
              "displayAliases": {
                "gpt-image-2.5-sunburst": "Sunburst"
              }
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "hybrid",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {
                "text": {
                  "input": 80,
                  "output": null
                },
                "image": {
                  "input": 50,
                  "output": 8
                }
              },
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 150
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.221,
                  "verifiedAt": "2026-09-09",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst"
                }
              ],
              "certainty": "estimated",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-09",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-realtime-translate",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-realtime-translate",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 15,
          "displayName": "gpt-realtime-translate",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "minute",
                  "coinsPerUnit": 97
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "minute",
                  "usdPerUnit": 0.034,
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-translate"
                }
              ],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-translate",
              "trackerEvidence": {
                "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
              },
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-realtime-whisper",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-realtime-whisper",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 16,
          "displayName": "gpt-realtime-whisper",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "minute",
                  "coinsPerUnit": 49
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "minute",
                  "usdPerUnit": 0.017,
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-whisper"
                }
              ],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-whisper",
              "trackerEvidence": {
                "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
              },
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "openai:gpt-transcribe",
      "entryKind": "model",
      "provider": "openai",
      "modelName": "gpt-transcribe",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.openai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 6,
          "displayName": "gpt-transcribe",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": true,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_stt"
            ],
            "capabilities": [
              "stt_file"
            ],
            "readiness": "policy_approved",
            "upstreamCertainty": "verified",
            "billingUnit": "audio_second",
            "billingUnitUnknownReason": null,
            "documentedModelId": null,
            "note": "9 coins/started minute. 서버 확인 audio_second는 ledger에 보존하고 고정 과금 adapter에서 minutes=ceil(seconds/60)로 변환한다."
          },
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "minute",
                  "coinsPerUnit": 13
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "minute",
                  "usdPerUnit": 0.0045,
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-transcribe"
                }
              ],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              },
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-transcribe",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "photoroom:remove-bg",
      "entryKind": "utility",
      "provider": "photoroom",
      "modelName": "remove-bg",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.photoroom.remove-bg",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 9,
          "displayName": "remove-bg",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 57
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.02,
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://docs.photoroom.com/remove-background-api-basic-plan/pricing"
                }
              ],
              "certainty": "verified",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null,
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://docs.photoroom.com/remove-background-api-basic-plan/pricing",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              }
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "pixian:remove-bg",
      "entryKind": "utility",
      "provider": "pixian",
      "modelName": "remove-bg",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.pixian.remove-bg",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 10,
          "displayName": "remove-bg",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 57
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.02,
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://pixian.ai/pricing"
                }
              ],
              "certainty": "verified",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null,
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://pixian.ai/pricing",
              "trackerEvidence": {
                "trackerRunId": "99dbb6c8-b1c5-498a-ac07-33982349ca0f"
              }
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "qwen:qwen-audio-3.1-asr-flash",
      "entryKind": "model",
      "provider": "qwen",
      "modelName": "qwen-audio-3.1-asr-flash",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.qwen.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "audio",
          "displayOrder": 8,
          "displayName": "qwen-audio-3.1-asr-flash",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": true,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_stt"
            ],
            "capabilities": [
              "stt_file"
            ],
            "readiness": "observed",
            "upstreamCertainty": "verified",
            "billingUnit": null,
            "billingUnitUnknownReason": "Model Studio ASR은 input/output token 정산(코인당 5,600/1,072 tokens)을 사용한다. D10은 provider usage 전체를 전달하고 누락 시 fail-closed해야 한다.",
            "documentedModelId": "qwen-audio-3.1-asr-flash",
            "note": "최신 비실시간 ASR. Usage parser와 runtime 연결은 D10이며, 누락·불일치 usage는 정산 오류로 fail-closed한다."
          },
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 2353,
                "output": 750
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.15,
                "output": 0.47
              },
              "tokenUsdPerMTokByModality": {
                "audio": {
                  "input": 0.15,
                  "output": 0.47
                }
              },
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:41.123456Z",
              "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "qwen:qwen-image-3.0-pro",
      "entryKind": "model",
      "provider": "qwen",
      "modelName": "qwen-image-3.0-pro",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.qwen.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 5,
          "displayName": "qwen-image-3.0-pro",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "fixed"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [],
              "supportedSizes": [],
              "sizeByAspectRatio": {},
              "displayAliases": {}
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "1K",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "image",
                      "coinsPerUnit": 114
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-28",
              "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
              "variants": [
                {
                  "id": "1K",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "image",
                      "usdPerUnit": 0.04,
                      "verifiedAt": "2026-09-28",
                      "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
                    }
                  ],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "9af8bede4514"
                  },
                  "verifiedAt": "2026-09-28",
                  "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "qwen:qwen3.8-omni-flash",
      "entryKind": "model",
      "provider": "qwen",
      "modelName": "qwen3.8-omni-flash",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.qwen.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 19,
          "displayName": "qwen3.8-omni-flash",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 2353,
                "output": 750
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.15,
                "output": 0.47
              },
              "tokenUsdPerMTokByModality": {
                "audio": {
                  "input": 0.15,
                  "output": 0.47
                },
                "image": {
                  "input": 0.15,
                  "output": null
                },
                "video": {
                  "input": 0.15,
                  "output": null
                }
              },
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:41.123456Z",
              "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        },
        {
          "modality": "audio",
          "displayOrder": 7,
          "displayName": "qwen3.8-omni-flash",
          "recommended": false,
          "launchState": "admin_only",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": true,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": {
            "roles": [
              "speech_analysis"
            ],
            "capabilities": [
              "stt_file"
            ],
            "readiness": "observed",
            "upstreamCertainty": "verified",
            "billingUnit": null,
            "billingUnitUnknownReason": "Model Studio의 modality 변환 input/output token에 generic token 정산을 적용한다. D10 provider usage는 승인된 adapter 형식과 일치해야 한다.",
            "documentedModelId": null,
            "note": "Model Studio Singapore International 가격은 input $0.15, cache-hit input $0.016, output $0.47/1M token이다. 비캐시 input 상한 COGS만 기록하며 provider usage 매핑과 정산 검증 전 라우팅하지 않는다."
          },
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 2353,
                "output": 750
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.15,
                "output": 0.47
              },
              "tokenUsdPerMTokByModality": {
                "audio": {
                  "input": 0.15,
                  "output": 0.47
                },
                "image": {
                  "input": 0.15,
                  "output": null
                },
                "video": {
                  "input": 0.15,
                  "output": null
                }
              },
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:41.123456Z",
              "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "xai:grok-4.5",
      "entryKind": "model",
      "provider": "xai",
      "modelName": "grok-4.5",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.xai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 28,
          "displayName": "grok-4.5",
          "recommended": false,
          "launchState": "internal",
          "selectable": false,
          "routable": false,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 176,
                "output": 58
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 2,
                "output": 6
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:23:10.458598Z",
              "sourceUrl": "https://docs.x.ai/developers/models/grok-4.5",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "xai:grok-4.7",
      "entryKind": "model",
      "provider": "xai",
      "modelName": "grok-4.7",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.xai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 23,
          "displayName": "grok-4.7",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 88,
                "output": 29
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "long",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 88,
                    "output": 29
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "strategy": "token",
                  "tokensPerCoin": {
                    "input": 176,
                    "output": 58
                  },
                  "tokensPerCoinByModality": {},
                  "fixedRates": [],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 4,
                "output": 12
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-29",
              "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
              "variants": [
                {
                  "id": "long",
                  "tokenUsdPerMTok": {
                    "input": 4,
                    "output": 12
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "9af8bede4514"
                  },
                  "verifiedAt": "2026-09-29",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "short",
                  "tokenUsdPerMTok": {
                    "input": 2,
                    "output": 6
                  },
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [],
                  "certainty": "verified",
                  "trackerEvidence": {
                    "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
                  },
                  "verifiedAt": "2026-10-11T04:23:10.458598Z",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "xai:grok-imagine-image-2.0",
      "entryKind": "model",
      "provider": "xai",
      "modelName": "grok-imagine-image-2.0",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.xai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 6,
          "displayName": "grok-imagine-image-2.0",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 3,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "fixed"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [],
              "supportedSizes": [],
              "sizeByAspectRatio": {},
              "displayAliases": {}
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 114
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.04,
                  "verifiedAt": "2026-09-27",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-image-2.0"
                }
              ],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9af8bede4514"
              },
              "verifiedAt": "2026-09-27",
              "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-image-2.0",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "xai:grok-imagine-video-1.5",
      "entryKind": "model",
      "provider": "xai",
      "modelName": "grok-imagine-video-1.5",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.xai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "video",
          "displayOrder": 3,
          "displayName": "grok-imagine-video-1.5",
          "recommended": true,
          "launchState": "internal",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 3,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": {
              "modes": [
                "text-to-video",
                "image-to-video",
                "reference-to-video",
                "extend"
              ],
              "durationsSeconds": [
                5,
                10
              ],
              "resolutions": [
                "480p",
                "720p",
                "1080p"
              ],
              "aspectRatios": [
                "16:9",
                "9:16",
                "1:1"
              ],
              "audio": false,
              "maxReferenceImages": 3,
              "pricingVariant": "720p"
            }
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [
                {
                  "id": "1080p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 709
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "480p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 227
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "strategy": "fixed",
                  "tokensPerCoin": null,
                  "tokensPerCoinByModality": {},
                  "fixedRates": [
                    {
                      "unit": "second",
                      "coinsPerUnit": 397
                    }
                  ],
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "verifiedAt": "2026-10-12",
              "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
              "trackerEvidence": {
                "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
              },
              "variants": [
                {
                  "id": "1080p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.25,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
                  "trackerEvidence": {
                    "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "480p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.08,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
                  "trackerEvidence": {
                    "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                },
                {
                  "id": "720p",
                  "tokenUsdPerMTok": null,
                  "tokenUsdPerMTokByModality": {},
                  "fixedRatesUsd": [
                    {
                      "unit": "second",
                      "usdPerUnit": 0.14,
                      "verifiedAt": "2026-10-12",
                      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
                    }
                  ],
                  "certainty": "verified",
                  "verifiedAt": "2026-10-12",
                  "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
                  "trackerEvidence": {
                    "trackerRunId": "1d7446c1-6ba4-4d84-8ed7-4175bbf8714e"
                  },
                  "effectiveFrom": null,
                  "effectiveTo": null
                }
              ],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "zai:cogvideox-3",
      "entryKind": "model",
      "provider": "zai",
      "modelName": "cogvideox-3",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.zai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "video",
          "displayOrder": 4,
          "displayName": "cogvideox-3",
          "recommended": false,
          "launchState": "internal",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 1,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": {
              "modes": [
                "text-to-video",
                "image-to-video"
              ],
              "durationsSeconds": [
                5,
                10
              ],
              "resolutions": [
                "720p"
              ],
              "aspectRatios": [
                "16:9"
              ],
              "audio": false,
              "maxReferenceImages": 1,
              "pricingVariant": null
            }
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "video",
                  "coinsPerUnit": 567
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "video",
                  "usdPerUnit": 0.2,
                  "verifiedAt": "2026-10-11T04:22:43.204138Z",
                  "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
                }
              ],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:43.204138Z",
              "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "zai:glm-5.3",
      "entryKind": "model",
      "provider": "zai",
      "modelName": "glm-5.3",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.zai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 25,
          "displayName": "glm-5.3",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": true,
            "levels": [
              "low",
              "high",
              "max"
            ],
            "default": "low"
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 252,
                "output": 80
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 1.4,
                "output": 4.4
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:43.204138Z",
              "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "zai:glm-5.3-flash",
      "entryKind": "model",
      "provider": "zai",
      "modelName": "glm-5.3-flash",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.zai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "text",
          "displayOrder": 26,
          "displayName": "glm-5.3-flash",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": true,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": null,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "not_applicable"
          },
          "options": {
            "image": null,
            "video": null
          },
          "reasoning": {
            "supported": true,
            "levels": [
              "low",
              "high",
              "max"
            ],
            "default": "low"
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "token",
              "tokensPerCoin": {
                "input": 2353,
                "output": 705
              },
              "tokensPerCoinByModality": {},
              "fixedRates": [],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": {
                "input": 0.15,
                "output": 0.5
              },
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:43.204138Z",
              "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    },
    {
      "id": "zai:glm-image",
      "entryKind": "model",
      "provider": "zai",
      "modelName": "glm-image",
      "upstreamModelName": null,
      "compatibility": {
        "billingModelNameAlias": null
      },
      "status": "active",
      "sunsetAt": null,
      "legalProfileRef": "ai.zai.default",
      "executionRoutes": [],
      "modalities": [
        {
          "modality": "image",
          "displayOrder": 8,
          "displayName": "glm-image",
          "recommended": true,
          "launchState": "public",
          "selectable": true,
          "routable": true,
          "capabilities": {
            "imageInput": false,
            "audioInput": false,
            "audioUnderstanding": false,
            "structuredOutput": false,
            "toolCall": false
          },
          "audioUnderstandingEvidence": null,
          "limits": {
            "contextWindowTokens": null,
            "maxOutputTokens": null,
            "maxReferenceImages": 0,
            "source": null,
            "verifiedAt": null
          },
          "request": {
            "temperature": "not_applicable",
            "thinkingBudget": "not_applicable",
            "thinkingMode": "not_applicable",
            "imageSizeMode": "fixed"
          },
          "options": {
            "image": {
              "supportedAspectRatios": [],
              "supportedSizes": [],
              "sizeByAspectRatio": {},
              "displayAliases": {}
            },
            "video": null
          },
          "reasoning": {
            "supported": false,
            "levels": [],
            "default": null
          },
          "speech": null,
          "pricing": {
            "sell": {
              "strategy": "fixed",
              "tokensPerCoin": null,
              "tokensPerCoinByModality": {},
              "fixedRates": [
                {
                  "unit": "image",
                  "coinsPerUnit": 43
                }
              ],
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "providerCost": {
              "tokenUsdPerMTok": null,
              "tokenUsdPerMTokByModality": {},
              "fixedRatesUsd": [
                {
                  "unit": "image",
                  "usdPerUnit": 0.015,
                  "verifiedAt": "2026-10-11T04:22:43.204138Z",
                  "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
                }
              ],
              "certainty": "verified",
              "trackerEvidence": {
                "trackerRunId": "9bd34602-bb28-40cc-81d8-28dd7b184034"
              },
              "verifiedAt": "2026-10-11T04:22:43.204138Z",
              "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
              "variants": [],
              "effectiveFrom": null,
              "effectiveTo": null
            },
            "referencePrice": null,
            "marginOverride": null
          }
        }
      ]
    }
  ],
  "roles": {
    "catalog": {
      "defaultByProviderModality": {
        "google/text": "google:gemini-3.8-flash/text",
        "openai/text": "openai:gpt-6-luna/text",
        "claude/text": "claude:claude-haiku-5-5/text",
        "deepseek/text": "deepseek:deepseek-v4-flash/text",
        "qwen/text": "qwen:qwen3.8-omni-flash/text",
        "xai/text": "xai:grok-4.7/text",
        "zai/text": "zai:glm-5.3-flash/text",
        "google/image": "google:gemini-3.1-flash-image-preview/image",
        "openai/image": "openai:gpt-image-2.5-flare/image",
        "qwen/image": "qwen:qwen-image-3.0-pro/image",
        "xai/image": "xai:grok-imagine-image-2.0/image",
        "zai/image": "zai:glm-image/image",
        "google/video": "google:veo-3.1-fast-generate-preview/video",
        "xai/video": "xai:grok-imagine-video-1.5/video",
        "zai/video": "zai:cogvideox-3/video"
      },
      "defaultTextModel": "zai:glm-5.3-flash/text",
      "defaultImageModel": "google:gemini-3.1-flash-image-preview/image"
    },
    "marketing": {
      "queueDefault": "google:gemini-3.8-flash/text"
    },
    "amuChat": {
      "fallbackChain": [
        "zai:glm-5.3-flash/text",
        "openai:gpt-6-luna/text",
        "google:gemini-3.8-flash/text"
      ]
    },
    "proofread": {
      "defaultProvider": "google",
      "defaultByProvider": {
        "google": "google:gemini-3.8-flash/text",
        "openai": "openai:gpt-6-luna/text",
        "claude": "claude:claude-haiku-5-5/text",
        "deepseek": "deepseek:deepseek-v4-flash/text",
        "xai": "xai:grok-4.7/text",
        "zai": "zai:glm-5.3-flash/text"
      }
    },
    "agent": {
      "image": {
        "defaultProvider": "zai",
        "defaultByProvider": {
          "google": "google:gemini-2.5-flash-image/image",
          "openai": "openai:gpt-image-2.5-flare/image",
          "xai": "xai:grok-imagine-image-2.0/image",
          "zai": "zai:glm-image/image"
        },
        "routingProfiles": {
          "supporting_visual": {
            "candidates": [
              "zai:glm-image/image",
              "google:gemini-2.5-flash-image/image"
            ],
            "textPolicy": "overlay_later"
          },
          "graphic_no_text": {
            "candidates": [
              "google:gemini-2.5-flash-image/image",
              "xai:grok-imagine-image-2.0/image"
            ],
            "textPolicy": "none"
          },
          "premium_template_sample": {
            "candidates": [
              "google:gemini-3.1-flash-image-preview/image",
              "xai:grok-imagine-image-2.0/image",
              "openai:gpt-image-2.5-flare/image"
            ],
            "textPolicy": "embedded_required"
          }
        }
      },
      "content": {
        "defaultProvider": "openai",
        "defaultByProvider": {
          "google": "google:gemini-3.8-flash/text",
          "openai": "openai:gpt-6-sol/text",
          "claude": "claude:claude-sonnet-5-5/text",
          "deepseek": "deepseek:deepseek-v4-pro/text",
          "xai": "xai:grok-4.7/text",
          "zai": "zai:glm-5.3-flash/text"
        }
      }
    },
    "chat": {
      "translation": {
        "helperModel": "openai:gpt-6-luna/text"
      },
      "memory": {
        "liteCandidates": [
          "google:gemini-3.8-flash/text",
          "openai:gpt-6-luna/text"
        ]
      }
    },
    "routing": {
      "genStudio": {
        "modelByRole": {
          "planner": "openai:gpt-6-sol/text",
          "worker": "google:gemini-3.8-flash/text",
          "deterministic": null,
          "evaluator": "claude:claude-sonnet-5-5/text"
        },
        "modelTierRoute": {
          "standard": "baseline",
          "worker": "worker",
          "planner": "planner",
          "evaluator": "evaluator"
        },
        "escalation": {
          "cheap_llm": null,
          "strong_llm": null
        }
      }
    },
    "speech": {
      "defaultByProviderRole": {
        "openai:speech_analysis": "openai:gpt-audio-1.5/audio",
        "elevenlabs:speech_tts": "elevenlabs:eleven-flash-v2-5/audio",
        "elevenlabs:speech_stt": "elevenlabs:scribe-v2/audio"
      }
    },
    "internalTools": {
      "providerPricingExtraction": {
        "defaultModel": "google:gemini-3.8-flash/text",
        "allowedModels": [
          "google:gemini-3.8-flash/text",
          "google:gemini-3.1-flash-lite/text"
        ]
      },
      "narrativeDirector": {
        "defaultModel": "google:gemini-3.8-flash/text",
        "allowedModels": [
          "google:gemini-3.8-flash/text"
        ]
      }
    },
    "gameAssets": {
      "spriteSheet": {
        "enabled": true,
        "defaultModel": "openai:gpt-image-2.5-sunburst/image",
        "allowedAlternates": [
          "openai:gpt-image-2.5-flare/image",
          "google:gemini-3.1-flash-image-preview/image"
        ]
      },
      "worldAssetModel": "google:gemini-3.1-flash-image-preview/image"
    }
  },
  "voices": [
    {
      "provider": "elevenlabs",
      "voiceId": "4JJwo477JUAx3HV0T7n7",
      "voiceRevision": "2026-09-11",
      "label": "Yohan Koo - Encouraging, Clear and Airy",
      "locales": [
        "ko"
      ],
      "tags": [
        "대화형",
        "또렷함",
        "격려형"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=conversational"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "5I7B1di44aCL15NkP0jn",
      "voiceRevision": "2026-09-11",
      "label": "Kanna - Calm & Friendly",
      "locales": [
        "ko"
      ],
      "tags": [
        "대화형",
        "차분함",
        "친근함"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=entertainment_tv"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "CxErO97xpQgQXYmapDKX",
      "voiceRevision": "2026-09-11",
      "label": "Theo - Warm, Smooth and Soft",
      "locales": [
        "ko"
      ],
      "tags": [
        "대화형",
        "따뜻함",
        "부드러움"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=conversational"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "JBFqnCBsd6RMkjVDRZzb",
      "voiceRevision": "2026-09-10",
      "label": "George",
      "locales": [
        "en"
      ],
      "tags": [
        "서술형",
        "따뜻함",
        "낮은 톤"
      ],
      "rightsStatus": "verified_commercial",
      "usage": "production",
      "sourceCategory": "premade",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-10",
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "operationalTerms": {
        "noticePeriodDays": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "rate": null,
        "availableForTiers": null,
        "observedAt": null
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "Lb7qkOn5hF8p7qfCDH8q",
      "voiceRevision": "2026-09-11",
      "label": "Annie - Friendly, Soft and Clear",
      "locales": [
        "ko"
      ],
      "tags": [
        "서술형",
        "부드러움",
        "또렷함"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=narrative_story"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "SAz9YHcvj6GT2YYXdXww",
      "voiceRevision": "2026-09-10",
      "label": "River",
      "locales": [
        "en"
      ],
      "tags": [
        "중립",
        "정보 전달",
        "편안함"
      ],
      "rightsStatus": "verified_commercial",
      "usage": "production",
      "sourceCategory": "premade",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-10",
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "operationalTerms": {
        "noticePeriodDays": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "rate": null,
        "availableForTiers": null,
        "observedAt": null
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "XrExE9yKIg1WjnnlVkGX",
      "voiceRevision": "2026-09-10",
      "label": "Matilda",
      "locales": [
        "en"
      ],
      "tags": [
        "설명형",
        "또렷함",
        "차분함"
      ],
      "rightsStatus": "verified_commercial",
      "usage": "production",
      "sourceCategory": "premade",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-10",
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "operationalTerms": {
        "noticePeriodDays": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "rate": null,
        "availableForTiers": null,
        "observedAt": null
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "uyVNoMrnUku1dZyVEXwD",
      "voiceRevision": "2026-09-11",
      "label": "Anna Kim - Tender, Calm and Clear",
      "locales": [
        "ko"
      ],
      "tags": [
        "서술형",
        "차분함",
        "또렷함"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=narrative_story"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    },
    {
      "provider": "elevenlabs",
      "voiceId": "zXNMXSB7uul4lbmpaVAn",
      "voiceRevision": "2026-09-11",
      "label": "Dahye - Clear Korean Explainer",
      "locales": [
        "ko"
      ],
      "tags": [
        "설명형",
        "또렷함",
        "서울 억양"
      ],
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "usage": "production",
      "creditMultiplier": 1,
      "verifiedAt": "2026-09-11",
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=informative_educational"
      ],
      "operationalTerms": {
        "noticePeriodDays": 730,
        "disableAt": null,
        "liveModerationEnabled": false,
        "rate": 1,
        "availableForTiers": [],
        "observedAt": "2026-09-11"
      },
      "role": "speech_tts"
    }
  ],
  "budgets": {
    "elevenlabsMediaGrant": {
      "unit": "credit",
      "approvedTotal": 1000000,
      "modalities": [
        "image",
        "video"
      ]
    },
    "speech": {
      "enforcement": [
        {
          "provider": "elevenlabs",
          "owners": [
            "internal",
            "magazine",
            "play"
          ]
        },
        {
          "provider": "openai",
          "roles": [
            "speech_stt"
          ],
          "owners": [
            "play"
          ],
          "limits": {
            "global": {
              "perRequestUsdCap": 0.05,
              "dailyUsdCap": 5,
              "monthlyUsdCap": 100
            },
            "byOwner": {
              "play": {
                "perRequestUsdCap": 0.05,
                "dailyUsdCap": 5,
                "monthlyUsdCap": 100
              }
            }
          }
        }
      ],
      "global": {
        "perRequestUsdCap": 1,
        "dailyUsdCap": 20,
        "monthlyUsdCap": 150
      },
      "byOwner": {
        "internal": {
          "perRequestUsdCap": 1,
          "dailyUsdCap": 8,
          "monthlyUsdCap": 10
        },
        "magazine": {
          "perRequestUsdCap": 1,
          "dailyUsdCap": 8,
          "monthlyUsdCap": 40
        },
        "play": {
          "perRequestUsdCap": 0.1,
          "dailyUsdCap": 10,
          "monthlyUsdCap": 100
        }
      },
      "concurrency": {
        "perUserConcurrent": null,
        "globalConcurrent": null
      }
    }
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_MODEL_CATALOG_REVISIONS = {
  "manifestRevision": "manifest-sha256-v1:209d1f8316f7e1071e4f1b5e3d67fa739716256436e741ed67d42b1d1f307d9d",
  "pricingRevision": "pricing-sha256-v1:2a6b0a870ed77c82ecf285e105ddb5eab1453afe9c49b1e6d663289d513c2a9e",
  "providerCostRevision": "provider-cost-sha256-v1:03115445385196d5caf6831921388fe492b17953e9c0c8d9fcce28ef3d6530bd"
} as const satisfies Readonly<Record<string, string>>;

export const AI_AUDIO_UNDERSTANDING_EVIDENCE = {} as const satisfies Readonly<Record<string, unknown>>;

export const AI_INTERNAL_LAUNCH_STATE = {
  "claude:claude-fable-5-1:text": "admin_only",
  "qwen:qwen-image-3.0-pro:image": "admin_only",
  "qwen:qwen3.8-omni-flash:text": "admin_only"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_SPEECH_LIST_PRICE_USD = {
  "elevenlabs/eleven-flash-v2-5": {
    "unit": "character",
    "perQuantity": 1000,
    "usd": 0.05,
    "source": "elevenlabs pricing/api 2026-09-06"
  },
  "elevenlabs/eleven-multilingual-v2": {
    "unit": "character",
    "perQuantity": 1000,
    "usd": 0.1,
    "source": "elevenlabs pricing/api 2026-09-06"
  },
  "elevenlabs/eleven-v3": {
    "unit": "character",
    "perQuantity": 1000,
    "usd": 0.1,
    "source": "elevenlabs pricing/api 2026-09-06"
  },
  "elevenlabs/scribe-v2": {
    "unit": "audio_second",
    "perQuantity": 3600,
    "usd": 0.22,
    "source": "elevenlabs pricing/api 2026-09-06"
  },
  "elevenlabs/eleven-v3-conversational": null,
  "openai/gpt-transcribe": {
    "unit": "audio_second",
    "perQuantity": 60,
    "usd": 0.0045,
    "source": "openai providerCost 2026-10-12 https://developers.openai.com/api/docs/models/gpt-transcribe"
  },
  "qwen/qwen-audio-3.1-asr-flash": null
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_PROVIDER_TOKEN_RATES = {
  "claude:claude-fable-5-1": {
    "input": 10,
    "output": 50,
    "verifiedAt": "2026-09-27",
    "sourceUrl": "https://platform.claude.com/docs/en/models/fable-5-1/overview"
  },
  "claude:claude-haiku-5-5": {
    "input": 0.1,
    "output": 0.5,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing"
  },
  "claude:claude-haiku-5-5:long": {
    "input": 0.5,
    "output": 2.5,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing"
  },
  "claude:claude-haiku-5-5:short": {
    "input": 0.1,
    "output": 0.5,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing"
  },
  "claude:claude-opus-5-5": {
    "input": 4,
    "output": 20,
    "verifiedAt": "2026-09-27",
    "sourceUrl": "https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5"
  },
  "claude:claude-sonnet-5-5": {
    "input": 2,
    "output": 10,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing"
  },
  "deepseek:deepseek-v4-flash": {
    "input": 0.3,
    "output": 1.2,
    "verifiedAt": "2026-10-11T04:22:39.888878Z",
    "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing"
  },
  "deepseek:deepseek-v4-pro": {
    "input": 1.32,
    "output": 3.96,
    "verifiedAt": "2026-10-11T04:22:39.888878Z",
    "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing"
  },
  "google:gemini-3.8-flash": {
    "input": 0.75,
    "output": 3.75,
    "verifiedAt": "2026-09-27",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/latest-model?hl=en"
  },
  "openai:gpt-4o-transcribe-diarize": {
    "audioInput": 2.5,
    "audioOutput": 10,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize"
  },
  "openai:gpt-6-astra": {
    "input": 10,
    "output": 50,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra"
  },
  "openai:gpt-6-astra:long": {
    "input": 20,
    "output": 75,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra"
  },
  "openai:gpt-6-astra:short": {
    "input": 10,
    "output": 50,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra"
  },
  "openai:gpt-6-luna": {
    "input": 0.1,
    "output": 0.5,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna"
  },
  "openai:gpt-6-luna:long": {
    "input": 0.2,
    "output": 0.75,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna"
  },
  "openai:gpt-6-luna:short": {
    "input": 0.1,
    "output": 0.5,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna"
  },
  "openai:gpt-6-sol": {
    "input": 2,
    "output": 10,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol"
  },
  "openai:gpt-6-sol:long": {
    "input": 4,
    "output": 15,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol"
  },
  "openai:gpt-6-sol:short": {
    "input": 2,
    "output": 10,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol"
  },
  "openai:gpt-audio-1.5": {
    "input": 2.5,
    "output": 10,
    "audioInput": 32,
    "audioOutput": 64,
    "verifiedAt": "2026-09-28",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-audio-1.5"
  },
  "qwen:qwen-audio-3.1-asr-flash": {
    "input": 0.15,
    "output": 0.47,
    "audioInput": 0.15,
    "audioOutput": 0.47,
    "verifiedAt": "2026-10-11T04:22:41.123456Z",
    "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
  },
  "qwen:qwen3.8-omni-flash": {
    "input": 0.15,
    "output": 0.47,
    "audioInput": 0.15,
    "audioOutput": 0.47,
    "imageInput": 0.15,
    "videoInput": 0.15,
    "verifiedAt": "2026-10-11T04:22:41.123456Z",
    "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
  },
  "xai:grok-4.5": {
    "input": 2,
    "output": 6,
    "verifiedAt": "2026-10-11T04:23:10.458598Z",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-4.5"
  },
  "xai:grok-4.7": {
    "input": 4,
    "output": 12,
    "verifiedAt": "2026-09-29",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7"
  },
  "xai:grok-4.7:long": {
    "input": 4,
    "output": 12,
    "verifiedAt": "2026-09-29",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7"
  },
  "xai:grok-4.7:short": {
    "input": 2,
    "output": 6,
    "verifiedAt": "2026-10-11T04:23:10.458598Z",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7"
  },
  "zai:glm-5.3": {
    "input": 1.4,
    "output": 4.4,
    "verifiedAt": "2026-10-11T04:22:43.204138Z",
    "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
  },
  "zai:glm-5.3-flash": {
    "input": 0.15,
    "output": 0.5,
    "verifiedAt": "2026-10-11T04:22:43.204138Z",
    "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_PROVIDER_FIXED_RATES = {
  "elevenlabs:eleven-flash-v2-5": {
    "perThousandCharacters": 0.04,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://elevenlabs.io/pricing/api"
  },
  "elevenlabs:scribe-v2": {
    "perMinute": 0.0036666667,
    "verifiedAt": "2026-10-13",
    "sourceUrl": "https://elevenlabs.io/pricing/api"
  },
  "google:gemini-2.5-flash-image": {
    "perImage": 0.039,
    "verifiedAt": "2026-10-11T04:23:36.521845Z",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:gemini-3.1-flash-image-preview:1K": {
    "perImage": 0.067,
    "verifiedAt": "2026-03-14",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:gemini-3.1-flash-image-preview:4K": {
    "perImage": 0.113,
    "verifiedAt": "2026-10-11T04:23:36.521845Z",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-fast-generate-preview:1080p": {
    "perSecond": 0.12,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-fast-generate-preview:4K": {
    "perSecond": 0.3,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-fast-generate-preview:720p": {
    "perSecond": 0.1,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-generate-preview:1080p": {
    "perSecond": 0.4,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-generate-preview:4K": {
    "perSecond": 0.6,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-generate-preview:720p": {
    "perSecond": 0.4,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-lite-generate-preview:1080p": {
    "perSecond": 0.08,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "google:veo-3.1-lite-generate-preview:720p": {
    "perSecond": 0.05,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing"
  },
  "openai:gpt-image-2.5-flare": {
    "perImage": 0.221,
    "verifiedAt": "2026-09-09",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare"
  },
  "openai:gpt-image-2.5-sunburst": {
    "perImage": 0.221,
    "verifiedAt": "2026-09-09",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst"
  },
  "openai:gpt-realtime-translate": {
    "perMinute": 0.034,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-translate"
  },
  "openai:gpt-realtime-whisper": {
    "perMinute": 0.017,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-whisper"
  },
  "openai:gpt-transcribe": {
    "perMinute": 0.0045,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-transcribe"
  },
  "photoroom:remove-bg": {
    "perImage": 0.02,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://docs.photoroom.com/remove-background-api-basic-plan/pricing"
  },
  "pixian:remove-bg": {
    "perImage": 0.02,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://pixian.ai/pricing"
  },
  "qwen:qwen-image-3.0-pro:1K": {
    "perImage": 0.04,
    "verifiedAt": "2026-09-28",
    "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing"
  },
  "xai:grok-imagine-image-2.0": {
    "perImage": 0.04,
    "verifiedAt": "2026-09-27",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-image-2.0"
  },
  "xai:grok-imagine-video-1.5:1080p": {
    "perSecond": 0.25,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
  },
  "xai:grok-imagine-video-1.5:480p": {
    "perSecond": 0.08,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
  },
  "xai:grok-imagine-video-1.5:720p": {
    "perSecond": 0.14,
    "verifiedAt": "2026-10-12",
    "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5"
  },
  "zai:cogvideox-3": {
    "perVideo": 0.2,
    "verifiedAt": "2026-10-11T04:22:43.204138Z",
    "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
  },
  "zai:glm-image": {
    "perImage": 0.015,
    "verifiedAt": "2026-10-11T04:22:43.204138Z",
    "sourceUrl": "https://docs.z.ai/guides/overview/pricing"
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_MODEL_ROLES = {
  "agent": {
    "content": {
      "defaultByProvider": {
        "claude": "claude:claude-sonnet-5-5/text",
        "deepseek": "deepseek:deepseek-v4-pro/text",
        "google": "google:gemini-3.8-flash/text",
        "openai": "openai:gpt-6-sol/text",
        "xai": "xai:grok-4.7/text",
        "zai": "zai:glm-5.3-flash/text"
      },
      "defaultProvider": "openai"
    },
    "image": {
      "defaultByProvider": {
        "google": "google:gemini-2.5-flash-image/image",
        "openai": "openai:gpt-image-2.5-flare/image",
        "xai": "xai:grok-imagine-image-2.0/image",
        "zai": "zai:glm-image/image"
      },
      "defaultProvider": "zai",
      "routingProfiles": {
        "graphic_no_text": {
          "candidates": [
            "google:gemini-2.5-flash-image/image",
            "xai:grok-imagine-image-2.0/image"
          ],
          "textPolicy": "none"
        },
        "premium_template_sample": {
          "candidates": [
            "google:gemini-3.1-flash-image-preview/image",
            "xai:grok-imagine-image-2.0/image",
            "openai:gpt-image-2.5-flare/image"
          ],
          "textPolicy": "embedded_required"
        },
        "supporting_visual": {
          "candidates": [
            "zai:glm-image/image",
            "google:gemini-2.5-flash-image/image"
          ],
          "textPolicy": "overlay_later"
        }
      }
    }
  },
  "amuChat": {
    "fallbackChain": [
      "zai:glm-5.3-flash/text",
      "openai:gpt-6-luna/text",
      "google:gemini-3.8-flash/text"
    ]
  },
  "catalog": {
    "defaultByProviderModality": {
      "claude/text": "claude:claude-haiku-5-5/text",
      "deepseek/text": "deepseek:deepseek-v4-flash/text",
      "google/image": "google:gemini-3.1-flash-image-preview/image",
      "google/text": "google:gemini-3.8-flash/text",
      "google/video": "google:veo-3.1-fast-generate-preview/video",
      "openai/image": "openai:gpt-image-2.5-flare/image",
      "openai/text": "openai:gpt-6-luna/text",
      "qwen/image": "qwen:qwen-image-3.0-pro/image",
      "qwen/text": "qwen:qwen3.8-omni-flash/text",
      "xai/image": "xai:grok-imagine-image-2.0/image",
      "xai/text": "xai:grok-4.7/text",
      "xai/video": "xai:grok-imagine-video-1.5/video",
      "zai/image": "zai:glm-image/image",
      "zai/text": "zai:glm-5.3-flash/text",
      "zai/video": "zai:cogvideox-3/video"
    },
    "defaultImageModel": "google:gemini-3.1-flash-image-preview/image",
    "defaultTextModel": "zai:glm-5.3-flash/text"
  },
  "chat": {
    "memory": {
      "liteCandidates": [
        "google:gemini-3.8-flash/text",
        "openai:gpt-6-luna/text"
      ]
    },
    "translation": {
      "helperModel": "openai:gpt-6-luna/text"
    }
  },
  "gameAssets": {
    "spriteSheet": {
      "allowedAlternates": [
        "openai:gpt-image-2.5-flare/image",
        "google:gemini-3.1-flash-image-preview/image"
      ],
      "defaultModel": "openai:gpt-image-2.5-sunburst/image",
      "enabled": true
    },
    "worldAssetModel": "google:gemini-3.1-flash-image-preview/image"
  },
  "internalTools": {
    "narrativeDirector": {
      "allowedModels": [
        "google:gemini-3.8-flash/text"
      ],
      "defaultModel": "google:gemini-3.8-flash/text"
    },
    "providerPricingExtraction": {
      "allowedModels": [
        "google:gemini-3.8-flash/text",
        "google:gemini-3.1-flash-lite/text"
      ],
      "defaultModel": "google:gemini-3.8-flash/text"
    }
  },
  "marketing": {
    "queueDefault": "google:gemini-3.8-flash/text"
  },
  "proofread": {
    "defaultByProvider": {
      "claude": "claude:claude-haiku-5-5/text",
      "deepseek": "deepseek:deepseek-v4-flash/text",
      "google": "google:gemini-3.8-flash/text",
      "openai": "openai:gpt-6-luna/text",
      "xai": "xai:grok-4.7/text",
      "zai": "zai:glm-5.3-flash/text"
    },
    "defaultProvider": "google"
  },
  "routing": {
    "genStudio": {
      "escalation": {
        "cheap_llm": null,
        "strong_llm": null
      },
      "modelByRole": {
        "deterministic": null,
        "evaluator": "claude:claude-sonnet-5-5/text",
        "planner": "openai:gpt-6-sol/text",
        "worker": "google:gemini-3.8-flash/text"
      },
      "modelTierRoute": {
        "evaluator": "evaluator",
        "planner": "planner",
        "standard": "baseline",
        "worker": "worker"
      }
    }
  },
  "speech": {
    "defaultByProviderRole": {
      "elevenlabs:speech_stt": "elevenlabs:scribe-v2/audio",
      "elevenlabs:speech_tts": "elevenlabs:eleven-flash-v2-5/audio",
      "openai:speech_analysis": "openai:gpt-audio-1.5/audio"
    }
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_GEN_STUDIO_MODEL_TIER_ROUTE = {
  "evaluator": "evaluator",
  "planner": "planner",
  "standard": "baseline",
  "worker": "worker"
} as const satisfies Readonly<Record<string, string>>;

export const AI_GEN_STUDIO_ESCALATION_ROLES = {
  "cheap_llm": null,
  "strong_llm": null
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_MODEL_EXECUTION_ROUTES = {
  "google:gemini-2.5-flash-image/image": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "gemini-2.5-flash-image",
      "equivalence": "same_model",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "google:gemini-2.5-flash-image/image",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ],
  "google:gemini-3.1-flash-image-preview/image": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "gemini-3.1-flash-image",
      "equivalence": "ga_of_preview",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "google:gemini-3.1-flash-image-preview/image",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ],
  "google:veo-3.1-fast-generate-preview/video": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "veo-3.1-fast-generate-001",
      "equivalence": "ga_of_preview",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "google:veo-3.1-fast-generate-preview/video",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ],
  "google:veo-3.1-generate-preview/video": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "veo-3.1-generate-001",
      "equivalence": "ga_of_preview",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "google:veo-3.1-generate-preview/video",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ],
  "openai:gpt-image-2.5-flare/image": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "gpt-image-2.5-flare",
      "equivalence": "same_model",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "openai:gpt-image-2.5-flare/image",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ],
  "openai:gpt-image-2.5-sunburst/image": [
    {
      "allowedCallers": [],
      "capability": {
        "aspectRatios": [],
        "audio": false,
        "durations": [],
        "maxReferenceImages": null,
        "modes": [],
        "resolutions": []
      },
      "elModelId": "gpt-image-2.5-sunburst",
      "equivalence": "same_model",
      "evidence": null,
      "grantCost": {
        "credits": null,
        "unit": "request"
      },
      "modelId": "openai:gpt-image-2.5-sunburst/image",
      "route": "elevenlabs",
      "state": "candidate",
      "verifiedAt": null
    }
  ]
} as const satisfies Readonly<Record<string, readonly unknown[]>>;

export const AI_MODEL_VOICES = [
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "label": "George",
    "locales": [
      "en"
    ],
    "operationalTerms": {
      "availableForTiers": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "noticePeriodDays": null,
      "observedAt": null,
      "rate": null
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "premade",
    "tags": [
      "서술형",
      "따뜻함",
      "낮은 톤"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-10",
    "voiceId": "JBFqnCBsd6RMkjVDRZzb",
    "voiceRevision": "2026-09-10"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "label": "Matilda",
    "locales": [
      "en"
    ],
    "operationalTerms": {
      "availableForTiers": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "noticePeriodDays": null,
      "observedAt": null,
      "rate": null
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "premade",
    "tags": [
      "설명형",
      "또렷함",
      "차분함"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-10",
    "voiceId": "XrExE9yKIg1WjnnlVkGX",
    "voiceRevision": "2026-09-10"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "label": "River",
    "locales": [
      "en"
    ],
    "operationalTerms": {
      "availableForTiers": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "noticePeriodDays": null,
      "observedAt": null,
      "rate": null
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "premade",
    "tags": [
      "중립",
      "정보 전달",
      "편안함"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-10",
    "voiceId": "SAz9YHcvj6GT2YYXdXww",
    "voiceRevision": "2026-09-10"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story"
    ],
    "label": "Anna Kim - Tender, Calm and Clear",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "서술형",
      "차분함",
      "또렷함"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "uyVNoMrnUku1dZyVEXwD",
    "voiceRevision": "2026-09-11"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story"
    ],
    "label": "Annie - Friendly, Soft and Clear",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "서술형",
      "부드러움",
      "또렷함"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "Lb7qkOn5hF8p7qfCDH8q",
    "voiceRevision": "2026-09-11"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=informative_educational"
    ],
    "label": "Dahye - Clear Korean Explainer",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "설명형",
      "또렷함",
      "서울 억양"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "zXNMXSB7uul4lbmpaVAn",
    "voiceRevision": "2026-09-11"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=entertainment_tv"
    ],
    "label": "Kanna - Calm & Friendly",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "대화형",
      "차분함",
      "친근함"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "5I7B1di44aCL15NkP0jn",
    "voiceRevision": "2026-09-11"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational"
    ],
    "label": "Theo - Warm, Smooth and Soft",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "대화형",
      "따뜻함",
      "부드러움"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "CxErO97xpQgQXYmapDKX",
    "voiceRevision": "2026-09-11"
  },
  {
    "creditMultiplier": 1,
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational"
    ],
    "label": "Yohan Koo - Encouraging, Clear and Airy",
    "locales": [
      "ko"
    ],
    "operationalTerms": {
      "availableForTiers": [],
      "disableAt": null,
      "liveModerationEnabled": false,
      "noticePeriodDays": 730,
      "observedAt": "2026-09-11",
      "rate": 1
    },
    "provider": "elevenlabs",
    "rightsStatus": "verified_commercial",
    "role": "speech_tts",
    "sourceCategory": "library_professional",
    "tags": [
      "대화형",
      "또렷함",
      "격려형"
    ],
    "usage": "production",
    "verifiedAt": "2026-09-11",
    "voiceId": "4JJwo477JUAx3HV0T7n7",
    "voiceRevision": "2026-09-11"
  }
] as const satisfies readonly unknown[];

export const AI_MODEL_BUDGETS = {
  "elevenlabsMediaGrant": {
    "approvedTotal": 1000000,
    "modalities": [
      "image",
      "video"
    ],
    "unit": "credit"
  },
  "speech": {
    "byOwner": {
      "internal": {
        "dailyUsdCap": 8,
        "monthlyUsdCap": 10,
        "perRequestUsdCap": 1
      },
      "magazine": {
        "dailyUsdCap": 8,
        "monthlyUsdCap": 40,
        "perRequestUsdCap": 1
      },
      "play": {
        "dailyUsdCap": 10,
        "monthlyUsdCap": 100,
        "perRequestUsdCap": 0.1
      }
    },
    "concurrency": {
      "globalConcurrent": null,
      "perUserConcurrent": null
    },
    "enforcement": [
      {
        "owners": [
          "internal",
          "magazine",
          "play"
        ],
        "provider": "elevenlabs"
      },
      {
        "limits": {
          "byOwner": {
            "play": {
              "dailyUsdCap": 5,
              "monthlyUsdCap": 100,
              "perRequestUsdCap": 0.05
            }
          },
          "global": {
            "dailyUsdCap": 5,
            "monthlyUsdCap": 100,
            "perRequestUsdCap": 0.05
          }
        },
        "owners": [
          "play"
        ],
        "provider": "openai",
        "roles": [
          "speech_stt"
        ]
      }
    ],
    "global": {
      "dailyUsdCap": 20,
      "monthlyUsdCap": 150,
      "perRequestUsdCap": 1
    }
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_AMU_CHAT_FALLBACK_CHAIN = [
  {
    "key": "zai:glm-5.3-flash",
    "provider": "zai",
    "modelName": "glm-5.3-flash"
  },
  {
    "key": "openai:gpt-6-luna",
    "provider": "openai",
    "modelName": "gpt-6-luna"
  },
  {
    "key": "google:gemini-3.8-flash",
    "provider": "google",
    "modelName": "gemini-3.8-flash"
  }
] as const satisfies readonly unknown[];

export const AI_MARKETING_PROOFREAD_DEFAULT_PROVIDER = "google" as const satisfies string;

export const AI_MARKETING_PROOFREAD_MODEL_BY_PROVIDER = {
  "google": "gemini-3.8-flash",
  "openai": "gpt-6-luna",
  "claude": "claude-haiku-5-5",
  "deepseek": "deepseek-v4-flash",
  "xai": "grok-4.7",
  "zai": "glm-5.3-flash"
} as const satisfies Readonly<Record<string, string>>;

export const AI_MARKETING_PROOFREAD_DEFAULT_MODEL = "gemini-3.8-flash" as const satisfies string;

export const AI_MODEL_LEGACY_PROJECTION = {
  "app/api/(ai)/ai/agent/provider-pricing-extraction/route.ts#ALLOWED_MODELS": {
    "$set": [
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash"
    ]
  },
  "app/api/(ai)/ai/agent/provider-pricing-extraction/route.ts#DEFAULT_MODEL": "gemini-3.8-flash",
  "consts/ai/audioUnderstandingEvidence.ts#AUDIO_UNDERSTANDING_EVIDENCE": {},
  "consts/ai/chatModelRouting.ts#AMU_CHAT_APPROVED_FALLBACK_CHAIN": [
    {
      "key": "zai:glm-5.3-flash",
      "modelName": "glm-5.3-flash",
      "provider": "zai"
    },
    {
      "key": "openai:gpt-6-luna",
      "modelName": "gpt-6-luna",
      "provider": "openai"
    },
    {
      "key": "google:gemini-3.8-flash",
      "modelName": "gemini-3.8-flash",
      "provider": "google"
    }
  ],
  "consts/ai/launchState.ts#INTERNAL_LAUNCH_STATE": {
    "claude:claude-fable-5-1:text": "admin_only",
    "qwen:qwen-image-3.0-pro:image": "admin_only",
    "qwen:qwen3.8-omni-flash:text": "admin_only"
  },
  "consts/ai/modelRole.ts#DEFAULT_IMAGE_MODEL": "gemini-3.1-flash-image-preview",
  "consts/ai/modelRole.ts#DEFAULT_IMAGE_MODEL_BY_PROVIDER": {
    "google": "gemini-3.1-flash-image-preview",
    "openai": "gpt-image-2.5-flare",
    "qwen": "qwen-image-3.0-pro",
    "xai": "grok-imagine-image-2.0",
    "zai": "glm-image"
  },
  "consts/ai/modelRole.ts#DEFAULT_TEXT_MODEL": "glm-5.3-flash",
  "consts/ai/modelRole.ts#DEFAULT_TEXT_MODEL_BY_PROVIDER": {
    "claude": "claude-haiku-5-5",
    "deepseek": "deepseek-v4-flash",
    "google": "gemini-3.8-flash",
    "openai": "gpt-6-luna",
    "qwen": "qwen3.8-omni-flash",
    "xai": "grok-4.7",
    "zai": "glm-5.3-flash"
  },
  "consts/ai/modelRole.ts#DEFAULT_VIDEO_MODEL_BY_PROVIDER": {
    "google": "veo-3.1-fast-generate-preview",
    "xai": "grok-imagine-video-1.5",
    "zai": "cogvideox-3"
  },
  "consts/ai/modelRole.ts#DEPRECATED_XAI_TEXT_MODELS": [],
  "consts/ai/modelRole.ts#GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL": {
    "gemini-2.5-flash-image": [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9"
    ],
    "gemini-3.1-flash-image-preview": [
      "1:4",
      "1:8",
      "4:1",
      "8:1",
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9"
    ]
  },
  "consts/ai/modelRole.ts#GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL": {
    "gemini-2.5-flash-image": "Nano Banana",
    "gemini-3.1-flash-image-preview": "Nano Banana 2"
  },
  "consts/ai/modelRole.ts#GOOGLE_IMAGE_SIZES_BY_MODEL": {
    "gemini-2.5-flash-image": [
      "1K"
    ],
    "gemini-3.1-flash-image-preview": [
      "512",
      "1K",
      "2K",
      "4K"
    ]
  },
  "consts/ai/modelRole.ts#IMAGE_MODELS": [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst",
    "grok-imagine-image-2.0",
    "glm-image"
  ],
  "consts/ai/modelRole.ts#IMAGE_MODEL_MAP": {
    "google": [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image-preview"
    ],
    "openai": [
      "gpt-image-2.5-flare",
      "gpt-image-2.5-sunburst"
    ],
    "xai": [
      "grok-imagine-image-2.0"
    ],
    "zai": [
      "glm-image"
    ]
  },
  "consts/ai/modelRole.ts#IMAGE_REF_LIMIT_BY_PROVIDER": {
    "google": 14,
    "openai": 16,
    "xai": 3,
    "zai": 0
  },
  "consts/ai/modelRole.ts#IMAGE_SELECTABLE_MODEL_MAP": {
    "google": [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image-preview"
    ],
    "openai": [
      "gpt-image-2.5-flare",
      "gpt-image-2.5-sunburst"
    ],
    "xai": [
      "grok-imagine-image-2.0"
    ],
    "zai": [
      "glm-image"
    ]
  },
  "consts/ai/modelRole.ts#OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS": [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst"
  ],
  "consts/ai/modelRole.ts#OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL": {
    "gpt-image-2.5-flare": "Flare",
    "gpt-image-2.5-sunburst": "Sunburst"
  },
  "consts/ai/modelRole.ts#QWEN_IMAGE_MODEL_CATALOG": [
    "qwen-image-3.0-pro"
  ],
  "consts/ai/modelRole.ts#QWEN_TEXT_MODEL_CATALOG": [
    "qwen3.8-omni-flash"
  ],
  "consts/ai/modelRole.ts#TEXT_MODELS": [
    "gemini-3.8-flash",
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna",
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "grok-4.7",
    "glm-5.3",
    "glm-5.3-flash"
  ],
  "consts/ai/modelRole.ts#TEXT_MODEL_CAPABILITIES": {
    "claude-fable-5-1": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "claude-haiku-5-5": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "claude-opus-5-5": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "claude-sonnet-5-5": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "deepseek-v4-flash": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": false
    },
    "deepseek-v4-pro": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": false
    },
    "gemini-3.8-flash": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "glm-5.3": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": false
    },
    "glm-5.3-flash": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "gpt-6-astra": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "gpt-6-luna": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "gpt-6-sol": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    },
    "grok-4.7": {
      "supportsAudioInput": false,
      "supportsAudioUnderstanding": false,
      "supportsImageInput": true
    }
  },
  "consts/ai/modelRole.ts#TEXT_MODEL_MAP": {
    "claude": [
      "claude-fable-5-1",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5"
    ],
    "deepseek": [
      "deepseek-v4-flash",
      "deepseek-v4-pro"
    ],
    "google": [
      "gemini-3.8-flash"
    ],
    "openai": [
      "gpt-6-astra",
      "gpt-6-sol",
      "gpt-6-luna"
    ],
    "xai": [
      "grok-4.7"
    ],
    "zai": [
      "glm-5.3",
      "glm-5.3-flash"
    ]
  },
  "consts/ai/modelRole.ts#VIDEO_MODEL_MAP": {
    "google": [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview"
    ],
    "xai": [
      "grok-imagine-video-1.5"
    ],
    "zai": [
      "cogvideox-3"
    ]
  },
  "consts/ai/modelRole.ts#_UPSTREAM_MODEL_ALIAS": {
    "claude": {
      "claude-haiku-5-5": "claude-haiku-5-5",
      "claude-sonnet-5-5": "claude-sonnet-5-5"
    },
    "deepseek": {
      "deepseek-v4-flash": "deepseek-flash",
      "deepseek-v4-pro": "deepseek-v4-pro"
    },
    "openai": {},
    "xai": {},
    "zai": {}
  },
  "consts/ai/modelRoutingPolicy.ts#AI_ROUTING_POLICY": {
    "deterministic": {
      "catalogKey": null,
      "modelName": null,
      "provider": null
    },
    "evaluator": {
      "catalogKey": "claude:claude-sonnet-5-5:text",
      "modelName": "claude-sonnet-5-5",
      "provider": "claude"
    },
    "planner": {
      "catalogKey": "openai:gpt-6-sol:text",
      "modelName": "gpt-6-sol",
      "provider": "openai"
    },
    "worker": {
      "catalogKey": "google:gemini-3.8-flash:text",
      "modelName": "gemini-3.8-flash",
      "provider": "google"
    }
  },
  "consts/ai/modelRoutingPolicy.ts#AI_ROUTING_ROLES": [
    "planner",
    "worker",
    "deterministic",
    "evaluator"
  ],
  "consts/ai/providerCost.ts#FIXED_RATES": {
    "elevenlabs:eleven-flash-v2-5": {
      "perThousandCharacters": 0.04,
      "sourceUrl": "https://elevenlabs.io/pricing/api",
      "verifiedAt": "2026-10-13"
    },
    "elevenlabs:scribe-v2": {
      "perMinute": 0.0036666667,
      "sourceUrl": "https://elevenlabs.io/pricing/api",
      "verifiedAt": "2026-10-13"
    },
    "google:gemini-2.5-flash-image": {
      "perImage": 0.039,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-11T04:23:36.521845Z"
    },
    "google:gemini-3.1-flash-image-preview:1K": {
      "perImage": 0.067,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-03-14"
    },
    "google:gemini-3.1-flash-image-preview:4K": {
      "perImage": 0.113,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-11T04:23:36.521845Z"
    },
    "google:veo-3.1-fast-generate-preview:1080p": {
      "perSecond": 0.12,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-fast-generate-preview:4K": {
      "perSecond": 0.3,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-fast-generate-preview:720p": {
      "perSecond": 0.1,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-generate-preview:1080p": {
      "perSecond": 0.4,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-generate-preview:4K": {
      "perSecond": 0.6,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-generate-preview:720p": {
      "perSecond": 0.4,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-lite-generate-preview:1080p": {
      "perSecond": 0.08,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "google:veo-3.1-lite-generate-preview:720p": {
      "perSecond": 0.05,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/pricing",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-image-2.5-flare": {
      "perImage": 0.221,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-flare",
      "verifiedAt": "2026-09-09"
    },
    "openai:gpt-image-2.5-sunburst": {
      "perImage": 0.221,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst",
      "verifiedAt": "2026-09-09"
    },
    "openai:gpt-realtime-translate": {
      "perMinute": 0.034,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-translate",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-realtime-whisper": {
      "perMinute": 0.017,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-realtime-whisper",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-transcribe": {
      "perMinute": 0.0045,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-transcribe",
      "verifiedAt": "2026-10-12"
    },
    "photoroom:remove-bg": {
      "perImage": 0.02,
      "sourceUrl": "https://docs.photoroom.com/remove-background-api-basic-plan/pricing",
      "verifiedAt": "2026-10-12"
    },
    "pixian:remove-bg": {
      "perImage": 0.02,
      "sourceUrl": "https://pixian.ai/pricing",
      "verifiedAt": "2026-10-12"
    },
    "qwen:qwen-image-3.0-pro:1K": {
      "perImage": 0.04,
      "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "verifiedAt": "2026-09-28"
    },
    "xai:grok-imagine-image-2.0": {
      "perImage": 0.04,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-image-2.0",
      "verifiedAt": "2026-09-27"
    },
    "xai:grok-imagine-video-1.5:1080p": {
      "perSecond": 0.25,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
      "verifiedAt": "2026-10-12"
    },
    "xai:grok-imagine-video-1.5:480p": {
      "perSecond": 0.08,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
      "verifiedAt": "2026-10-12"
    },
    "xai:grok-imagine-video-1.5:720p": {
      "perSecond": 0.14,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-imagine-video-1.5",
      "verifiedAt": "2026-10-12"
    },
    "zai:cogvideox-3": {
      "perVideo": 0.2,
      "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
      "verifiedAt": "2026-10-11T04:22:43.204138Z"
    },
    "zai:glm-image": {
      "perImage": 0.015,
      "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
      "verifiedAt": "2026-10-11T04:22:43.204138Z"
    }
  },
  "consts/ai/providerCost.ts#TOKEN_RATES": {
    "claude:claude-fable-5-1": {
      "input": 10,
      "output": 50,
      "sourceUrl": "https://platform.claude.com/docs/en/models/fable-5-1/overview",
      "verifiedAt": "2026-09-27"
    },
    "claude:claude-haiku-5-5": {
      "input": 0.1,
      "output": 0.5,
      "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
      "verifiedAt": "2026-10-13"
    },
    "claude:claude-haiku-5-5:long": {
      "input": 0.5,
      "output": 2.5,
      "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
      "verifiedAt": "2026-10-13"
    },
    "claude:claude-haiku-5-5:short": {
      "input": 0.1,
      "output": 0.5,
      "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
      "verifiedAt": "2026-10-13"
    },
    "claude:claude-opus-5-5": {
      "input": 4,
      "output": 20,
      "sourceUrl": "https://platform.claude.com/docs/en/models/opus-5-5/whats-new-opus-5-5",
      "verifiedAt": "2026-09-27"
    },
    "claude:claude-sonnet-5-5": {
      "input": 2,
      "output": 10,
      "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
      "verifiedAt": "2026-10-13"
    },
    "deepseek:deepseek-v4-flash": {
      "input": 0.3,
      "output": 1.2,
      "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
      "verifiedAt": "2026-10-11T04:22:39.888878Z"
    },
    "deepseek:deepseek-v4-pro": {
      "input": 1.32,
      "output": 3.96,
      "sourceUrl": "https://api-docs.deepseek.com/quick_start/pricing",
      "verifiedAt": "2026-10-11T04:22:39.888878Z"
    },
    "google:gemini-3.8-flash": {
      "input": 0.75,
      "output": 3.75,
      "sourceUrl": "https://ai.google.dev/gemini-api/docs/latest-model?hl=en",
      "verifiedAt": "2026-09-27"
    },
    "openai:gpt-4o-transcribe-diarize": {
      "audioInput": 2.5,
      "audioOutput": 10,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-4o-transcribe-diarize",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-astra": {
      "input": 10,
      "output": 50,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-astra:long": {
      "input": 20,
      "output": 75,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-astra:short": {
      "input": 10,
      "output": 50,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-astra",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-luna": {
      "input": 0.1,
      "output": 0.5,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-luna:long": {
      "input": 0.2,
      "output": 0.75,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-luna:short": {
      "input": 0.1,
      "output": 0.5,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-luna",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-sol": {
      "input": 2,
      "output": 10,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-sol:long": {
      "input": 4,
      "output": 15,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-6-sol:short": {
      "input": 2,
      "output": 10,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-6-sol",
      "verifiedAt": "2026-10-12"
    },
    "openai:gpt-audio-1.5": {
      "audioInput": 32,
      "audioOutput": 64,
      "input": 2.5,
      "output": 10,
      "sourceUrl": "https://developers.openai.com/api/docs/models/gpt-audio-1.5",
      "verifiedAt": "2026-09-28"
    },
    "qwen:qwen-audio-3.1-asr-flash": {
      "audioInput": 0.15,
      "audioOutput": 0.47,
      "input": 0.15,
      "output": 0.47,
      "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "verifiedAt": "2026-10-11T04:22:41.123456Z"
    },
    "qwen:qwen3.8-omni-flash": {
      "audioInput": 0.15,
      "audioOutput": 0.47,
      "imageInput": 0.15,
      "input": 0.15,
      "output": 0.47,
      "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
      "verifiedAt": "2026-10-11T04:22:41.123456Z",
      "videoInput": 0.15
    },
    "xai:grok-4.5": {
      "input": 2,
      "output": 6,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-4.5",
      "verifiedAt": "2026-10-11T04:23:10.458598Z"
    },
    "xai:grok-4.7": {
      "input": 4,
      "output": 12,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
      "verifiedAt": "2026-09-29"
    },
    "xai:grok-4.7:long": {
      "input": 4,
      "output": 12,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
      "verifiedAt": "2026-09-29"
    },
    "xai:grok-4.7:short": {
      "input": 2,
      "output": 6,
      "sourceUrl": "https://docs.x.ai/developers/models/grok-4.7",
      "verifiedAt": "2026-10-11T04:23:10.458598Z"
    },
    "zai:glm-5.3": {
      "input": 1.4,
      "output": 4.4,
      "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
      "verifiedAt": "2026-10-11T04:22:43.204138Z"
    },
    "zai:glm-5.3-flash": {
      "input": 0.15,
      "output": 0.5,
      "sourceUrl": "https://docs.z.ai/guides/overview/pricing",
      "verifiedAt": "2026-10-11T04:22:43.204138Z"
    }
  },
  "consts/ai/reasoningEffort.ts#REASONING_EFFORT_POLICY": {
    "openai:gpt-6-astra:text": {
      "levels": [
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ],
      "policyDefault": "low"
    },
    "openai:gpt-6-luna:text": {
      "levels": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ],
      "policyDefault": "low"
    },
    "openai:gpt-6-sol:text": {
      "levels": [
        "none",
        "low",
        "medium",
        "high",
        "xhigh",
        "max"
      ],
      "policyDefault": "low"
    },
    "zai:glm-5.3-flash:text": {
      "levels": [
        "low",
        "high",
        "max"
      ],
      "policyDefault": "low"
    },
    "zai:glm-5.3:text": {
      "levels": [
        "low",
        "high",
        "max"
      ],
      "policyDefault": "low"
    }
  },
  "consts/ai/speechListPrice.ts#SPEECH_LIST_PRICE_USD": {
    "elevenlabs/eleven-flash-v2-5": {
      "perQuantity": 1000,
      "source": "elevenlabs pricing/api 2026-09-06",
      "unit": "character",
      "usd": 0.05
    },
    "elevenlabs/eleven-multilingual-v2": {
      "perQuantity": 1000,
      "source": "elevenlabs pricing/api 2026-09-06",
      "unit": "character",
      "usd": 0.1
    },
    "elevenlabs/eleven-v3": {
      "perQuantity": 1000,
      "source": "elevenlabs pricing/api 2026-09-06",
      "unit": "character",
      "usd": 0.1
    },
    "elevenlabs/eleven-v3-conversational": null,
    "elevenlabs/scribe-v2": {
      "perQuantity": 3600,
      "source": "elevenlabs pricing/api 2026-09-06",
      "unit": "audio_second",
      "usd": 0.22
    },
    "openai/gpt-transcribe": {
      "perQuantity": 60,
      "source": "openai providerCost 2026-10-12 https://developers.openai.com/api/docs/models/gpt-transcribe",
      "unit": "audio_second",
      "usd": 0.0045
    },
    "qwen/qwen-audio-3.1-asr-flash": null
  },
  "consts/ai/speechModel.ts#DEFAULT_SPEECH_MODEL_BY_PROVIDER_ROLE": {
    "elevenlabs:speech_stt": "scribe-v2",
    "elevenlabs:speech_tts": "eleven-flash-v2-5",
    "openai:speech_analysis": "gpt-audio-1.5"
  },
  "consts/ai/speechModel.ts#SPEECH_MODEL_CATALOG": [
    {
      "billingUnit": null,
      "billingUnitUnknownReason": "text/audio 모달리티별 generic token 정산을 사용한다. 고정 SpeechBillingUnit은 적용하지 않는다.",
      "capabilities": [
        "stt_file"
      ],
      "launchState": "admin_only",
      "modelName": "gpt-audio-1.5",
      "note": "text 160/35, audio 12/5 tokens/coin을 기존 gpt-audio 요율 키로 정산한다. usage modality breakdown 누락·무효 시 fail-closed.",
      "provider": "openai",
      "readiness": "policy_approved",
      "roles": [
        "speech_analysis"
      ],
      "routable": true,
      "upstreamCertainty": "verified"
    },
    {
      "billingUnit": "audio_second",
      "capabilities": [
        "stt_file"
      ],
      "launchState": "admin_only",
      "modelName": "gpt-transcribe",
      "note": "9 coins/started minute. 서버 확인 audio_second는 ledger에 보존하고 고정 과금 adapter에서 minutes=ceil(seconds/60)로 변환한다.",
      "provider": "openai",
      "readiness": "policy_approved",
      "roles": [
        "speech_stt"
      ],
      "routable": true,
      "upstreamCertainty": "verified"
    },
    {
      "billingUnit": null,
      "billingUnitUnknownReason": "Model Studio의 modality 변환 input/output token에 generic token 정산을 적용한다. D10 provider usage는 승인된 adapter 형식과 일치해야 한다.",
      "capabilities": [
        "stt_file"
      ],
      "launchState": "admin_only",
      "modelName": "qwen3.8-omni-flash",
      "note": "Model Studio Singapore International 가격은 input $0.15, cache-hit input $0.016, output $0.47/1M token이다. 비캐시 input 상한 COGS만 기록하며 provider usage 매핑과 정산 검증 전 라우팅하지 않는다.",
      "provider": "qwen",
      "readiness": "observed",
      "roles": [
        "speech_analysis"
      ],
      "routable": true,
      "upstreamCertainty": "verified"
    },
    {
      "billingUnit": null,
      "billingUnitUnknownReason": "Model Studio ASR은 input/output token 정산(코인당 5,600/1,072 tokens)을 사용한다. D10은 provider usage 전체를 전달하고 누락 시 fail-closed해야 한다.",
      "capabilities": [
        "stt_file"
      ],
      "documentedModelId": "qwen-audio-3.1-asr-flash",
      "launchState": "admin_only",
      "modelName": "qwen-audio-3.1-asr-flash",
      "note": "최신 비실시간 ASR. Usage parser와 runtime 연결은 D10이며, 누락·불일치 usage는 정산 오류로 fail-closed한다.",
      "provider": "qwen",
      "readiness": "observed",
      "roles": [
        "speech_stt"
      ],
      "routable": true,
      "upstreamCertainty": "verified"
    },
    {
      "billingUnit": "character",
      "capabilities": [
        "tts_http",
        "tts_websocket"
      ],
      "documentedModelId": "eleven_flash_v2_5",
      "launchState": "admin_only",
      "modelName": "eleven-flash-v2-5",
      "provider": "elevenlabs",
      "readiness": "observed",
      "roles": [
        "speech_tts"
      ],
      "routable": true,
      "upstreamCertainty": "unverified"
    },
    {
      "billingUnit": "character",
      "capabilities": [
        "tts_http",
        "tts_websocket"
      ],
      "documentedModelId": "eleven_multilingual_v2",
      "launchState": "internal",
      "modelName": "eleven-multilingual-v2",
      "provider": "elevenlabs",
      "readiness": "observed",
      "roles": [
        "speech_tts"
      ],
      "routable": false,
      "upstreamCertainty": "unverified"
    },
    {
      "billingUnit": "character",
      "capabilities": [
        "tts_http"
      ],
      "documentedModelId": "eleven_v3",
      "launchState": "internal",
      "modelName": "eleven-v3",
      "note": "표현력 우선 모델. 실시간 대화 기본값으로 쓰지 않는다(ADR-EL-001 D4).",
      "provider": "elevenlabs",
      "readiness": "observed",
      "roles": [
        "speech_tts"
      ],
      "routable": false,
      "upstreamCertainty": "unverified"
    },
    {
      "billingUnit": "audio_second",
      "capabilities": [
        "stt_file"
      ],
      "documentedModelId": "scribe_v2",
      "launchState": "admin_only",
      "modelName": "scribe-v2",
      "provider": "elevenlabs",
      "readiness": "observed",
      "roles": [
        "speech_stt"
      ],
      "routable": true,
      "upstreamCertainty": "unverified"
    },
    {
      "billingUnit": null,
      "billingUnitUnknownReason": "Text-to-Dialogue 단가를 공식 가격표에서 확인하지 못했다.",
      "capabilities": [
        "dialogue_websocket"
      ],
      "documentedModelId": "eleven_v3_conversational",
      "launchState": "internal",
      "modelName": "eleven-v3-conversational",
      "note": "단가 단위 미확정. 단위 없는 가격은 SPEECH_PRICING_UNVERIFIED로 거부한다(ADR-EL-001 D5).",
      "provider": "elevenlabs",
      "readiness": "observed",
      "roles": [
        "speech_tts"
      ],
      "routable": false,
      "upstreamCertainty": "unverified"
    }
  ],
  "consts/ai/voiceCatalog.ts#ELEVENLABS_APPROVED_VOICE_CATALOG": [
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "label": "George",
      "locales": [
        "en"
      ],
      "operationalTerms": {
        "availableForTiers": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "noticePeriodDays": null,
        "observedAt": null,
        "rate": null
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "premade",
      "tags": [
        "서술형",
        "따뜻함",
        "낮은 톤"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-10",
      "voiceId": "JBFqnCBsd6RMkjVDRZzb",
      "voiceRevision": "2026-09-10"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "label": "Matilda",
      "locales": [
        "en"
      ],
      "operationalTerms": {
        "availableForTiers": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "noticePeriodDays": null,
        "observedAt": null,
        "rate": null
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "premade",
      "tags": [
        "설명형",
        "또렷함",
        "차분함"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-10",
      "voiceId": "XrExE9yKIg1WjnnlVkGX",
      "voiceRevision": "2026-09-10"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
      ],
      "label": "River",
      "locales": [
        "en"
      ],
      "operationalTerms": {
        "availableForTiers": null,
        "disableAt": null,
        "liveModerationEnabled": null,
        "noticePeriodDays": null,
        "observedAt": null,
        "rate": null
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "premade",
      "tags": [
        "중립",
        "정보 전달",
        "편안함"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-10",
      "voiceId": "SAz9YHcvj6GT2YYXdXww",
      "voiceRevision": "2026-09-10"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=narrative_story"
      ],
      "label": "Anna Kim - Tender, Calm and Clear",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "서술형",
        "차분함",
        "또렷함"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "uyVNoMrnUku1dZyVEXwD",
      "voiceRevision": "2026-09-11"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=narrative_story"
      ],
      "label": "Annie - Friendly, Soft and Clear",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "서술형",
        "부드러움",
        "또렷함"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "Lb7qkOn5hF8p7qfCDH8q",
      "voiceRevision": "2026-09-11"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=informative_educational"
      ],
      "label": "Dahye - Clear Korean Explainer",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "설명형",
        "또렷함",
        "서울 억양"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "zXNMXSB7uul4lbmpaVAn",
      "voiceRevision": "2026-09-11"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=entertainment_tv"
      ],
      "label": "Kanna - Calm & Friendly",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "대화형",
        "차분함",
        "친근함"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "5I7B1di44aCL15NkP0jn",
      "voiceRevision": "2026-09-11"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=conversational"
      ],
      "label": "Theo - Warm, Smooth and Soft",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "대화형",
        "따뜻함",
        "부드러움"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "CxErO97xpQgQXYmapDKX",
      "voiceRevision": "2026-09-11"
    },
    {
      "creditMultiplier": 1,
      "evidence": [
        "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
        "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
        "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
        "use_case=conversational"
      ],
      "label": "Yohan Koo - Encouraging, Clear and Airy",
      "locales": [
        "ko"
      ],
      "operationalTerms": {
        "availableForTiers": [],
        "disableAt": null,
        "liveModerationEnabled": false,
        "noticePeriodDays": 730,
        "observedAt": "2026-09-11",
        "rate": 1
      },
      "provider": "elevenlabs",
      "rightsStatus": "verified_commercial",
      "sourceCategory": "library_professional",
      "tags": [
        "대화형",
        "또렷함",
        "격려형"
      ],
      "usage": "production",
      "verifiedAt": "2026-09-11",
      "voiceId": "4JJwo477JUAx3HV0T7n7",
      "voiceRevision": "2026-09-11"
    }
  ],
  "consts/ai/voiceCatalog.ts#ELEVENLABS_APPROVED_VOICE_IDS": [
    "JBFqnCBsd6RMkjVDRZzb",
    "XrExE9yKIg1WjnnlVkGX",
    "SAz9YHcvj6GT2YYXdXww",
    "uyVNoMrnUku1dZyVEXwD",
    "Lb7qkOn5hF8p7qfCDH8q",
    "zXNMXSB7uul4lbmpaVAn",
    "5I7B1di44aCL15NkP0jn",
    "CxErO97xpQgQXYmapDKX",
    "4JJwo477JUAx3HV0T7n7"
  ],
  "consts/ai/voiceCatalog.ts#ELEVENLABS_DEFAULT_STT_MODEL": "scribe-v2",
  "consts/ai/voiceCatalog.ts#ELEVENLABS_DEFAULT_TTS_MODEL": "eleven-flash-v2-5",
  "consts/ai/voiceCatalog.ts#OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL": "gpt-audio-1.5",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_LOCK.modelName": "gpt-image-2.5-sunburst",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_LOCK.provider": "openai",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_OPTIONS.0.modelName": "gpt-image-2.5-flare",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_OPTIONS.0.provider": "openai",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_OPTIONS.2.modelName": "gemini-3.1-flash-image-preview",
  "consts/game/gameAssetTemplates.ts#SPRITE_MODEL_OPTIONS.2.provider": "google",
  "consts/game/worldAssetTemplates.ts#WORLD_ASSET_IMAGE_PROMPT_TEMPLATES.0.defaultParams.modelName": "gemini-3.1-flash-image-preview",
  "consts/game/worldAssetTemplates.ts#WORLD_ASSET_IMAGE_PROMPT_TEMPLATES.0.defaultParams.provider": "google",
  "consts/marketing/proofread.ts#MARKETING_PROOFREAD_DEFAULT_MODEL_BY_PROVIDER": {
    "claude": "claude-haiku-5-5",
    "deepseek": "deepseek-v4-flash",
    "google": "gemini-3.8-flash",
    "openai": "gpt-6-luna",
    "xai": "grok-4.7",
    "zai": "glm-5.3-flash"
  },
  "consts/marketing/proofread.ts#MARKETING_PROOFREAD_DEFAULT_PROVIDER": "google",
  "consts/payment/pricingRoles.ts#FIXED_COSTS": {
    "elevenlabs:eleven-flash-v2-5": {
      "perThousandCharacters": 114
    },
    "elevenlabs:scribe-v2": {
      "perMinute": 11
    },
    "google:gemini-2.5-flash-image": {
      "perImage": 111
    },
    "google:gemini-3.1-flash-image-preview": {
      "perImage": 160
    },
    "google:gemini-3.1-flash-image-preview:1K": {
      "perImage": 190
    },
    "google:gemini-3.1-flash-image-preview:2K": {
      "perImage": 240
    },
    "google:gemini-3.1-flash-image-preview:4K": {
      "perImage": 321
    },
    "google:gemini-3.1-flash-image-preview:512": {
      "perImage": 105
    },
    "google:veo-3.1-fast-generate-preview:1080p": {
      "perSecond": 340
    },
    "google:veo-3.1-fast-generate-preview:4K": {
      "perSecond": 850
    },
    "google:veo-3.1-fast-generate-preview:720p": {
      "perSecond": 284
    },
    "google:veo-3.1-generate-preview:1080p": {
      "perSecond": 1134
    },
    "google:veo-3.1-generate-preview:4K": {
      "perSecond": 1700
    },
    "google:veo-3.1-generate-preview:720p": {
      "perSecond": 1134
    },
    "google:veo-3.1-lite-generate-preview:1080p": {
      "perSecond": 227
    },
    "google:veo-3.1-lite-generate-preview:720p": {
      "perSecond": 142
    },
    "openai:gpt-4o-transcribe-diarize": {
      "perMinute": 12
    },
    "openai:gpt-image-2.5-flare": {
      "perImage": 150
    },
    "openai:gpt-image-2.5-sunburst": {
      "perImage": 150
    },
    "openai:gpt-realtime-translate": {
      "perMinute": 97
    },
    "openai:gpt-realtime-whisper": {
      "perMinute": 49
    },
    "openai:gpt-transcribe": {
      "perMinute": 13
    },
    "photoroom:remove-bg": {
      "perImage": 57
    },
    "pixian:remove-bg": {
      "perImage": 57
    },
    "qwen:qwen-image-3.0-pro:1K": {
      "perImage": 114
    },
    "xai:grok-imagine-image-2.0": {
      "perImage": 114
    },
    "xai:grok-imagine-video-1.5:1080p": {
      "perSecond": 709
    },
    "xai:grok-imagine-video-1.5:480p": {
      "perSecond": 227
    },
    "xai:grok-imagine-video-1.5:720p": {
      "perSecond": 397
    },
    "zai:cogvideox-3": {
      "perVideo": 567
    },
    "zai:glm-image": {
      "perImage": 43
    }
  },
  "consts/payment/pricingRoles.ts#TOKENS_PER_COIN": {
    "claude:claude-fable-5-1": {
      "input": 35,
      "output": 7
    },
    "claude:claude-haiku-5-5": {
      "input": 3529,
      "output": 705
    },
    "claude:claude-haiku-5-5:long": {
      "input": 705,
      "output": 141
    },
    "claude:claude-haiku-5-5:short": {
      "input": 3529,
      "output": 705
    },
    "claude:claude-opus-5-5": {
      "input": 88,
      "output": 17
    },
    "claude:claude-sonnet-5-5": {
      "input": 176,
      "output": 35
    },
    "deepseek:deepseek-v4-flash": {
      "input": 1176,
      "output": 294
    },
    "deepseek:deepseek-v4-pro": {
      "input": 267,
      "output": 89
    },
    "google:gemini-3.8-flash": {
      "input": 470,
      "output": 94
    },
    "openai:gpt-4o-transcribe-diarize:audio": {
      "input": 141,
      "output": 35
    },
    "openai:gpt-4o-transcribe-diarize:text": {
      "input": 0,
      "output": 35
    },
    "openai:gpt-6-astra": {
      "input": 35,
      "output": 7
    },
    "openai:gpt-6-astra:long": {
      "input": 17,
      "output": 4
    },
    "openai:gpt-6-astra:short": {
      "input": 35,
      "output": 7
    },
    "openai:gpt-6-luna": {
      "input": 3529,
      "output": 705
    },
    "openai:gpt-6-luna:long": {
      "input": 1764,
      "output": 470
    },
    "openai:gpt-6-luna:short": {
      "input": 3529,
      "output": 705
    },
    "openai:gpt-6-sol": {
      "input": 176,
      "output": 35
    },
    "openai:gpt-6-sol:long": {
      "input": 88,
      "output": 23
    },
    "openai:gpt-6-sol:short": {
      "input": 176,
      "output": 35
    },
    "openai:gpt-audio:audio": {
      "input": 11,
      "output": 5
    },
    "openai:gpt-audio:text": {
      "input": 141,
      "output": 35
    },
    "openai:gpt-image-2.5-flare:image": {
      "input": 50,
      "output": 8
    },
    "openai:gpt-image-2.5-flare:text": {
      "input": 80,
      "output": 0
    },
    "openai:gpt-image-2.5-sunburst:image": {
      "input": 50,
      "output": 8
    },
    "openai:gpt-image-2.5-sunburst:text": {
      "input": 80,
      "output": 0
    },
    "qwen:qwen-audio-3.1-asr-flash": {
      "input": 2353,
      "output": 750
    },
    "qwen:qwen3.8-omni-flash": {
      "input": 2353,
      "output": 750
    },
    "xai:grok-4.5": {
      "input": 176,
      "output": 58
    },
    "xai:grok-4.7": {
      "input": 88,
      "output": 29
    },
    "xai:grok-4.7:long": {
      "input": 88,
      "output": 29
    },
    "xai:grok-4.7:short": {
      "input": 176,
      "output": 58
    },
    "zai:glm-5.3": {
      "input": 252,
      "output": 80
    },
    "zai:glm-5.3-flash": {
      "input": 2353,
      "output": 705
    }
  },
  "consts/system/speechRuntimeControls.ts#DEFAULT_SPEECH_TUTORS_STT_CONTROLS.modelName": "",
  "libs/marketing/generationConfig.ts#normalizeMarketingGenerationConfig.modelName": "gemini-3.8-flash",
  "libs/marketing/generationConfig.ts#normalizeMarketingGenerationConfig.modelProvider": "google",
  "libs/server-utils/auth/agentRateLimit.ts#AGENT_CONTENT_POLICY.defaultModelByProvider": {
    "claude": "claude-sonnet-5-5",
    "deepseek": "deepseek-v4-pro",
    "google": "gemini-3.8-flash",
    "openai": "gpt-6-sol",
    "xai": "grok-4.7",
    "zai": "glm-5.3-flash"
  },
  "libs/server-utils/auth/agentRateLimit.ts#AGENT_CONTENT_POLICY.defaultProvider": "openai",
  "libs/server-utils/auth/agentRateLimit.ts#AGENT_IMAGE_POLICY.defaultModelByProvider": {
    "google": "gemini-2.5-flash-image",
    "openai": "gpt-image-2.5-flare",
    "xai": "grok-imagine-image-2.0",
    "zai": "glm-image"
  },
  "libs/server-utils/auth/agentRateLimit.ts#AGENT_IMAGE_POLICY.defaultProvider": "zai",
  "libs/server-utils/chat/conversationMemoryPipeline.ts#LITE_MODEL_CANDIDATES": [
    {
      "model": "gemini-3.8-flash",
      "provider": "google"
    },
    {
      "model": "gpt-6-luna",
      "provider": "openai"
    }
  ],
  "store/chat/translationStore.ts#DEFAULT_CHAT_HELPER_MODEL": {
    "modelName": "gpt-6-luna",
    "provider": "openai"
  },
  "types/ai/videoGeneration.ts#VIDEO_CAPABILITY_MATRIX": [
    {
      "aspectRatios": [
        "16:9",
        "9:16",
        "1:1"
      ],
      "audio": true,
      "durations": [
        4,
        6,
        8
      ],
      "maxReferenceImages": 1,
      "modelName": "veo-3.1-fast-generate-preview",
      "modes": [
        "text-to-video",
        "image-to-video",
        "reference-to-video"
      ],
      "pricingVariant": "720p",
      "provider": "google",
      "resolutions": [
        "720p",
        "1080p"
      ]
    },
    {
      "aspectRatios": [
        "16:9",
        "9:16"
      ],
      "audio": true,
      "durations": [
        4,
        6,
        8
      ],
      "maxReferenceImages": 1,
      "modelName": "veo-3.1-generate-preview",
      "modes": [
        "text-to-video",
        "image-to-video"
      ],
      "pricingVariant": "720p",
      "provider": "google",
      "resolutions": [
        "720p",
        "1080p",
        "4K"
      ]
    },
    {
      "aspectRatios": [
        "16:9",
        "9:16"
      ],
      "audio": false,
      "durations": [
        4,
        6,
        8
      ],
      "maxReferenceImages": 1,
      "modelName": "veo-3.1-lite-generate-preview",
      "modes": [
        "text-to-video",
        "image-to-video"
      ],
      "pricingVariant": "720p",
      "provider": "google",
      "resolutions": [
        "720p",
        "1080p"
      ]
    },
    {
      "aspectRatios": [
        "16:9",
        "9:16",
        "1:1"
      ],
      "audio": false,
      "durations": [
        5,
        10
      ],
      "maxReferenceImages": 3,
      "modelName": "grok-imagine-video-1.5",
      "modes": [
        "text-to-video",
        "image-to-video",
        "reference-to-video",
        "extend"
      ],
      "pricingVariant": "720p",
      "provider": "xai",
      "resolutions": [
        "480p",
        "720p",
        "1080p"
      ]
    },
    {
      "aspectRatios": [
        "16:9"
      ],
      "audio": false,
      "durations": [
        5,
        10
      ],
      "maxReferenceImages": 1,
      "modelName": "cogvideox-3",
      "modes": [
        "text-to-video",
        "image-to-video"
      ],
      "provider": "zai",
      "resolutions": [
        "720p"
      ]
    }
  ],
  "utils/ai/agentImageRoutingPolicy.ts#ROUTING_CANDIDATES": {
    "graphic_no_text": [
      {
        "modelName": "gemini-2.5-flash-image",
        "provider": "google"
      },
      {
        "modelName": "grok-imagine-image-2.0",
        "provider": "xai"
      }
    ],
    "premium_template_sample": [
      {
        "modelName": "gemini-3.1-flash-image-preview",
        "provider": "google"
      },
      {
        "modelName": "grok-imagine-image-2.0",
        "provider": "xai"
      },
      {
        "modelName": "gpt-image-2.5-flare",
        "provider": "openai"
      }
    ],
    "supporting_visual": [
      {
        "modelName": "glm-image",
        "provider": "zai"
      },
      {
        "modelName": "gemini-2.5-flash-image",
        "provider": "google"
      }
    ]
  },
  "utils/ai/agentImageRoutingPolicy.ts#resolveAgentImageRoutingPlan.textPolicy": {
    "graphic_no_text": "none",
    "premium_template_sample": "embedded_required",
    "supporting_visual": "overlay_later"
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_MODEL_ROUTING_ROLES = [
  "planner",
  "worker",
  "deterministic",
  "evaluator"
] as const satisfies readonly string[];

export const AI_MODEL_ROUTING_POLICY = {
  "planner": {
    "provider": "openai",
    "modelName": "gpt-6-sol",
    "catalogKey": "openai:gpt-6-sol:text"
  },
  "worker": {
    "provider": "google",
    "modelName": "gemini-3.8-flash",
    "catalogKey": "google:gemini-3.8-flash:text"
  },
  "deterministic": {
    "provider": null,
    "modelName": null,
    "catalogKey": null
  },
  "evaluator": {
    "provider": "claude",
    "modelName": "claude-sonnet-5-5",
    "catalogKey": "claude:claude-sonnet-5-5:text"
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_MODEL_REASONING_EFFORT_POLICY = {
  "openai:gpt-6-astra:text": {
    "levels": [
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ],
    "policyDefault": "low"
  },
  "openai:gpt-6-luna:text": {
    "levels": [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ],
    "policyDefault": "low"
  },
  "openai:gpt-6-sol:text": {
    "levels": [
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ],
    "policyDefault": "low"
  },
  "zai:glm-5.3-flash:text": {
    "levels": [
      "low",
      "high",
      "max"
    ],
    "policyDefault": "low"
  },
  "zai:glm-5.3:text": {
    "levels": [
      "low",
      "high",
      "max"
    ],
    "policyDefault": "low"
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_SPEECH_MODEL_CATALOG = [
  {
    "provider": "openai",
    "modelName": "gpt-audio-1.5",
    "roles": [
      "speech_analysis"
    ],
    "capabilities": [
      "stt_file"
    ],
    "readiness": "policy_approved",
    "billingUnit": null,
    "billingUnitUnknownReason": "text/audio 모달리티별 generic token 정산을 사용한다. 고정 SpeechBillingUnit은 적용하지 않는다.",
    "upstreamCertainty": "verified",
    "routable": true,
    "launchState": "admin_only",
    "note": "text 160/35, audio 12/5 tokens/coin을 기존 gpt-audio 요율 키로 정산한다. usage modality breakdown 누락·무효 시 fail-closed."
  },
  {
    "provider": "openai",
    "modelName": "gpt-transcribe",
    "roles": [
      "speech_stt"
    ],
    "capabilities": [
      "stt_file"
    ],
    "readiness": "policy_approved",
    "billingUnit": "audio_second",
    "upstreamCertainty": "verified",
    "routable": true,
    "launchState": "admin_only",
    "note": "9 coins/started minute. 서버 확인 audio_second는 ledger에 보존하고 고정 과금 adapter에서 minutes=ceil(seconds/60)로 변환한다."
  },
  {
    "provider": "qwen",
    "modelName": "qwen3.8-omni-flash",
    "roles": [
      "speech_analysis"
    ],
    "capabilities": [
      "stt_file"
    ],
    "readiness": "observed",
    "billingUnit": null,
    "billingUnitUnknownReason": "Model Studio의 modality 변환 input/output token에 generic token 정산을 적용한다. D10 provider usage는 승인된 adapter 형식과 일치해야 한다.",
    "upstreamCertainty": "verified",
    "routable": true,
    "launchState": "admin_only",
    "note": "Model Studio Singapore International 가격은 input $0.15, cache-hit input $0.016, output $0.47/1M token이다. 비캐시 input 상한 COGS만 기록하며 provider usage 매핑과 정산 검증 전 라우팅하지 않는다."
  },
  {
    "provider": "qwen",
    "modelName": "qwen-audio-3.1-asr-flash",
    "roles": [
      "speech_stt"
    ],
    "capabilities": [
      "stt_file"
    ],
    "readiness": "observed",
    "billingUnit": null,
    "billingUnitUnknownReason": "Model Studio ASR은 input/output token 정산(코인당 5,600/1,072 tokens)을 사용한다. D10은 provider usage 전체를 전달하고 누락 시 fail-closed해야 한다.",
    "documentedModelId": "qwen-audio-3.1-asr-flash",
    "upstreamCertainty": "verified",
    "routable": true,
    "launchState": "admin_only",
    "note": "최신 비실시간 ASR. Usage parser와 runtime 연결은 D10이며, 누락·불일치 usage는 정산 오류로 fail-closed한다."
  },
  {
    "provider": "elevenlabs",
    "modelName": "eleven-flash-v2-5",
    "roles": [
      "speech_tts"
    ],
    "capabilities": [
      "tts_http",
      "tts_websocket"
    ],
    "readiness": "observed",
    "billingUnit": "character",
    "documentedModelId": "eleven_flash_v2_5",
    "upstreamCertainty": "unverified",
    "routable": true,
    "launchState": "admin_only"
  },
  {
    "provider": "elevenlabs",
    "modelName": "eleven-multilingual-v2",
    "roles": [
      "speech_tts"
    ],
    "capabilities": [
      "tts_http",
      "tts_websocket"
    ],
    "readiness": "observed",
    "billingUnit": "character",
    "documentedModelId": "eleven_multilingual_v2",
    "upstreamCertainty": "unverified",
    "routable": false,
    "launchState": "internal"
  },
  {
    "provider": "elevenlabs",
    "modelName": "eleven-v3",
    "roles": [
      "speech_tts"
    ],
    "capabilities": [
      "tts_http"
    ],
    "readiness": "observed",
    "billingUnit": "character",
    "documentedModelId": "eleven_v3",
    "upstreamCertainty": "unverified",
    "routable": false,
    "launchState": "internal",
    "note": "표현력 우선 모델. 실시간 대화 기본값으로 쓰지 않는다(ADR-EL-001 D4)."
  },
  {
    "provider": "elevenlabs",
    "modelName": "scribe-v2",
    "roles": [
      "speech_stt"
    ],
    "capabilities": [
      "stt_file"
    ],
    "readiness": "observed",
    "billingUnit": "audio_second",
    "documentedModelId": "scribe_v2",
    "upstreamCertainty": "unverified",
    "routable": true,
    "launchState": "admin_only"
  },
  {
    "provider": "elevenlabs",
    "modelName": "eleven-v3-conversational",
    "roles": [
      "speech_tts"
    ],
    "capabilities": [
      "dialogue_websocket"
    ],
    "readiness": "observed",
    "billingUnit": null,
    "billingUnitUnknownReason": "Text-to-Dialogue 단가를 공식 가격표에서 확인하지 못했다.",
    "documentedModelId": "eleven_v3_conversational",
    "upstreamCertainty": "unverified",
    "routable": false,
    "launchState": "internal",
    "note": "단가 단위 미확정. 단위 없는 가격은 SPEECH_PRICING_UNVERIFIED로 거부한다(ADR-EL-001 D5)."
  }
] as const satisfies readonly unknown[];

export const AI_DEFAULT_SPEECH_MODEL_BY_PROVIDER_ROLE = {
  "openai:speech_analysis": "gpt-audio-1.5",
  "elevenlabs:speech_tts": "eleven-flash-v2-5",
  "elevenlabs:speech_stt": "scribe-v2"
} as const satisfies Readonly<Record<string, string>>;

export const AI_VIDEO_CAPABILITIES = [
  {
    "provider": "google",
    "modelName": "veo-3.1-fast-generate-preview",
    "modes": [
      "text-to-video",
      "image-to-video",
      "reference-to-video"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "aspectRatios": [
      "16:9",
      "9:16",
      "1:1"
    ],
    "audio": true,
    "maxReferenceImages": 1,
    "pricingVariant": "720p"
  },
  {
    "provider": "google",
    "modelName": "veo-3.1-generate-preview",
    "modes": [
      "text-to-video",
      "image-to-video"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "resolutions": [
      "720p",
      "1080p",
      "4K"
    ],
    "aspectRatios": [
      "16:9",
      "9:16"
    ],
    "audio": true,
    "maxReferenceImages": 1,
    "pricingVariant": "720p"
  },
  {
    "provider": "google",
    "modelName": "veo-3.1-lite-generate-preview",
    "modes": [
      "text-to-video",
      "image-to-video"
    ],
    "durations": [
      4,
      6,
      8
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "aspectRatios": [
      "16:9",
      "9:16"
    ],
    "audio": false,
    "maxReferenceImages": 1,
    "pricingVariant": "720p"
  },
  {
    "provider": "xai",
    "modelName": "grok-imagine-video-1.5",
    "modes": [
      "text-to-video",
      "image-to-video",
      "reference-to-video",
      "extend"
    ],
    "durations": [
      5,
      10
    ],
    "resolutions": [
      "480p",
      "720p",
      "1080p"
    ],
    "aspectRatios": [
      "16:9",
      "9:16",
      "1:1"
    ],
    "audio": false,
    "maxReferenceImages": 3,
    "pricingVariant": "720p"
  },
  {
    "provider": "zai",
    "modelName": "cogvideox-3",
    "modes": [
      "text-to-video",
      "image-to-video"
    ],
    "durations": [
      5,
      10
    ],
    "resolutions": [
      "720p"
    ],
    "aspectRatios": [
      "16:9"
    ],
    "audio": false,
    "maxReferenceImages": 1
  }
] as const satisfies readonly unknown[];

export const AI_DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview" as const satisfies string;

export const AI_DEFAULT_IMAGE_MODEL_BY_PROVIDER = {
  "google": "gemini-3.1-flash-image-preview",
  "openai": "gpt-image-2.5-flare",
  "qwen": "qwen-image-3.0-pro",
  "xai": "grok-imagine-image-2.0",
  "zai": "glm-image"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_DEFAULT_TEXT_MODEL = "glm-5.3-flash" as const satisfies string;

export const AI_DEFAULT_TEXT_MODEL_BY_PROVIDER = {
  "google": "gemini-3.8-flash",
  "openai": "gpt-6-luna",
  "claude": "claude-haiku-5-5",
  "deepseek": "deepseek-v4-flash",
  "qwen": "qwen3.8-omni-flash",
  "xai": "grok-4.7",
  "zai": "glm-5.3-flash"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_DEFAULT_VIDEO_MODEL_BY_PROVIDER = {
  "google": "veo-3.1-fast-generate-preview",
  "xai": "grok-imagine-video-1.5",
  "zai": "cogvideox-3"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_DEPRECATED_XAI_TEXT_MODELS = [] as const satisfies readonly unknown[];

export const AI_GOOGLE_IMAGE_ASPECT_RATIOS_BY_MODEL = {
  "gemini-2.5-flash-image": [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9"
  ],
  "gemini-3.1-flash-image-preview": [
    "1:4",
    "1:8",
    "4:1",
    "8:1",
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_GOOGLE_IMAGE_MODEL_ALIAS_BY_MODEL = {
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-3.1-flash-image-preview": "Nano Banana 2"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_GOOGLE_IMAGE_SIZES_BY_MODEL = {
  "gemini-2.5-flash-image": [
    "1K"
  ],
  "gemini-3.1-flash-image-preview": [
    "512",
    "1K",
    "2K",
    "4K"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_IMAGE_MODELS = [
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
  "grok-imagine-image-2.0",
  "glm-image"
] as const satisfies readonly unknown[];

export const AI_IMAGE_MODEL_MAP = {
  "google": [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview"
  ],
  "openai": [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst"
  ],
  "xai": [
    "grok-imagine-image-2.0"
  ],
  "zai": [
    "glm-image"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_IMAGE_REF_LIMIT_BY_PROVIDER = {
  "google": 14,
  "openai": 16,
  "xai": 3,
  "zai": 0
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_IMAGE_SELECTABLE_MODEL_MAP = {
  "google": [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview"
  ],
  "openai": [
    "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst"
  ],
  "xai": [
    "grok-imagine-image-2.0"
  ],
  "zai": [
    "glm-image"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_OPENAI_FLEXIBLE_SIZE_IMAGE_MODELS = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst"
] as const satisfies readonly unknown[];

export const AI_OPENAI_IMAGE_MODEL_ALIAS_BY_MODEL = {
  "gpt-image-2.5-flare": "Flare",
  "gpt-image-2.5-sunburst": "Sunburst"
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_QWEN_IMAGE_MODEL_CATALOG = [
  "qwen-image-3.0-pro"
] as const satisfies readonly unknown[];

export const AI_QWEN_TEXT_MODEL_CATALOG = [
  "qwen3.8-omni-flash"
] as const satisfies readonly unknown[];

export const AI_TEXT_MODELS = [
  "gemini-3.8-flash",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-6-luna",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "grok-4.7",
  "glm-5.3",
  "glm-5.3-flash"
] as const satisfies readonly unknown[];

export const AI_TEXT_MODEL_CAPABILITIES = {
  "claude-fable-5-1": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "claude-haiku-5-5": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "claude-opus-5-5": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "claude-sonnet-5-5": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "deepseek-v4-flash": {
    "supportsImageInput": false,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "deepseek-v4-pro": {
    "supportsImageInput": false,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "gemini-3.8-flash": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "glm-5.3": {
    "supportsImageInput": false,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "glm-5.3-flash": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "gpt-6-astra": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "gpt-6-luna": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "gpt-6-sol": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  },
  "grok-4.7": {
    "supportsImageInput": true,
    "supportsAudioInput": false,
    "supportsAudioUnderstanding": false
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_TEXT_MODEL_MAP = {
  "google": [
    "gemini-3.8-flash"
  ],
  "openai": [
    "gpt-6-astra",
    "gpt-6-sol",
    "gpt-6-luna"
  ],
  "claude": [
    "claude-fable-5-1",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
    "claude-haiku-5-5"
  ],
  "deepseek": [
    "deepseek-v4-flash",
    "deepseek-v4-pro"
  ],
  "xai": [
    "grok-4.7"
  ],
  "zai": [
    "glm-5.3",
    "glm-5.3-flash"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_VIDEO_MODEL_MAP = {
  "google": [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview"
  ],
  "xai": [
    "grok-imagine-video-1.5"
  ],
  "zai": [
    "cogvideox-3"
  ]
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_UPSTREAM_MODEL_ALIAS = {
  "openai": {},
  "claude": {
    "claude-haiku-5-5": "claude-haiku-5-5",
    "claude-sonnet-5-5": "claude-sonnet-5-5"
  },
  "deepseek": {
    "deepseek-v4-flash": "deepseek-flash",
    "deepseek-v4-pro": "deepseek-v4-pro"
  },
  "xai": {},
  "zai": {}
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_ELEVENLABS_APPROVED_VOICE_CATALOG = [
  {
    "provider": "elevenlabs",
    "voiceId": "JBFqnCBsd6RMkjVDRZzb",
    "voiceRevision": "2026-09-10",
    "label": "George",
    "locales": [
      "en"
    ],
    "tags": [
      "서술형",
      "따뜻함",
      "낮은 톤"
    ],
    "rightsStatus": "verified_commercial",
    "usage": "production",
    "sourceCategory": "premade",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-10",
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "operationalTerms": {
      "noticePeriodDays": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "rate": null,
      "availableForTiers": null,
      "observedAt": null
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "XrExE9yKIg1WjnnlVkGX",
    "voiceRevision": "2026-09-10",
    "label": "Matilda",
    "locales": [
      "en"
    ],
    "tags": [
      "설명형",
      "또렷함",
      "차분함"
    ],
    "rightsStatus": "verified_commercial",
    "usage": "production",
    "sourceCategory": "premade",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-10",
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "operationalTerms": {
      "noticePeriodDays": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "rate": null,
      "availableForTiers": null,
      "observedAt": null
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "SAz9YHcvj6GT2YYXdXww",
    "voiceRevision": "2026-09-10",
    "label": "River",
    "locales": [
      "en"
    ],
    "tags": [
      "중립",
      "정보 전달",
      "편안함"
    ],
    "rightsStatus": "verified_commercial",
    "usage": "production",
    "sourceCategory": "premade",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-10",
    "evidence": [
      "GET /api/admin/speech-voices 2026-09-10 — category=premade, observedRate=null"
    ],
    "operationalTerms": {
      "noticePeriodDays": null,
      "disableAt": null,
      "liveModerationEnabled": null,
      "rate": null,
      "availableForTiers": null,
      "observedAt": null
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "uyVNoMrnUku1dZyVEXwD",
    "voiceRevision": "2026-09-11",
    "label": "Anna Kim - Tender, Calm and Clear",
    "locales": [
      "ko"
    ],
    "tags": [
      "서술형",
      "차분함",
      "또렷함"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "Lb7qkOn5hF8p7qfCDH8q",
    "voiceRevision": "2026-09-11",
    "label": "Annie - Friendly, Soft and Clear",
    "locales": [
      "ko"
    ],
    "tags": [
      "서술형",
      "부드러움",
      "또렷함"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=narrative_story"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "zXNMXSB7uul4lbmpaVAn",
    "voiceRevision": "2026-09-11",
    "label": "Dahye - Clear Korean Explainer",
    "locales": [
      "ko"
    ],
    "tags": [
      "설명형",
      "또렷함",
      "서울 억양"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=informative_educational"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "5I7B1di44aCL15NkP0jn",
    "voiceRevision": "2026-09-11",
    "label": "Kanna - Calm & Friendly",
    "locales": [
      "ko"
    ],
    "tags": [
      "대화형",
      "차분함",
      "친근함"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=entertainment_tv"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "CxErO97xpQgQXYmapDKX",
    "voiceRevision": "2026-09-11",
    "label": "Theo - Warm, Smooth and Soft",
    "locales": [
      "ko"
    ],
    "tags": [
      "대화형",
      "따뜻함",
      "부드러움"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  },
  {
    "provider": "elevenlabs",
    "voiceId": "4JJwo477JUAx3HV0T7n7",
    "voiceRevision": "2026-09-11",
    "label": "Yohan Koo - Encouraging, Clear and Airy",
    "locales": [
      "ko"
    ],
    "tags": [
      "대화형",
      "또렷함",
      "격려형"
    ],
    "rightsStatus": "verified_commercial",
    "sourceCategory": "library_professional",
    "usage": "production",
    "creditMultiplier": 1,
    "verifiedAt": "2026-09-11",
    "evidence": [
      "GET /v1/voices 2026-09-11 — category=professional, labels.language=ko, sharing.rate=1, notice_period=730, financial_rewards_enabled=false",
      "GET /v1/shared-voices?language=ko 2026-09-11 — Voice Library 원본 rate=1",
      "정본: .agent/legal/elevenlabs/voice-library-rights-determination.md §1·§5 — Voice Library/VLA·유료 플랜 상업 이용 판정",
      "use_case=conversational"
    ],
    "operationalTerms": {
      "noticePeriodDays": 730,
      "disableAt": null,
      "liveModerationEnabled": false,
      "rate": 1,
      "availableForTiers": [],
      "observedAt": "2026-09-11"
    }
  }
] as const satisfies readonly unknown[];

export const AI_ELEVENLABS_APPROVED_VOICE_IDS = [
  "JBFqnCBsd6RMkjVDRZzb",
  "XrExE9yKIg1WjnnlVkGX",
  "SAz9YHcvj6GT2YYXdXww",
  "uyVNoMrnUku1dZyVEXwD",
  "Lb7qkOn5hF8p7qfCDH8q",
  "zXNMXSB7uul4lbmpaVAn",
  "5I7B1di44aCL15NkP0jn",
  "CxErO97xpQgQXYmapDKX",
  "4JJwo477JUAx3HV0T7n7"
] as const satisfies readonly unknown[];

export const AI_OPENAI_DEFAULT_AUDIO_ANALYSIS_MODEL = "gpt-audio-1.5" as const satisfies string;

export const AI_ELEVENLABS_DEFAULT_STT_MODEL = "scribe-v2" as const satisfies string;

export const AI_ELEVENLABS_DEFAULT_TTS_MODEL = "eleven-flash-v2-5" as const satisfies string;

export const AI_SELL_FIXED_COSTS = {
  "elevenlabs:eleven-flash-v2-5": {
    "perThousandCharacters": 114
  },
  "elevenlabs:scribe-v2": {
    "perMinute": 11
  },
  "google:gemini-2.5-flash-image": {
    "perImage": 111
  },
  "google:gemini-3.1-flash-image-preview": {
    "perImage": 160
  },
  "google:gemini-3.1-flash-image-preview:1K": {
    "perImage": 190
  },
  "google:gemini-3.1-flash-image-preview:2K": {
    "perImage": 240
  },
  "google:gemini-3.1-flash-image-preview:4K": {
    "perImage": 321
  },
  "google:gemini-3.1-flash-image-preview:512": {
    "perImage": 105
  },
  "google:veo-3.1-fast-generate-preview:1080p": {
    "perSecond": 340
  },
  "google:veo-3.1-fast-generate-preview:4K": {
    "perSecond": 850
  },
  "google:veo-3.1-fast-generate-preview:720p": {
    "perSecond": 284
  },
  "google:veo-3.1-generate-preview:1080p": {
    "perSecond": 1134
  },
  "google:veo-3.1-generate-preview:4K": {
    "perSecond": 1700
  },
  "google:veo-3.1-generate-preview:720p": {
    "perSecond": 1134
  },
  "google:veo-3.1-lite-generate-preview:1080p": {
    "perSecond": 227
  },
  "google:veo-3.1-lite-generate-preview:720p": {
    "perSecond": 142
  },
  "openai:gpt-4o-transcribe-diarize": {
    "perMinute": 12
  },
  "openai:gpt-image-2.5-flare": {
    "perImage": 150
  },
  "openai:gpt-image-2.5-sunburst": {
    "perImage": 150
  },
  "openai:gpt-realtime-translate": {
    "perMinute": 97
  },
  "openai:gpt-realtime-whisper": {
    "perMinute": 49
  },
  "openai:gpt-transcribe": {
    "perMinute": 13
  },
  "photoroom:remove-bg": {
    "perImage": 57
  },
  "pixian:remove-bg": {
    "perImage": 57
  },
  "qwen:qwen-image-3.0-pro:1K": {
    "perImage": 114
  },
  "xai:grok-imagine-image-2.0": {
    "perImage": 114
  },
  "xai:grok-imagine-video-1.5:1080p": {
    "perSecond": 709
  },
  "xai:grok-imagine-video-1.5:480p": {
    "perSecond": 227
  },
  "xai:grok-imagine-video-1.5:720p": {
    "perSecond": 397
  },
  "zai:cogvideox-3": {
    "perVideo": 567
  },
  "zai:glm-image": {
    "perImage": 43
  }
} as const satisfies Readonly<Record<string, unknown>>;

export const AI_SELL_TOKENS_PER_COIN = {
  "claude:claude-fable-5-1": {
    "input": 35,
    "output": 7
  },
  "claude:claude-haiku-5-5": {
    "input": 3529,
    "output": 705
  },
  "claude:claude-haiku-5-5:long": {
    "input": 705,
    "output": 141
  },
  "claude:claude-haiku-5-5:short": {
    "input": 3529,
    "output": 705
  },
  "claude:claude-opus-5-5": {
    "input": 88,
    "output": 17
  },
  "claude:claude-sonnet-5-5": {
    "input": 176,
    "output": 35
  },
  "deepseek:deepseek-v4-flash": {
    "input": 1176,
    "output": 294
  },
  "deepseek:deepseek-v4-pro": {
    "input": 267,
    "output": 89
  },
  "google:gemini-3.8-flash": {
    "input": 470,
    "output": 94
  },
  "openai:gpt-4o-transcribe-diarize:audio": {
    "input": 141,
    "output": 35
  },
  "openai:gpt-4o-transcribe-diarize:text": {
    "input": 0,
    "output": 35
  },
  "openai:gpt-6-astra": {
    "input": 35,
    "output": 7
  },
  "openai:gpt-6-astra:long": {
    "input": 17,
    "output": 4
  },
  "openai:gpt-6-astra:short": {
    "input": 35,
    "output": 7
  },
  "openai:gpt-6-luna": {
    "input": 3529,
    "output": 705
  },
  "openai:gpt-6-luna:long": {
    "input": 1764,
    "output": 470
  },
  "openai:gpt-6-luna:short": {
    "input": 3529,
    "output": 705
  },
  "openai:gpt-6-sol": {
    "input": 176,
    "output": 35
  },
  "openai:gpt-6-sol:long": {
    "input": 88,
    "output": 23
  },
  "openai:gpt-6-sol:short": {
    "input": 176,
    "output": 35
  },
  "openai:gpt-audio:audio": {
    "input": 11,
    "output": 5
  },
  "openai:gpt-audio:text": {
    "input": 141,
    "output": 35
  },
  "openai:gpt-image-2.5-flare:image": {
    "input": 50,
    "output": 8
  },
  "openai:gpt-image-2.5-flare:text": {
    "input": 80,
    "output": 0
  },
  "openai:gpt-image-2.5-sunburst:image": {
    "input": 50,
    "output": 8
  },
  "openai:gpt-image-2.5-sunburst:text": {
    "input": 80,
    "output": 0
  },
  "qwen:qwen-audio-3.1-asr-flash": {
    "input": 2353,
    "output": 750
  },
  "qwen:qwen3.8-omni-flash": {
    "input": 2353,
    "output": 750
  },
  "xai:grok-4.5": {
    "input": 176,
    "output": 58
  },
  "xai:grok-4.7": {
    "input": 88,
    "output": 29
  },
  "xai:grok-4.7:long": {
    "input": 88,
    "output": 29
  },
  "xai:grok-4.7:short": {
    "input": 176,
    "output": 58
  },
  "zai:glm-5.3": {
    "input": 252,
    "output": 80
  },
  "zai:glm-5.3-flash": {
    "input": 2353,
    "output": 705
  }
} as const satisfies Readonly<Record<string, unknown>>;

export type AiModelId = (typeof AI_MODEL_CATALOG.models)[number]["id"];
export type AiModelProfileRef = `${AiModelId}/${(typeof AI_MODEL_CATALOG.models)[number]["modalities"][number]["modality"]}`;
export type GenStudioModelTierRouteLabel = keyof typeof AI_GEN_STUDIO_MODEL_TIER_ROUTE;
export type AiExecutionRouteId = (typeof AI_MODEL_CATALOG.models)[number]["executionRoutes"][number]["route"];
