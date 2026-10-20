import { WHITEBOARD_COLORS, type WhiteboardColor, type WhiteboardPoint } from '../whiteboard/protocol';

export const CUSTOM_EMBLEM_WIDTH = 256;
export const CUSTOM_EMBLEM_HEIGHT = 128;
export const CUSTOM_EMBLEM_FRAME_COUNT = 3;
export const CUSTOM_EMBLEM_MAX_OPERATIONS = 300;
export const CUSTOM_EMBLEM_MAX_POINTS = 180;
export const CUSTOM_EMBLEM_MAX_DOCUMENT_BYTES = 180_000;
export const CUSTOM_EMBLEM_MAX_IMAGE_BYTES = 180_000;
export const CUSTOM_EMBLEM_BORDER_COUNT = 28;
export const CUSTOM_EMBLEM_BORDER_NUMBER = 5;

export interface CustomEmblemStroke {
  kind: 'stroke' | 'erase';
  color?: WhiteboardColor;
  points: WhiteboardPoint[];
}

export interface CustomEmblemCrop { x: number; y: number; width: number; height: number }
export interface CustomEmblemDocument { operations: CustomEmblemStroke[]; crop: CustomEmblemCrop; borderNumber: number }
export interface CustomEmblemMeta { playerId: string; version: number; borderNumber: number }
export interface CustomEmblemState extends CustomEmblemDocument { version: number }

export const DEFAULT_CUSTOM_EMBLEM_DOCUMENT: CustomEmblemDocument = {
  operations: [], crop: { x: 188, y: 130, width: 384, height: 192 }, borderNumber: CUSTOM_EMBLEM_BORDER_NUMBER,
};

let customEmblemImageBaseUrl = '';

export function setCustomEmblemImageBaseUrl(baseUrl: string): void {
  customEmblemImageBaseUrl = baseUrl.replace(/\/$/u, '');
}

export function customEmblemImageUrl(meta: CustomEmblemMeta): string {
  return `${customEmblemImageBaseUrl}/custom-emblems/${encodeURIComponent(meta.playerId)}.webp?v=${meta.version}&format=2`;
}

export function nextCustomEmblemBorder(borderNumber: number): number {
  return borderNumber % CUSTOM_EMBLEM_BORDER_COUNT + 1;
}

export function isCustomEmblemMeta(value: unknown): value is CustomEmblemMeta {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CustomEmblemMeta>;
  return typeof item.playerId === 'string' && item.playerId.length > 0 && item.playerId.length <= 128
    && Number.isSafeInteger(item.version) && item.version! > 0 && validBorder(item.borderNumber);
}

export function isCustomEmblemDocument(value: unknown): value is CustomEmblemDocument {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CustomEmblemDocument>;
  if (!validBorder(item.borderNumber) || !validCrop(item.crop) || !Array.isArray(item.operations)
    || item.operations.length > CUSTOM_EMBLEM_MAX_OPERATIONS) return false;
  return item.operations.every((operation) => {
    if (!operation || (operation.kind !== 'stroke' && operation.kind !== 'erase') || !Array.isArray(operation.points)
      || operation.points.length < 2 || operation.points.length > CUSTOM_EMBLEM_MAX_POINTS) return false;
    if (operation.kind === 'stroke' && !WHITEBOARD_COLORS.includes(operation.color as WhiteboardColor)) return false;
    return operation.points.every((point) => point && finiteRange(point.x, 0, 760) && finiteRange(point.y, 0, 450));
  });
}

export function validCrop(value: unknown): value is CustomEmblemCrop {
  if (!value || typeof value !== 'object') return false;
  const crop = value as Partial<CustomEmblemCrop>;
  return finiteRange(crop.x, 0, 760) && finiteRange(crop.y, 0, 450)
    && finiteRange(crop.width, 96, 760) && finiteRange(crop.height, 48, 380)
    && Math.abs(crop.width! / crop.height! - 2) < 0.001
    && crop.x! + crop.width! <= 760.001 && crop.y! + crop.height! <= 450.001;
}

function validBorder(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= CUSTOM_EMBLEM_BORDER_COUNT;
}

function finiteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
