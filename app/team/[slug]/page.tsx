import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Metadata } from 'next'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { data } = await createAdminClient()
    .from('instructors')
    .select('name, title')
    .eq('slug', slug)
    .single()
  if (!data) return {}
  return {
    title: data.name,
    description: data.title,
  }
}

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: instructor } = await createAdminClient()
    .from('instructors')
    .select('name, title, bio, avatar, avatar_position, avatar_scale')
    .eq('slug', slug)
    .eq('active', true)
    .single()

  if (!instructor) notFound()

  return (
    <>
      {/* Hero */}
      <div className="pt-32 pb-20 bg-pr-surface border-b border-white/[0.06] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-16 h-[3px] bg-pr-red" />
        <div className="absolute top-0 left-0 w-[3px] h-16 bg-pr-red" />
        <div className="site-container">
          <div className="flex items-center gap-2 text-xs font-display tracking-widest uppercase text-pr-muted mb-8">
            <Link href="/team" className="hover:text-pr-text transition-colors">Team</Link>
            <span>/</span>
            <span className="text-pr-red">{instructor.name}</span>
          </div>

          <div className="flex flex-col md:flex-row gap-10 items-start">
            <div className="relative w-40 h-40 md:w-56 md:h-56 flex-shrink-0 overflow-hidden bg-pr-surface-raised border border-white/[0.06]">
              {instructor.avatar ? (
                <Image
                  src={instructor.avatar}
                  alt={instructor.name}
                  fill
                  className={`object-cover ${instructor.avatar_position ?? 'object-top'} ${instructor.avatar_scale ?? ''}`}
                  sizes="224px"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-display font-700 text-5xl text-pr-muted/25 tracking-widest">
                  {instructor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </span>
              )}
            </div>

            <div>
              <h1 className="display-lg mt-2 text-pr-text">{instructor.name}</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Bio */}
      {instructor.bio && (
        <div className="py-20 bg-pr-bg">
          <div className="site-container max-w-3xl">
            <div className="accent-line">
              <h2 className="display-md text-pr-text mb-6">Background</h2>
            </div>
            <p className="text-pr-muted leading-relaxed text-lg">{instructor.bio}</p>
          </div>
        </div>
      )}
    </>
  )
}
