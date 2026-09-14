function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function validatePrivateOpenCodeConfig(contents: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Private OpenCode configuration must be valid JSON");
  }
  const providers = record(record(parsed)?.provider);
  if (!providers || Object.keys(providers).length === 0) throw new Error("Private OpenCode configuration requires at least one provider");
  for (const [name, value] of Object.entries(providers)) {
    const options = record(record(value)?.options);
    if (typeof options?.baseURL !== "string") throw new Error(`OpenCode provider ${name} requires options.baseURL`);
    const url = new URL(options.baseURL);
    if (url.protocol !== "http:" || url.hostname !== "inference.local" || url.port !== "8080") {
      throw new Error(`OpenCode provider ${name} baseURL must use http://inference.local:8080`);
    }
    if (typeof options.apiKey !== "string" || !/^\{env:[A-Z][A-Z0-9_]*\}$/.test(options.apiKey)) {
      throw new Error(`OpenCode provider ${name} apiKey must be an {env:VARIABLE} reference`);
    }
  }
}

export function validateOpenCodeIdentity(
  profile: { model: string; variant: string | null },
  system: { inference: { parameters: Record<string, unknown>; reasoning: string } },
): void {
  const declaredModel = system.inference.parameters.opencodeModel;
  if (typeof declaredModel !== "string" || !declaredModel.trim()) {
    throw new Error("Public system profile requires inference.parameters.opencodeModel for OpenCode execution");
  }
  if (profile.model !== declaredModel) {
    throw new Error("Private OpenCode model does not match the public system profile");
  }
  if (system.inference.reasoning !== "unknown" && profile.variant !== system.inference.reasoning) {
    throw new Error("Private OpenCode variant does not match the public system reasoning setting");
  }
}

export function validateOpenCodeConfigModel(model: string, contents: string): void {
  const [providerId, modelId, ...rest] = model.split("/");
  if (!providerId || !modelId || rest.length > 0) throw new Error("OpenCode model must use provider/model format");
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Private OpenCode configuration must be valid JSON");
  }
  const provider = record(record(parsed)?.provider)?.[providerId];
  const models = record(record(provider)?.models);
  if (!models || !Object.hasOwn(models, modelId)) {
    throw new Error("Private OpenCode configuration does not expose the selected model");
  }
}
