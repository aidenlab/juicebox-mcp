/**
 * Room ids: 10 Crockford base32 characters (~50 bits), short enough for a
 * small join-link QR, long enough to be unguessable (design §5.4). The one
 * definition `/ws` and `join_room` both check, so a page can't sit in a room
 * MCP can never join.
 */

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A room id: Crockford base32 has no I, L, O or U. */
export const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{10}$/i;

/** The room id spelled by the first 10 bytes, 5 bits each. */
export function roomIdFromBytes(bytes) {
  return Array.from(bytes.subarray(0, 10), b => CROCKFORD_BASE32[b & 31]).join('');
}

/** A fresh random room id. */
export function mintRoomId() {
  return roomIdFromBytes(crypto.getRandomValues(new Uint8Array(10)));
}
