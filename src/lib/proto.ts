// Manual protobuf decoder - Edge Runtime compatible (no eval)

function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;

  while (pos < data.length) {
    const byte = data[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return [result, pos];
}

function readString(data: Uint8Array, offset: number, length: number): string {
  const bytes = data.slice(offset, offset + length);
  return new TextDecoder().decode(bytes);
}

interface ParsedServer {
  EndPoint: string;
  Data: {
    svMaxclients: number;
    clients: number;
    hostname: string;
    gametype: string;
    mapname: string;
    server: string;
    vars: Record<string, string>;
  };
}

function parseVars(data: Uint8Array, start: number, end: number): Record<string, string> {
  const vars: Record<string, string> = {};
  let pos = start;

  while (pos < end) {
    // Read field header
    const [header, newPos] = readVarint(data, pos);
    pos = newPos;

    const fieldNum = header >> 3;
    const wireType = header & 0x7;

    if (wireType === 2) {
      // Length-delimited (string)
      const [len, lenPos] = readVarint(data, pos);
      pos = lenPos;

      // Map entry: key (field 1) and value (field 2)
      if (fieldNum === 12) {
        // Parse map entry
        const entryEnd = pos + len;
        let key = "";
        let value = "";

        while (pos < entryEnd) {
          const [entryHeader, entryNewPos] = readVarint(data, pos);
          pos = entryNewPos;

          const entryFieldNum = entryHeader >> 3;
          const entryWireType = entryHeader & 0x7;

          if (entryWireType === 2) {
            const [strLen, strPos] = readVarint(data, pos);
            pos = strPos;
            const str = readString(data, pos, strLen);
            pos += strLen;

            if (entryFieldNum === 1) key = str;
            else if (entryFieldNum === 2) value = str;
          }
        }

        if (key) vars[key] = value;
      } else {
        pos += len;
      }
    } else if (wireType === 0) {
      // Varint
      const [, newPos2] = readVarint(data, pos);
      pos = newPos2;
    }
  }

  return vars;
}

function parseServerData(data: Uint8Array, start: number, end: number): ParsedServer["Data"] {
  const result: ParsedServer["Data"] = {
    svMaxclients: 0,
    clients: 0,
    hostname: "",
    gametype: "",
    mapname: "",
    server: "",
    vars: {},
  };

  let pos = start;

  while (pos < end) {
    const [header, newPos] = readVarint(data, pos);
    pos = newPos;

    const fieldNum = header >> 3;
    const wireType = header & 0x7;

    if (wireType === 0) {
      // Varint
      const [value, newPos2] = readVarint(data, pos);
      pos = newPos2;

      if (fieldNum === 1) result.svMaxclients = value;
      else if (fieldNum === 2) result.clients = value;
    } else if (wireType === 2) {
      // Length-delimited
      const [len, lenPos] = readVarint(data, pos);
      pos = lenPos;

      if (fieldNum === 4) result.hostname = readString(data, pos, len);
      else if (fieldNum === 5) result.gametype = readString(data, pos, len);
      else if (fieldNum === 6) result.mapname = readString(data, pos, len);
      else if (fieldNum === 9) result.server = readString(data, pos, len);
      else if (fieldNum === 12) {
        // Vars map - parse inline
        const entryEnd = pos + len;
        let key = "";
        let value = "";
        let entryPos = pos;

        while (entryPos < entryEnd) {
          const [entryHeader, entryNewPos] = readVarint(data, entryPos);
          entryPos = entryNewPos;

          const entryFieldNum = entryHeader >> 3;
          const entryWireType = entryHeader & 0x7;

          if (entryWireType === 2) {
            const [strLen, strPos] = readVarint(data, entryPos);
            entryPos = strPos;
            const str = readString(data, entryPos, strLen);
            entryPos += strLen;

            if (entryFieldNum === 1) key = str;
            else if (entryFieldNum === 2) value = str;
          }
        }

        if (key) result.vars[key] = value;
      }

      pos += len;
    }
  }

  return result;
}

export function decodeServerMessage(data: Uint8Array): ParsedServer | null {
  try {
    let pos = 0;
    let endpoint = "";
    let serverData: ParsedServer["Data"] | null = null;

    while (pos < data.length) {
      const [header, newPos] = readVarint(data, pos);
      pos = newPos;

      const fieldNum = header >> 3;
      const wireType = header & 0x7;

      if (wireType === 2) {
        const [len, lenPos] = readVarint(data, pos);
        pos = lenPos;

        if (fieldNum === 1) {
          endpoint = readString(data, pos, len);
        } else if (fieldNum === 2) {
          serverData = parseServerData(data, pos, pos + len);
        }

        pos += len;
      } else if (wireType === 0) {
        const [, newPos2] = readVarint(data, pos);
        pos = newPos2;
      }
    }

    if (!endpoint || !serverData) return null;

    return { EndPoint: endpoint, Data: serverData };
  } catch {
    return null;
  }
}

// Compatibility export - same interface as before
export const ServerMessage = {
  decode: (data: Uint8Array) => decodeServerMessage(data),
};
