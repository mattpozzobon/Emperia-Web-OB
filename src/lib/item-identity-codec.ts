import {
  ITEM_IDENTITY_OPTIONS,
  type ItemIdentity,
} from './item-identity';

const SERIALIZED_IDENTITIES = ITEM_IDENTITY_OPTIONS.filter(
  (identity): identity is ItemIdentity => identity !== '',
);

export const ITEM_IDENTITY_CODE_BY_NAME = new Map<ItemIdentity, number>(
  SERIALIZED_IDENTITIES.map((identity, index) => [identity, index + 1]),
);

export function isItemIdentity(identity: string): identity is ItemIdentity {
  return ITEM_IDENTITY_CODE_BY_NAME.has(identity as ItemIdentity);
}

export function encodeItemIdentity(identity: string): number {
  const code = ITEM_IDENTITY_CODE_BY_NAME.get(identity as ItemIdentity);
  if (code == null) throw new Error(`Unknown item identity "${identity}"`);
  return code;
}

export function decodeItemIdentity(code: number): ItemIdentity {
  const identity = SERIALIZED_IDENTITIES[code - 1];
  if (!identity) throw new Error(`Unknown EOBJ item identity code ${code}`);
  return identity;
}
