import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Follow along with Peak Rescue operations, training, and expeditions.',
}

export default function GalleryPage() {
  return (
    <>
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">Follow Along</span>
          <h1 className="display-lg mt-3 text-pr-text">Gallery</h1>
          <p className="mt-4 text-pr-muted max-w-xl leading-relaxed">
            Operations, training, and expeditions — as they happen.
          </p>
        </div>
      </div>

      <div className="py-20 bg-pr-bg">
        <div className="site-container text-center">
          <p className="text-pr-muted">Instagram gallery integration coming soon.</p>
        </div>
      </div>
    </>
  )
}
