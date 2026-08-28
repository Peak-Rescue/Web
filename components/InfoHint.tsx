// A label that needs a sentence of explanation, without the sentence sitting
// on screen forever. The text is the button's accessible name, so screen
// readers and keyboard users get it without the hover.
//
// The bubble is capped to the viewport as well as to its own width. A
// transformed box still counts toward the page's scrollable area even at zero
// opacity, so an icon sitting within half a bubble of the right edge used to
// widen the whole document — which centred every page against the wrong width
// and left a gap down one side on phones. `overflow-x: clip` on the root now
// catches that for good; this cap is what keeps the bubble readable rather
// than merely clipped.
export default function InfoHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label={text}
        className="w-4 h-4 rounded-full border border-zinc-600 text-zinc-500 text-[10px] font-medium leading-none flex items-center justify-center transition-colors hover:text-zinc-200 hover:border-zinc-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 max-w-[calc(100vw-2rem)] rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs font-normal text-zinc-300 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
