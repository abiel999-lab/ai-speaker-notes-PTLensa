import { useEffect, useRef, useState } from "react";
import type { Studio } from "../studio/useStudio";
export function TemplateTextEditor({ studio: s, blocks, blockId, disabled, disabledReason }: {
  studio: Studio; blocks: { id: string; text: string; raw?: string }[]; blockId: string | null; disabled: boolean; disabledReason?: string;
}) {
  const [selected, setSelected] = useState(blockId || ""), [text, setText] = useState("");
  const drafts = useRef(new Map<string, string>());
  useEffect(() => { drafts.current.clear(); }, [s.job?.id]);
  useEffect(() => { setSelected(blockId || blocks[0]?.id || ""); }, [blockId, s.job?.id]);
  const block = blocks.find(b => b.id === selected), original = block?.raw ?? block?.text ?? "";
  useEffect(() => { setText(drafts.current.get(selected) ?? original); }, [selected, original, s.job?.id]);
  return <section className="inspector-section template-text-editor">
    <h2>Edit text · Template</h2>
    <p className="help-text">Save a new source revision and rebuild the PowerPoint. Earlier versions remain available. This action does not call AI.</p>
    <label className="field">Source block<select aria-label="Text block" value={selected} disabled={disabled} onChange={e => setSelected(e.target.value)}>
      {blocks.map(b => <option value={b.id} key={b.id}>{b.text.slice(0, 70)}</option>)}</select></label>
    <label className="field">Text / Markdown<textarea aria-label="Edit slide text" rows={8} value={text} disabled={disabled || !block}
      onChange={e => { setText(e.target.value); drafts.current.set(selected, e.target.value); }} /></label>
    {disabled && <p className="help-text">{disabledReason || "Finish the current job or apply/reset design changes before editing text."}</p>}
    <div className="template-text-actions"><button type="button" className="button primary" disabled={disabled || !block || !text.trim() || text === original}
      onClick={() => { void s.editText(selected, text); }}>Save text &amp; rebuild</button>
      <button type="button" className="text-button" disabled={disabled || text === original} onClick={() => { drafts.current.delete(selected); setText(original); }}>Reset text</button></div>
  </section>;
}
