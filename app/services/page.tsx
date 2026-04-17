'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { services, categoryMeta, type ServiceCategory } from '@/lib/data/services'

const categories: (ServiceCategory | 'all')[] = ['all', 'tactical', 'sar', 'industrial', 'specialty']

const categoryLabels: Record<ServiceCategory | 'all', string> = {
  all: 'All Programs',
  ...Object.fromEntries(
    Object.entries(categoryMeta).map(([k, v]) => [k, v.label])
  ) as Record<ServiceCategory, string>,
}

function ServicesContent() {
  const searchParams = useSearchParams()
  const param = searchParams.get('category') as ServiceCategory | null
  const active: ServiceCategory | 'all' = param && categories.includes(param) ? param : 'all'

  const filtered = active === 'all' ? services : services.filter((s) => s.category === active)

  return (
    <>
      {/* Page hero */}
      <div className="pt-32 pb-16 bg-pr-surface border-b border-white/[0.06]">
        <div className="site-container">
          <span className="section-label">What We Teach</span>
          <h1 className="display-lg mt-3 text-pr-text">
            Training Programs
          </h1>
          <p className="mt-4 text-pr-muted max-w-2xl leading-relaxed">
            Specialized programs across military, SAR, industrial, and commercial disciplines — all
            customizable to your team, timeline, and mission profile. IFMGA-certified instructors. Real field conditions.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-pr-bg/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="site-container py-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {categories.map((cat) => (
              <Link
                key={cat}
                href={cat === 'all' ? '/services' : `/services?category=${cat}`}
                className={`flex-shrink-0 px-4 py-2 text-xs font-display font-600 tracking-widest uppercase transition-all duration-200 ${
                  active === cat
                    ? 'bg-pr-red text-white'
                    : 'border border-white/10 text-pr-muted hover:text-pr-text hover:border-white/25'
                }`}
              >
                {categoryLabels[cat]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Services grid */}
      <div className="py-16 md:py-24 bg-pr-bg">
        <div className="site-container">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {filtered.map((service) => (
                <Link
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  className="group flex flex-col glass-card hover:border-pr-red/30 hover:bg-white/[0.04] transition-all duration-300 relative overflow-hidden"
                >
                  {/* Hero image */}
                  {service.heroImage && (
                    <div className="relative w-full h-44 overflow-hidden">
                      <Image
                        src={service.heroImage}
                        alt={service.title}
                        fill
                        className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-pr-surface/80 to-transparent" />
                    </div>
                  )}

                  <div className="flex flex-col flex-1 p-8">
                    {/* Category label */}
                    <span className="section-label text-[10px] mb-4">
                      {categoryMeta[service.category].label}
                    </span>

                    <h2 className="font-display font-700 text-xl tracking-wide uppercase text-pr-text group-hover:text-pr-red transition-colors mb-3">
                      {service.title}
                    </h2>

                    <p className="text-sm text-pr-muted leading-relaxed flex-1">
                      {service.tagline}
                    </p>

                    <div className="mt-6 flex items-center gap-2 text-pr-red text-xs font-display tracking-widest uppercase">
                      <span className="transition-transform duration-200 group-hover:translate-x-1">
                        View Program →
                      </span>
                    </div>
                  </div>

                  {/* Hover top border */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-pr-red scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                </Link>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* CTA */}
      <div className="py-16 bg-pr-surface border-t border-white/[0.06]">
        <div className="site-container text-center">
          <h2 className="display-md text-pr-text mb-4">Don&apos;t see exactly what you need?</h2>
          <p className="text-pr-muted mb-8 max-w-lg mx-auto">
            Every program we run is built around your mission. Contact us and we&apos;ll design the
            right curriculum for your team.
          </p>
          <Link
            href="/contact"
            className="inline-block px-8 py-4 bg-pr-red text-white font-display font-700 text-sm tracking-widest uppercase hover:bg-pr-red-light transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </>
  )
}

export default function ServicesPage() {
  return (
    <Suspense>
      <ServicesContent />
    </Suspense>
  )
}
