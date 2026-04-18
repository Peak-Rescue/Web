import Link from 'next/link'
import Image from 'next/image'
import { instructors } from '@/lib/data/instructors'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Our Team',
  description: 'Meet the Peak Rescue instructor team — IFMGA-certified guides and rescue specialists with decades of combined field experience.',
}

export default function InstructorsPage() {
  return (
    <>
      {/* Page hero */}
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">Who We Are</span>
          <h1 className="display-lg mt-3 text-pr-text">The Team</h1>
          <p className="mt-4 text-pr-muted max-w-2xl leading-relaxed">
            IFMGA guides, military veterans, fire department careers, and decades of field experience across mountain, water, urban, and tactical environments.
          </p>
        </div>
      </div>

      {/* Instructors grid */}
      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {instructors.map((instructor) => (
              <Link
                key={instructor.slug}
                href={`/instructors/${instructor.slug}`}
                className="group flex flex-col glass-card hover:border-pr-red/30 transition-all duration-300 overflow-hidden"
              >
                {/* Photo */}
                <div className="relative aspect-[4/3] bg-pr-surface overflow-hidden">
                  {instructor.avatar ? (
                    <Image
                      src={instructor.avatar}
                      alt={instructor.name}
                      fill
                      className={`object-cover ${instructor.avatarPosition ?? 'object-center'} ${instructor.avatarScale ?? ''} grayscale group-hover:grayscale-0 transition-all duration-500`}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-display font-700 text-6xl text-pr-muted/15 tracking-widest select-none">
                      {instructor.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                    </span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pr-red scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </div>

                {/* Info */}
                <div className="p-6 flex flex-col flex-1">
                  <h3 className="font-display font-700 text-lg uppercase tracking-wide text-pr-text group-hover:text-pr-red transition-colors">
                    {instructor.name}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {instructor.certifications.slice(0, 2).map((cert) => (
                      <span
                        key={cert}
                        className="px-2 py-0.5 text-[10px] font-display tracking-widest uppercase border border-white/10 text-pr-muted"
                      >
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

    </>
  )
}
