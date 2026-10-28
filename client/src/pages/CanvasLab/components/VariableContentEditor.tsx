import type { ContentBlock, VariableContent } from "@shared/variableContent";
import { contentBlockTypes, contentTextRoles } from "@shared/variableContent";
const field =
  "w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white";
const button =
  "rounded-lg border border-white/15 px-2 py-1 text-xs hover:bg-white/10";
const names = {
  text: "Texto",
  list: "Lista",
  metric: "Métrica",
  quote: "Citação",
  comparison: "Comparação",
};
const roleLabels: Record<string, string> = {
  headline: "Título principal",
  subheadline: "Subtítulo",
  body: "Corpo do texto",
  highlight: "Destaque",
  cta: "Chamada (CTA)",
  eyebrow: "Chapéu / Tag",
  caption: "Legenda",
  quote: "Citação",
  stat: "Número / Métrica",
  footer: "Rodapé",
  sectionLabel: "Seção",
  callToAction: "Chamada (CTA)",
  label: "Rótulo",
};
export default function VariableContentEditor({
  value,
  onChange,
}: {
  value: VariableContent;
  onChange: (v: VariableContent) => void;
}) {
  const update = (id: string, change: (b: ContentBlock) => ContentBlock) =>
    onChange({
      ...value,
      blocks: value.blocks.map(b => (b.id === id ? change(b) : b)),
    });
  const move = (index: number, delta: number) => {
    const blocks = [...value.blocks];
    const other = index + delta;
    if (other < 0 || other >= blocks.length) return;
    [blocks[index], blocks[other]] = [blocks[other], blocks[index]];
    onChange({ ...value, blocks });
  };
  const add = (type: ContentBlock["type"]) => {
    const id = crypto.randomUUID();
    let block: ContentBlock;
    switch (type) {
      case "text":
        block = { id, type, role: "body", text: "Novo texto" };
        break;
      case "list":
        block = {
          id,
          type,
          items: [{ id: crypto.randomUUID(), text: "Novo item" }],
        };
        break;
      case "metric":
        block = {
          id,
          type,
          value: "Valor",
          label: "Descrição",
          sourceSpanIds: [],
        };
        break;
      case "quote":
        block = { id, type, text: "Citação", author: null, sourceSpanIds: [] };
        break;
      case "comparison":
        block = {
          id,
          type,
          left: { label: "Antes", text: "Texto" },
          right: { label: "Depois", text: "Texto" },
        };
        break;
    }
    onChange({ ...value, blocks: [...value.blocks, block] });
  };
  const input = (label: string, text: string, change: (s: string) => void) => (
    <label className="block text-xs">
      {label}
      <textarea
        aria-label={label}
        className={field}
        value={text}
        onChange={e => change(e.target.value)}
      />
    </label>
  );
  return (
    <div className="space-y-3" data-variable-content-editor>
      <p className="text-xs">
        {value.blocks.length} blocos de conteúdo. Listas mantêm seus próprios
        itens.
      </p>
      {value.blocks.map((b, index) => (
        <div
          key={b.id}
          className="rounded-lg border border-white/15 p-2 space-y-2"
        >
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs">
              {index + 1}. {names[b.type]}
            </span>
            <button
              className={button}
              aria-label={`Subir bloco ${index + 1}`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              className={button}
              aria-label={`Descer bloco ${index + 1}`}
              disabled={index === value.blocks.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              className={button}
              aria-label={`Excluir bloco ${index + 1}`}
              onClick={() =>
                onChange({
                  ...value,
                  blocks: value.blocks.filter(old => old.id !== b.id),
                })
              }
            >
              Excluir
            </button>
          </div>
          {b.type === "text" && (
            <>
              <select
                aria-label={`Papel do bloco ${index + 1}`}
                className={field}
                value={b.role}
                onChange={e =>
                  update(b.id, () => ({
                    ...b,
                    role: e.target.value as typeof b.role,
                  }))
                }
              >
                {contentTextRoles.map(r => (
                  <option key={r} value={r}>
                    {roleLabels[r] ?? r}
                  </option>
                ))}
              </select>
              {input(`Texto do bloco ${index + 1}`, b.text, text =>
                update(b.id, () => ({ ...b, text }))
              )}
            </>
          )}
          {b.type === "list" && (
            <>
              {b.items.map((item, i) => (
                <div key={item.id}>
                  {input(`Bloco ${index + 1}, item ${i + 1}`, item.text, text =>
                    update(b.id, () => ({
                      ...b,
                      items: b.items.map(old =>
                        old.id === item.id ? { ...old, text } : old
                      ),
                    }))
                  )}
                  <button
                    className={button}
                    aria-label={`Excluir item ${i + 1} do bloco ${index + 1}`}
                    onClick={() =>
                      update(b.id, () => ({
                        ...b,
                        items: b.items.filter(old => old.id !== item.id),
                      }))
                    }
                  >
                    Excluir item
                  </button>
                  <button
                    className={button}
                    disabled={i === 0}
                    aria-label={`Subir item ${i + 1} do bloco ${index + 1}`}
                    onClick={() =>
                      update(b.id, () => {
                        const items = [...b.items];
                        [items[i - 1], items[i]] = [items[i], items[i - 1]];
                        return { ...b, items };
                      })
                    }
                  >
                    ↑
                  </button>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  update(b.id, () => ({
                    ...b,
                    items: [
                      ...b.items,
                      { id: crypto.randomUUID(), text: "Novo item" },
                    ],
                  }))
                }
              >
                Adicionar item ao bloco {index + 1}
              </button>
            </>
          )}
          {b.type === "metric" && (
            <>
              {input(`Valor do bloco ${index + 1}`, b.value, value =>
                update(b.id, () => ({ ...b, value }))
              )}
              {input(`Descrição do bloco ${index + 1}`, b.label, label =>
                update(b.id, () => ({ ...b, label }))
              )}
            </>
          )}
          {b.type === "quote" && (
            <>
              {input(`Citação do bloco ${index + 1}`, b.text, text =>
                update(b.id, () => ({ ...b, text }))
              )}
              {input(`Autor do bloco ${index + 1}`, b.author ?? "", author =>
                update(b.id, () => ({ ...b, author: author || null }))
              )}
            </>
          )}
          {b.type === "comparison" &&
            (["left", "right"] as const).map(side => (
              <div key={side}>
                {input(
                  `Rótulo ${side === "left" ? "esquerdo" : "direito"} do bloco ${index + 1}`,
                  b[side].label,
                  label =>
                    update(b.id, () => ({
                      ...b,
                      [side]: { ...b[side], label },
                    }))
                )}
                {input(
                  `Texto ${side === "left" ? "esquerdo" : "direito"} do bloco ${index + 1}`,
                  b[side].text,
                  text =>
                    update(b.id, () => ({ ...b, [side]: { ...b[side], text } }))
                )}
              </div>
            ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {contentBlockTypes.map(type => (
          <button key={type} className={button} onClick={() => add(type)}>
            Adicionar {names[type].toLowerCase()}
          </button>
        ))}
      </div>
      {input("Legenda", value.caption, caption =>
        onChange({ ...value, caption })
      )}
      {input("Hashtags", value.hashtags.join(" "), text =>
        onChange({ ...value, hashtags: text.split(/\s+/).filter(Boolean) })
      )}
    </div>
  );
}
