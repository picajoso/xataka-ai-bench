const objectiveValidators = new Set(["command", "required-files", "forbidden-files", "json-schema", "browser"]);

export type ObjectiveDiagnostic = { validator: string; observation: string };

export function buildRepairPrompt(originalPrompt: string, diagnostics: ObjectiveDiagnostic[]): string {
  if (!originalPrompt.trim()) throw new Error("Original prompt is required for repair");
  if (diagnostics.some((diagnostic) => !objectiveValidators.has(diagnostic.validator))) {
    throw new Error("Repair diagnostics must come from an objective validator");
  }
  const entries = diagnostics.map((diagnostic) => `- [${diagnostic.validator}] ${diagnostic.observation}`).join("\n") || "- No objective diagnostic was supplied.";
  return `${originalPrompt.trim()}\n\n---\n\nRevisa el resultado completo frente al prompt original, ejecuta las comprobaciones disponibles y corrige los incumplimientos o errores que detectes. No añadas funcionalidades ajenas al encargo.\n\nDiagnósticos objetivos de la primera ejecución:\n${entries}\n`;
}
