export function validateEditPlan(plan, catalog) {
  if (typeof plan?.question === "string" && plan.question.trim())
    throw Error(plan.question);
  if (
    !Array.isArray(plan?.commands) ||
    !plan.commands.length ||
    plan.commands.length > 120
  )
    throw Error("O modelo devolveu um plano de edição inválido.");
  const commands = plan.commands.map(raw => {
    const spec = catalog.find(item => item.id === raw?.id);
    if (!spec) throw Error("A IA propôs uma operação fora do catálogo.");
    // Some providers group arguments in params. Unwrap only this lossless representation.
    let fields = Object.fromEntries(
      Object.entries(raw).filter(([key]) => key !== "id")
    );
    if (
      Object.keys(fields).length === 1 &&
      fields.params &&
      typeof fields.params === "object" &&
      !Array.isArray(fields.params) &&
      !(Object.hasOwn(spec.required,"params") || Object.hasOwn(spec.optional,"params"))
    )
      fields = fields.params;
    for (const key of Object.keys(fields)) {
      if (
        key.endsWith("?") ||
        (!Object.hasOwn(spec.required, key) &&
          !Object.hasOwn(spec.optional, key))
      )
        throw Error(
          "A proposta usa o parâmetro desconhecido “" +
            key +
            "” em " +
            spec.id +
            "."
        );
    }
    for (const key of Object.keys(spec.required)) {
      if (!key.endsWith("?") && !Object.hasOwn(fields, key))
        throw Error("Faltou o parâmetro “" + key + "” em " + spec.id + ".");
    }
    return { ...fields, id: spec.id };
  });
  return {
    commands,
    summary: typeof plan.summary === "string" ? plan.summary : "",
  };
}
