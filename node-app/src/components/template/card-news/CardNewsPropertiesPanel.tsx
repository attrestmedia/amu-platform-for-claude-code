"use client";

import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@amu-labs/ui";
import { ImagePlus, Layers, Paintbrush, Square, Trash2, Type } from "lucide-react";
import { Lang, lang } from "components/module/i18n";
import {
  CARD_NEWS_FONT_FAMILIES,
  CARD_NEWS_FONT_WEIGHTS,
  CARD_NEWS_GRADIENT_DIRECTIONS,
  type CardNewsCard,
  type CardNewsDeckPayload,
  type CardNewsLayer,
  type CardNewsWatermark,
} from "types/card-news";
import {
  updateCardNewsBackground,
  updateCardNewsCard,
  updateCardNewsLayer,
} from "libs/card-news/editor";

export type CardNewsAssetPickerTarget = "background" | "layer" | "watermark-logo";

type CardNewsPropertiesPanelProps = {
  document: CardNewsDeckPayload;
  card: CardNewsCard;
  selectedLayer: CardNewsLayer | null;
  onDocumentChange: (next: CardNewsDeckPayload) => void;
  onSelectLayer: (layerId: string | null) => void;
  onOpenAssetPicker: (target: CardNewsAssetPickerTarget) => void;
  onAddText: () => void;
  onAddSolid: () => void;
  onDeleteLayer: (layerId: string) => void;
};

function ColorInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const color = /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} label={label} />
      <input
        id={id}
        type="color"
        value={color}
        aria-label={label}
        className="size-11 cursor-pointer rounded-md border border-border bg-surface p-1"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberField({ id, label, value, min, max, step = 1, onChange }: { id: string; label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} label={label} />
      <Input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        className="min-h-11"
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function SelectField({ id, label, value, options, onChange }: { id: string; label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} label={label} />
      <Select value={value} onValueChange={(next) => onChange(String(next))}>
        <SelectTrigger id={id} className="min-h-11"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

const DEFAULT_WATERMARK: CardNewsWatermark = {
  enabled: false,
  text: "AMU",
  size: 24,
  opacity: 0.72,
  position: "bottom-right",
};

function WatermarkFields({
  document,
  card,
  onDocumentChange,
  onOpenAssetPicker,
}: {
  document: CardNewsDeckPayload;
  card: CardNewsCard;
  onDocumentChange: (next: CardNewsDeckPayload) => void;
  onOpenAssetPicker: (target: CardNewsAssetPickerTarget) => void;
}) {
  const watermark = document.watermark || DEFAULT_WATERMARK;
  const cardEnabled = card.watermarkEnabled !== false;

  const updateWatermark = (patch: Partial<CardNewsWatermark>) => {
    onDocumentChange({ ...document, watermark: { ...watermark, ...patch } });
  };

  return (
    <section aria-labelledby="card-news-watermark-title" className="space-y-3 border-t border-border/70 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="card-news-watermark-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "브랜드 워터마크", en: "Brand watermark" }} />
          </h3>
          <p className="mt-1 text-xs leading-5 text-secondary-text">
            <Lang text={{ ko: "덱 전체 기본값이며 카드별로 끌 수 있습니다.", en: "A deck default that can be turned off per card." }} />
          </p>
        </div>
        <Switch
          id="card-news-watermark-enabled"
          checked={watermark.enabled}
          onCheckedChange={(enabled) => updateWatermark({ enabled })}
          aria-label={lang({ ko: "워터마크 전체 사용", en: "Enable watermark for deck" })}
        />
      </div>

      {watermark.enabled ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="card-news-watermark-text" label={<Lang text={{ ko: "브랜드 표시명", en: "Brand label" }} />} />
            <Input
              id="card-news-watermark-text"
              key={watermark.text}
              defaultValue={watermark.text}
              maxLength={120}
              className="min-h-11"
              onBlur={(event) => updateWatermark({ text: event.currentTarget.value.trim() })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="card-news-watermark-size" label={lang({ ko: "크기", en: "Size" })} value={watermark.size} min={8} max={120} onChange={(size) => updateWatermark({ size })} />
            <NumberField id="card-news-watermark-opacity" label={lang({ ko: "불투명도", en: "Opacity" })} value={watermark.opacity} min={0} max={1} step={0.05} onChange={(opacity) => updateWatermark({ opacity })} />
          </div>
          <SelectField
            id="card-news-watermark-position"
            label={lang({ ko: "위치", en: "Position" })}
            value={watermark.position}
            options={["top-left", "top-right", "bottom-left", "bottom-right"]}
            onChange={(position) => updateWatermark({ position: position as CardNewsWatermark["position"] })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="min-h-11 gap-2" onClick={() => onOpenAssetPicker("watermark-logo")}>
              <ImagePlus className="size-4" aria-hidden />
              <Lang text={{ ko: watermark.logo ? "브랜드 로고 바꾸기" : "브랜드 로고 추가", en: watermark.logo ? "Change brand logo" : "Add brand logo" }} />
            </Button>
            {watermark.logo ? (
              <>
                <span className="max-w-[12rem] truncate text-xs text-secondary-text">{watermark.logo.value}</span>
                <Button variant="ghost" className="min-h-11" onClick={() => updateWatermark({ logo: undefined })}>
                  <Lang text={{ ko: "로고 제거", en: "Remove logo" }} />
                </Button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
        <div>
          <Label htmlFor="card-news-watermark-card-enabled" label={<Lang text={{ ko: "현재 카드에 표시", en: "Show on this card" }} />} />
          <p className="mt-0.5 text-xs text-secondary-text"><Lang text={{ ko: "덱 워터마크가 켜져 있을 때 적용됩니다.", en: "Applies when the deck watermark is enabled." }} /></p>
        </div>
        <Switch
          id="card-news-watermark-card-enabled"
          checked={cardEnabled}
          onCheckedChange={(enabled) => onDocumentChange(updateCardNewsCard(document, card.cardId, { watermarkEnabled: enabled }))}
          aria-label={lang({ ko: "현재 카드 워터마크 표시", en: "Show watermark on current card" })}
        />
      </div>
    </section>
  );
}

function TextLayerFields({
  document,
  card,
  layer,
  onDocumentChange,
}: {
  document: CardNewsDeckPayload;
  card: CardNewsCard;
  layer: Extract<CardNewsLayer, { type: "text" }>;
  onDocumentChange: (next: CardNewsDeckPayload) => void;
}) {
  const [text, setText] = useState(layer.text);
  const update = (patch: Partial<typeof layer>) => onDocumentChange(updateCardNewsLayer(document, card.cardId, layer.id, patch));
  const weights = CARD_NEWS_FONT_WEIGHTS[layer.fontFamily].map(String);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="card-news-layer-text" label={<Lang text={{ ko: "텍스트", en: "Text" }} />} />
        <Textarea
          id="card-news-layer-text"
          value={text}
          rows={4}
          maxLength={3000}
          className="min-h-28 resize-y"
          onChange={(event) => setText(event.target.value)}
          onBlur={() => update({ text })}
        />
        <p className="text-xs text-secondary-text">{text.length}/3000</p>
      </div>
      <SelectField
        id="card-news-layer-font"
        label={lang({ ko: "폰트", en: "Font" })}
        value={layer.fontFamily}
        options={CARD_NEWS_FONT_FAMILIES}
        onChange={(fontFamily) => {
          const family = fontFamily as typeof layer.fontFamily;
          const nextWeight = CARD_NEWS_FONT_WEIGHTS[family].includes(layer.fontWeight)
            ? layer.fontWeight
            : CARD_NEWS_FONT_WEIGHTS[family][0];
          update({ fontFamily: family, fontWeight: nextWeight });
        }}
      />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="card-news-layer-weight" label={lang({ ko: "굵기", en: "Weight" })} value={String(layer.fontWeight)} options={weights} onChange={(value) => update({ fontWeight: Number(value) })} />
        <NumberField id="card-news-layer-size" label={lang({ ko: "크기", en: "Size" })} value={layer.fontSize} min={8} max={240} onChange={(fontSize) => update({ fontSize })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-layer-line-height" label={lang({ ko: "줄 간격", en: "Line height" })} value={layer.lineHeight} min={8} max={720} onChange={(lineHeight) => update({ lineHeight })} />
        <NumberField id="card-news-layer-letter-spacing" label={lang({ ko: "자간", en: "Letter spacing" })} value={layer.letterSpacing} min={-10} max={20} step={0.5} onChange={(letterSpacing) => update({ letterSpacing })} />
      </div>
      <ColorInput id="card-news-layer-color" label={lang({ ko: "텍스트 색상", en: "Text color" })} value={layer.color} onChange={(color) => update({ color })} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="card-news-layer-align" label={lang({ ko: "정렬", en: "Align" })} value={layer.align} options={["left", "center", "right"]} onChange={(align) => update({ align: align as typeof layer.align })} />
        <SelectField id="card-news-layer-vertical" label={lang({ ko: "세로 정렬", en: "Vertical" })} value={layer.verticalAlign} options={["top", "middle", "bottom"]} onChange={(verticalAlign) => update({ verticalAlign: verticalAlign as typeof layer.verticalAlign })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SelectField id="card-news-layer-overflow" label={lang({ ko: "넘침", en: "Overflow" })} value={layer.overflow} options={["clip", "ellipsis"]} onChange={(overflow) => update({ overflow: overflow as typeof layer.overflow })} />
        <SelectField id="card-news-layer-word-break" label={lang({ ko: "줄바꿈", en: "Word break" })} value={layer.wordBreak} options={["keep-all", "normal", "break-word"]} onChange={(wordBreak) => update({ wordBreak: wordBreak as typeof layer.wordBreak })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-layer-x" label="X" value={layer.box.x} min={0} max={1} step={0.01} onChange={(x) => update({ box: { ...layer.box, x } })} />
        <NumberField id="card-news-layer-y" label="Y" value={layer.box.y} min={0} max={1} step={0.01} onChange={(y) => update({ box: { ...layer.box, y } })} />
        <NumberField id="card-news-layer-width" label={lang({ ko: "너비", en: "Width" })} value={layer.box.w} min={0.02} max={1} step={0.01} onChange={(w) => update({ box: { ...layer.box, w } })} />
        <NumberField id="card-news-layer-height" label={lang({ ko: "높이", en: "Height" })} value={layer.box.h} min={0.02} max={1} step={0.01} onChange={(h) => update({ box: { ...layer.box, h } })} />
      </div>
    </div>
  );
}

function ImageLayerFields({ document, card, layer, onDocumentChange }: { document: CardNewsDeckPayload; card: CardNewsCard; layer: Extract<CardNewsLayer, { type: "image" }>; onDocumentChange: (next: CardNewsDeckPayload) => void }) {
  const update = (patch: Partial<typeof layer>) => onDocumentChange(updateCardNewsLayer(document, card.cardId, layer.id, patch));
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-secondary-text">
        <span className="font-medium text-primary-text">{layer.srcKind === "assetId" ? "Asset" : "Proxy"}</span>
        <span className="ml-2 break-all">{layer.src}</span>
      </div>
      <SelectField id="card-news-image-fit" label={lang({ ko: "맞춤", en: "Fit" })} value={layer.fit} options={["cover", "contain", "fill"]} onChange={(fit) => update({ fit: fit as typeof layer.fit })} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-image-focal-x" label="Focal X" value={layer.focalPoint.x} min={0} max={1} step={0.01} onChange={(x) => update({ focalPoint: { ...layer.focalPoint, x } })} />
        <NumberField id="card-news-image-focal-y" label="Focal Y" value={layer.focalPoint.y} min={0} max={1} step={0.01} onChange={(y) => update({ focalPoint: { ...layer.focalPoint, y } })} />
        <NumberField id="card-news-image-opacity" label={lang({ ko: "불투명도", en: "Opacity" })} value={layer.opacity} min={0} max={1} step={0.05} onChange={(opacity) => update({ opacity })} />
        <NumberField id="card-news-image-radius" label={lang({ ko: "모서리", en: "Radius" })} value={layer.radius} min={0} max={100} step={1} onChange={(radius) => update({ radius })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-image-x" label="X" value={layer.box.x} min={0} max={1} step={0.01} onChange={(x) => update({ box: { ...layer.box, x } })} />
        <NumberField id="card-news-image-y" label="Y" value={layer.box.y} min={0} max={1} step={0.01} onChange={(y) => update({ box: { ...layer.box, y } })} />
        <NumberField id="card-news-image-width" label={lang({ ko: "너비", en: "Width" })} value={layer.box.w} min={0.02} max={1} step={0.01} onChange={(w) => update({ box: { ...layer.box, w } })} />
        <NumberField id="card-news-image-height" label={lang({ ko: "높이", en: "Height" })} value={layer.box.h} min={0.02} max={1} step={0.01} onChange={(h) => update({ box: { ...layer.box, h } })} />
      </div>
    </div>
  );
}

function ShapeLayerFields({ document, card, layer, onDocumentChange }: { document: CardNewsDeckPayload; card: CardNewsCard; layer: Extract<CardNewsLayer, { type: "shape" }>; onDocumentChange: (next: CardNewsDeckPayload) => void }) {
  const update = (patch: Partial<typeof layer>) => onDocumentChange(updateCardNewsLayer(document, card.cardId, layer.id, patch));
  return (
    <div className="space-y-4">
      <SelectField id="card-news-shape-type" label={lang({ ko: "도형", en: "Shape" })} value={layer.shape} options={["rectangle", "circle"]} onChange={(shape) => update({ shape: shape as typeof layer.shape })} />
      <ColorInput id="card-news-shape-fill" label={lang({ ko: "채우기", en: "Fill" })} value={layer.fill} onChange={(fill) => update({ fill })} />
      <NumberField id="card-news-shape-radius" label={lang({ ko: "모서리", en: "Radius" })} value={layer.radius} min={0} max={100} onChange={(radius) => update({ radius })} />
    </div>
  );
}

function colorWithoutAlpha(value: string) {
  const match = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.exec(value);
  return match ? `#${match[0].slice(1, 7)}` : "#111827";
}

function SolidLayerFields({ document, card, layer, onDocumentChange }: { document: CardNewsDeckPayload; card: CardNewsCard; layer: Extract<CardNewsLayer, { type: "solid" }>; onDocumentChange: (next: CardNewsDeckPayload) => void }) {
  const update = (patch: Partial<typeof layer>) => onDocumentChange(updateCardNewsLayer(document, card.cardId, layer.id, patch));
  const gradient = layer.gradient || {
    from: layer.color,
    to: `${colorWithoutAlpha(layer.color)}00`,
    direction: "top-bottom" as const,
  };
  const isGradient = Boolean(layer.gradient);
  const isTransparentTo = /00$/i.test(gradient.to);
  const updateGradient = (patch: Partial<typeof gradient>) => update({ gradient: { ...gradient, ...patch } });

  return (
    <div className="space-y-4">
      <SelectField
        id="card-news-solid-fill-mode"
        label={lang({ ko: "채우기 방식", en: "Fill mode" })}
        value={isGradient ? "gradient" : "solid"}
        options={["solid", "gradient"]}
        onChange={(mode) => update(mode === "gradient" ? { gradient } : { gradient: undefined })}
      />
      {!isGradient ? (
        <ColorInput id="card-news-solid-color" label={lang({ ko: "색상", en: "Color" })} value={layer.color} onChange={(color) => update({ color })} />
      ) : (
        <div className="space-y-4 rounded-lg border border-border/70 p-3">
          <p className="text-xs text-secondary-text"><Lang text={{ ko: "시작 색상에서 끝 색상으로 자연스럽게 전환합니다.", en: "Blend smoothly from the start color to the end color." }} /></p>
          <ColorInput id="card-news-solid-gradient-from" label={lang({ ko: "From 색상", en: "From color" })} value={gradient.from} onChange={(from) => updateGradient({ from })} />
          <ColorInput
            id="card-news-solid-gradient-to"
            label={lang({ ko: "To 색상", en: "To color" })}
            value={gradient.to}
            onChange={(to) => updateGradient({ to: isTransparentTo ? `${to}00` : to })}
          />
          <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="card-news-solid-gradient-transparent" label={lang({ ko: "To를 투명하게", en: "Fade to transparent" })} />
              <span className="text-xs text-secondary-text"><Lang text={{ ko: "끝 지점에서 색상이 사라집니다.", en: "The color fades out at the end point." }} /></span>
            </div>
            <Switch
              id="card-news-solid-gradient-transparent"
              size="sm"
              checked={isTransparentTo}
              onCheckedChange={(checked) => updateGradient({ to: `${colorWithoutAlpha(gradient.to)}${checked ? "00" : "ff"}` })}
              aria-label={lang({ ko: "그라데이션 끝 색상 투명 전환", en: "Toggle transparent gradient end" })}
            />
          </div>
          <SelectField
            id="card-news-solid-gradient-direction"
            label={lang({ ko: "방향", en: "Direction" })}
            value={gradient.direction}
            options={CARD_NEWS_GRADIENT_DIRECTIONS}
            onChange={(direction) => updateGradient({ direction: direction as typeof gradient.direction })}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-solid-opacity" label={lang({ ko: "불투명도", en: "Opacity" })} value={layer.opacity} min={0} max={1} step={0.05} onChange={(opacity) => update({ opacity })} />
        <NumberField id="card-news-solid-radius" label={lang({ ko: "모서리", en: "Radius" })} value={layer.radius} min={0} max={100} onChange={(radius) => update({ radius })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField id="card-news-solid-x" label="X" value={layer.box.x} min={0} max={1} step={0.01} onChange={(x) => update({ box: { ...layer.box, x } })} />
        <NumberField id="card-news-solid-y" label="Y" value={layer.box.y} min={0} max={1} step={0.01} onChange={(y) => update({ box: { ...layer.box, y } })} />
        <NumberField id="card-news-solid-width" label={lang({ ko: "너비", en: "Width" })} value={layer.box.w} min={0.02} max={1} step={0.01} onChange={(w) => update({ box: { ...layer.box, w } })} />
        <NumberField id="card-news-solid-height" label={lang({ ko: "높이", en: "Height" })} value={layer.box.h} min={0.02} max={1} step={0.01} onChange={(h) => update({ box: { ...layer.box, h } })} />
      </div>
    </div>
  );
}

export function CardNewsPropertiesPanel({
  document,
  card,
  selectedLayer,
  onDocumentChange,
  onSelectLayer,
  onOpenAssetPicker,
  onAddText,
  onAddSolid,
  onDeleteLayer,
}: CardNewsPropertiesPanelProps) {
  const [altText, setAltText] = useState(card.altText);

  const updateBackgroundColor = (value: string) => {
    onDocumentChange(updateCardNewsBackground(document, card.cardId, { type: "color", value, opacity: 1 }));
  };
  const imageBackground = card.background.type === "image" ? card.background : null;

  return (
    <div className="space-y-5">
      <section aria-labelledby="card-news-properties-title" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="card-news-properties-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "속성", en: "Properties" }} />
          </h2>
          <span className="text-xs text-secondary-text">{selectedLayer ? selectedLayer.type : "card"}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="outline" className="min-h-11 gap-2" onClick={onAddText}>
            <Type className="size-4" aria-hidden />
            <Lang text={{ ko: "텍스트", en: "Text" }} />
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" onClick={() => onOpenAssetPicker("layer")}>
            <ImagePlus className="size-4" aria-hidden />
            <Lang text={{ ko: "이미지", en: "Image" }} />
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" onClick={onAddSolid}>
            <Square className="size-4" aria-hidden />
            <Lang text={{ ko: "솔리드", en: "Solid" }} />
          </Button>
        </div>
      </section>

      <section aria-labelledby="card-news-background-title" className="space-y-3 border-t border-border/70 pt-4">
        <h3 id="card-news-background-title" className="text-sm font-semibold text-primary-text">
          <Lang text={{ ko: "카드 배경", en: "Card background" }} />
        </h3>
        <ColorInput id="card-news-background-color" label={lang({ ko: "배경 색상", en: "Background color" })} value={card.background.type === "color" ? card.background.value : document.theme.backgroundColor} onChange={updateBackgroundColor} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 gap-2" onClick={() => onOpenAssetPicker("background")}>
            <ImagePlus className="size-4" aria-hidden />
            <Lang text={{ ko: imageBackground ? "배경 이미지 바꾸기" : "배경 이미지 추가", en: imageBackground ? "Change background" : "Add background" }} />
          </Button>
          {imageBackground ? (
            <Button variant="ghost" className="min-h-11" onClick={() => updateBackgroundColor(document.theme.backgroundColor)}>
              <Lang text={{ ko: "색상으로 전환", en: "Use color" }} />
            </Button>
          ) : null}
        </div>
        {imageBackground ? (
          <div className="grid grid-cols-2 gap-3">
            <SelectField id="card-news-background-fit" label={lang({ ko: "맞춤", en: "Fit" })} value={imageBackground.fit} options={["cover", "contain", "fill"]} onChange={(fit) => onDocumentChange(updateCardNewsBackground(document, card.cardId, { type: "image", fit: fit as typeof imageBackground.fit }))} />
            <NumberField id="card-news-background-opacity" label={lang({ ko: "불투명도", en: "Opacity" })} value={imageBackground.opacity} min={0} max={1} step={0.05} onChange={(opacity) => onDocumentChange(updateCardNewsBackground(document, card.cardId, { type: "image", opacity }))} />
            <NumberField id="card-news-background-focal-x" label="Focal X" value={imageBackground.focalPoint.x} min={0} max={1} step={0.01} onChange={(x) => onDocumentChange(updateCardNewsBackground(document, card.cardId, { type: "image", focalPoint: { ...imageBackground.focalPoint, x } }))} />
            <NumberField id="card-news-background-focal-y" label="Focal Y" value={imageBackground.focalPoint.y} min={0} max={1} step={0.01} onChange={(y) => onDocumentChange(updateCardNewsBackground(document, card.cardId, { type: "image", focalPoint: { ...imageBackground.focalPoint, y } }))} />
          </div>
        ) : null}
      </section>

      <WatermarkFields
        document={document}
        card={card}
        onDocumentChange={onDocumentChange}
        onOpenAssetPicker={onOpenAssetPicker}
      />

      <section aria-labelledby="card-news-layer-list-title" className="space-y-3 border-t border-border/70 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 id="card-news-layer-list-title" className="text-sm font-semibold text-primary-text">
            <Lang text={{ ko: "레이어", en: "Layers" }} />
          </h3>
          <span className="text-xs text-secondary-text">{card.layers.length}</span>
        </div>
        <ul role="listbox" aria-label="카드 레이어 목록" className="space-y-2">
          {card.layers.length ? card.layers.map((layer) => (
            <li key={layer.id}>
              <div className={`flex items-center gap-2 rounded-lg border p-1.5 ${selectedLayer?.id === layer.id ? "border-primary bg-primary/5" : "border-border/70"}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedLayer?.id === layer.id}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelectLayer(layer.id)}
                  onDoubleClick={() => layer.type === "text" && onSelectLayer(layer.id)}
                >
                  {layer.type === "text" ? <Type className="size-4 shrink-0 text-primary" aria-hidden /> : layer.type === "image" ? <ImagePlus className="size-4 shrink-0 text-secondary" aria-hidden /> : layer.type === "solid" ? <Square className="size-4 shrink-0 text-accent-text" aria-hidden /> : <Paintbrush className="size-4 shrink-0 text-accent-text" aria-hidden />}
                  <span className="truncate">{layer.type === "text" ? layer.text || "텍스트" : layer.type === "image" ? "이미지" : layer.type === "solid" ? "솔리드" : "도형"}</span>
                </button>
                <Button variant="ghost" size="icon-md" aria-label={lang({ ko: "레이어 삭제", en: "Delete layer" })} className="text-danger hover:text-danger" onClick={() => onDeleteLayer(layer.id)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          )) : (
            <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-secondary-text">
              <Lang text={{ ko: "레이어를 추가해 카드 내용을 구성하세요.", en: "Add a layer to build this card." }} />
            </li>
          )}
        </ul>
      </section>

      {selectedLayer ? (
        <section aria-labelledby="card-news-selected-layer-title" className="space-y-3 border-t border-border/70 pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id="card-news-selected-layer-title" className="text-sm font-semibold text-primary-text">
              <Lang text={{ ko: "선택한 레이어", en: "Selected layer" }} />
            </h3>
            <Layers className="size-4 text-secondary-text" aria-hidden />
          </div>
          {selectedLayer.type === "text" ? <TextLayerFields key={`${selectedLayer.id}:${selectedLayer.text}`} document={document} card={card} layer={selectedLayer} onDocumentChange={onDocumentChange} /> : null}
          {selectedLayer.type === "image" ? <ImageLayerFields document={document} card={card} layer={selectedLayer} onDocumentChange={onDocumentChange} /> : null}
          {selectedLayer.type === "solid" ? <SolidLayerFields document={document} card={card} layer={selectedLayer} onDocumentChange={onDocumentChange} /> : null}
          {selectedLayer.type === "shape" ? <ShapeLayerFields document={document} card={card} layer={selectedLayer} onDocumentChange={onDocumentChange} /> : null}
        </section>
      ) : null}

      <section aria-labelledby="card-news-alt-text-title" className="space-y-3 border-t border-border/70 pt-4">
        <h3 id="card-news-alt-text-title" className="text-sm font-semibold text-primary-text">
          <Lang text={{ ko: "접근성 설명", en: "Accessibility" }} />
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="card-news-alt-text" label={<Lang text={{ ko: "카드 설명(altText)", en: "Card description (altText)" }} />} />
          <Textarea
            id="card-news-alt-text"
            value={altText}
            rows={3}
            maxLength={500}
            placeholder={lang({ ko: "이 카드의 내용을 설명해 주세요.", en: "Describe this card." })}
            onChange={(event) => setAltText(event.target.value)}
            onBlur={() => onDocumentChange(updateCardNewsCard(document, card.cardId, { altText }))}
          />
        </div>
      </section>
    </div>
  );
}
