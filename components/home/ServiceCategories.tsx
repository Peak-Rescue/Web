'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { categoryMeta, type ServiceCategory } from '@/lib/data/services'

const categoryIcons: Record<ServiceCategory, React.ReactNode> = {
  tactical: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="3" x2="12" y2="7" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="3" y1="12" x2="7" y2="12" />
      <line x1="17" y1="12" x2="21" y2="12" />
    </svg>
  ),
  sar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 20L9 8l4 6 3-4 5 10H3z" />
    </svg>
  ),
  industrial: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <rect x="3" y="8" width="5" height="13" />
      <rect x="10" y="3" width="5" height="18" />
      <rect x="17" y="11" width="4" height="10" />
    </svg>
  ),
  specialty: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87V17a1 1 0 01-1.447.894L15 16M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
    </svg>
  ),
}

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 32 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
}

export default function ServiceCategories() {
  return (
    <section className="py-24 md:py-32 bg-pr-bg">
      <div className="site-container">
        {/* Heading */}
        <motion.div
          className="mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="section-label">Training Programs</span>
          <h2 className="display-lg mt-3 text-pr-text">
            Built for your<br />
            <span className="text-pr-red">team and terrain.</span>
          </h2>
        </motion.div>

        {/* Category grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {(Object.entries(categoryMeta) as [ServiceCategory, typeof categoryMeta[ServiceCategory]][]).map(
            ([key, meta]) => {
              return (
                <motion.div key={key} variants={item}>
                  <Link
                    href={`/services?category=${key}`}
                    className="group relative flex flex-col h-full min-h-[320px] p-8 border border-white/[0.08] hover:border-pr-red/30 transition-all duration-300 overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 right-0 h-px bg-pr-red scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />

                    {/* Content */}
                    <div className="flex flex-col h-full">
                      <div className="text-pr-red mb-6 transition-transform duration-300 group-hover:-translate-y-1">
                        {categoryIcons[key]}
                      </div>

                      <h3 className="font-display font-700 text-xl tracking-wide uppercase text-pr-text mb-3">
                        {meta.label}
                      </h3>

                      <p className="text-pr-muted text-sm leading-relaxed flex-1">
                        {meta.description}
                      </p>

                      <div className="mt-6 flex justify-end">
                        <span className="text-pr-red text-sm font-display tracking-widest uppercase transition-transform duration-200 group-hover:translate-x-1">
                          →
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              )
            }
          )}
        </motion.div>

        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <Link
            href="/services"
            className="inline-block px-8 py-4 border border-white/15 text-pr-text font-display font-700 text-sm tracking-widest uppercase hover:border-pr-red/50 hover:text-pr-red transition-all duration-200"
          >
            View All Programs
          </Link>
        </motion.div>
      </div>
    </section>
  )
}
