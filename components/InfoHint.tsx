// A label that needs a sentence of explanation, without the sentence sitting
// on screen forever. The text is the button's accessible name, so screen
// readers and keyboard users get it without the hover.
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
        className="pointer-events-none absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-2 text-xs font-normal text-zinc-300 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}
