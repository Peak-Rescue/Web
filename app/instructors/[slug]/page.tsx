import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getInstructorBySlug, instructors, roleLabels } from '@/lib/data/instructors'
import { getServiceBySlug } from '@/lib/data/services'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return instructors.map((i) => ({ slug: i.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const instructor = getInstructorBySlug(slug)
  if (!instructor) return {}
  return {
    title: instructor.name,
    description: `${instructor.title} — ${instructor.certifications.join(', ')}`,
  }
}

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const instructor = getInstructorBySlug(slug)
  if (!instructor) notFound()

  const specialtyServices = instructor.specialties
    .map((s) => getServiceBySlug(s))
    .filter(Boolean)

  return (
    <>
      {/* Hero */}
      <div className="pt-32 pb-20 bg-pr-surface border-b border-white/[0.06] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-1 bg-pr-red" />
        <div className="site-container">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-display tracking-widest uppercase text-pr-muted mb-8">
            <Link href="/instructors" className="hover:text-pr-text transition-colors">
              Team
            </Link>
            <span>/</span>
            <span className="text-pr-red">{instructor.name}</span>
          </div>

          <div className="flex flex-col md:flex-row gap-10 items-start">
            {/* Photo */}
            <div className="relative w-40 h-40 md:w-56 md:h-56 flex-shrink-0 overflow-hidden bg-pr-surface-raised border border-white/[0.06]">
              {instructor.avatar ? (
                <Image
                  src={instructor.avatar}
                  alt={instructor.name}
                  fill
                  className="object-cover object-top"
                  sizes="224px"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center font-display font-700 text-5xl text-pr-muted/25 tracking-widest">
                  {instructor.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </span>
              )}
            </div>

            {/* Info */}
            <div>
              <span className="section-label">{roleLabels[instructor.role]}</span>
              <h1 className="display-lg mt-2 text-pr-text">{instructor.name}</h1>
              <p className="mt-2 text-pr-muted font-display font-500 tracking-wide">
                {instructor.title}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {instructor.certifications.map((cert) => (
                  <span
                    key={cert}
                    className="px-3 py-1 text-xs font-display tracking-widest uppercase border border-white/15 text-pr-muted"
                  >
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bio + specialties */}
      <div className="py-20 bg-pr-bg">
        <div className="site-container grid grid-cols-1 lg:grid-cols-3 gap-16">
          <div className="lg:col-span-2">
            <div className="accent-line">
              <h2 className="display-md text-pr-text mb-6">Background</h2>
            </div>
            <p className="text-pr-muted leading-relaxed text-lg">{instructor.bio}</p>
          </div>

          <div>
            <h3 className="section-label mb-6">Specialties</h3>
            <div className="flex flex-col gap-3">
              {specialtyServices.map((service) => service && (
                <Link
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  className="group flex items-center justify-between p-4 glass-card hover:border-pr-red/30 transition-all"
                >
                  <span className="text-sm font-display font-600 uppercase tracking-wide text-pr-text group-hover:text-pr-red transition-colors">
                    {service.shortTitle}
                  </span>
                  <span className="text-pr-red text-xs">→</span>
                </Link>
              ))}
            </div>

            <div className="mt-10 pt-8 border-t border-white/[0.06]">
              <Link
                href="/contact"
                className="block text-center px-6 py-3 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors"
              >
                Train with {instructor.name.split(' ')[0]}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
