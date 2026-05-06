import Link from 'next/link'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Our Team',
  description: 'Meet the Peak Rescue instructor team — IFMGA-certified guides and rescue specialists with decades of combined field experience.',
}

export default async function InstructorsPage() {
  const { data: instructors } = await createAdminClient()
    .from('instructors')
    .select('slug, name, avatar, avatar_position, avatar_scale')
    .eq('show_on_team_page', true)
    .eq('active', true)
    .order('name')

  return (
    <>
      {/* Page hero */}
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">Who We Are</span>
          <h1 className="display-lg mt-3 text-pr-text">The Team</h1>
          <p className="mt-4 text-pr-muted max-w-2xl leading-relaxed">
            Top-of-field professionals from across the mountain, rescue, and technical disciplines — each still actively working in the field and bringing thousands of hours of real-world experience to every course.
          </p>
        </div>
      </div>

      {/* Instructors grid */}
      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(instructors ?? []).map((instructor) => (
              <Link
                key={instructor.slug}
                href={`/instructors/${instructor.slug}`}
                className="group flex flex-col glass-card hover:border-pr-red/30 transition-all duration-300 overflow-hidden"
              >
                <div className="relative aspect-[4/3] bg-pr-surface overflow-hidden">
                  {instructor.avatar ? (
                    <Image
                      src={instructor.avatar}
                      alt={instructor.name}
                      fill
                      className={`object-cover ${instructor.avatar_position ?? 'object-center'} ${instructor.avatar_scale ?? ''} grayscale group-hover:grayscale-0 transition-all duration-500`}
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-display font-700 text-6xl text-pr-muted/15 tracking-widest select-none">
                      {instructor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </span>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-pr-red scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </div>
                <div className="p-6">
                  <h3 className="font-display font-700 text-lg uppercase tracking-wide text-pr-text group-hover:text-pr-red transition-colors">
                    {instructor.name}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
