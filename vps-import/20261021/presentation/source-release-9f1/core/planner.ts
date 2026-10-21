import type { LayoutId, Plan, SlidePlan, SourceDocument } from "./types.js";
export const LAYOUTS: LayoutId[] = [
  "cover",
  "section",
  "editorial",
  "columns",
  "process",
  "cards",
  "timeline",
  "statement",
  "photo",
  "table",
];
export function safeLayoutChoices(
  doc: SourceDocument,
  slide: SlidePlan,
  images: boolean,
): LayoutId[] {
  const blocks = slide.blockIds.map((id) =>
    doc.blocks.find((block) => block.id === id)!,
  );
  if (blocks.some((block) => block.kind === "table"))
    return ["table", "editorial", "columns"];
  if (blocks.length === 1 && blocks[0].kind === "heading")
    return ["section", "cover", "statement", "editorial"];
  const choices: LayoutId[] = ["editorial", "columns", "statement"];
  if (blocks.filter((block) => block.kind === "list").length >= 2)
    choices.splice(1, 0, "process", "cards", "timeline");
  if (images) choices.push("photo");
  return choices;
}
export function rulesPlan(doc: SourceDocument, images = true): Plan {
  const slides: SlidePlan[] = [];
  let ids: string[] = [];
  let budget = 0;
  const flush = () => {
    if (!ids.length) return;
    const b = ids.map((id) => doc.blocks.find((x) => x.id === id)!);
    const heading = b.find((x) => x.kind === "heading");
    const lists = b.filter((x) => x.kind === "list");
    let layout: LayoutId = b.some((x) => x.kind === "table")
      ? "table"
      : b.length === 1 && heading
        ? "section"
        : lists.length >= 3
          ? lists.every((item) => /^\s*\d+[.)]/.test(item.text))
            ? "timeline"
            : slides.length % 2
              ? "cards"
              : "process"
          : b.length >= 4
            ? "columns"
            : !heading &&
                b.every((x) => x.kind === "paragraph") &&
                b.reduce((n, x) => n + x.text.length, 0) < 500
              ? "statement"
              : "editorial";
    if (slides.length === 0 && b.length === 1 && heading && heading.text.length < 180)
      layout = "cover";
    const imageId =
      images &&
      slides.length % 5 === 2 &&
      !["process", "cards", "timeline", "table"].includes(layout)
        ? "city"
        : null;
    if (imageId) layout = "photo";
    slides.push({ id: `s${slides.length}`, blockIds: ids, layout, imageId });
    ids = [];
    budget = 0;
  };
  for (const block of doc.blocks) {
    if (block.kind === "heading" && ids.length) {
      // Keep Markdown separator markers with the following section heading.
      // The marker remains a source-bearing object; this only avoids a nearly
      // empty slide when the input contains `*` between sections.
      let separatorStart = ids.length;
      while (
        separatorStart > 0 &&
        doc.blocks
          .find((item) => item.id === ids[separatorStart - 1])
          ?.text.trim() === "*"
      )
        separatorStart--;
      if (separatorStart > 0 && separatorStart < ids.length) {
        const separators = ids.slice(separatorStart);
        ids = ids.slice(0, separatorStart);
        budget = ids.reduce(
          (total, id) =>
            total + doc.blocks.find((item) => item.id === id)!.text.length + 70,
          0,
        );
        flush();
        ids = separators;
        budget = separators.reduce(
          (total, id) =>
            total + doc.blocks.find((item) => item.id === id)!.text.length + 70,
          0,
        );
      } else if (separatorStart > 0) flush();
    }
    if (block.kind === "table") {
      flush();
      ids = [block.id];
      flush();
      continue;
    }
    if (budget + block.text.length > 1000 && ids.length) flush();
    ids.push(block.id);
    budget += block.text.length + 70;
  }
  flush();
  if (slides.length > 80) throw new Error("SLIDE_LIMIT");
  return { slides, engine: "rules" };
}
export function validatePlan(doc: SourceDocument, plan: Plan) {
  const expected = doc.blocks.map((x) => x.id),
    actual = plan.slides.flatMap((x) => x.blockIds);
  if (
    !plan.slides.length ||
    plan.slides.length > 80 ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error("PLAN_COVERAGE");
  const slideIds = new Set<string>();
  for (const slide of plan.slides) {
    if (
      !LAYOUTS.includes(slide.layout) ||
      !slide.blockIds.length ||
      slideIds.has(slide.id) ||
      !(
        slide.imageId === null ||
        slide.imageId === "city" ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          slide.imageId,
        )
      )
    )
      throw new Error("PLAN_SCHEMA");
    if (slide.offsets) {
      if (Object.keys(slide.offsets).length > 100) throw new Error("PLAN_SCHEMA");
      for (const [blockId, offset] of Object.entries(slide.offsets)) {
        if (!/^b\d+$/.test(blockId) || !slide.blockIds.includes(blockId) ||
          !offset || !Number.isFinite(offset.dx) || !Number.isFinite(offset.dy) ||
          Math.abs(offset.dx) > 0.75 || Math.abs(offset.dy) > 0.75)
          throw new Error("PLAN_SCHEMA");
      }
    }
    const blocks = slide.blockIds.map((id) =>
      doc.blocks.find((b) => b.id === id)!,
    );
    if (slide.layout === "table" && !blocks.some((b) => b.kind === "table"))
      throw new Error("PLAN_SCHEMA");
    if (slide.layout === "photo" && blocks.some((b) => b.kind === "table"))
      throw new Error("PLAN_SCHEMA");
    if (
      slide.layout === "section" &&
      (blocks.length !== 1 || blocks[0].kind !== "heading")
    )
      throw new Error("PLAN_SCHEMA");
    slideIds.add(slide.id);
  }
  return true;
}
