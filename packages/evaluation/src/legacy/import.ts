import { type LegacyInventory } from "./inventory.js";

export type LegacyCandidate = {
  source: string;
  status: "legacy-unverified";
  includedPaths: string[];
  excludedPaths: string[];
  unknownMetadata: ["duration", "cost", "agentVersion"];
};

export function buildLegacyCandidate(source: string, inventory: LegacyInventory): LegacyCandidate {
  const includedPaths = inventory.entries
    .filter((entry) => entry.classification === "source" || entry.classification === "evidence")
    .map((entry) => entry.path)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const excludedPaths = inventory.entries
    .filter((entry) => entry.classification === "generated" || entry.classification === "repositoryMetadata")
    .map((entry) => entry.path)
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return { source, status: "legacy-unverified", includedPaths, excludedPaths, unknownMetadata: ["duration", "cost", "agentVersion"] };
}
