import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getServiceBySlug, services, categoryMeta } from '@/lib/data/services'
import type { Metadata } from 'next'

export function generateStaticParams() {
  return services.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) return {}
  return {
    title: service.title,
    description: service.tagline,
  }
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const service = getServiceBySlug(slug)
  if (!service) notFound()

  const category = categoryMeta[service.category]

  // Related services in same category
  const related = services
    .filter((s) => s.category === service.category && s.slug !== service.slug)
    .slice(0, 3)

  return (
    <>
      {/* Hero */}
      <div className="relative bg-pr-surface border-b border-white/[0.06] overflow-hidden pt-16 md:pt-20">
        <div className="absolute top-0 left-0 w-48 h-1 bg-pr-red z-10" />

        {service.heroImage ? (
          <>
            <div className="relative w-full h-64 md:h-96 lg:h-[480px]">
              <Image
                src={service.heroImage}
                alt={service.title}
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-pr-bg via-pr-bg/50 to-transparent" />
            </div>
            {/* Text overlaid at bottom of image */}
            <div className="absolute bottom-0 left-0 right-0 pb-12">
              <div className="site-container">
                <div className="flex items-center gap-2 text-xs font-display tracking-widest uppercase text-white/60 mb-6">
                  <Link href="/services" className="hover:text-white transition-colors">Training</Link>
                  <span>/</span>
                  <span className="text-pr-red">{category.label}</span>
                </div>
                <span className="section-label">{category.label}</span>
                <h1 className="display-lg mt-3 text-pr-text max-w-3xl">{service.title}</h1>
                <p className="mt-6 text-xl text-pr-muted max-w-2xl leading-relaxed font-display font-500 tracking-wide">
                  {service.tagline}
                </p>
                <div className="mt-10">
                  <Link
                    href="/contact"
                    className="inline-block px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors"
                  >
                    Inquire About This Program
                  </Link>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="pt-8 pb-20 site-container">
            <div className="flex items-center gap-2 text-xs font-display tracking-widest uppercase text-pr-muted mb-8">
              <Link href="/services" className="hover:text-pr-text transition-colors">Training</Link>
              <span>/</span>
              <span className="text-pr-red">{category.label}</span>
            </div>
            <span className="section-label">{category.label}</span>
            <h1 className="display-lg mt-3 text-pr-text max-w-3xl">{service.title}</h1>
            <p className="mt-6 text-xl text-pr-muted max-w-2xl leading-relaxed font-display font-500 tracking-wide">
              {service.tagline}
            </p>
            <div className="mt-10">
              <Link
                href="/contact"
                className="inline-block px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors"
              >
                Inquire About This Program
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="py-20 bg-pr-bg">
        <div className="site-container">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
            {/* Main */}
            <div className="lg:col-span-2">
              <div className="accent-line">
                <h2 className="display-md text-pr-text mb-6">Program Overview</h2>
              </div>
              <p className="text-pr-muted leading-relaxed text-lg mb-12">{service.description}</p>

              <h3 className="section-label mb-6">Curriculum Includes</h3>
              <ul className="flex flex-col gap-4">
                {service.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-4">
                    <span className="mt-1.5 w-4 h-0.5 bg-pr-red flex-shrink-0" />
                    <span className="text-pr-muted leading-relaxed">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="glass-card p-8 sticky top-28">
                <h3 className="section-label mb-6">Ready to Train?</h3>
                <p className="text-pr-muted text-sm leading-relaxed mb-6">
                  This program is customized for your team&apos;s size, timeline, and operating
                  environment. Contact us to build the right training.
                </p>
                <Link
                  href="/contact"
                  className="block text-center px-6 py-3 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors mb-4"
                >
                  Get in Touch
                </Link>
                <a
                  href="tel:+18337372834"
                  className="block text-center px-6 py-3 border border-white/15 text-pr-text font-display font-600 text-sm tracking-widest uppercase hover:border-white/30 transition-colors"
                >
                  (833) 737-2834
                </a>

                <div className="mt-8 pt-8 border-t border-white/[0.06]">
                  <h4 className="section-label mb-4">Category</h4>
                  <Link
                    href={`/services#${service.category}`}
                    className="text-pr-muted text-sm hover:text-pr-text transition-colors"
                  >
                    {category.label} →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="py-16 bg-pr-surface border-t border-white/[0.06]">
          <div className="site-container">
            <h3 className="section-label mb-8">Related Programs</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((s) => (
                <Link
                  key={s.slug}
                  href={`/services/${s.slug}`}
                  className="group p-6 glass-card hover:border-pr-red/30 transition-all duration-200"
                >
                  <h4 className="font-display font-700 text-lg uppercase tracking-wide text-pr-text group-hover:text-pr-red transition-colors mb-2">
                    {s.shortTitle}
                  </h4>
                  <p className="text-sm text-pr-muted">{s.tagline}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
