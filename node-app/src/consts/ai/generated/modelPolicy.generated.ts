// GENERATED FILE — DO NOT EDIT
// Source: config/ai-model-catalog.yaml
// Generator: scripts/build/generateAiModelCatalog.mjs

export const AI_MODEL_ROLE_POLICY = {
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

export const AI_MODEL_REQUEST_FLAGS = {
  "claude:claude-fable-5-1": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "always_on"
    }
  },
  "claude:claude-haiku-5-5": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "adaptive"
    }
  },
  "claude:claude-opus-5-5": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "always_on"
    }
  },
  "claude:claude-sonnet-5-5": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "adaptive",
      "thinkingOff": "between_tools"
    }
  },
  "deepseek:deepseek-flash": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "deepseek:deepseek-v4-flash": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "deepseek:deepseek-v4-pro": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "elevenlabs:eleven-flash-v2-5": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "elevenlabs:eleven-multilingual-v2": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "elevenlabs:eleven-v3": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "elevenlabs:eleven-v3-conversational": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "elevenlabs:scribe-v2": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "google:gemini-2.5-flash-image": {
    "image": {
      "imageSizeMode": "fixed",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "google:gemini-3.1-flash-image-preview": {
    "image": {
      "imageSizeMode": "fixed",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "google:gemini-3.1-flash-lite": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "supported",
      "thinkingBudget": "supported",
      "thinkingMode": "not_applicable"
    }
  },
  "google:gemini-3.8-flash": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "unsupported",
      "thinkingMode": "not_applicable"
    }
  },
  "google:veo-3.1-fast-generate-preview": {
    "video": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "google:veo-3.1-generate-preview": {
    "video": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "google:veo-3.1-lite-generate-preview": {
    "video": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-4o-transcribe-diarize": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-6-astra": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-6-luna": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-6-sol": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "unsupported",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-audio-1.5": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-image-2.5-flare": {
    "image": {
      "imageSizeMode": "flexible",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-image-2.5-sunburst": {
    "image": {
      "imageSizeMode": "flexible",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-realtime-translate": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-realtime-whisper": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "openai:gpt-transcribe": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "qwen:qwen-audio-3.1-asr-flash": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "qwen:qwen-image-3.0-pro": {
    "image": {
      "imageSizeMode": "fixed",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "qwen:qwen3.8-omni-flash": {
    "audio": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    },
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "xai:grok-4.5": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "xai:grok-4.7": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "xai:grok-imagine-image-2.0": {
    "image": {
      "imageSizeMode": "fixed",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "xai:grok-imagine-video-1.5": {
    "video": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "zai:cogvideox-3": {
    "video": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "zai:glm-5.3": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "zai:glm-5.3-flash": {
    "text": {
      "imageSizeMode": "not_applicable",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  },
  "zai:glm-image": {
    "image": {
      "imageSizeMode": "fixed",
      "temperature": "not_applicable",
      "thinkingBudget": "not_applicable",
      "thinkingMode": "not_applicable"
    }
  }
} as const satisfies Readonly<Record<string, unknown>>;
