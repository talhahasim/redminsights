import protobuf from "protobufjs/light";

const schema = {
  nested: {
    master: {
      nested: {
        Player: {
          fields: {
            name: { type: "string", id: 1 },
            identifiers: { rule: "repeated", type: "string", id: 2 },
            endpoint: { type: "string", id: 3 },
            ping: { type: "int32", id: 4 },
            id: { type: "int32", id: 5 },
          },
        },
        ServerData: {
          fields: {
            svMaxclients: { type: "int32", id: 1 },
            clients: { type: "int32", id: 2 },
            protocol: { type: "int32", id: 3 },
            hostname: { type: "string", id: 4 },
            gametype: { type: "string", id: 5 },
            mapname: { type: "string", id: 6 },
            resources: { rule: "repeated", type: "string", id: 8 },
            server: { type: "string", id: 9 },
            players: { rule: "repeated", type: "Player", id: 10 },
            iconVersion: { type: "int32", id: 11 },
            vars: { keyType: "string", type: "string", id: 12 },
            enhancedHostSupport: { type: "bool", id: 16 },
            upvotePower: { type: "int32", id: 17 },
            connectEndPoints: { rule: "repeated", type: "string", id: 18 },
            burstPower: { type: "int32", id: 19 },
          },
        },
        Server: {
          fields: {
            EndPoint: { type: "string", id: 1 },
            Data: { type: "ServerData", id: 2 },
          },
        },
      },
    },
  },
};

// protobufjs JSON schema supports keyType for map fields at runtime
// but the TypeScript types don't include it
const root = protobuf.Root.fromJSON(
  schema as unknown as protobuf.INamespace
);

export const ServerMessage = root.lookupType("master.Server");
