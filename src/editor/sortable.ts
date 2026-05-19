import Sortable from "sortablejs";

export function bindSortable(
  listEl: HTMLElement,
  onReorder: (orderedIds: string[]) => void,
): Sortable {
  return Sortable.create(listEl, {
    animation: 150,
    handle: ".drag-handle",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onEnd: () => {
      const ids = [...listEl.children]
        .map((ch) => (ch as HTMLElement).dataset.itemId)
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      onReorder(ids);
    },
  });
}
